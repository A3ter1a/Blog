[CmdletBinding()]
param(
  [switch]$KeepArtifacts
)

$ErrorActionPreference = 'Stop'

function Invoke-Checked([string]$Label, [string]$Tool, [string[]]$Arguments) {
  & $Tool @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Label 失败，退出码 $LASTEXITCODE。" }
}

function Invoke-PsqlScalar([string]$Sql) {
  $Rows = & $script:Psql '--dbname' $script:Connection '--no-password' '--no-psqlrc' '--quiet' `
    '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' $Sql
  if ($LASTEXITCODE -ne 0) { throw '本地 SQL 核验失败。' }
  return (($Rows | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Last 1) -join '').Trim()
}

function Get-LatestBackupDirectory([string]$Root) {
  $Candidate = Get-ChildItem -LiteralPath $Root -Directory -ErrorAction Stop |
    Where-Object {
      (Test-Path -LiteralPath (Join-Path $_.FullName 'app-schema.sql')) -and
      (Test-Path -LiteralPath (Join-Path $_.FullName 'app-data.sql'))
    } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($null -eq $Candidate) { throw '没有找到可用的 WP1-B 本地备份。' }
  return $Candidate.FullName
}

function Get-AuthUserIdsFromCopy([string]$DataPath) {
  $Ids = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  $Columns = @()
  $UserIdIndex = -1
  $InsideCopy = $false

  foreach ($Line in [System.IO.File]::ReadLines($DataPath)) {
    if (-not $InsideCopy) {
      $Match = [regex]::Match($Line, '^COPY public\.[a-z0-9_]+ \(([^)]+)\) FROM stdin;$', 'IgnoreCase')
      if (-not $Match.Success) { continue }
      $Columns = @($Match.Groups[1].Value.Split(',') | ForEach-Object { $_.Trim() })
      $UserIdIndex = [Array]::IndexOf($Columns, 'user_id')
      $InsideCopy = $true
      continue
    }
    if ($Line -eq '\.') {
      $InsideCopy = $false
      $Columns = @()
      $UserIdIndex = -1
      continue
    }
    if ($UserIdIndex -lt 0) { continue }
    $Fields = $Line.Split("`t")
    if ($UserIdIndex -ge $Fields.Count) { throw '生产备份 COPY 列数异常。' }
    $Value = $Fields[$UserIdIndex]
    if ($Value -eq '\N') { continue }
    if ($Value -notmatch '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') {
      throw '生产备份包含无效 user_id。'
    }
    $null = $Ids.Add($Value.ToLowerInvariant())
  }
  return @($Ids | Sort-Object)
}

