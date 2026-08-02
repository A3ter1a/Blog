[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupDir,
  [string]$CredentialPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-production-db-credential.json'),
  [switch]$ConfirmProductionWrite,
  [string]$ConfirmationPhrase = ''
)

$ErrorActionPreference = 'Stop'
$ProductionProjectRef = 'kysywitrsjhcdlcrfayl'
$ExpectedPhrase = "WRITE $ProductionProjectRef AI-SUBMISSION-RPC 0029"
$LocalTunnelPort = 15432
$ExpectedPoolerHost = 'aws-1-ap-southeast-1.pooler.supabase.com'
$ExpectedUsername = "postgres.$ProductionProjectRef"
$MigrationName = '0029_ai_content_submission_rpc.sql'
$MigrationHash = '25875b6dd1c0822e85cfab229463f8b11bedcdfd3d64ac33c4cce64a7f18418c'

if (-not $ConfirmProductionWrite -or $ConfirmationPhrase -cne $ExpectedPhrase) {
  throw "Production migration requires -ConfirmProductionWrite and the exact phrase: $ExpectedPhrase"
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$BackupRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups\wp1-b'))
$ResolvedBackupDir = (Resolve-Path -LiteralPath $BackupDir).Path
if (-not $ResolvedBackupDir.StartsWith($BackupRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing to run: backup directory is outside the fixed production backup root.'
}

$Manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $ResolvedBackupDir 'backup-manifest.json') | ConvertFrom-Json
$CapturedAt = [DateTimeOffset]::Parse([string]$Manifest.capturedAt).ToUniversalTime()
if ([string]$Manifest.projectRef -cne $ProductionProjectRef -or $Manifest.productionStableDuringBackup -ne $true -or ([DateTimeOffset]::UtcNow - $CapturedAt).TotalHours -gt 4) {
  throw 'Production backup failed the project/stability/freshness gate.'
}

$Credential = Get-Content -Raw -Encoding UTF8 -LiteralPath $CredentialPath | ConvertFrom-Json
if ([string]$Credential.projectRef -cne $ProductionProjectRef -or [string]$Credential.poolerHost -cne $ExpectedPoolerHost -or [string]$Credential.username -cne $ExpectedUsername -or [string]::IsNullOrWhiteSpace([string]$Credential.databasePassword)) {
  throw 'Production credential target does not match the fixed project.'
}

$MigrationPath = Join-Path $RepositoryRoot "supabase\migrations\$MigrationName"
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $MigrationPath).Hash.ToLowerInvariant() -cne $MigrationHash) {
  throw 'Migration hash does not match the reviewed SQL.'
}

