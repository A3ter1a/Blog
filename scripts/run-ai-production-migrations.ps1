[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupDir,
  [string]$CredentialPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-production-db-credential.json'),
  [ValidateRange(1, 24)]
  [int]$MaxBackupAgeHours = 4,
  [switch]$ConfirmProductionWrite,
  [string]$ConfirmationPhrase = ''
)

$ErrorActionPreference = 'Stop'
$ProductionProjectRef = 'kysywitrsjhcdlcrfayl'
$ExpectedPhrase = "WRITE $ProductionProjectRef AI-UPGRADE 0023-0029"
$LocalTunnelPort = 15432
$ExpectedPoolerHost = 'aws-1-ap-southeast-1.pooler.supabase.com'
$ExpectedPoolerPort = 5432
$ExpectedDatabase = 'postgres'
$ExpectedUsername = "postgres.$ProductionProjectRef"
$MigrationHashes = [ordered]@{
  '0023_ai_content_accounts_and_collections.sql' = 'c12a4e8e6f89062f0c6a5d78b61c60860cd9fc016ec2f3e1d0bd9509abb747f8'
  '0024_ai_content_review_comments.sql' = '4c99a859a8ab986e2a2e73c82d89837fd1d6cac87e27ad2a202a63d732d52a14'
  '0025_ai_collection_publish_boundary.sql' = '00c92a68fd5ca25954e13ffea4235f0403b978c5542be4bd2fbd5ceab9ecac7f'
  '0026_job_center_lifecycle.sql' = '96f276fc52d1501820b07d7f7e5e35614b5cc7965b78e1fa06720d444a944c14'
  '0027_ai_knowledge_quizzes.sql' = '5432a8477e58681fb1d33951c06fa8943d0b09e893ae0b6d2664791f0033b848'
  '0028_ai_knowledge_quiz_insert_policy_fix.sql' = '9f642ad1c2f2486d496e5f8ec993b6d72f1a5f8a6c83c41a65214ba8b7f285c0'
  '0029_ai_content_submission_rpc.sql' = '25875b6dd1c0822e85cfab229463f8b11bedcdfd3d64ac33c4cce64a7f18418c'
}