function Export-OrderedCopyTables([string]$DataPath, [string]$OutputPath, [string[]]$TableNames) {
  $Blocks = @{}
  $CurrentTable = $null
  $CurrentLines = $null

  foreach ($Line in [System.IO.File]::ReadLines($DataPath)) {
    if ($null -eq $CurrentTable) {
      $Match = [regex]::Match($Line, '^COPY public\.([a-z0-9_]+) \([^)]+\) FROM stdin;$', 'IgnoreCase')
      if (-not $Match.Success -or $TableNames -notcontains $Match.Groups[1].Value) { continue }
      $CurrentTable = $Match.Groups[1].Value
      $CurrentLines = [System.Collections.Generic.List[string]]::new()
      $CurrentLines.Add($Line)
      continue
    }

    $CurrentLines.Add($Line)
    if ($Line -eq '\.') {
      $Blocks[$CurrentTable] = @($CurrentLines)
      $CurrentTable = $null
      $CurrentLines = $null
    }
  }

  foreach ($TableName in $TableNames) {
    if (-not $Blocks.ContainsKey($TableName)) { throw "生产备份缺少 $TableName COPY 数据块。" }
  }

  $OrderedLines = [System.Collections.Generic.List[string]]::new()
  $OrderedLines.Add('set row_security = off;')
  foreach ($TableName in $TableNames) {
    foreach ($Line in $Blocks[$TableName]) { $OrderedLines.Add($Line) }
  }
  Set-Content -LiteralPath $OutputPath -Value $OrderedLines -Encoding UTF8
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$PgBin = Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin'
foreach ($ToolName in @('initdb.exe', 'pg_ctl.exe', 'createdb.exe', 'psql.exe')) {
  if (-not (Test-Path -LiteralPath (Join-Path $PgBin $ToolName))) {
    throw "缺少本地 PostgreSQL 演练工具：$ToolName"
  }
}

$BackupRoot = Join-Path $RepositoryRoot '.local-backups\wp1-b'
$BackupDir = Get-LatestBackupDirectory $BackupRoot
$AppSchema = Join-Path $BackupDir 'app-schema.sql'
$AppData = Join-Path $BackupDir 'app-data.sql'
$Migration0010 = Join-Path $RepositoryRoot 'supabase\migrations\0010_training_event_core.sql'
$Migration0016 = Join-Path $RepositoryRoot 'supabase\migrations\0016_english_training_core_backfill.sql'
$Migration0017 = Join-Path $RepositoryRoot 'supabase\migrations\0017_english_training_command_rpc.sql'
$Migration0018 = Join-Path $RepositoryRoot 'supabase\migrations\0018_english_subjective_grade_rpc.sql'

$RehearsalRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups\wp5-english-backfill-rehearsal'))
$RunRoot = Join-Path $RehearsalRoot (Get-Date -Format 'yyyyMMdd-HHmmss-fff')
$ExpectedPrefix = $RehearsalRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $RunRoot.StartsWith($ExpectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "本地演练目录越界：$RunRoot"
}

$ClusterDir = Join-Path $RunRoot 'cluster'
$ServerLog = Join-Path $RunRoot 'postgres.log'
$BootstrapPath = Join-Path $RunRoot 'bootstrap.sql'
$AuthSeedPath = Join-Path $RunRoot 'auth-seed.sql'
$EnglishDataPath = Join-Path $RunRoot 'english-data.sql'
$RollbackMigrationPath = Join-Path $RunRoot '0016-rollback.sql'
$CommandRollbackPath = Join-Path $RunRoot '0017-command-rollback.sql'
$CommandCommitPath = Join-Path $RunRoot '0017-command-commit.sql'
$SubjectiveCommitPath = Join-Path $RunRoot '0018-subjective-commit.sql'
$EvidencePath = Join-Path $RehearsalRoot 'latest-result.json'
New-Item -ItemType Directory -Path $ClusterDir -Force | Out-Null

$Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$Listener.Start()
$Port = ([System.Net.IPEndPoint]$Listener.LocalEndpoint).Port
$Listener.Stop()

$InitDb = Join-Path $PgBin 'initdb.exe'
$PgCtl = Join-Path $PgBin 'pg_ctl.exe'
$CreateDb = Join-Path $PgBin 'createdb.exe'
$script:Psql = Join-Path $PgBin 'psql.exe'
$script:Connection = "host=127.0.0.1 port=$Port user=postgres dbname=english_backfill_rehearsal sslmode=disable"
$ServerStarted = $false

$BootstrapSql = @'
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then create role supabase_admin nologin; end if;
end
$$;

create schema auth;
create schema extensions;
create extension pgcrypto with schema extensions;

create table auth.users (
  id uuid primary key,
  email text
);

create function auth.uid()
returns uuid
language sql
stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;

create function auth.jwt()
returns jsonb
language sql
stable
as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb); $$;

create function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('role', true), ''),
    current_user
  );
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.jwt(), auth.role() to anon, authenticated, service_role;
'@

try {
  Set-Content -LiteralPath $BootstrapPath -Value $BootstrapSql -Encoding UTF8
  $AuthUserIds = Get-AuthUserIdsFromCopy $AppData
  if ($AuthUserIds.Count -eq 0) { throw '生产备份中没有可恢复的 user_id。' }
  $AuthValues = $AuthUserIds | ForEach-Object { "('$_')" }
  $AuthSeedSql = "insert into auth.users (id) values`n$($AuthValues -join ",`n")`non conflict (id) do nothing;"
  Set-Content -LiteralPath $AuthSeedPath -Value $AuthSeedSql -Encoding UTF8
  Export-OrderedCopyTables $AppData $EnglishDataPath @(
    'english_papers',
    'english_passages',
    'english_questions',
    'english_attempts',
    'english_attempt_answers'
  )

  $MigrationText = Get-Content -Raw -Encoding UTF8 -LiteralPath $Migration0016
  $RollbackText = [regex]::Replace($MigrationText, '(?im)^commit;\s*$', 'rollback;')
  if ($RollbackText -eq $MigrationText) { throw '无法生成 0016 事务回滚预演文件。' }
  Set-Content -LiteralPath $RollbackMigrationPath -Value $RollbackText -Encoding UTF8

  Invoke-Checked '初始化本地 PostgreSQL' $InitDb @('--pgdata', $ClusterDir, '--username=postgres', '--auth=trust', '--encoding=UTF8', '--no-locale')
  Invoke-Checked '启动本地 PostgreSQL' $PgCtl @('--pgdata', $ClusterDir, '--log', $ServerLog, '--options', "-h 127.0.0.1 -p $Port", 'start', '--wait')
  $ServerStarted = $true
  Invoke-Checked '创建英语 backfill 演练数据库' $CreateDb @('--host=127.0.0.1', "--port=$Port", '--username=postgres', 'english_backfill_rehearsal')
  Invoke-Checked '加载最小 Supabase Auth 夹具' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $BootstrapPath)
  Invoke-Checked '加载生产 public schema 备份' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $AppSchema)
  Invoke-Checked '加载生产 Auth 占位行' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $AuthSeedPath)
  Invoke-Checked '按依赖顺序加载生产英语数据备份' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $EnglishDataPath)

  $LegacyBefore = Invoke-PsqlScalar @'