$Node = (Get-Command node -ErrorAction Stop).Source
$PgBin = (Resolve-Path (Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin')).Path
$Psql = Join-Path $PgBin 'psql.exe'
$TunnelScript = Join-Path $RepositoryRoot 'scripts\wp1b-pg-http-connect-tunnel.mjs'
$Database = "host=$ExpectedPoolerHost hostaddr=127.0.0.1 port=$LocalTunnelPort dbname=postgres user=$ExpectedUsername sslmode=require connect_timeout=10"

function Test-LoopbackPort([int]$Port) {
  $Client = [System.Net.Sockets.TcpClient]::new()
  try { $Task = $Client.ConnectAsync('127.0.0.1', $Port); return $Task.Wait(250) -and $Client.Connected }
  catch { return $false }
  finally { $Client.Dispose() }
}

function Invoke-JsonSql([string]$Sql) {
  $Rows = $Sql | & $Psql '--dbname' $Database '--no-password' '--no-psqlrc' '--quiet' '--tuples-only' '--no-align' '--set=ON_ERROR_STOP=1' 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Production SQL failed: $($Rows -join ' ')" }
  $Line = $Rows | Where-Object { $_.TrimStart().StartsWith('{') } | Select-Object -Last 1
  if ([string]::IsNullOrWhiteSpace([string]$Line)) { throw 'Production SQL returned no JSON evidence.' }
  return ([string]$Line | ConvertFrom-Json)
}

$FingerprintSql = @'
begin read only;
select jsonb_build_object(
  'notes', jsonb_build_object('count', count(*), 'checksum', md5(coalesce(string_agg((to_jsonb(n) - 'content_version' - 'author_kind' - 'author_profile_id' - 'owner_user_id')::text, E'\n' order by id), ''))),
  'chapters', jsonb_build_object('count', (select count(*) from public.chapters), 'checksum', (select md5(coalesce(string_agg(to_jsonb(c)::text, E'\n' order by id), '')) from public.chapters c)),
  'authUsers', (select count(*) from auth.users),
  'adminMatches', (select count(*) from public.admin_users a join auth.users u on lower(u.email) = lower(a.email))
)::text
from public.notes n;
rollback;
'@

$TunnelProcess = $null
$PreviousPgPassword = $env:PGPASSWORD
try {
  if (Test-LoopbackPort $LocalTunnelPort) { throw "Loopback port $LocalTunnelPort is already in use." }
  $TunnelProcess = Start-Process -FilePath $Node -ArgumentList @($TunnelScript, 'production') -WorkingDirectory $RepositoryRoot -WindowStyle Hidden -PassThru
  $Ready = $false
  for ($Attempt = 0; $Attempt -lt 40; $Attempt += 1) { if (Test-LoopbackPort $LocalTunnelPort) { $Ready = $true; break }; Start-Sleep -Milliseconds 250 }
  if (-not $Ready) { throw 'Production loopback tunnel did not become ready.' }
  $env:PGPASSWORD = [string]$Credential.databasePassword
  $Before = Invoke-JsonSql $FingerprintSql
  & $Psql '--dbname' $Database '--no-password' '--no-psqlrc' '--set=ON_ERROR_STOP=1' '--file' $MigrationPath
  if ($LASTEXITCODE -ne 0) { throw "Migration failed: $MigrationName" }
  $After = Invoke-JsonSql $FingerprintSql
  $FunctionCheck = Invoke-JsonSql @'
begin read only;
select jsonb_build_object(
  'submissionRpc', to_regprocedure('public.submit_ai_content_proposal(uuid)') is not null,
  'executePrivilege', has_function_privilege('authenticated', 'public.submit_ai_content_proposal(uuid)', 'EXECUTE')
)::text;
rollback;
'@
  if ($After.notes.count -ne $Before.notes.count -or $After.notes.checksum -cne $Before.notes.checksum -or $After.chapters.count -ne $Before.chapters.count -or $After.chapters.checksum -cne $Before.chapters.checksum -or $After.authUsers -ne $Before.authUsers -or $After.adminMatches -ne $Before.adminMatches -or $FunctionCheck.submissionRpc -ne $true -or $FunctionCheck.executePrivilege -ne $true) {
    throw 'Submission RPC migration postflight failed.'
  }
  $Evidence = [ordered]@{
    evidenceVersion = 1
    projectRef = $ProductionProjectRef
    completedAt = [DateTimeOffset]::UtcNow.ToString('o')
    backupDirName = Split-Path -Leaf $ResolvedBackupDir
    migration = $MigrationName
    migrationSha256 = $MigrationHash
    preFingerprint = $Before
    postFingerprint = $After
    submissionRpc = $FunctionCheck
    productionWritePerformed = $true
  }
  $EvidencePath = Join-Path $ResolvedBackupDir ("ai-submission-rpc-production-migration-" + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.json')
  $Evidence | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
  [pscustomobject]@{ status = 'passed'; migration = $MigrationName; evidencePath = $EvidencePath; notesChecksumUnchanged = $true; submissionRpc = $FunctionCheck } | ConvertTo-Json -Compress
} finally {
  if ($null -eq $PreviousPgPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD = $PreviousPgPassword }
  if ($null -ne $TunnelProcess -and -not $TunnelProcess.HasExited) { Stop-Process -Id $TunnelProcess.Id -Force -ErrorAction SilentlyContinue; $TunnelProcess.WaitForExit(5000) | Out-Null }
  if (Test-LoopbackPort $LocalTunnelPort) { throw "Production tunnel port $LocalTunnelPort was not cleaned up." }
}
