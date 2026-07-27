[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupDir,
  [string]$CredentialPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-production-db-credential.json'),
  [ValidateSet('preflight', '0014', '0016', '0017', '0018', '0019', '0020', '0021', '0022', 'postflight')]
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
$MigrationOrder = @('0014', '0016', '0017', '0018', '0019', '0020', '0021', '0022')
$MigrationFiles = [ordered]@{
  '0014' = '0014_job_item_lease_rpc.sql'
  '0016' = '0016_english_training_core_backfill.sql'
  '0017' = '0017_english_training_command_rpc.sql'
  '0018' = '0018_english_subjective_grade_rpc.sql'
  '0019' = '0019_math_training_and_booklet_core.sql'
  '0020' = '0020_problem_ocr_job_assets.sql'
  '0021' = '0021_private_note_rag_and_memory.sql'
  '0022' = '0022_private_note_rag_operator_fix.sql'
}
$ExpectedMigrationHashes = [ordered]@{
  '0014' = '7c7af2e7b543e23470a11140653f4ab7a4e543f933206465b4aa0b49e79c6559'
  '0016' = '344abe1c7e158906ecd8740e548df9fcbcf15f8787fe67bd5a5e88268e64cf02'
  '0017' = 'a37670ae61b754f21fe5862bdaa5b091a8930641551817533bcdd05d056b09b7'
  '0018' = '3792b7e2b1a5f084feb1bf53ad65845bb1eb2a86b5ac68d139c09d4779e74ffa'
  '0019' = '00ee78bfc527e46f6829a1b67688ef1a945beb3b5ed23d33c0d0df035a4e81b6'
  '0020' = 'e33724b90ce7997650f1a08513f00a93c5e0087c1a7289d3de2a67ac16d57ba2'
  '0021' = '8a5a14c117ff8e7e39ca2cd915277be1b4cbb36f20892176f550a9de7f78f97f'
  '0022' = 'b40918f65d9f4019da23293f1d0c60916aca59a5a9fb8874fff6a0b6350aa327'
}

if ($ProductionProjectRef -ceq $ShadowProjectRef) {
  throw 'Refusing to run: production ref equals the fixed shadow ref.'
}
$ExpectedPhrase = if ($Stage -in @('preflight', 'postflight')) {
  "READ $ProductionProjectRef UPGRADE $($Stage.ToUpperInvariant())"
} else {
  "WRITE $ProductionProjectRef UPGRADE $Stage"
}
if ($Stage -in @('preflight', 'postflight')) {
  if (-not $ConfirmProductionRead -or $ConfirmationPhrase -cne $ExpectedPhrase) {
    throw "Production $Stage requires -ConfirmProductionRead and the exact phrase: $ExpectedPhrase"
  }
} elseif (-not $ConfirmProductionWrite -or $ConfirmationPhrase -cne $ExpectedPhrase) {
  throw "Production $Stage requires -ConfirmProductionWrite and the exact phrase: $ExpectedPhrase"
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$BackupRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups\wp1-b'))
$ResolvedBackupDir = (Resolve-Path -LiteralPath $BackupDir).Path
$BackupPrefix = $BackupRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $ResolvedBackupDir.StartsWith($BackupPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing to run: backup directory is outside the fixed production backup root.'
}

$BackupManifestPath = Join-Path $ResolvedBackupDir 'backup-manifest.json'
$ProductionAuditPath = Join-Path $ResolvedBackupDir 'production-audit-after.json'
foreach ($RequiredPath in @($BackupManifestPath, $ProductionAuditPath, $CredentialPath)) {
  if (-not (Test-Path -LiteralPath $RequiredPath -PathType Leaf)) {
    throw "Required production input is missing: $RequiredPath"
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
foreach ($MigrationId in $MigrationOrder) {
  $MigrationPath = Join-Path $RepositoryRoot "supabase\migrations\$($MigrationFiles[$MigrationId])"
  if (-not (Test-Path -LiteralPath $MigrationPath -PathType Leaf)) {
    throw "Reviewed migration file is missing: $MigrationPath"
  }
  $ActualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $MigrationPath).Hash.ToLowerInvariant()
  if ($ActualHash -cne $ExpectedMigrationHashes[$MigrationId]) {
    throw "Production migration $MigrationId differs from the reviewed artifact."
  }
  $MigrationPaths[$MigrationId] = $MigrationPath
}

$ProductionAudit = Get-Content -Raw -Encoding UTF8 -LiteralPath $ProductionAuditPath | ConvertFrom-Json
$PgBin = (Resolve-Path (Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin')).Path
$Psql = Join-Path $PgBin 'psql.exe'
$TunnelScript = Join-Path $RepositoryRoot 'scripts\wp1b-pg-http-connect-tunnel.mjs'
$GateSql = Join-Path $RepositoryRoot 'supabase\wp1c-production-gate.sql'
$DatabaseParameters = @(
  "host=$ExpectedPoolerHost",
  'hostaddr=127.0.0.1',
  "port=$LocalTunnelPort",
  "dbname=$ExpectedDatabase",
  "user=$ExpectedUsername",
  'sslmode=require',
  'connect_timeout=10'
) -join ' '

$ReadinessSql = @'
begin transaction read only;
with function_counts as (
  select
    count(*) filter (where n.nspname = 'public' and p.proname in (
      'enqueue_job_item', 'claim_next_job_item', 'complete_job_item',
      'fail_job_item', 'reset_failed_job_item'
    )) as wp3_0014,
    count(*) filter (where n.nspname = 'private' and p.proname = 'normalize_english_objective_answer') as wp5_0016,
    count(*) filter (where n.nspname = 'public' and p.proname = 'record_english_training_command') as wp5_0017,
    count(*) filter (where (
      (n.nspname = 'private' and p.proname = 'ensure_previous_attempt_has_formal_grade') or
      (n.nspname = 'public' and p.proname in ('record_english_subjective_submission', 'confirm_english_subjective_grade'))
    )) as wp5_0018,
    count(*) filter (where n.nspname = 'public' and p.proname in (
      'start_math_paper_attempt', 'record_math_ocr_confirmation', 'record_math_ai_grade',
      'confirm_math_grade', 'list_math_papers', 'get_math_training_state',
      'get_math_grade_source', 'create_private_booklet', 'refresh_booklet_drift'
    )) as wp6_0019,
    count(*) filter (where n.nspname = 'public' and p.proname in (
      'sync_private_note_rag', 'search_private_note_rag', 'propose_assistant_memory',
      'decide_assistant_memory', 'list_assistant_memories'
    )) as wp7_0021
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
), table_counts as (
  select
    count(*) filter (where table_name in (
      'math_papers', 'math_paper_problems', 'ocr_confirmations', 'math_grade_steps', 'booklets'
    )) as wp6_0019,
    count(*) filter (where table_name in ('rag_chunks', 'memory_candidates')) as wp7_0021
  from information_schema.tables
  where table_schema = 'public'
), bucket_state as (
  select
    coalesce(public, true) as is_public,
    coalesce(file_size_limit, 0) as file_size_limit,
    coalesce(allowed_mime_types, array[]::text[]) as allowed_mime_types
  from storage.buckets
  where id = 'ocr-documents'
), snapshot_state as (
  select case when to_regclass('public.content_migration_snapshots') is null
    then 0 else (select count(*) from public.content_migration_snapshots) end as row_count
), english_state as (
  select
    (select count(*) from public.english_attempts) as legacy_attempts,
    (select count(*) from public.attempts a
      join public.english_attempts e on e.id = a.id
      where a.source_kind = 'english_passage') as mapped_attempts
), search_fix as (
  select exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'search_private_note_rag'
      and pg_get_functiondef(p.oid) ilike '%operator(extensions.<=>)%'
  ) as ready
)
select jsonb_build_object(
  'identity', jsonb_build_object(
    'database', current_database(),
    'user', current_user,
    'transactionReadOnly', current_setting('transaction_read_only') = 'on'
  ),
  'baseline', jsonb_build_object(
    'notes', (select count(*) from public.notes),
    'chapters', (select count(*) from public.chapters),
    'legacyEnglishAttempts', (select legacy_attempts from english_state),
    'mappedEnglishAttempts', (select mapped_attempts from english_state),
    'contentMigrationSnapshots', (select row_count from snapshot_state)
  ),
  'migrations', jsonb_build_object(
    '0014', (select wp3_0014 = 5 from function_counts),
    '0015', to_regclass('public.content_migration_snapshots') is not null,
    '0016', (select wp5_0016 = 1 and legacy_attempts = mapped_attempts from function_counts, english_state),
    '0017', (select wp5_0017 = 1 from function_counts),
    '0018', (select wp5_0018 = 3 from function_counts),
    '0019', (select function_counts.wp6_0019 = 9 and table_counts.wp6_0019 = 5 from function_counts, table_counts),
    '0020', coalesce((select
      not is_public and file_size_limit = 52428800
      and allowed_mime_types @> array['application/pdf','image/jpeg','image/png','image/webp']::text[]
      from bucket_state), false),
    '0021', (select function_counts.wp7_0021 = 5 and table_counts.wp7_0021 = 2 from function_counts, table_counts),
    '0022', (select ready from search_fix)
  ),
  'partialMarkers', jsonb_build_object(
    '0014FunctionCount', (select wp3_0014 from function_counts),
    '0016FunctionCount', (select wp5_0016 from function_counts),
    '0017FunctionCount', (select wp5_0017 from function_counts),
    '0018FunctionCount', (select wp5_0018 from function_counts),
    '0019FunctionCount', (select wp6_0019 from function_counts),
    '0019TableCount', (select wp6_0019 from table_counts),
    '0021FunctionCount', (select wp7_0021 from function_counts),
    '0021TableCount', (select wp7_0021 from table_counts)
  )
)::text;
rollback;
'@

function Invoke-PsqlJson([string]$Sql) {
  $Rows = $Sql | & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--quiet' `
    '--tuples-only' '--no-align' '--set=ON_ERROR_STOP=1'
  if ($LASTEXITCODE -ne 0) { throw 'Fixed production upgrade SQL command failed.' }
  $JsonLine = $Rows | Where-Object {
    -not [string]::IsNullOrWhiteSpace($_) -and $_.TrimStart().StartsWith('{')
  } | Select-Object -Last 1
  if ([string]::IsNullOrWhiteSpace([string]$JsonLine)) {
    throw 'Fixed production upgrade SQL returned no JSON evidence.'
  }
  try { return ([string]$JsonLine | ConvertFrom-Json) } catch {
    throw 'Fixed production upgrade SQL returned invalid JSON evidence.'
  }
}

function Read-Wp1GateSnapshot {
  $Rows = & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--quiet' `
    '--tuples-only' '--no-align' '--set=ON_ERROR_STOP=1' '--file' $GateSql
  if ($LASTEXITCODE -ne 0) { throw 'Production protected-baseline query failed.' }
  $JsonLine = (($Rows | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Last 1) -join '').Trim()
  try { $Gate = $JsonLine | ConvertFrom-Json } catch {
    throw 'Production protected-baseline query returned invalid JSON.'
  }
  if ($Gate.identity.transactionReadOnly -ne $true) {
    throw 'Production protected-baseline query was not read-only.'
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
    throw 'Production protected baseline has an integrity or schema-alignment failure.'
  }
}

function Assert-BaselineStable([object]$Before, [object]$After) {
  foreach ($Name in @(
    'notesTotal', 'notesPublished', 'notesPrivate', 'notesStableChecksum', 'publishedNoteIdsMd5',
    'chaptersTotal', 'chaptersChecksum', 'englishAttemptsTotal', 'englishAttemptsChecksum',
    'englishAttemptAnswersTotal', 'englishAttemptAnswersChecksum', 'adminUsersTotal', 'adminUsersChecksum'
  )) {
    if ([string]$Before.baseline.$Name -cne [string]$After.baseline.$Name) {
      throw "Production upgrade changed a protected baseline value: $Name"
    }
  }
}

function Get-MigrationValue([object]$State, [string]$MigrationId) {
  return [bool]$State.migrations.PSObject.Properties[$MigrationId].Value
}

function Assert-StateProgression([object]$State, [int]$CompletedCount) {
  if (
    $State.identity.transactionReadOnly -ne $true -or
    [string]$State.identity.database -cne 'postgres' -or
    [string]$State.identity.user -cne 'postgres' -or
    $State.migrations.'0015' -ne $true
  ) {
    throw 'Production identity, read-only state, or prerequisite 0015 is invalid.'
  }
  for ($Index = 0; $Index -lt $MigrationOrder.Count; $Index += 1) {
    $Expected = $Index -lt $CompletedCount
    $Actual = Get-MigrationValue $State $MigrationOrder[$Index]
    if ($Actual -ne $Expected) {
      throw "Production migration progression is not the unique expected prefix at $($MigrationOrder[$Index])."
    }
  }
  $ExpectedMarkers = @{
    '0014FunctionCount' = if ($CompletedCount -ge 1) { 5 } else { 0 }
    '0016FunctionCount' = if ($CompletedCount -ge 2) { 1 } else { 0 }
    '0017FunctionCount' = if ($CompletedCount -ge 3) { 1 } else { 0 }
    '0018FunctionCount' = if ($CompletedCount -ge 4) { 3 } else { 0 }
    '0019FunctionCount' = if ($CompletedCount -ge 5) { 9 } else { 0 }
    '0019TableCount' = if ($CompletedCount -ge 5) { 5 } else { 0 }
    '0021FunctionCount' = if ($CompletedCount -ge 7) { 5 } else { 0 }
    '0021TableCount' = if ($CompletedCount -ge 7) { 2 } else { 0 }
  }
  foreach ($Name in $ExpectedMarkers.Keys) {
    if ([int]$State.partialMarkers.$Name -ne [int]$ExpectedMarkers[$Name]) {
      throw "Production contains a partial or unexpected migration marker: $Name"
    }
  }
}

function Get-CompletedPrefixCount([object]$State) {
  $Count = 0
  $SeenMissing = $false
  foreach ($MigrationId in $MigrationOrder) {
    $Applied = Get-MigrationValue $State $MigrationId
    if ($Applied -and $SeenMissing) {
      throw "Production migration order has a gap before $MigrationId."
    }
    if ($Applied) { $Count += 1 } else { $SeenMissing = $true }
  }
  Assert-StateProgression $State $Count
  return $Count
}

function Test-LoopbackPortListening([int]$Port) {
  $Client = [System.Net.Sockets.TcpClient]::new()
  try {
    $Task = $Client.ConnectAsync('127.0.0.1', $Port)
    return $Task.Wait(250) -and $Client.Connected
  } catch { return $false } finally { $Client.Dispose() }
}

$TunnelProcess = $null
$PreviousPgPassword = $env:PGPASSWORD
$PreviousPgOptions = $env:PGOPTIONS
try {
  if (Test-LoopbackPortListening $LocalTunnelPort) {
    throw "Refusing to reuse an existing listener on production tunnel port $LocalTunnelPort."
  }
  $TunnelProcess = Start-Process -FilePath $Node -ArgumentList @($TunnelScript, 'production') `
    -WorkingDirectory $RepositoryRoot -WindowStyle Hidden -PassThru
  $Ready = $false
  for ($Attempt = 0; $Attempt -lt 40; $Attempt += 1) {
    if (Test-LoopbackPortListening $LocalTunnelPort) { $Ready = $true; break }
    Start-Sleep -Milliseconds 250
  }
  if (-not $Ready) { throw 'Production loopback tunnel did not become ready.' }

  $env:PGPASSWORD = [string]$Credential.databasePassword
  $env:PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=60000'
  $BaselineBefore = Read-Wp1GateSnapshot
  Assert-BaselineMatchesBackup $BaselineBefore
  $StateBefore = Invoke-PsqlJson $ReadinessSql
  $CompletedBefore = Get-CompletedPrefixCount $StateBefore
  $Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'

  if ($Stage -eq 'preflight') {
    $Evidence = [ordered]@{
      evidenceVersion = 1; stage = 'preflight'; projectRef = $ProductionProjectRef
      backupCapturedAt = $BackupManifest.capturedAt; completedAt = [DateTimeOffset]::UtcNow.ToString('o')
      completedPrefixCount = $CompletedBefore; nextMigration = if ($CompletedBefore -lt $MigrationOrder.Count) { $MigrationOrder[$CompletedBefore] } else { $null }
      readiness = $StateBefore; baseline = $BaselineBefore
      productionConnected = $true; productionWritePerformed = $false
    }
    $EvidencePath = Join-Path $ResolvedBackupDir "production-upgrade-preflight-$Timestamp.json"
    $Evidence | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
    Write-Output "PreflightEvidence=$EvidencePath"
    Write-Output "Production upgrade preflight passed. Completed=$CompletedBefore; no write was performed."
    return
  }

  if ($Stage -eq 'postflight') {
    Assert-StateProgression $StateBefore $MigrationOrder.Count
    $Evidence = [ordered]@{
      evidenceVersion = 1; stage = 'postflight'; projectRef = $ProductionProjectRef
      backupCapturedAt = $BackupManifest.capturedAt; completedAt = [DateTimeOffset]::UtcNow.ToString('o')
      readiness = $StateBefore; baseline = $BaselineBefore
      productionConnected = $true; productionWritePerformed = $false
    }
    $EvidencePath = Join-Path $ResolvedBackupDir "production-upgrade-postflight-$Timestamp.json"
    $Evidence | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
    Write-Output "PostflightEvidence=$EvidencePath"
    Write-Output 'Production upgrade read-only postflight passed; no write was performed.'
    return
  }

  $StageIndex = [array]::IndexOf($MigrationOrder, $Stage)
  Assert-StateProgression $StateBefore $StageIndex
  $env:PGOPTIONS = '-c lock_timeout=5000 -c statement_timeout=180000'
  & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--set=ON_ERROR_STOP=1' `
    '--file' $MigrationPaths[$Stage]
  if ($LASTEXITCODE -ne 0) {
    throw "Production migration $Stage failed. No later migration was attempted."
  }

  $env:PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=60000'
  $StateAfter = Invoke-PsqlJson $ReadinessSql
  Assert-StateProgression $StateAfter ($StageIndex + 1)
  $BaselineAfter = Read-Wp1GateSnapshot
  Assert-BaselineMatchesBackup $BaselineAfter
  Assert-BaselineStable $BaselineBefore $BaselineAfter

  $Evidence = [ordered]@{
    evidenceVersion = 1; stage = $Stage; projectRef = $ProductionProjectRef
    backupCapturedAt = $BackupManifest.capturedAt; migrationFile = $MigrationFiles[$Stage]
    migrationSha256 = $ExpectedMigrationHashes[$Stage]; completedAt = [DateTimeOffset]::UtcNow.ToString('o')
    readinessBefore = $StateBefore; readinessAfter = $StateAfter
    baselineBefore = $BaselineBefore; baselineAfter = $BaselineAfter; protectedBaselineStable = $true
    productionConnected = $true; productionWritePerformed = $true
  }
  $EvidencePath = Join-Path $ResolvedBackupDir "production-upgrade-$Stage-$Timestamp.json"
  $Evidence | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
  Write-Output "MigrationEvidence=$EvidencePath"
  Write-Output "Production migration $Stage passed and its protected baseline remained stable."
} finally {
  if ($null -eq $PreviousPgPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD = $PreviousPgPassword }
  if ($null -eq $PreviousPgOptions) { Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue } else { $env:PGOPTIONS = $PreviousPgOptions }
  if ($null -ne $TunnelProcess -and -not $TunnelProcess.HasExited) {
    Stop-Process -Id $TunnelProcess.Id -Force -ErrorAction SilentlyContinue
    $TunnelProcess.WaitForExit(5000) | Out-Null
  }
  for ($Attempt = 0; $Attempt -lt 20; $Attempt += 1) {
    if (-not (Test-LoopbackPortListening $LocalTunnelPort)) { break }
    Start-Sleep -Milliseconds 100
  }
  if (Test-LoopbackPortListening $LocalTunnelPort) {
    throw "Production tunnel port $LocalTunnelPort was not cleaned up."
  }
}
