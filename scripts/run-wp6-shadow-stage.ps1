[CmdletBinding()]
param(
  [ValidateSet('preflight', 'preview-0019', 'commit-0019', 'postflight')]
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
$Expected0019Hash = '00ee78bfc527e46f6829a1b67688ef1a945beb3b5ed23d33c0d0df035a4e81b6'
$PreviewPhrase = "PREVIEW $ShadowProjectRef WP6 0019 ROLLBACK"
$WritePhrase = "WRITE $ShadowProjectRef WP6 0019"

if ($ShadowProjectRef -eq $ProductionProjectRef) {
  throw '拒绝执行：fixed Shadow ref 与生产 ref 相同。'
}
if ($Stage -eq 'preview-0019' -and (
  -not $ConfirmShadowPreview -or $ConfirmationPhrase -cne $PreviewPhrase
)) {
  throw "事务预演需要 -ConfirmShadowPreview 和精确确认短语：$PreviewPhrase"
}
if ($Stage -eq 'commit-0019' -and (
  -not $ConfirmShadowWrite -or $ConfirmationPhrase -cne $WritePhrase
)) {
  throw "Shadow 提交需要 -ConfirmShadowWrite 和精确确认短语：$WritePhrase"
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
$Migration0019 = Join-Path $RepositoryRoot 'supabase\migrations\0019_math_training_and_booklet_core.sql'
$PreviewRoot = Join-Path $RepositoryRoot '.local-backups\wp6-shadow-preview'
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

function New-RollbackMigrationCopy([string]$MigrationPath) {
  New-Item -ItemType Directory -Path $PreviewRoot -Force | Out-Null
  $Lines = [System.Collections.Generic.List[string]]::new()
  Get-Content -Encoding UTF8 -LiteralPath $MigrationPath | ForEach-Object { $Lines.Add($_) }
  $FirstSqlIndex = -1
  for ($Index = 0; $Index -lt $Lines.Count; $Index += 1) {
    $Trimmed = $Lines[$Index].Trim()
    if ($Trimmed -and -not $Trimmed.StartsWith('--')) { $FirstSqlIndex = $Index; break }
  }
  $LastSqlIndex = -1
  for ($Index = $Lines.Count - 1; $Index -ge 0; $Index -= 1) {
    if ($Lines[$Index].Trim()) { $LastSqlIndex = $Index; break }
  }
  if ($FirstSqlIndex -lt 0 -or $Lines[$FirstSqlIndex].Trim().ToLowerInvariant() -cne 'begin;') {
    throw '0019 预演拒绝：原迁移不再以 BEGIN 开始。'
  }
  if ($LastSqlIndex -lt 0 -or $Lines[$LastSqlIndex].Trim().ToLowerInvariant() -cne 'commit;') {
    throw '0019 预演拒绝：原迁移不再以 COMMIT 结束。'
  }
  $Lines[$FirstSqlIndex] = '-- transaction begin is supplied by the rollback preview runner'
  $Lines[$LastSqlIndex] = '-- transaction commit is replaced by rollback in the preview runner'
  $PreviewPath = Join-Path $PreviewRoot '0019-body.sql'
  [System.IO.File]::WriteAllLines($PreviewPath, $Lines, [System.Text.UTF8Encoding]::new($false))
  return $PreviewPath
}

function Invoke-RollbackPreview([string]$VerificationSql) {
  $PreviewPath = New-RollbackMigrationCopy $Migration0019
  try {
    $Rows = & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--quiet' `
      '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' `
      '--command' 'begin;' '--file' $PreviewPath '--command' $VerificationSql '--command' 'rollback;'
    if ($LASTEXITCODE -ne 0) { throw '0019 fixed Shadow 事务预演失败。' }
    return Get-LastJson $Rows '0019 fixed Shadow 事务预演'
  } finally {
    Remove-Item -LiteralPath $PreviewPath -Force -ErrorAction SilentlyContinue
  }
}

$SnapshotCoreSql = @'
with
required_functions(signature) as (
  values
    ('public.start_math_paper_attempt(uuid,smallint,uuid)'),
    ('public.record_math_ocr_confirmation(uuid,uuid,jsonb,jsonb)'),
    ('public.record_math_ai_grade(uuid,uuid,numeric,numeric,text,jsonb,jsonb)'),
    ('public.confirm_math_grade(uuid,uuid,numeric,text,jsonb,jsonb)'),
    ('public.list_math_papers()'),
    ('public.get_math_training_state(uuid)'),
    ('public.get_math_grade_source(uuid)'),
    ('public.create_private_booklet(uuid,text,text,jsonb,text,text,boolean)'),
    ('public.refresh_booklet_drift(uuid)')
),
function_state as (
  select required.signature, proc.oid, proc.proowner, proc.prosecdef, proc.proconfig, proc.proacl
  from required_functions required
  left join pg_proc proc on proc.oid = to_regprocedure(required.signature)
),
target_tables as (
  select class.oid, class.relrowsecurity, class.relforcerowsecurity
  from pg_class class
  join pg_namespace namespace on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
    and class.relname in ('math_papers', 'math_paper_problems', 'ocr_confirmations', 'math_grade_steps', 'booklets')
),
base_counts as (
  select
    (select count(*) from public.attempts) as attempt_count,
    (select count(*) from public.attempt_revisions) as revision_count,
    (select count(*) from public.grades) as grade_count,
    (select count(*) from public.notes) as note_count
)
select jsonb_build_object(
  'identityOk', current_database() = 'postgres' and current_user = 'postgres',
  'prerequisiteTableCount', (
    select count(*) from unnest(array[
      to_regclass('public.attempts'), to_regclass('public.attempt_revisions'),
      to_regclass('public.grades'), to_regclass('public.notes')
    ]) relation where relation is not null
  ),
  'prerequisiteFunctionCount', (
    select count(*) from unnest(array[
      to_regprocedure('private.reject_immutable_event_mutation()'),
      to_regprocedure('private.current_user_is_admin()'),
      to_regprocedure('private.ensure_previous_attempt_has_formal_grade()'),
      to_regprocedure('extensions.digest(bytea,text)')
    ]) procedure where procedure is not null
  ),
  'wp5SubjectiveRpcReady',
    to_regprocedure('public.record_english_subjective_submission(uuid,smallint,jsonb,uuid,numeric,text,jsonb)') is not null
    and to_regprocedure('public.confirm_english_subjective_grade(uuid,uuid,numeric,text,jsonb,boolean)') is not null,
  'gradesUserFinalPolicyReady', exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'grades' and policyname = 'grades_owner_insert_user_final'
  ),
  'baseAttemptCount', (select attempt_count from base_counts),
  'baseRevisionCount', (select revision_count from base_counts),
  'baseGradeCount', (select grade_count from base_counts),
  'baseNoteCount', (select note_count from base_counts),
  'targetTableCount', (select count(*) from target_tables),
  'targetRlsCount', (select count(*) from target_tables where relrowsecurity),
  'targetForceRlsCount', (select count(*) from target_tables where relforcerowsecurity),
  'sourceColumnCount', (
    select count(*) from information_schema.columns
    where table_schema = 'public'
      and (table_name, column_name) in (('attempts', 'math_paper_id'), ('grades', 'confirmation_id'))
  ),
  'targetFunctionCount', (select count(*) from function_state where oid is not null),
  'targetSecurityDefinerCount', (select count(*) from function_state where oid is not null and prosecdef),
  'targetEmptySearchPathCount', (
    select count(*) from function_state
    where oid is not null and coalesce(proconfig, array[]::text[]) @> array['search_path=""']::text[]
  ),
  'targetAuthenticatedExecuteCount', (
    select count(*) from function_state where oid is not null and has_function_privilege('authenticated', oid, 'EXECUTE')
  ),
  'targetAnonExecuteCount', (
    select count(*) from function_state where oid is not null and has_function_privilege('anon', oid, 'EXECUTE')
  ),
  'targetPublicExecuteCount', (
    select count(*) from function_state
    where oid is not null and exists (
      select 1 from aclexplode(coalesce(function_state.proacl, acldefault('f', function_state.proowner))) privilege
      where privilege.grantee = 0 and privilege.privilege_type = 'EXECUTE'
    )
  ),
  'targetPolicyCount', (
    select count(*) from pg_policies
    where schemaname = 'public' and policyname in (
      'math_papers_authenticated_select', 'math_papers_admin_insert', 'math_papers_admin_update',
      'math_paper_problems_authenticated_select', 'math_paper_problems_admin_insert', 'math_paper_problems_admin_update',
      'ocr_confirmations_owner_select', 'math_grade_steps_owner_select', 'booklets_owner_select'
    )
  ),
  'targetTriggerCount', (
    select count(*) from pg_trigger
    where not tgisinternal and tgname in (
      'enforce_math_problem_version', 'set_math_papers_updated_at', 'set_math_paper_problems_updated_at',
      'enforce_ocr_confirmation_append', 'reject_ocr_confirmation_mutation',
      'enforce_math_grade_confirmation', 'reject_math_grade_step_mutation', 'set_booklets_updated_at'
    )
  ),
  'targetIndexCount', (
    select count(*) from pg_indexes
    where schemaname = 'public' and indexname in (
      'math_paper_problems_paper_no_idx', 'attempts_unique_math_paper_round',
      'ocr_confirmations_attempt_created_idx', 'math_grade_steps_problem_idx', 'booklets_user_generated_idx'
    )
  ),
  'attemptSourceKindIncludesMath', exists (
    select 1 from pg_constraint
    where conrelid = to_regclass('public.attempts') and conname = 'attempts_source_kind_check'
      and pg_get_constraintdef(oid) ilike '%math_paper%'
  ),
  'attemptSourceShapeIncludesMath', exists (
    select 1 from pg_constraint
    where conrelid = to_regclass('public.attempts') and conname = 'attempts_source_shape_check'
      and pg_get_constraintdef(oid) ilike '%math_paper_id%'
  ),
  'gradeConfirmationShapeReady', exists (
    select 1 from pg_constraint
    where conrelid = to_regclass('public.grades') and conname = 'grades_confirmation_shape_check'
      and pg_get_constraintdef(oid) ilike '%confirmation_id%'
  ),
  'gradePolicyBlocksMath', exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'grades' and policyname = 'grades_owner_insert_user_final'
      and coalesce(with_check, '') ilike '%scoring_mode%math%'
      and coalesce(with_check, '') ilike '%confirmation_id%'
  )
)::text;
'@

$SnapshotSql = "begin transaction read only;`n$SnapshotCoreSql`nrollback;"

$DataSql = @'
begin transaction read only;
select jsonb_build_object(
  'mathPaperCount', (select count(*) from public.math_papers),
  'mathProblemCount', (select count(*) from public.math_paper_problems),
  'mathAttemptCount', (select count(*) from public.attempts where source_kind = 'math_paper'),
  'confirmationCount', (select count(*) from public.ocr_confirmations),
  'mathGradeCount', (select count(*) from public.grades where scoring_mode = 'math'),
  'gradeStepCount', (select count(*) from public.math_grade_steps),
  'bookletCount', (select count(*) from public.booklets)
)::text;
rollback;
'@

function Assert-Prerequisites([object]$Snapshot) {
  if (
    $Snapshot.identityOk -ne $true -or
    [int]$Snapshot.prerequisiteTableCount -ne 4 -or
    [int]$Snapshot.prerequisiteFunctionCount -ne 4 -or
    $Snapshot.wp5SubjectiveRpcReady -ne $true -or
    $Snapshot.gradesUserFinalPolicyReady -ne $true
  ) {
    throw 'WP6 fixed Shadow 缺少 0008、0010、0011、0018 或 pgcrypto 前置结构。'
  }
}

function Test-0019Ready([object]$Snapshot) {
  return (
    [int]$Snapshot.targetTableCount -eq 5 -and
    [int]$Snapshot.targetRlsCount -eq 5 -and
    [int]$Snapshot.targetForceRlsCount -eq 5 -and
    [int]$Snapshot.sourceColumnCount -eq 2 -and
    [int]$Snapshot.targetFunctionCount -eq 9 -and
    [int]$Snapshot.targetSecurityDefinerCount -eq 9 -and
    [int]$Snapshot.targetEmptySearchPathCount -eq 9 -and
    [int]$Snapshot.targetAuthenticatedExecuteCount -eq 9 -and
    [int]$Snapshot.targetAnonExecuteCount -eq 0 -and
    [int]$Snapshot.targetPublicExecuteCount -eq 0 -and
    [int]$Snapshot.targetPolicyCount -eq 9 -and
    [int]$Snapshot.targetTriggerCount -eq 8 -and
    [int]$Snapshot.targetIndexCount -eq 5 -and
    $Snapshot.attemptSourceKindIncludesMath -eq $true -and
    $Snapshot.attemptSourceShapeIncludesMath -eq $true -and
    $Snapshot.gradeConfirmationShapeReady -eq $true -and
    $Snapshot.gradePolicyBlocksMath -eq $true
  )
}

function Assert-0019Ready([object]$Snapshot) {
  if (-not (Test-0019Ready $Snapshot)) {
    throw "0019 后验失败：tables=$($Snapshot.targetTableCount)/5 columns=$($Snapshot.sourceColumnCount)/2 functions=$($Snapshot.targetFunctionCount)/9 policies=$($Snapshot.targetPolicyCount)/9 triggers=$($Snapshot.targetTriggerCount)/8 indexes=$($Snapshot.targetIndexCount)/5"
  }
}

function Test-0019PartiallyApplied([object]$Snapshot) {
  return (
    [int]$Snapshot.targetTableCount -gt 0 -or
    [int]$Snapshot.sourceColumnCount -gt 0 -or
    [int]$Snapshot.targetFunctionCount -gt 0 -or
    [int]$Snapshot.targetPolicyCount -gt 0 -or
    [int]$Snapshot.targetTriggerCount -gt 0 -or
    [int]$Snapshot.targetIndexCount -gt 0 -or
    $Snapshot.gradeConfirmationShapeReady -eq $true
  )
}

function Assert-BaseCountsStable([object]$Before, [object]$After, [string]$Label) {
  foreach ($Property in @('baseAttemptCount', 'baseRevisionCount', 'baseGradeCount', 'baseNoteCount')) {
    if ([string]$Before.$Property -cne [string]$After.$Property) {
      throw "$Label 稳定数据计数变化：$Property"
    }
  }
}

Assert-FileHash $Migration0019 $Expected0019Hash '0019'

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

  $Before = Invoke-PsqlJson $SnapshotSql 'WP6 fixed Shadow snapshot'
  Assert-Prerequisites $Before
  $Ready0019 = Test-0019Ready $Before

  if ($Stage -eq 'preflight') {
    if (-not $Ready0019 -and (Test-0019PartiallyApplied $Before)) {
      throw '0019 处于部分应用状态，拒绝进入预演或提交。'
    }
    [pscustomobject]@{
      ProjectRef = $ShadowProjectRef
      Stage = $Stage
      ReadOnly = $true
      Migration0019Ready = $Ready0019
      Migration0019PartiallyApplied = $false
      Migration0019Sha256 = $Expected0019Hash
      BaseAttemptCount = [int64]$Before.baseAttemptCount
      BaseRevisionCount = [int64]$Before.baseRevisionCount
      BaseGradeCount = [int64]$Before.baseGradeCount
      BaseNoteCount = [int64]$Before.baseNoteCount
      RealMathPaperImported = $false
    } | ConvertTo-Json -Compress
    return
  }

  if ($Stage -eq 'postflight') {
    Assert-0019Ready $Before
    $Data = Invoke-PsqlJson $DataSql 'WP6 fixed Shadow data postflight'
    [pscustomobject]@{
      ProjectRef = $ShadowProjectRef
      Stage = $Stage
      ReadOnly = $true
      Migration0019Ready = $true
      RlsAndRpcBoundaryPassed = $true
      MathPaperCount = [int64]$Data.mathPaperCount
      MathProblemCount = [int64]$Data.mathProblemCount
      MathAttemptCount = [int64]$Data.mathAttemptCount
      ConfirmationCount = [int64]$Data.confirmationCount
      MathGradeCount = [int64]$Data.mathGradeCount
      GradeStepCount = [int64]$Data.gradeStepCount
      BookletCount = [int64]$Data.bookletCount
      RealMathPaperImported = ([int64]$Data.mathPaperCount -gt 0 -and [int64]$Data.mathProblemCount -gt 0)
    } | ConvertTo-Json -Compress
    return
  }

  if ($Ready0019) {
    [pscustomobject]@{ ProjectRef = $ShadowProjectRef; Stage = $Stage; AlreadyReady = $true } | ConvertTo-Json -Compress
    return
  }
  if (Test-0019PartiallyApplied $Before) {
    throw '0019 处于部分应用状态，拒绝自动覆盖。'
  }

  if ($Stage -eq 'preview-0019') {
    $Inside = Invoke-RollbackPreview $SnapshotCoreSql
    Assert-0019Ready $Inside
    $AfterRollback = Invoke-PsqlJson $SnapshotSql '0019 rollback snapshot'
    Assert-BaseCountsStable $Before $AfterRollback '0019 rollback'
    if (Test-0019Ready $AfterRollback -or (Test-0019PartiallyApplied $AfterRollback)) {
      throw '0019 事务预演没有恢复迁移前状态。'
    }
    [pscustomobject]@{
      ProjectRef = $ShadowProjectRef
      Stage = $Stage
      TransactionRolledBack = $true
      MigrationReadyInsideTransaction = $true
      StableBaseDataCounts = $true
    } | ConvertTo-Json -Compress
    return
  }

  & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--quiet' `
    '--set' 'ON_ERROR_STOP=1' '--file' $Migration0019
  if ($LASTEXITCODE -ne 0) { throw '0019 fixed Shadow 提交失败。' }
  try {
    $After = Invoke-PsqlJson $SnapshotSql '0019 commit snapshot'
    Assert-BaseCountsStable $Before $After '0019 commit'
    Assert-0019Ready $After
    $Data = Invoke-PsqlJson $DataSql '0019 commit data postflight'
  } catch {
    [pscustomobject]@{
      ProjectRef = $ShadowProjectRef
      Stage = $Stage
      MigrationCommitted = $true
      PostflightPending = $true
      RequiredNextStage = 'postflight'
      Message = '0019 已由 psql 成功提交，但独立后验未完成；禁止重复提交，必须重新运行只读 postflight。'
    } | ConvertTo-Json -Compress
    return
  }
  [pscustomobject]@{
    ProjectRef = $ShadowProjectRef
    Stage = $Stage
    MigrationReady = $true
    StableBaseDataCounts = $true
    MathPaperCount = [int64]$Data.mathPaperCount
    MathProblemCount = [int64]$Data.mathProblemCount
    RealMathPaperImported = ([int64]$Data.mathPaperCount -gt 0 -and [int64]$Data.mathProblemCount -gt 0)
    PostflightPending = $false
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