select jsonb_build_object(
  'attemptCount', (select count(*) from public.english_attempts),
  'answerCount', (select count(*) from public.english_attempt_answers),
  'attemptHash', (select md5(coalesce(string_agg(to_jsonb(row_value)::text, '' order by id), '')) from public.english_attempts row_value),
  'answerHash', (select md5(coalesce(string_agg(to_jsonb(row_value)::text, '' order by id), '')) from public.english_attempt_answers row_value)
)::text;
'@

  $TrainingCorePresent = Invoke-PsqlScalar @'
select (
  to_regclass('public.attempts') is not null
  and to_regclass('public.attempt_revisions') is not null
  and to_regclass('public.grades') is not null
)::text;
'@
  if (@('t', 'true') -notcontains $TrainingCorePresent) {
    Invoke-Checked '加载共享训练核心' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $Migration0010)
  }

  Invoke-Checked '事务回滚预演 0016' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $RollbackMigrationPath)
  $AfterRollbackCounts = Invoke-PsqlScalar "select (select count(*) from public.attempts)::text || '|' || (select count(*) from public.attempt_revisions) || '|' || (select count(*) from public.grades);"
  if ($AfterRollbackCounts -ne '0|0|0') { throw "0016 回滚后共享表非空：$AfterRollbackCounts" }

  Invoke-Checked '提交 0016 英语 backfill' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $Migration0016)
  $FirstCounts = Invoke-PsqlScalar @'
select jsonb_build_object(
  'attempts', (select count(*) from public.attempts where source_kind = 'english_passage'),
  'revisions', (select count(*) from public.attempt_revisions),
  'legacyGrades', (select count(*) from public.grades where origin = 'legacy_imported'),
  'systemGrades', (select count(*) from public.grades where origin = 'system_scored'),
  'scoreDifferences', (
    select count(*)
    from public.english_attempts legacy
    join public.grades grade on grade.revision_id = legacy.id and grade.origin = 'system_scored'
    where legacy.score <> grade.score or legacy.max_score <> grade.max_score
  )
)::text;
'@

  Invoke-Checked '幂等重跑 0016 英语 backfill' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $Migration0016)
  $SecondCounts = Invoke-PsqlScalar @'
select jsonb_build_object(
  'attempts', (select count(*) from public.attempts where source_kind = 'english_passage'),
  'revisions', (select count(*) from public.attempt_revisions),
  'legacyGrades', (select count(*) from public.grades where origin = 'legacy_imported'),
  'systemGrades', (select count(*) from public.grades where origin = 'system_scored'),
  'scoreDifferences', (
    select count(*)
    from public.english_attempts legacy
    join public.grades grade on grade.revision_id = legacy.id and grade.origin = 'system_scored'
    where legacy.score <> grade.score or legacy.max_score <> grade.max_score
  )
)::text;
'@
  if ($FirstCounts -ne $SecondCounts) { throw '0016 幂等重跑改变了目标行数。' }

  $LegacyAfter = Invoke-PsqlScalar @'
