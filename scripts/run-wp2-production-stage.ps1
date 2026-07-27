[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupDir,
  [string]$CredentialPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-production-db-credential.json'),
  [ValidateSet('preflight', '0015', 'postflight')]
  [string]$Stage = 'preflight',
  [ValidateRange(1, 24)]
  [int]$MaxBackupAgeHours = 4,
  [switch]$ConfirmProductionRead,
  [switch]$ConfirmProductionWrite,
  [string]$ConfirmationPhrase = ''
)

$ErrorActionPreference = 'Stop'
$ProductionProjectRef = 'kysywitrsjhcdlcrfayl'
$ShadowProjectRef = 'qyjfcebqjtphlpsvizxo'
$ExpectedPoolerHost = 'aws-1-ap-southeast-1.pooler.supabase.com'
$ExpectedPoolerPort = 5432
$ExpectedDatabase = 'postgres'
$ExpectedUsername = "postgres.$ProductionProjectRef"
$LocalTunnelPort = 15432
$ExpectedMigrationSha256 = 'c778f46dd57b2125e4d6413196f774f41b3bd41fe639445c6d93f5d6430c566f'
$PreflightPhrase = "READ $ProductionProjectRef WP2 0015 PREFLIGHT"
$PostflightPhrase = "READ $ProductionProjectRef WP2 0015 POSTFLIGHT"
$WritePhrase = "WRITE $ProductionProjectRef 0015"

