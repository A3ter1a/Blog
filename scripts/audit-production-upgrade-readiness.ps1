[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupDir,
  [string]$CredentialPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-production-db-credential.json')
)

$ErrorActionPreference = 'Stop'
$ProductionProjectRef = 'kysywitrsjhcdlcrfayl'
$ExpectedPoolerHost = 'aws-1-ap-southeast-1.pooler.supabase.com'
$ExpectedPoolerPort = 5432
$ExpectedDatabase = 'postgres'
$ExpectedUsername = "postgres.$ProductionProjectRef"
$LocalTunnelPort = 15432

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$BackupRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups\wp1-b'))
$ResolvedBackupDir = (Resolve-Path -LiteralPath $BackupDir).Path
$BackupPrefix = $BackupRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $ResolvedBackupDir.StartsWith($BackupPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing to audit with a backup outside the fixed WP1-B backup root.'
}

foreach ($RequiredPath in @(
  (Join-Path $ResolvedBackupDir 'backup-manifest.json'),
  (Join-Path $ResolvedBackupDir 'production-audit-after.json'),
  $CredentialPath
)) {
  if (-not (Test-Path -LiteralPath $RequiredPath -PathType Leaf)) {
    throw "Required production audit input is missing: $RequiredPath"
  }
}

$Node = (Get-Command node -ErrorAction Stop).Source
& $Node (Join-Path $RepositoryRoot 'scripts\verify-wp1b-backup.mjs') '--dir' $ResolvedBackupDir
if ($LASTEXITCODE -ne 0) {
  throw 'Production backup verification failed.'
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

$AuditSql = @'
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

$TunnelProcess = $null
$PreviousPgPassword = $env:PGPASSWORD
$PreviousPgOptions = $env:PGOPTIONS
try {
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
  $Rows = $AuditSql | & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' `
    '--quiet' '--tuples-only' '--no-align' '--set=ON_ERROR_STOP=1'
  if ($LASTEXITCODE -ne 0) { throw 'Production readiness SQL failed.' }
  $JsonLine = $Rows | Where-Object { $_.TrimStart().StartsWith('{') } | Select-Object -Last 1
  $Result = [string]$JsonLine | ConvertFrom-Json
  if ($Result.identity.transactionReadOnly -ne $true -or $Result.identity.database -cne 'postgres' -or $Result.identity.user -cne 'postgres') {
    throw 'Production readiness audit identity or read-only guard failed.'
  }

  $Evidence = [ordered]@{
    evidenceVersion = 1
    projectRef = $ProductionProjectRef
    completedAt = [DateTimeOffset]::UtcNow.ToString('o')
    backupDirName = Split-Path -Leaf $ResolvedBackupDir
    result = $Result
    productionConnected = $true
    productionWritePerformed = $false
  }
  $EvidencePath = Join-Path $ResolvedBackupDir 'production-upgrade-readiness.json'
  $Evidence | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
  $Evidence | ConvertTo-Json -Depth 10 -Compress
  Write-Output "EvidencePath=$EvidencePath"
} finally {
  if ($null -eq $PreviousPgPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD = $PreviousPgPassword }
  if ($null -eq $PreviousPgOptions) { Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue } else { $env:PGOPTIONS = $PreviousPgOptions }
  if ($null -ne $TunnelProcess -and -not $TunnelProcess.HasExited) {
    Stop-Process -Id $TunnelProcess.Id -Force -ErrorAction SilentlyContinue
    $TunnelProcess.WaitForExit(5000) | Out-Null
  }
  if (Test-LoopbackPortListening $LocalTunnelPort) {
    throw "Production tunnel port $LocalTunnelPort was not cleaned up."
  }
}