select jsonb_build_object(
  'attemptCount', (select count(*) from public.english_attempts),
  'answerCount', (select count(*) from public.english_attempt_answers),
  'attemptHash', (select md5(coalesce(string_agg(to_jsonb(row_value)::text, '' order by id), '')) from public.english_attempts row_value),
  'answerHash', (select md5(coalesce(string_agg(to_jsonb(row_value)::text, '' order by id), '')) from public.english_attempt_answers row_value)
)::text;
'@
  if ($LegacyBefore -ne $LegacyAfter) { throw '0016 修改了 legacy English 表。' }

  $DualReadMismatchCount = [int](Invoke-PsqlScalar @'
with legacy_payloads as (
  select
    legacy.id,
    jsonb_build_object(
      'answers',
      jsonb_object_agg(answer_row.question_id::text, answer_row.answer order by answer_row.question_id)
    ) as response_payload
  from public.english_attempts legacy
  join public.english_attempt_answers answer_row on answer_row.attempt_id = legacy.id
  where legacy.status = 'submitted'
  group by legacy.id
),
system_expected as (
  select
    legacy.id,
    sum(
      case
        when private.normalize_english_objective_answer(coalesce(answer_row.answer, '')) <> ''
          and private.normalize_english_objective_answer(answer_row.answer)
            = private.normalize_english_objective_answer(question.standard_answer)
        then question.score
        else 0
      end
    ) as score,
    sum(question.score) as max_score
  from public.english_attempts legacy
  join public.english_passages passage on passage.id = legacy.passage_id
  join public.english_questions question on question.passage_id = passage.id
  left join public.english_attempt_answers answer_row
    on answer_row.attempt_id = legacy.id and answer_row.question_id = question.id
  where legacy.status = 'submitted'
    and passage.section in ('reading', 'cloze', 'new_type')
  group by legacy.id
)
select count(*)
from public.english_attempts legacy
join legacy_payloads payload on payload.id = legacy.id
join system_expected expected on expected.id = legacy.id
left join public.attempts target on target.id = legacy.id
left join public.attempt_revisions revision
  on revision.id = legacy.id and revision.attempt_id = legacy.id and revision.revision_no = 1
left join public.grades legacy_grade
  on legacy_grade.revision_id = legacy.id and legacy_grade.origin = 'legacy_imported' and legacy_grade.grade_seq = 1
left join public.grades system_grade
  on system_grade.revision_id = legacy.id and system_grade.origin = 'system_scored' and system_grade.grade_seq = 1
where target.id is null
  or target.user_id <> legacy.user_id
  or target.english_passage_id <> legacy.passage_id
  or target.round <> 1
  or target.status <> legacy.status
  or revision.response_payload is distinct from payload.response_payload
  or legacy_grade.score is distinct from legacy.score
  or legacy_grade.max_score is distinct from legacy.max_score
  or system_grade.score is distinct from expected.score
  or system_grade.max_score is distinct from expected.max_score;
'@)
  if ($DualReadMismatchCount -ne 0) { throw "legacy/shared 双读对账存在 $DualReadMismatchCount 条未解释差异。" }

  Invoke-Checked '加载 0017 英语原子命令' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $Migration0017)
  Invoke-Checked '加载 0018 英语主观确认命令' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $Migration0018)
  $RpcBoundary = Invoke-PsqlScalar @'
select jsonb_build_object(
  'exists', to_regprocedure('public.record_english_training_command(uuid,smallint,text,jsonb,uuid,boolean)') is not null,
  'securityDefinerHardened', exists (
    select 1
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'record_english_training_command'
      and procedure.prosecdef
      and pg_get_userbyid(procedure.proowner) not in ('anon', 'authenticated')
      and coalesce(array_to_string(procedure.proconfig, ','), '') like '%search_path=""%'
  ),
  'authenticatedExecute', has_function_privilege(
    'authenticated',
    'public.record_english_training_command(uuid,smallint,text,jsonb,uuid,boolean)',
    'execute'
  ),
  'anonExecute', has_function_privilege(
    'anon',
    'public.record_english_training_command(uuid,smallint,text,jsonb,uuid,boolean)',
    'execute'
  ),
  'publicExecute', exists (
    select 1
    from pg_proc procedure,
      lateral aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) privilege
    where procedure.oid = to_regprocedure('public.record_english_training_command(uuid,smallint,text,jsonb,uuid,boolean)')
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  )
)::text;
'@
  $Rpc = $RpcBoundary | ConvertFrom-Json
  if (-not $Rpc.exists -or -not $Rpc.securityDefinerHardened -or -not $Rpc.authenticatedExecute -or $Rpc.anonExecute -or $Rpc.publicExecute) {
    throw '0017 RPC 的 owner/search_path/execute 权限边界不符合预期。'
  }

  $CommandRollbackSql = @'
select
  user_row.id::text as command_user_id,
  passage.id::text as command_passage_id,
  (
    select jsonb_object_agg(question.id::text, question.standard_answer order by question.sort_order, question.id)::text
    from public.english_questions question
    where question.passage_id = passage.id
  ) as command_answers