if ($ProductionProjectRef -eq $ShadowProjectRef) {
  throw 'Refusing to run: production ref equals fixed shadow ref.'
}
if ($Stage -eq 'preflight' -and (-not $ConfirmProductionRead -or $ConfirmationPhrase -cne $PreflightPhrase)) {
  throw "Production preflight requires -ConfirmProductionRead and the exact phrase: $PreflightPhrase"
}
if ($Stage -eq 'postflight' -and (-not $ConfirmProductionRead -or $ConfirmationPhrase -cne $PostflightPhrase)) {
  throw "Production postflight requires -ConfirmProductionRead and the exact phrase: $PostflightPhrase"
}
if ($Stage -eq '0015' -and (-not $ConfirmProductionWrite -or $ConfirmationPhrase -cne $WritePhrase)) {
  throw "Production 0015 requires -ConfirmProductionWrite and the exact phrase: $WritePhrase"
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$BackupRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups\wp1-b'))
$ResolvedBackupDir = (Resolve-Path -LiteralPath $BackupDir).Path
$BackupPrefix = $BackupRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $ResolvedBackupDir.StartsWith($BackupPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing to run: backup directory is outside the fixed WP1-B backup root.'
}

$BackupManifestPath = Join-Path $ResolvedBackupDir 'backup-manifest.json'
$ProductionAuditPath = Join-Path $ResolvedBackupDir 'production-audit-after.json'
foreach ($RequiredPath in @($BackupManifestPath, $ProductionAuditPath, $CredentialPath)) {
  if (-not (Test-Path -LiteralPath $RequiredPath -PathType Leaf)) {
    throw "Required production evidence is missing: $RequiredPath"
  }
}

$BackupManifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $BackupManifestPath | ConvertFrom-Json
if (
  [string]$BackupManifest.projectRef -cne $ProductionProjectRef -or
  $BackupManifest.productionStableDuringBackup -ne $true -or
  $BackupManifest.containsSensitiveData -ne $true
) {
  throw 'Backup manifest does not match the fixed stable production backup contract.'
}
$CapturedAt = [DateTimeOffset]::Parse([string]$BackupManifest.capturedAt).ToUniversalTime()
$BackupAge = [DateTimeOffset]::UtcNow - $CapturedAt
if ($BackupAge.TotalMinutes -lt -5 -or $BackupAge.TotalHours -gt $MaxBackupAgeHours) {
  throw "Production backup is outside the $MaxBackupAgeHours-hour freshness gate."
}

$Node = (Get-Command node -ErrorAction Stop).Source
& $Node (Join-Path $RepositoryRoot 'scripts\verify-wp1b-backup.mjs') '--dir' $ResolvedBackupDir
if ($LASTEXITCODE -ne 0) {
  throw 'Fresh production backup failed manifest, hash, or stable-audit verification.'
}

$Credential = Get-Content -Raw -Encoding UTF8 -LiteralPath $CredentialPath | ConvertFrom-Json
$CredentialShapeMatches =
  [string]$Credential.projectRef -ceq $ProductionProjectRef -and
  [string]$Credential.poolerHost -ceq $ExpectedPoolerHost -and
  [int]$Credential.poolerPort -eq $ExpectedPoolerPort -and
  [string]$Credential.database -ceq $ExpectedDatabase -and
  [string]$Credential.username -ceq $ExpectedUsername
if (-not $CredentialShapeMatches -or [string]::IsNullOrWhiteSpace([string]$Credential.databasePassword)) {
  throw 'Production credential ref, Pooler, database, username, or password does not match the fixed target.'
}

$ProductionAudit = Get-Content -Raw -Encoding UTF8 -LiteralPath $ProductionAuditPath | ConvertFrom-Json
$PgBin = (Resolve-Path (Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin')).Path
$Psql = Join-Path $PgBin 'psql.exe'
$TunnelScript = Join-Path $RepositoryRoot 'scripts\wp1b-pg-http-connect-tunnel.mjs'
$GateSql = Join-Path $RepositoryRoot 'supabase\wp1c-production-gate.sql'
$MigrationPath = Join-Path $RepositoryRoot 'supabase\migrations\0015_content_migration_snapshots.sql'
$MigrationHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $MigrationPath).Hash.ToLowerInvariant()
if ($MigrationHash -cne $ExpectedMigrationSha256) {
  throw 'Production 0015 migration hash differs from the reviewed artifact.'
}
$DatabaseParameters = @(
  "host=$ExpectedPoolerHost",
  'hostaddr=127.0.0.1',
  "port=$LocalTunnelPort",
  "dbname=$ExpectedDatabase",
  "user=$ExpectedUsername",
  'sslmode=require',
  'connect_timeout=10'
) -join ' '

function Invoke-PsqlJson([string]$Sql) {
  $Rows = $Sql | & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--quiet' `
    '--tuples-only' '--no-align' '--set=ON_ERROR_STOP=1'
  if ($LASTEXITCODE -ne 0) {
    throw 'Fixed production WP2 SQL command failed.'
  }
  $JsonLine = $Rows | Where-Object {
    -not [string]::IsNullOrWhiteSpace($_) -and $_.TrimStart().StartsWith('{')
  } | Select-Object -Last 1
  if ([string]::IsNullOrWhiteSpace([string]$JsonLine)) {
    throw 'Fixed production WP2 SQL returned no JSON evidence.'
  }
  try {
    return ([string]$JsonLine | ConvertFrom-Json)
  } catch {
    throw 'Fixed production WP2 SQL returned invalid JSON evidence.'
  }
}

function Read-Wp1GateSnapshot {
  $Rows = & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--quiet' `
    '--tuples-only' '--no-align' '--set=ON_ERROR_STOP=1' '--file' $GateSql
  if ($LASTEXITCODE -ne 0) {
    throw 'Production baseline gate query failed.'
  }
  $JsonLine = (($Rows | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Last 1) -join '').Trim()
  try {
    $Gate = $JsonLine | ConvertFrom-Json
  } catch {
    throw 'Production baseline gate returned invalid JSON.'
  }
  if ($Gate.identity.transactionReadOnly -ne $true) {
    throw 'Production baseline gate did not run in a native read-only transaction.'
  }
  return $Gate
}

function Assert-BaselineMatchesBackup([object]$Gate) {
  $ExpectedCounts = @{
    notesTotal = [int64]$ProductionAudit.tables.notes.rowCount
    chaptersTotal = [int64]$ProductionAudit.tables.chapters.rowCount
    englishAttemptsTotal = [int64]$ProductionAudit.tables.english_attempts.rowCount
    englishAttemptAnswersTotal = [int64]$ProductionAudit.tables.english_attempt_answers.rowCount
    adminUsersTotal = [int64]$ProductionAudit.tables.admin_users.rowCount
  }
  foreach ($Name in $ExpectedCounts.Keys) {
    if ([int64]$Gate.baseline.$Name -ne $ExpectedCounts[$Name]) {
      throw "Production baseline row count differs from the fresh backup: $Name"
    }
  }
  $ExpectedChecksums = @{
    notesStableChecksum = [string]$ProductionAudit.tables.notes.checksum
    chaptersChecksum = [string]$ProductionAudit.tables.chapters.checksum
    englishAttemptsChecksum = [string]$ProductionAudit.tables.english_attempts.checksum
    englishAttemptAnswersChecksum = [string]$ProductionAudit.tables.english_attempt_answers.checksum
    adminUsersChecksum = [string]$ProductionAudit.tables.admin_users.checksum
  }
  foreach ($Name in $ExpectedChecksums.Keys) {
    if ([string]$Gate.baseline.$Name -cne $ExpectedChecksums[$Name]) {
      throw "Production baseline checksum differs from the fresh backup: $Name"
    }
  }
  if (
    [int64]$Gate.integrity.invalidChapterScopeRows -ne 0 -or
    [int64]$Gate.integrity.unmatchedAdminUsers -ne 0 -or
    $Gate.schema.contentVersionReady -ne $true -or
    $Gate.schema.boundaryAlignmentReady -ne $true
  ) {
    throw 'Production baseline has an integrity, content_version, or boundary-alignment failure.'
  }
}

function Assert-BaselineStable([object]$Before, [object]$After) {
  foreach ($Name in @(
    'notesTotal', 'notesPublished', 'notesPrivate', 'notesStableChecksum', 'publishedNoteIdsMd5',
    'chaptersTotal', 'chaptersChecksum', 'englishAttemptsTotal', 'englishAttemptsChecksum',
    'englishAttemptAnswersTotal', 'englishAttemptAnswersChecksum', 'adminUsersTotal', 'adminUsersChecksum'
  )) {
    if ([string]$Before.baseline.$Name -cne [string]$After.baseline.$Name) {
      throw "Production 0015 changed a protected baseline value: $Name"
    }
  }
}

$PreflightSql = @'
begin transaction read only;
select jsonb_build_object(
  'identityOk', current_database() = 'postgres' and current_user = 'postgres',
  'notesTable', to_regclass('public.notes') is not null,
  'contentVersionColumn', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notes' and column_name = 'content_version'
      and data_type = 'bigint' and is_nullable = 'NO'
  ),
  'contentVersionInvalid', (select count(*) from public.notes where content_version < 1),
  'pgcrypto', exists (select 1 from pg_extension where extname = 'pgcrypto'),
  'privateSchema', to_regnamespace('private') is not null,
  'immutableEventFunction', to_regprocedure('private.reject_immutable_event_mutation()') is not null,
  'snapshotTable', to_regclass('public.content_migration_snapshots') is not null,
  'adminCount', (select count(*) from public.admin_users),
  'adminAuthCount', (
    select count(*) from public.admin_users admin_user
    join auth.users auth_user on lower(auth_user.email) = lower(admin_user.email)
  ),
  'notesTotal', (select count(*) from public.notes),
  'notesStableMd5', coalesce((
    select md5(string_agg(to_jsonb(note_row)::text, chr(30) order by note_row.id))
    from public.notes note_row
  ), '')
)::text;
rollback;
'@

$PostflightSql = @'
begin transaction read only;
with apply_fn as (
  select p.oid from pg_proc p
  where p.oid = to_regprocedure('public.apply_content_migration(uuid,text,text,text,bigint,text,text,text,boolean,text,text,text,text,jsonb)')
), rollback_fn as (
  select p.oid from pg_proc p
  where p.oid = to_regprocedure('public.rollback_content_migration(uuid,text,bigint,jsonb)')
)
select jsonb_build_object(
  'identityOk', current_database() = 'postgres' and current_user = 'postgres',
  'snapshotTable', to_regclass('public.content_migration_snapshots') is not null,
  'snapshotRls', coalesce((select relrowsecurity from pg_class where oid = 'public.content_migration_snapshots'::regclass), false),
  'snapshotForceRls', coalesce((select relforcerowsecurity from pg_class where oid = 'public.content_migration_snapshots'::regclass), false),
  'snapshotRows', (select count(*) from public.content_migration_snapshots),
  'adminPolicy', exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'content_migration_snapshots'
      and policyname = 'content_migration_snapshots_admin_select'
  ),
  'authenticatedSelect', has_table_privilege('authenticated', 'public.content_migration_snapshots', 'select'),
  'authenticatedInsert', has_table_privilege('authenticated', 'public.content_migration_snapshots', 'insert'),
  'authenticatedUpdate', has_table_privilege('authenticated', 'public.content_migration_snapshots', 'update'),
  'authenticatedDelete', has_table_privilege('authenticated', 'public.content_migration_snapshots', 'delete'),
  'anonSelect', has_table_privilege('anon', 'public.content_migration_snapshots', 'select'),
  'applyFunction', exists (select 1 from apply_fn),
  'rollbackFunction', exists (select 1 from rollback_fn),
  'applySecurityDefiner', coalesce((select prosecdef from pg_proc where oid = (select oid from apply_fn)), false),
  'rollbackSecurityDefiner', coalesce((select prosecdef from pg_proc where oid = (select oid from rollback_fn)), false),
  'applySearchPathEmpty', coalesce((select proconfig @> ARRAY['search_path=""'] from pg_proc where oid = (select oid from apply_fn)), false),
  'rollbackSearchPathEmpty', coalesce((select proconfig @> ARRAY['search_path=""'] from pg_proc where oid = (select oid from rollback_fn)), false),
  'applyAuthenticatedExecute', has_function_privilege('authenticated', 'public.apply_content_migration(uuid,text,text,text,bigint,text,text,text,boolean,text,text,text,text,jsonb)', 'execute'),
  'rollbackAuthenticatedExecute', has_function_privilege('authenticated', 'public.rollback_content_migration(uuid,text,bigint,jsonb)', 'execute'),
  'applyAnonExecute', has_function_privilege('anon', 'public.apply_content_migration(uuid,text,text,text,bigint,text,text,text,boolean,text,text,text,text,jsonb)', 'execute'),
  'rollbackAnonExecute', has_function_privilege('anon', 'public.rollback_content_migration(uuid,text,bigint,jsonb)', 'execute'),
  'immutableTrigger', exists (
    select 1 from pg_trigger where tgrelid = 'public.content_migration_snapshots'::regclass
      and tgname = 'reject_content_migration_snapshot_mutation'
  )
)::text;
rollback;
'@

