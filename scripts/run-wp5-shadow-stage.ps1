[CmdletBinding()]
param(
  [ValidateSet(
    'preflight',
    'preview-0016', 'commit-0016',
    'preview-0017', 'commit-0017',
    'preview-0018', 'commit-0018',
    'postflight'
  )]
  [string]$Stage = 'preflight',
  [string]$CredentialPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-shadow-credential-v2.json'),
  [switch]$ConfirmShadowPreview,
  [switch]$ConfirmShadowWrite,
  [string]$ConfirmationPhrase = ''
)

$ErrorActionPreference = 'Stop'
$ShadowProjectRef = 'qyjfcebqjtphlpsvizxo'
$ProductionProjectRef = 'kysywitrsjhcdlcrfayl'
$ExpectedShadowProjectName = 'Blog-shadow-wp1b'
$ExpectedShadowRegion = 'ap-southeast-1'
$LocalTunnelPort = 15433
$Expected0016Hash = '344abe1c7e158906ecd8740e548df9fcbcf15f8787fe67bd5a5e88268e64cf02'
$Expected0017Hash = 'a37670ae61b754f21fe5862bdaa5b091a8930641551817533bcdd05d056b09b7'
$Expected0018Hash = '3792b7e2b1a5f084feb1bf53ad65845bb1eb2a86b5ac68d139c09d4779e74ffa'
$PreviewPhrases = @{
  'preview-0016' = "PREVIEW $ShadowProjectRef WP5 0016 ROLLBACK"
  'preview-0017' = "PREVIEW $ShadowProjectRef WP5 0017 ROLLBACK"
  'preview-0018' = "PREVIEW $ShadowProjectRef WP5 0018 ROLLBACK"
}
$WritePhrases = @{
  'commit-0016' = "WRITE $ShadowProjectRef WP5 0016"
  'commit-0017' = "WRITE $ShadowProjectRef WP5 0017"
  'commit-0018' = "WRITE $ShadowProjectRef WP5 0018"
}