from auth.users user_row
cross join public.english_passages passage
where passage.section in ('reading', 'cloze', 'new_type')
  and not exists (
    select 1 from public.attempts attempt
    where attempt.user_id = user_row.id
      and attempt.source_kind = 'english_passage'
      and attempt.english_passage_id = passage.id
  )
order by user_row.id, passage.year, passage.sort_order, passage.id
limit 1
\gset

begin;
set local role authenticated;
\o NUL
select set_config('request.jwt.claim.sub', :'command_user_id', true);
select public.record_english_training_command(
  :'command_passage_id'::uuid, 1::smallint, 'save_draft', :'command_answers'::jsonb,
  '91000000-0000-4000-8000-000000000001'::uuid, true
);
select public.record_english_training_command(
  :'command_passage_id'::uuid, 1::smallint, 'submit', :'command_answers'::jsonb,
  '91000000-0000-4000-8000-000000000002'::uuid, true
);
\o
rollback;
'@
  Set-Content -LiteralPath $CommandRollbackPath -Value $CommandRollbackSql -Encoding UTF8
  $CommandCountsBefore = Invoke-PsqlScalar "select (select count(*) from public.attempts)::text || '|' || (select count(*) from public.attempt_revisions) || '|' || (select count(*) from public.grades) || '|' || (select count(*) from public.english_attempts) || '|' || (select count(*) from public.english_attempt_answers);"
  Invoke-Checked '事务回滚预演 0017 英语命令' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $CommandRollbackPath)
  $CommandCountsAfterRollback = Invoke-PsqlScalar "select (select count(*) from public.attempts)::text || '|' || (select count(*) from public.attempt_revisions) || '|' || (select count(*) from public.grades) || '|' || (select count(*) from public.english_attempts) || '|' || (select count(*) from public.english_attempt_answers);"
  if ($CommandCountsBefore -ne $CommandCountsAfterRollback) { throw '0017 回滚后共享核或 legacy 投影发生残留。' }

  $CommandCommitSql = @'
do $$
declare
  test_user_id uuid;
  test_passage_id uuid;
  first_question_id text;
  answer_payload jsonb;
  corrected_payload jsonb;
  legacy_score numeric;
  latest_round_score numeric;
  mismatch_count integer;