function Assert-Preflight([object]$Result) {
  if (
    $Result.identityOk -ne $true -or
    $Result.notesTable -ne $true -or
    $Result.contentVersionColumn -ne $true -or
    [int64]$Result.contentVersionInvalid -ne 0 -or
    $Result.pgcrypto -ne $true -or
    $Result.privateSchema -ne $true -or
    $Result.immutableEventFunction -ne $true -or
    $Result.snapshotTable -ne $false -or
    [int64]$Result.adminCount -ne 1 -or
    [int64]$Result.adminAuthCount -ne 1
  ) {
    throw 'Production is not in the unique allowed pre-0015 state.'
  }
}

function Assert-Postflight([object]$Result) {
  if (
    $Result.identityOk -ne $true -or
    $Result.snapshotTable -ne $true -or
    $Result.snapshotRls -ne $true -or
    $Result.snapshotForceRls -ne $true -or
    [int64]$Result.snapshotRows -ne 0 -or
    $Result.adminPolicy -ne $true -or
    $Result.authenticatedSelect -ne $true -or
    $Result.authenticatedInsert -ne $false -or
    $Result.authenticatedUpdate -ne $false -or
    $Result.authenticatedDelete -ne $false -or
    $Result.anonSelect -ne $false -or
    $Result.applyFunction -ne $true -or
    $Result.rollbackFunction -ne $true -or
    $Result.applySecurityDefiner -ne $true -or
    $Result.rollbackSecurityDefiner -ne $true -or
    $Result.applySearchPathEmpty -ne $true -or
    $Result.rollbackSearchPathEmpty -ne $true -or
    $Result.applyAuthenticatedExecute -ne $true -or
    $Result.rollbackAuthenticatedExecute -ne $true -or
    $Result.applyAnonExecute -ne $false -or
    $Result.rollbackAnonExecute -ne $false -or
    $Result.immutableTrigger -ne $true
  ) {
    throw 'Production 0015 postflight matrix failed.'
  }
}