if ($ShadowProjectRef -eq $ProductionProjectRef) {
  throw '拒绝执行：fixed Shadow ref 与生产 ref 相同。'
}
if ($PreviewPhrases.ContainsKey($Stage) -and (
  -not $ConfirmShadowPreview -or $ConfirmationPhrase -cne $PreviewPhrases[$Stage]
)) {
  throw "事务预演需要 -ConfirmShadowPreview 和精确确认短语：$($PreviewPhrases[$Stage])"
}
if ($WritePhrases.ContainsKey($Stage) -and (
  -not $ConfirmShadowWrite -or $ConfirmationPhrase -cne $WritePhrases[$Stage]
)) {
  throw "Shadow 提交需要 -ConfirmShadowWrite 和精确确认短语：$($WritePhrases[$Stage])"
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ResolvedCredentialPath = (Resolve-Path -LiteralPath $CredentialPath).Path
$ExpectedCredentialRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups'))
$ExpectedCredentialPrefix = $ExpectedCredentialRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $ResolvedCredentialPath.StartsWith($ExpectedCredentialPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw '拒绝读取 .local-backups 之外的 Shadow 凭据。'
}

$Credential = Get-Content -Raw -Encoding UTF8 -LiteralPath $ResolvedCredentialPath | ConvertFrom-Json
if (
  [string]$Credential.projectName -cne $ExpectedShadowProjectName -or
  [string]$Credential.region -cne $ExpectedShadowRegion -or
  [string]::IsNullOrWhiteSpace([string]$Credential.databasePassword)
) {
  throw '固定 Shadow 凭据形状或目标标记不符合预期。'
}

$PgBin = (Resolve-Path (Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin')).Path
$Psql = Join-Path $PgBin 'psql.exe'
$TunnelScript = Join-Path $RepositoryRoot 'scripts\wp1b-pg-http-connect-tunnel.mjs'
$Migration0016 = Join-Path $RepositoryRoot 'supabase\migrations\0016_english_training_core_backfill.sql'
$Migration0017 = Join-Path $RepositoryRoot 'supabase\migrations\0017_english_training_command_rpc.sql'
$Migration0018 = Join-Path $RepositoryRoot 'supabase\migrations\0018_english_subjective_grade_rpc.sql'
$PreviewRoot = Join-Path $RepositoryRoot '.local-backups\wp5-shadow-preview'
$DatabaseParameters = @(
  'host=aws-0-ap-southeast-1.pooler.supabase.com',
  'hostaddr=127.0.0.1',
  "port=$LocalTunnelPort",
  'dbname=postgres',
  "user=postgres.$ShadowProjectRef",
  'sslmode=require',
  'connect_timeout=10'
) -join ' '

function Assert-FileHash([string]$Path, [string]$ExpectedHash, [string]$Label) {
  $ActualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
  if ($ActualHash -cne $ExpectedHash) {
    throw "$Label SHA-256 漂移：expected=$ExpectedHash actual=$ActualHash"
  }
}

function Get-LastJson([object[]]$Rows, [string]$Label) {
  $JsonLine = $Rows | Where-Object {
    -not [string]::IsNullOrWhiteSpace([string]$_) -and [string]$_.TrimStart().StartsWith('{')
  } | Select-Object -Last 1
  if ([string]::IsNullOrWhiteSpace([string]$JsonLine)) {
    throw "$Label 没有返回 JSON 证据。"
  }
  try {
    return ([string]$JsonLine | ConvertFrom-Json -Depth 30)
  } catch {
    throw "$Label 返回的 JSON 无效。"
  }
}

function Invoke-PsqlJson([string]$Sql, [string]$Label) {
  $Rows = & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--quiet' `
    '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' $Sql
  if ($LASTEXITCODE -ne 0) { throw "$Label SQL 执行失败。" }
  return Get-LastJson $Rows $Label
}

function New-RollbackMigrationCopy([string]$MigrationPath, [string]$Label) {
  New-Item -ItemType Directory -Path $PreviewRoot -Force | Out-Null
  $Lines = [System.Collections.Generic.List[string]]::new()
  Get-Content -Encoding UTF8 -LiteralPath $MigrationPath | ForEach-Object { $Lines.Add($_) }
  $FirstSqlIndex = -1
  for ($Index = 0; $Index -lt $Lines.Count; $Index += 1) {
    $Trimmed = $Lines[$Index].Trim()
    if ($Trimmed -and -not $Trimmed.StartsWith('--')) {
      $FirstSqlIndex = $Index
      break
    }
  }
  $LastSqlIndex = -1
  for ($Index = $Lines.Count - 1; $Index -ge 0; $Index -= 1) {
    if ($Lines[$Index].Trim()) {
      $LastSqlIndex = $Index
      break
    }
  }
  if ($FirstSqlIndex -lt 0 -or $Lines[$FirstSqlIndex].Trim().ToLowerInvariant() -cne 'begin;') {
    throw "$Label 预演拒绝：原迁移不再以 BEGIN 开始。"
  }
  if ($LastSqlIndex -lt 0 -or $Lines[$LastSqlIndex].Trim().ToLowerInvariant() -cne 'commit;') {
    throw "$Label 预演拒绝：原迁移不再以 COMMIT 结束。"
  }
  $Lines[$FirstSqlIndex] = '-- transaction begin is supplied by the rollback preview runner'
  $Lines[$LastSqlIndex] = '-- transaction commit is replaced by rollback in the preview runner'
  $PreviewPath = Join-Path $PreviewRoot "$Label-body.sql"
  [System.IO.File]::WriteAllLines($PreviewPath, $Lines, [System.Text.UTF8Encoding]::new($false))
  return $PreviewPath
}

function Invoke-RollbackPreview([string]$MigrationPath, [string]$VerificationSql, [string]$Label) {
  $PreviewPath = New-RollbackMigrationCopy $MigrationPath $Label
  try {
    $Rows = & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--quiet' `
      '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' `
      '--command' 'begin;' '--file' $PreviewPath '--command' $VerificationSql '--command' 'rollback;'
    if ($LASTEXITCODE -ne 0) { throw "$Label 事务预演失败。" }
    return Get-LastJson $Rows "$Label 事务预演"
  } finally {
    Remove-Item -LiteralPath $PreviewPath -Force -ErrorAction SilentlyContinue
  }
}

$SnapshotCoreSql = @'
with
command_proc as (
  select proc.oid, proc.proowner, proc.prosecdef, proc.proconfig, proc.proacl
  from pg_proc proc
  join pg_namespace namespace on namespace.oid = proc.pronamespace
  where proc.oid = to_regprocedure('public.record_english_training_command(uuid,smallint,text,jsonb,uuid,boolean)')
),
subjective_proc as (
  select proc.oid, proc.proowner, proc.prosecdef, proc.proconfig, proc.proacl
  from pg_proc proc
  join pg_namespace namespace on namespace.oid = proc.pronamespace
  where proc.oid in (
    to_regprocedure('public.record_english_subjective_submission(uuid,smallint,jsonb,uuid,numeric,text,jsonb)'),
    to_regprocedure('public.confirm_english_subjective_grade(uuid,uuid,numeric,text,jsonb,boolean)')
  )
),
legacy as (
  select
    count(*) as attempt_count,
    count(*) filter (where status = 'submitted') as submitted_count,
    md5(coalesce(string_agg(to_jsonb(row_value)::text, '' order by id), '')) as fingerprint
  from public.english_attempts row_value
),
legacy_answers as (
  select
    count(*) as answer_count,
    md5(coalesce(string_agg(to_jsonb(row_value)::text, '' order by id), '')) as fingerprint
  from public.english_attempt_answers row_value
),
expected_system as (
  select count(distinct attempt.id) as grade_count
  from public.english_attempts attempt
  join public.english_passages passage on passage.id = attempt.passage_id
  where attempt.status = 'submitted'
    and passage.section in ('reading', 'cloze', 'new_type')
),
shared as (
  select
    count(*) as attempt_count,
    count(*) filter (where id in (select id from public.english_attempts)) as mapped_attempt_count,
    md5(coalesce(string_agg(
      id::text || chr(31) || user_id::text || chr(31) || coalesce(english_passage_id::text, '') ||
      chr(31) || round::text || chr(31) || status,
      chr(30) order by id
    ), '')) as fingerprint
  from public.attempts
  where source_kind = 'english_passage'
),
shared_revisions as (
  select
    count(*) as revision_count,
    count(*) filter (where revision.id in (select id from public.english_attempts where status = 'submitted')) as mapped_revision_count
  from public.attempt_revisions revision
  join public.attempts attempt on attempt.id = revision.attempt_id
  where attempt.source_kind = 'english_passage'
),
shared_grades as (
  select
    count(*) as grade_count,
    count(*) filter (
      where grade.origin = 'legacy_imported'
        and grade.revision_id in (select id from public.english_attempts where status = 'submitted')
    ) as mapped_legacy_grade_count,
    count(*) filter (
      where grade.origin = 'system_scored'
        and grade.revision_id in (select id from public.english_attempts where status = 'submitted')
    ) as mapped_system_grade_count
  from public.grades grade
  join public.attempt_revisions revision on revision.id = grade.revision_id
  join public.attempts attempt on attempt.id = revision.attempt_id
  where attempt.source_kind = 'english_passage'
)
select jsonb_build_object(
  'identityOk', current_database() = 'postgres' and current_user = 'postgres',
  'trainingCoreReady',
    to_regclass('public.attempts') is not null
    and to_regclass('public.attempt_revisions') is not null
    and to_regclass('public.grades') is not null,
  'englishSourceReady',
    to_regclass('public.english_papers') is not null
    and to_regclass('public.english_passages') is not null
    and to_regclass('public.english_questions') is not null,
  'legacyAttemptCount', (select attempt_count from legacy),
  'legacySubmittedCount', (select submitted_count from legacy),
  'legacyAnswerCount', (select answer_count from legacy_answers),
  'legacyAttemptFingerprint', (select fingerprint from legacy),
  'legacyAnswerFingerprint', (select fingerprint from legacy_answers),
  'expectedSystemGradeCount', (select grade_count from expected_system),
  'sharedAttemptCount', (select attempt_count from shared),
  'mappedAttemptCount', (select mapped_attempt_count from shared),
  'sharedAttemptFingerprint', (select fingerprint from shared),
  'sharedRevisionCount', (select revision_count from shared_revisions),
  'mappedRevisionCount', (select mapped_revision_count from shared_revisions),
  'sharedGradeCount', (select grade_count from shared_grades),
  'mappedLegacyGradeCount', (select mapped_legacy_grade_count from shared_grades),
  'mappedSystemGradeCount', (select mapped_system_grade_count from shared_grades),
  'normalizeFunctionExists',
    to_regprocedure('private.normalize_english_objective_answer(text)') is not null,
  'commandFunctionExists', exists (select 1 from command_proc),
  'commandSecurityDefiner', coalesce((select bool_and(prosecdef) from command_proc), false),
  'commandEmptySearchPath', coalesce((
    select bool_and(coalesce(proconfig, array[]::text[]) @> array['search_path=""']::text[])
    from command_proc
  ), false),
  'commandAuthenticatedExecute', coalesce((
    select bool_and(has_function_privilege('authenticated', oid, 'EXECUTE')) from command_proc
  ), false),
  'commandAnonExecute', coalesce((
    select bool_or(has_function_privilege('anon', oid, 'EXECUTE')) from command_proc
  ), false),
  'commandPublicExecute', coalesce((
    select bool_or(exists (
      select 1
      from aclexplode(coalesce(command_proc.proacl, acldefault('f', command_proc.proowner))) privilege
      where privilege.grantee = 0 and privilege.privilege_type = 'EXECUTE'
    )) from command_proc
  ), false),
  'subjectiveFunctionCount', (select count(*) from subjective_proc),
  'subjectiveSecurityDefinerCount', (select count(*) from subjective_proc where prosecdef),
  'subjectiveEmptySearchPathCount', (
    select count(*) from subjective_proc
    where coalesce(proconfig, array[]::text[]) @> array['search_path=""']::text[]
  ),
  'subjectiveAuthenticatedExecuteCount', (
    select count(*) from subjective_proc where has_function_privilege('authenticated', oid, 'EXECUTE')
  ),
  'subjectiveAnonExecuteCount', (
    select count(*) from subjective_proc where has_function_privilege('anon', oid, 'EXECUTE')
  ),
  'subjectivePublicExecuteCount', (
    select count(*)
    from subjective_proc
    where exists (
      select 1
      from aclexplode(coalesce(subjective_proc.proacl, acldefault('f', subjective_proc.proowner))) privilege
      where privilege.grantee = 0 and privilege.privilege_type = 'EXECUTE'
    )
  ),
  'formalGradeTriggerExists', exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.attempts'::regclass
      and tgname = 'verify_previous_attempt_formal_grade'
      and not tgisinternal
  )
)::text;
'@

$SnapshotSql = "begin transaction read only;`n$SnapshotCoreSql`nrollback;"

function Assert-Prerequisites([object]$Snapshot) {
  if (
    $Snapshot.identityOk -ne $true -or
    $Snapshot.trainingCoreReady -ne $true -or
    $Snapshot.englishSourceReady -ne $true
  ) {
    throw 'WP5 fixed Shadow 缺少共享训练核心或英语题源前置结构。'
  }
}

function Test-0016Ready([object]$Snapshot) {
  return (
    $Snapshot.normalizeFunctionExists -eq $true -and
    [int64]$Snapshot.mappedAttemptCount -eq [int64]$Snapshot.legacyAttemptCount -and
    [int64]$Snapshot.mappedRevisionCount -eq [int64]$Snapshot.legacySubmittedCount -and
    [int64]$Snapshot.mappedLegacyGradeCount -eq [int64]$Snapshot.legacySubmittedCount -and
    [int64]$Snapshot.mappedSystemGradeCount -eq [int64]$Snapshot.expectedSystemGradeCount
  )
}

function Assert-0016Ready([object]$Snapshot) {
  if (-not (Test-0016Ready $Snapshot)) {
    throw "0016 后验失败：legacy=$($Snapshot.legacyAttemptCount) mapped=$($Snapshot.mappedAttemptCount) revisions=$($Snapshot.mappedRevisionCount)/$($Snapshot.legacySubmittedCount) legacyGrades=$($Snapshot.mappedLegacyGradeCount) systemGrades=$($Snapshot.mappedSystemGradeCount)/$($Snapshot.expectedSystemGradeCount)"
  }
}

function Test-0017Ready([object]$Snapshot) {
  return (
    $Snapshot.commandFunctionExists -eq $true -and
    $Snapshot.commandSecurityDefiner -eq $true -and
    $Snapshot.commandEmptySearchPath -eq $true -and
    $Snapshot.commandAuthenticatedExecute -eq $true -and
    $Snapshot.commandAnonExecute -eq $false -and
    $Snapshot.commandPublicExecute -eq $false
  )
}

function Assert-0017Ready([object]$Snapshot) {
  if (-not (Test-0017Ready $Snapshot)) {
    throw '0017 后验失败：英语原子命令的 SECURITY DEFINER、空 search_path 或 execute 边界不正确。'
  }
}

function Test-0018Ready([object]$Snapshot) {
  return (
    [int]$Snapshot.subjectiveFunctionCount -eq 2 -and
    [int]$Snapshot.subjectiveSecurityDefinerCount -eq 2 -and
    [int]$Snapshot.subjectiveEmptySearchPathCount -eq 2 -and
    [int]$Snapshot.subjectiveAuthenticatedExecuteCount -eq 2 -and
    [int]$Snapshot.subjectiveAnonExecuteCount -eq 0 -and
    [int]$Snapshot.subjectivePublicExecuteCount -eq 0 -and
    $Snapshot.formalGradeTriggerExists -eq $true
  )
}

function Assert-0018Ready([object]$Snapshot) {
  if (-not (Test-0018Ready $Snapshot)) {
    throw '0018 后验失败：主观评分双 RPC、formal-grade trigger 或 execute 边界不正确。'
  }
}

function Assert-LegacyStable([object]$Before, [object]$After, [string]$Label) {
  foreach ($Property in @(
    'legacyAttemptCount', 'legacySubmittedCount', 'legacyAnswerCount',
    'legacyAttemptFingerprint', 'legacyAnswerFingerprint'
  )) {
    if ([string]$Before.$Property -cne [string]$After.$Property) {
      throw "$Label 稳定数据变化：$Property"
    }
  }
}

function Assert-StableData([object]$Before, [object]$After, [string]$Label) {
  Assert-LegacyStable $Before $After $Label
  foreach ($Property in @(
    'sharedAttemptCount', 'sharedAttemptFingerprint',
    'sharedRevisionCount', 'sharedGradeCount'
  )) {
    if ([string]$Before.$Property -cne [string]$After.$Property) {
      throw "$Label 稳定数据变化：$Property"
    }
  }
}

Assert-FileHash $Migration0016 $Expected0016Hash '0016'
Assert-FileHash $Migration0017 $Expected0017Hash '0017'
Assert-FileHash $Migration0018 $Expected0018Hash '0018'

$PreviousPgPassword = $env:PGPASSWORD
$PreviousPgOptions = $env:PGOPTIONS
$TunnelProcess = $null
try {
  $Node = (Get-Command node -ErrorAction Stop).Source
  $TunnelProcess = Start-Process -FilePath $Node `
    -ArgumentList @($TunnelScript, 'shadow') `
    -WorkingDirectory $RepositoryRoot -WindowStyle Hidden -PassThru

  $Ready = $false
  for ($Attempt = 0; $Attempt -lt 40; $Attempt += 1) {
    try {
      $Client = [System.Net.Sockets.TcpClient]::new()
      $Client.Connect('127.0.0.1', $LocalTunnelPort)
      $Client.Dispose()
      $Ready = $true
      break
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }
  if (-not $Ready) { throw '固定 Shadow 本地隧道未就绪。' }

  $env:PGPASSWORD = [string]$Credential.databasePassword
  if ($Stage -in @('preflight', 'postflight')) {
    $env:PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=60000 -c lock_timeout=5000'
  } else {
    $env:PGOPTIONS = '-c statement_timeout=120000 -c lock_timeout=10000'
  }

  $Before = Invoke-PsqlJson $SnapshotSql 'WP5 fixed Shadow snapshot'
  Assert-Prerequisites $Before
  $Ready0016 = Test-0016Ready $Before
  $Ready0017 = Test-0017Ready $Before
  $Ready0018 = Test-0018Ready $Before
  if ($Ready0017 -and -not $Ready0016) { throw 'WP5 Shadow 状态非法：0017 已就绪但 0016 未通过。' }
  if ($Ready0018 -and -not $Ready0017) { throw 'WP5 Shadow 状态非法：0018 已就绪但 0017 未通过。' }

  if ($Stage -eq 'preflight') {
    [pscustomobject]@{
      ProjectRef = $ShadowProjectRef
      Stage = $Stage
      ReadOnly = $true
      LegacyAttemptCount = [int64]$Before.legacyAttemptCount
      LegacyAnswerCount = [int64]$Before.legacyAnswerCount
      SharedAttemptCount = [int64]$Before.sharedAttemptCount
      Migration0016Ready = $Ready0016
      Migration0017Ready = $Ready0017
      Migration0018Ready = $Ready0018
      Migration0016Sha256 = $Expected0016Hash
      Migration0017Sha256 = $Expected0017Hash
      Migration0018Sha256 = $Expected0018Hash
    } | ConvertTo-Json -Compress
    return
  }

  if ($Stage -eq 'postflight') {
    Assert-0016Ready $Before
    Assert-0017Ready $Before
    Assert-0018Ready $Before
    [pscustomobject]@{
      ProjectRef = $ShadowProjectRef
      Stage = $Stage
      ReadOnly = $true
      Migration0016Ready = $true
      Migration0017Ready = $true
      Migration0018Ready = $true
      LegacyAttemptCount = [int64]$Before.legacyAttemptCount
      MappedAttemptCount = [int64]$Before.mappedAttemptCount
      MappedRevisionCount = [int64]$Before.mappedRevisionCount
      MappedLegacyGradeCount = [int64]$Before.mappedLegacyGradeCount
      MappedSystemGradeCount = [int64]$Before.mappedSystemGradeCount
      RlsAndRpcBoundaryPassed = $true
    } | ConvertTo-Json -Compress
    return
  }

  $MigrationByStage = @{
    'preview-0016' = $Migration0016
    'commit-0016' = $Migration0016
    'preview-0017' = $Migration0017
    'commit-0017' = $Migration0017
    'preview-0018' = $Migration0018
    'commit-0018' = $Migration0018
  }
  $Label = $Stage.Substring($Stage.Length - 4)

  if ($Label -eq '0016') {
    if ($Ready0016) {
      [pscustomobject]@{ ProjectRef = $ShadowProjectRef; Stage = $Stage; AlreadyReady = $true } | ConvertTo-Json -Compress
      return
    }
    if ($Before.normalizeFunctionExists -eq $true -or $Ready0017 -or $Ready0018) {
      throw '0016 处于部分应用状态，拒绝自动覆盖。'
    }
  } elseif ($Label -eq '0017') {
    Assert-0016Ready $Before
    if ($Ready0017) {
      [pscustomobject]@{ ProjectRef = $ShadowProjectRef; Stage = $Stage; AlreadyReady = $true } | ConvertTo-Json -Compress
      return
    }
    if ($Before.commandFunctionExists -eq $true -or $Ready0018) {
      throw '0017 处于部分应用状态，拒绝自动覆盖。'
    }
  } elseif ($Label -eq '0018') {
    Assert-0016Ready $Before
    Assert-0017Ready $Before
    if ($Ready0018) {
      [pscustomobject]@{ ProjectRef = $ShadowProjectRef; Stage = $Stage; AlreadyReady = $true } | ConvertTo-Json -Compress
      return
    }
    if (
      [int]$Before.subjectiveFunctionCount -ne 0 -or
      $Before.formalGradeTriggerExists -eq $true
    ) {
      throw '0018 处于部分应用状态，拒绝自动覆盖。'
    }
  }

  if ($Stage.StartsWith('preview-')) {
    $Inside = Invoke-RollbackPreview $MigrationByStage[$Stage] $SnapshotCoreSql $Label
    if ($Label -eq '0016') { Assert-0016Ready $Inside }
    if ($Label -eq '0017') { Assert-0017Ready $Inside }
    if ($Label -eq '0018') { Assert-0018Ready $Inside }
    $AfterRollback = Invoke-PsqlJson $SnapshotSql "$Label rollback snapshot"
    Assert-StableData $Before $AfterRollback "$Label rollback"
    if (
      (Test-0016Ready $Before) -ne (Test-0016Ready $AfterRollback) -or
      (Test-0017Ready $Before) -ne (Test-0017Ready $AfterRollback) -or
      (Test-0018Ready $Before) -ne (Test-0018Ready $AfterRollback)
    ) {
      throw "$Label 事务预演没有恢复迁移前状态。"
    }
    [pscustomobject]@{
      ProjectRef = $ShadowProjectRef
      Stage = $Stage
      TransactionRolledBack = $true
      MigrationReadyInsideTransaction = $true
      StableData = $true
    } | ConvertTo-Json -Compress
    return
  }

  & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--quiet' `
    '--set' 'ON_ERROR_STOP=1' '--file' $MigrationByStage[$Stage]
  if ($LASTEXITCODE -ne 0) { throw "$Label fixed Shadow 提交失败。" }
  $After = Invoke-PsqlJson $SnapshotSql "$Label commit snapshot"
  if ($Label -eq '0016') {
    Assert-LegacyStable $Before $After "$Label commit"
  } else {
    Assert-StableData $Before $After "$Label commit"
  }
  if ($Label -eq '0016') { Assert-0016Ready $After }
  if ($Label -eq '0017') { Assert-0016Ready $After; Assert-0017Ready $After }
  if ($Label -eq '0018') { Assert-0016Ready $After; Assert-0017Ready $After; Assert-0018Ready $After }
  [pscustomobject]@{
    ProjectRef = $ShadowProjectRef
    Stage = $Stage
    MigrationReady = $true
    StableLegacyData = $true
  } | ConvertTo-Json -Compress
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
  if (Test-Path -LiteralPath $PreviewRoot) {
    $ResolvedPreviewRoot = (Resolve-Path -LiteralPath $PreviewRoot).Path
    if (-not $ResolvedPreviewRoot.StartsWith($ExpectedCredentialPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "拒绝清理 .local-backups 之外的预演目录：$ResolvedPreviewRoot"
    }
    Remove-Item -LiteralPath $ResolvedPreviewRoot -Recurse -Force
  }
}