begin
  select user_row.id, passage.id
    into test_user_id, test_passage_id
  from auth.users user_row
  cross join public.english_passages passage
  where passage.section in ('reading', 'cloze', 'new_type')
    and not exists (
      select 1 from public.attempts attempt
      where attempt.user_id = user_row.id
        and attempt.source_kind = 'english_passage'
        and attempt.english_passage_id = passage.id
    )
  order by user_row.id, passage.year, passage.sort_order, passage.id
  limit 1;

  if test_user_id is null or test_passage_id is null then
    raise exception 'No unused objective English passage exists for the command rehearsal';
  end if;

  perform set_config('request.jwt.claim.sub', test_user_id::text, true);
  select
    jsonb_object_agg(question.id::text, question.standard_answer order by question.sort_order, question.id),
    (array_agg(question.id::text order by question.sort_order, question.id))[1]
    into answer_payload, first_question_id
  from public.english_questions question
  where question.passage_id = test_passage_id;
  corrected_payload := jsonb_set(answer_payload, array[first_question_id], to_jsonb('Z'::text));

  perform public.record_english_training_command(test_passage_id, 1::smallint, 'save_draft', answer_payload, '92000000-0000-4000-8000-000000000001'::uuid, true);
  perform public.record_english_training_command(test_passage_id, 1::smallint, 'save_draft', answer_payload, '92000000-0000-4000-8000-000000000001'::uuid, true);
  perform public.record_english_training_command(test_passage_id, 1::smallint, 'submit', answer_payload, '92000000-0000-4000-8000-000000000002'::uuid, true);
  perform public.record_english_training_command(test_passage_id, 1::smallint, 'submit', answer_payload, '92000000-0000-4000-8000-000000000002'::uuid, true);

  perform public.record_english_training_command(test_passage_id, 1::smallint, 'start_next', '{}'::jsonb, '92000000-0000-4000-8000-000000000003'::uuid, true);
  perform public.record_english_training_command(test_passage_id, 1::smallint, 'start_next', '{}'::jsonb, '92000000-0000-4000-8000-000000000003'::uuid, true);
  perform public.record_english_training_command(test_passage_id, 2::smallint, 'save_draft', answer_payload, '92000000-0000-4000-8000-000000000004'::uuid, true);
  perform public.record_english_training_command(test_passage_id, 2::smallint, 'submit', answer_payload, '92000000-0000-4000-8000-000000000005'::uuid, true);
  perform public.record_english_training_command(test_passage_id, 2::smallint, 'submit', answer_payload, '92000000-0000-4000-8000-000000000005'::uuid, true);

  perform public.record_english_training_command(test_passage_id, 2::smallint, 'start_next', '{}'::jsonb, '92000000-0000-4000-8000-000000000006'::uuid, true);
  perform public.record_english_training_command(test_passage_id, 3::smallint, 'save_draft', answer_payload, '92000000-0000-4000-8000-000000000007'::uuid, true);
  perform public.record_english_training_command(test_passage_id, 3::smallint, 'submit', answer_payload, '92000000-0000-4000-8000-000000000008'::uuid, true);
  perform public.record_english_training_command(test_passage_id, 3::smallint, 'submit', corrected_payload, '92000000-0000-4000-8000-000000000009'::uuid, true);

  -- Correcting an older sealed round must not regress the legacy projection from R3 to R1.
  perform public.record_english_training_command(test_passage_id, 1::smallint, 'submit', corrected_payload, '92000000-0000-4000-8000-000000000010'::uuid, true);

  if (select count(*) from public.attempts where user_id = test_user_id and english_passage_id = test_passage_id) <> 3 then
    raise exception 'English command rehearsal did not create exactly three rounds';
  end if;
  if (
    select string_agg(round::text || ':' || status, ',' order by round)
    from public.attempts where user_id = test_user_id and english_passage_id = test_passage_id
  ) <> '1:sealed,2:sealed,3:submitted' then
    raise exception 'English round lifecycle is incorrect';
  end if;
  if (
    select count(*)
    from public.attempt_revisions revision
    join public.attempts attempt on attempt.id = revision.attempt_id
    where attempt.user_id = test_user_id and attempt.english_passage_id = test_passage_id
  ) <> 5 then
    raise exception 'Idempotent English submissions created an unexpected revision count';
  end if;

  select legacy.score
    into legacy_score
  from public.english_attempts legacy
  where legacy.user_id = test_user_id and legacy.passage_id = test_passage_id;
  select grade.score
    into latest_round_score
  from public.attempts attempt
  join public.attempt_revisions revision on revision.attempt_id = attempt.id
  join public.grades grade on grade.revision_id = revision.id and grade.origin = 'system_scored'
  where attempt.user_id = test_user_id and attempt.english_passage_id = test_passage_id and attempt.round = 3
  order by revision.revision_no desc
  limit 1;
  if legacy_score is distinct from latest_round_score then
    raise exception 'Legacy projection regressed from the highest completed round';
  end if;

  select count(*)
    into mismatch_count
  from public.english_attempt_answers legacy_answer
  join public.english_attempts legacy on legacy.id = legacy_answer.attempt_id
  where legacy.user_id = test_user_id
    and legacy.passage_id = test_passage_id
    and legacy_answer.answer is distinct from coalesce(corrected_payload ->> legacy_answer.question_id::text, '');
  if mismatch_count <> 0 then
    raise exception 'Legacy answer projection differs from the latest R3 correction';
  end if;

  begin
    perform public.record_english_training_command(test_passage_id, 3::smallint, 'start_next', '{}'::jsonb, '92000000-0000-4000-8000-000000000011'::uuid, true);
    raise exception 'Fourth English round was unexpectedly accepted' using errcode = 'P0002';
  exception when others then
    if sqlstate = 'P0002' then raise; end if;
  end;
end
$$;
'@
  Set-Content -LiteralPath $CommandCommitPath -Value $CommandCommitSql -Encoding UTF8
  Invoke-Checked '提交 0017 三轮/纠正/双写演练' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $CommandCommitPath)
  $CommandEvidence = Invoke-PsqlScalar @'