if (-not $ConfirmProductionWrite -or $ConfirmationPhrase -cne $ExpectedPhrase) {
  throw "Production migration requires -ConfirmProductionWrite and the exact phrase: $ExpectedPhrase"
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$BackupRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups\wp1-b'))
$ResolvedBackupDir = (Resolve-Path -LiteralPath $BackupDir).Path
$BackupPrefix = $BackupRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $ResolvedBackupDir.StartsWith($BackupPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing to run: backup directory is outside the fixed production backup root.'
}

$ManifestPath = Join-Path $ResolvedBackupDir 'backup-manifest.json'
$Manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $ManifestPath | ConvertFrom-Json
if (
  [string]$Manifest.projectRef -cne $ProductionProjectRef -or
  $Manifest.productionStableDuringBackup -ne $true -or
  $Manifest.containsSensitiveData -ne $true
) {
  throw 'Backup manifest does not match the stable production backup contract.'
}
$CapturedAt = [DateTimeOffset]::Parse([string]$Manifest.capturedAt).ToUniversalTime()
$BackupAge = [DateTimeOffset]::UtcNow - $CapturedAt
if ($BackupAge.TotalMinutes -lt -5 -or $BackupAge.TotalHours -gt $MaxBackupAgeHours) {
  throw "Production backup is outside the $MaxBackupAgeHours-hour freshness gate."
}

$Node = (Get-Command node -ErrorAction Stop).Source
& $Node (Join-Path $RepositoryRoot 'scripts\verify-wp1b-backup.mjs') '--dir' $ResolvedBackupDir
if ($LASTEXITCODE -ne 0) { throw 'Production backup verification failed.' }

$Credential = Get-Content -Raw -Encoding UTF8 -LiteralPath $CredentialPath | ConvertFrom-Json
if (
  [string]$Credential.projectRef -cne $ProductionProjectRef -or
  [string]$Credential.poolerHost -cne $ExpectedPoolerHost -or
  [int]$Credential.poolerPort -ne $ExpectedPoolerPort -or
  [string]$Credential.database -cne $ExpectedDatabase -or
  [string]$Credential.username -cne $ExpectedUsername -or
  [string]::IsNullOrWhiteSpace([string]$Credential.databasePassword)
) {
  throw 'Production credential target does not match the fixed project.'
}

$MigrationPaths = [ordered]@{}
foreach ($Entry in $MigrationHashes.GetEnumerator()) {
  $Path = Join-Path $RepositoryRoot "supabase\migrations\$($Entry.Key)"
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Missing migration: $($Entry.Key)" }
  $ActualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
  if ($ActualHash -cne $Entry.Value) { throw "Reviewed migration hash changed: $($Entry.Key)" }
  $MigrationPaths[$Entry.Key] = $Path
}

$PgBin = (Resolve-Path (Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin')).Path
$Psql = Join-Path $PgBin 'psql.exe'
$TunnelScript = Join-Path $RepositoryRoot 'scripts\wp1b-pg-http-connect-tunnel.mjs'
$DatabaseParameters = @(
  "host=$ExpectedPoolerHost",
  'hostaddr=127.0.0.1',
  "port=$LocalTunnelPort",
  "dbname=$ExpectedDatabase",
  "user=$ExpectedUsername",
  'sslmode=require',
  'connect_timeout=10'
) -join ' '

function Test-LoopbackPortListening([int]$Port) {
  $Client = [System.Net.Sockets.TcpClient]::new()
  try {
    $Task = $Client.ConnectAsync('127.0.0.1', $Port)
    return $Task.Wait(250) -and $Client.Connected
  } catch {
    return $false
  } finally {
    $Client.Dispose()
  }
}

function Invoke-PsqlJson([string]$Sql) {
  $Rows = $Sql | & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--quiet' `
    '--tuples-only' '--no-align' '--set=ON_ERROR_STOP=1' 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Production SQL failed: $($Rows -join ' ')" }
  $Line = $Rows | Where-Object { $_.TrimStart().StartsWith('{') } | Select-Object -Last 1
  if ([string]::IsNullOrWhiteSpace([string]$Line)) { throw 'Production SQL returned no JSON evidence.' }
  return ([string]$Line | ConvertFrom-Json)
}

$FingerprintSql = @'
begin read only;
select jsonb_build_object(
  'identity', jsonb_build_object(
    'database', current_database(),
    'user', current_user,
    'transactionReadOnly', current_setting('transaction_read_only') = 'on'
  ),
  'notes', jsonb_build_object(
    'count', count(*),
    'checksum', md5(coalesce(string_agg(
      (to_jsonb(n) - 'content_version' - 'author_kind' - 'author_profile_id' - 'owner_user_id')::text,
      E'\n' order by id
    ), ''))
  ),
  'chapters', jsonb_build_object(
    'count', (select count(*) from public.chapters),
    'checksum', (select md5(coalesce(string_agg(to_jsonb(c)::text, E'\n' order by id), '')) from public.chapters c)
  ),
  'authUsers', (select count(*) from auth.users),
  'adminMatches', (select count(*) from public.admin_users a join auth.users u on lower(u.email) = lower(a.email)),
  'targetTablesPresent', (
    select count(*) from unnest(array[
      'public.ai_profiles', 'public.ai_content_proposals', 'public.ai_content_proposal_comments',
      'public.note_collections', 'public.note_collection_items', 'public.ai_knowledge_quizzes',
      'public.ai_knowledge_quiz_items', 'public.ai_knowledge_quiz_attempts'
    ]) as target(name) where to_regclass(target.name) is not null
  ),
  'legacyReady',
    to_regprocedure('private.current_user_is_admin()') is not null
    and to_regprocedure('public.search_private_note_rag(text,vector,uuid,integer)') is not null
)::text
from public.notes n;
rollback;
'@

$PostflightSql = @'
begin read only;
select jsonb_build_object(
  'targetTablesPresent', (
    select count(*) from unnest(array[
      'public.ai_profiles', 'public.ai_content_proposals', 'public.ai_content_proposal_comments',
      'public.note_collections', 'public.note_collection_items', 'public.ai_knowledge_quizzes',
      'public.ai_knowledge_quiz_items', 'public.ai_knowledge_quiz_attempts'
    ]) as target(name) where to_regclass(target.name) is not null
  ),
  'emptyTargetTables',
    (select count(*) from public.ai_profiles) = 0
    and (select count(*) from public.ai_content_proposals) = 0
    and (select count(*) from public.ai_content_proposal_comments) = 0
    and (select count(*) from public.note_collections) = 0
    and (select count(*) from public.note_collection_items) = 0
    and (select count(*) from public.ai_knowledge_quizzes) = 0
    and (select count(*) from public.ai_knowledge_quiz_items) = 0
    and (select count(*) from public.ai_knowledge_quiz_attempts) = 0,
  'rlsForcedTables', (
    select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in (
      'ai_profiles', 'ai_content_proposals', 'ai_content_proposal_comments',
      'note_collections', 'note_collection_items', 'ai_knowledge_quizzes',
      'ai_knowledge_quiz_items', 'ai_knowledge_quiz_attempts'
    ) and c.relrowsecurity and c.relforcerowsecurity
  ),
  'policyCount', (
    select count(*) from pg_policies where schemaname = 'public' and tablename in (
      'ai_profiles', 'ai_content_proposals', 'ai_content_proposal_comments',
      'note_collections', 'note_collection_items', 'ai_knowledge_quizzes',
      'ai_knowledge_quiz_items', 'ai_knowledge_quiz_attempts'
    )
  ),
  'functionsReady',
    to_regprocedure('private.current_user_is_ai()') is not null
    and to_regprocedure('private.current_ai_profile_id()') is not null
    and to_regprocedure('public.publish_ai_content_proposal(uuid)') is not null
    and to_regprocedure('public.submit_ai_content_proposal(uuid)') is not null,
  'noteAuthorColumns', (
    select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'notes'
    and column_name in ('author_kind', 'author_profile_id', 'owner_user_id')
  ),
  'jobLifecycleReady', exists (
    select 1 from pg_constraint c join pg_class r on r.oid = c.conrelid
    where r.oid = 'public.jobs'::regclass and c.conname = 'jobs_status_check'
      and pg_get_constraintdef(c.oid) ilike '%cancelled%'
  )
)::text;
rollback;
'@

$TunnelProcess = $null
$PreviousPgPassword = $env:PGPASSWORD
$Applied = [System.Collections.Generic.List[string]]::new()
try {
  if (Test-LoopbackPortListening $LocalTunnelPort) { throw "Loopback port $LocalTunnelPort is already in use." }
  $TunnelProcess = Start-Process -FilePath $Node -ArgumentList @($TunnelScript, 'production') `
    -WorkingDirectory $RepositoryRoot -WindowStyle Hidden -PassThru
  $Ready = $false
  for ($Attempt = 0; $Attempt -lt 40; $Attempt += 1) {
    if (Test-LoopbackPortListening $LocalTunnelPort) { $Ready = $true; break }
    Start-Sleep -Milliseconds 250
  }
  if (-not $Ready) { throw 'Production loopback tunnel did not become ready.' }

  $env:PGPASSWORD = [string]$Credential.databasePassword
  $Preflight = Invoke-PsqlJson $FingerprintSql
  if (
    $Preflight.identity.database -cne 'postgres' -or
    $Preflight.identity.user -cne 'postgres' -or
    $Preflight.identity.transactionReadOnly -ne $true -or
    [int]$Preflight.targetTablesPresent -ne 0 -or
    $Preflight.legacyReady -ne $true
  ) {
    throw 'Production AI migration preflight failed.'
  }

  foreach ($Entry in $MigrationPaths.GetEnumerator()) {
    $MigrationSql = Get-Content -Raw -Encoding UTF8 -LiteralPath $Entry.Value
    & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--set=ON_ERROR_STOP=1' '--command' $MigrationSql
    if ($LASTEXITCODE -ne 0) { throw "Migration failed: $($Entry.Key)" }
    $Applied.Add($Entry.Key)
  }

  $PostFingerprint = Invoke-PsqlJson $FingerprintSql
  $Postflight = Invoke-PsqlJson $PostflightSql
  if (
    $PostFingerprint.notes.count -ne $Preflight.notes.count -or
    $PostFingerprint.notes.checksum -cne $Preflight.notes.checksum -or
    $PostFingerprint.chapters.count -ne $Preflight.chapters.count -or
    $PostFingerprint.chapters.checksum -cne $Preflight.chapters.checksum -or
    $PostFingerprint.authUsers -ne $Preflight.authUsers -or
    $PostFingerprint.adminMatches -ne $Preflight.adminMatches -or
    [int]$Postflight.targetTablesPresent -ne 8 -or
    $Postflight.emptyTargetTables -ne $true -or
    [int]$Postflight.rlsForcedTables -ne 8 -or
    [int]$Postflight.noteAuthorColumns -ne 3 -or
    $Postflight.functionsReady -ne $true -or
    $Postflight.jobLifecycleReady -ne $true
  ) {
    throw 'Production AI migration postflight failed.'
  }

  $Evidence = [ordered]@{
    evidenceVersion = 1
    projectRef = $ProductionProjectRef
    completedAt = [DateTimeOffset]::UtcNow.ToString('o')
    backupDirName = Split-Path -Leaf $ResolvedBackupDir
    migrationHashes = $MigrationHashes
    appliedMigrations = @($Applied)
    preflight = $Preflight
    postFingerprint = $PostFingerprint
    postflight = $Postflight
    productionConnected = $true
    productionWritePerformed = $true
  }
  $Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
  $EvidencePath = Join-Path $ResolvedBackupDir "ai-upgrade-production-migration-$Timestamp.json"
  $Evidence | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
  $Evidence | ConvertTo-Json -Depth 20 -Compress
  Write-Output "EvidencePath=$EvidencePath"
} finally {
  if ($null -eq $PreviousPgPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD = $PreviousPgPassword }
  if ($null -ne $TunnelProcess -and -not $TunnelProcess.HasExited) {
    Stop-Process -Id $TunnelProcess.Id -Force -ErrorAction SilentlyContinue
    $TunnelProcess.WaitForExit(5000) | Out-Null
  }
  if (Test-LoopbackPortListening $LocalTunnelPort) { throw "Production tunnel port $LocalTunnelPort was not cleaned up." }
}