function Test-LoopbackPortListening([int]$Port) {
  $Client = [System.Net.Sockets.TcpClient]::new()
  try {
    $ConnectTask = $Client.ConnectAsync('127.0.0.1', $Port)
    if (-not $ConnectTask.Wait(250)) {
      return $false
    }
    return $Client.Connected
  } catch {
    return $false
  } finally {
    $Client.Dispose()
  }
}

$TunnelProcess = $null
$PreviousPgPassword = $env:PGPASSWORD
$PreviousPgOptions = $env:PGOPTIONS
try {
  $TunnelProcess = Start-Process -FilePath $Node -ArgumentList @($TunnelScript, 'production') `
    -WorkingDirectory $RepositoryRoot -WindowStyle Hidden -PassThru

  $TunnelReady = $false
  for ($Attempt = 0; $Attempt -lt 40; $Attempt += 1) {
    try {
      $Client = [System.Net.Sockets.TcpClient]::new()
      $Client.Connect('127.0.0.1', $LocalTunnelPort)
      $Client.Dispose()
      $TunnelReady = $true
      break
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }
  if (-not $TunnelReady) {
    throw 'Fixed production loopback tunnel did not become ready.'
  }

  $env:PGPASSWORD = [string]$Credential.databasePassword
  $env:PGOPTIONS = if ($Stage -in @('preflight', 'postflight')) {
    '-c default_transaction_read_only=on -c statement_timeout=60000'
  } else {
    '-c lock_timeout=5000 -c statement_timeout=120000'
  }

  $BaselineBefore = Read-Wp1GateSnapshot
  Assert-BaselineMatchesBackup $BaselineBefore
  $Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'

  if ($Stage -eq 'postflight') {
    $Postflight = Invoke-PsqlJson $PostflightSql
    Assert-Postflight $Postflight
    $Evidence = [ordered]@{
      evidenceVersion = 1
      stage = 'postflight'
      projectRef = $ProductionProjectRef
      backupCapturedAt = $BackupManifest.capturedAt
      migrationSha256 = $MigrationHash
      completedAt = [DateTimeOffset]::UtcNow.ToString('o')
      postflight = $Postflight
      baseline = $BaselineBefore
      productionConnected = $true
      productionWritePerformed = $false
    }
    $EvidencePath = Join-Path $ResolvedBackupDir "wp2-production-0015-postflight-$Timestamp.json"
    $Evidence | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
    Write-Output "PostflightEvidence=$EvidencePath"
    Write-Output 'WP2 production 0015 read-only postflight passed; no write was performed.'
    return
  }

  $Before = Invoke-PsqlJson $PreflightSql
  Assert-Preflight $Before
  if ($Stage -eq 'preflight') {
    $Evidence = [ordered]@{
      evidenceVersion = 1
      stage = 'preflight'
      projectRef = $ProductionProjectRef
      backupCapturedAt = $BackupManifest.capturedAt
      migrationSha256 = $MigrationHash
      completedAt = [DateTimeOffset]::UtcNow.ToString('o')
      preflight = $Before
      baseline = $BaselineBefore
      productionConnected = $true
      productionWritePerformed = $false
    }
    $EvidencePath = Join-Path $ResolvedBackupDir "wp2-production-0015-preflight-$Timestamp.json"
    $Evidence | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
    Write-Output "PreflightEvidence=$EvidencePath"
    Write-Output 'WP2 production 0015 read-only preflight passed; no write was performed.'
    return
  }

  & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--set=ON_ERROR_STOP=1' '--file' $MigrationPath
  if ($LASTEXITCODE -ne 0) {
    throw 'Production migration 0015 failed. No later WP2 stage was attempted.'
  }

  $Postflight = Invoke-PsqlJson $PostflightSql
  Assert-Postflight $Postflight
  $BaselineAfter = Read-Wp1GateSnapshot
  Assert-BaselineMatchesBackup $BaselineAfter
  Assert-BaselineStable $BaselineBefore $BaselineAfter

  $Evidence = [ordered]@{
    evidenceVersion = 1
    stage = '0015'
    projectRef = $ProductionProjectRef
    backupCapturedAt = $BackupManifest.capturedAt
    migrationFile = '0015_content_migration_snapshots.sql'
    migrationSha256 = $MigrationHash
    completedAt = [DateTimeOffset]::UtcNow.ToString('o')
    preflight = $Before
    postflight = $Postflight
    baselineBefore = $BaselineBefore
    baselineAfter = $BaselineAfter
    protectedBaselineStable = $true
    productionConnected = $true
    productionWritePerformed = $true
  }
  $EvidencePath = Join-Path $ResolvedBackupDir "wp2-production-0015-$Timestamp.json"
  $Evidence | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
  Write-Output "MigrationEvidence=$EvidencePath"
  Write-Output 'WP2 production 0015 passed. Stop and review evidence before any article migration.'
} finally {
  if ($null -eq $PreviousPgPassword) {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  } else {
    $env:PGPASSWORD = $PreviousPgPassword
  }
  if ($null -eq $PreviousPgOptions) {
    Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue
  } else {
    $env:PGOPTIONS = $PreviousPgOptions
  }
  if ($null -ne $TunnelProcess -and -not $TunnelProcess.HasExited) {
    Stop-Process -Id $TunnelProcess.Id -Force -ErrorAction SilentlyContinue
    $TunnelProcess.WaitForExit(5000) | Out-Null
  }
  for ($Attempt = 0; $Attempt -lt 20; $Attempt += 1) {
    if (-not (Test-LoopbackPortListening $LocalTunnelPort)) {
      break
    }
    Start-Sleep -Milliseconds 100
  }
  if (Test-LoopbackPortListening $LocalTunnelPort) {
    throw "Fixed production tunnel port $LocalTunnelPort was not cleaned up."
  }
}