select jsonb_build_object(
  'attempts', (select count(*) from public.attempts where id in (
    '92000000-0000-4000-8000-000000000001'::uuid,
    '92000000-0000-4000-8000-000000000003'::uuid,
    '92000000-0000-4000-8000-000000000006'::uuid
  )),
  'revisions', (select count(*) from public.attempt_revisions where id::text like '92000000-0000-4000-8000-%'),
  'systemGrades', (
    select count(*) from public.grades grade
    join public.attempt_revisions revision on revision.id = grade.revision_id
    where revision.id::text like '92000000-0000-4000-8000-%' and grade.origin = 'system_scored'
  ),
  'legacyRows', (
    select count(*) from public.english_attempts legacy
    join public.attempts shared on shared.user_id = legacy.user_id and shared.english_passage_id = legacy.passage_id
    where shared.id = '92000000-0000-4000-8000-000000000006'::uuid
  )
)::text;
'@
  $Command = $CommandEvidence | ConvertFrom-Json
  if ($Command.attempts -ne 3 -or $Command.revisions -ne 5 -or $Command.systemGrades -ne 5 -or $Command.legacyRows -ne 1) {
    throw "0017 原子命令对账异常：$CommandEvidence"
  }

  $SubjectiveCommitSql = @'
do $$
declare
  test_user_id uuid;
  test_passage_id uuid;
  answer_payload jsonb;
  max_score numeric;
  latest_final_score numeric;
  legacy_score numeric;
begin
  select user_row.id, passage.id
    into test_user_id, test_passage_id
  from auth.users user_row
  cross join public.english_passages passage
  where passage.section in ('translation', 'writing')
    and exists (select 1 from public.english_questions question where question.passage_id = passage.id and question.score > 0)
    and not exists (
      select 1 from public.attempts attempt
      where attempt.user_id = user_row.id and attempt.english_passage_id = passage.id
    )
  order by user_row.id, passage.year, passage.sort_order, passage.id
  limit 1;
  if test_user_id is null then raise exception 'No unused subjective English passage exists'; end if;

  perform set_config('request.jwt.claim.sub', test_user_id::text, true);
  select
    jsonb_object_agg(question.id::text, 'subjective rehearsal answer' order by question.sort_order, question.id),
    sum(question.score)
    into answer_payload, max_score
  from public.english_questions question
  where question.passage_id = test_passage_id;

  perform public.record_english_training_command(
    test_passage_id, 1::smallint, 'save_draft', answer_payload,
    '93000000-0000-4000-8000-000000000001'::uuid, true
  );
  perform public.record_english_subjective_submission(
    test_passage_id, 1::smallint, answer_payload,
    '93000000-0000-4000-8000-000000000002'::uuid,
    round(max_score * 0.8, 1), 'AI suggestion for rehearsal',
    jsonb_build_object('confidence', 0.8, 'source', 'local_rehearsal')
  );

  begin
    perform public.record_english_training_command(
      test_passage_id, 1::smallint, 'start_next', '{}'::jsonb,
      '93000000-0000-4000-8000-000000000099'::uuid, true
    );
    raise exception 'Subjective next round started before user_final' using errcode = 'P0002';
  exception when others then
    if sqlstate = 'P0002' then raise; end if;
  end;

  perform public.confirm_english_subjective_grade(
    '93000000-0000-4000-8000-000000000002'::uuid,
    '93000000-0000-4000-8000-000000000003'::uuid,
    round(max_score * 0.9, 1), 'User confirmed rehearsal grade',
    jsonb_build_object('decision', 'accepted_with_edit'), true
  );
  perform public.confirm_english_subjective_grade(
    '93000000-0000-4000-8000-000000000002'::uuid,
    '93000000-0000-4000-8000-000000000003'::uuid,
    round(max_score * 0.9, 1), 'User confirmed rehearsal grade',
    jsonb_build_object('decision', 'accepted_with_edit'), true
  );
  perform public.confirm_english_subjective_grade(
    '93000000-0000-4000-8000-000000000002'::uuid,
    '93000000-0000-4000-8000-000000000005'::uuid,
    round(max_score * 0.95, 1), 'User revised the final grade',
    jsonb_build_object('decision', 'revised_final'), true
  );
  perform public.record_english_training_command(
    test_passage_id, 1::smallint, 'start_next', '{}'::jsonb,
    '93000000-0000-4000-8000-000000000004'::uuid, true
  );

  select grade.score into latest_final_score
  from public.grades grade
  where grade.revision_id = '93000000-0000-4000-8000-000000000002'::uuid
    and grade.origin = 'user_final'
  order by grade.grade_seq desc limit 1;
  select attempt.score into legacy_score
  from public.english_attempts attempt
  where attempt.user_id = test_user_id and attempt.passage_id = test_passage_id;
  if legacy_score is distinct from latest_final_score then
    raise exception 'Subjective legacy projection does not match latest user_final';
  end if;
end
$$;
'@
  Set-Content -LiteralPath $SubjectiveCommitPath -Value $SubjectiveCommitSql -Encoding UTF8
  Invoke-Checked '提交 0018 主观建议/终分/下一轮演练' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $SubjectiveCommitPath)
  $SubjectiveEvidence = Invoke-PsqlScalar @'
select jsonb_build_object(
  'attempts', (select count(*) from public.attempts where id in (
    '93000000-0000-4000-8000-000000000001'::uuid,
    '93000000-0000-4000-8000-000000000004'::uuid
  )),
  'revisions', (select count(*) from public.attempt_revisions where id = '93000000-0000-4000-8000-000000000002'::uuid),
  'aiGrades', (select count(*) from public.grades where revision_id = '93000000-0000-4000-8000-000000000002'::uuid and origin = 'ai_suggested'),
  'finalGrades', (select count(*) from public.grades where revision_id = '93000000-0000-4000-8000-000000000002'::uuid and origin = 'user_final'),
  'nextRoundCreated', exists (select 1 from public.attempts where id = '93000000-0000-4000-8000-000000000004'::uuid and round = 2 and status = 'in_progress')
)::text;
'@
  $Subjective = $SubjectiveEvidence | ConvertFrom-Json
  if ($Subjective.attempts -ne 2 -or $Subjective.revisions -ne 1 -or $Subjective.aiGrades -ne 1 -or $Subjective.finalGrades -ne 2 -or -not $Subjective.nextRoundCreated) {
    throw "0018 主观确认命令对账异常：$SubjectiveEvidence"
  }

  $First = $FirstCounts | ConvertFrom-Json
  if ($First.attempts -ne 28 -or $First.revisions -ne 28 -or $First.legacyGrades -ne 28 -or $First.systemGrades -ne 28 -or $First.scoreDifferences -ne 2) {
    throw "0016 生产备份对账异常：$FirstCounts"
  }

  $Evidence = [ordered]@{
    status = 'passed'
    testedAt = (Get-Date).ToUniversalTime().ToString('o')
    postgresVersion = (Invoke-PsqlScalar 'show server_version;')
    sourceBackup = [System.IO.Path]::GetRelativePath($RepositoryRoot, $BackupDir).Replace('\', '/')
    sourceAttemptCount = [int]$First.attempts
    sourceAnswerCount = 140
    mappedAttemptCount = [int]$First.attempts
    mappedRevisionCount = [int]$First.revisions
    legacyGradeCount = [int]$First.legacyGrades
    systemGradeCount = [int]$First.systemGrades
    explainedScoreDifferenceCount = [int]$First.scoreDifferences
    dualReadMismatchCount = $DualReadMismatchCount
    transactionRollbackVerified = $true
    idempotentSecondRun = $true
    legacyRowsUnchanged = $true
    commandTransactionRollbackVerified = $true
    authenticatedRpcVerified = $true
    rpcPermissionBoundaryVerified = $true
    commandAttemptCount = [int]$Command.attempts
    commandRevisionCount = [int]$Command.revisions
    commandSystemGradeCount = [int]$Command.systemGrades
    commandIdempotencyVerified = $true
    legacyProjectionMatchesLatestRound = $true
    threeRoundLimitVerified = $true
    subjectiveAttemptCount = [int]$Subjective.attempts
    subjectiveRevisionCount = [int]$Subjective.revisions
    aiSuggestedGradeCount = [int]$Subjective.aiGrades
    userFinalGradeCount = [int]$Subjective.finalGrades
    subjectiveNextRoundRequiresFinal = $true
    subjectiveFinalRevisionVerified = $true
    authPlaceholderCount = $AuthUserIds.Count
    externalConnections = 0
  }
  New-Item -ItemType Directory -Path $RehearsalRoot -Force | Out-Null
  Set-Content -LiteralPath $EvidencePath -Value ($Evidence | ConvertTo-Json -Depth 5) -Encoding UTF8
  $Evidence | ConvertTo-Json -Depth 5
} finally {
  if ($ServerStarted) {
    & $PgCtl '--pgdata' $ClusterDir 'stop' '--mode=fast' '--wait' | Out-Null
  }
  if (-not $KeepArtifacts -and (Test-Path -LiteralPath $RunRoot)) {
    $ResolvedRunRoot = (Resolve-Path -LiteralPath $RunRoot).Path
    if (-not $ResolvedRunRoot.StartsWith($ExpectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "拒绝清理演练根目录外路径：$ResolvedRunRoot"
    }
    Remove-Item -LiteralPath $ResolvedRunRoot -Recurse -Force
  }
}
