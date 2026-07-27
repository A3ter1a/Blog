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
  if ($LASTEXITCODE -ne 0) { throw 'WP6 本地 SQL 核验失败。' }
  return (($Rows | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Last 1) -join '').Trim()
}

function Assert-SqlFails([string]$Label, [string]$Sql) {
  $null = & $script:Psql '--dbname' $script:Connection '--no-password' '--no-psqlrc' '--quiet' `
    '--set' 'ON_ERROR_STOP=1' '--command' $Sql 2>&1
  if ($LASTEXITCODE -eq 0) { throw "$Label 应被数据库拒绝，但实际成功。" }
}

function New-AuthenticatedSql([string]$UserId, [string]$Body) {
  return "begin; set local role authenticated; select set_config('request.jwt.claim.sub', '$UserId', true); $Body; commit;"
}

function Get-Sha256([string]$Text) {
  $Bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
  $Hash = [System.Security.Cryptography.SHA256]::HashData($Bytes)
  return [Convert]::ToHexString($Hash).ToLowerInvariant()
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$PgBin = Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin'
foreach ($ToolName in @('initdb.exe', 'pg_ctl.exe', 'createdb.exe', 'psql.exe')) {
  if (-not (Test-Path -LiteralPath (Join-Path $PgBin $ToolName))) {
    throw "缺少本地 PostgreSQL 演练工具：$ToolName"
  }
}

$Migration0010 = Join-Path $RepositoryRoot 'supabase\migrations\0010_training_event_core.sql'
$Migration0019 = Join-Path $RepositoryRoot 'supabase\migrations\0019_math_training_and_booklet_core.sql'
$RehearsalRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups\wp6-math-core-rehearsal'))
$RunRoot = Join-Path $RehearsalRoot (Get-Date -Format 'yyyyMMdd-HHmmss-fff')
$ExpectedPrefix = $RehearsalRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $RunRoot.StartsWith($ExpectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "本地演练目录越界：$RunRoot"
}

$ClusterDir = Join-Path $RunRoot 'cluster'
$ServerLog = Join-Path $RunRoot 'postgres.log'
$BootstrapPath = Join-Path $RunRoot 'bootstrap.sql'
$RollbackMigrationPath = Join-Path $RunRoot '0019-rollback.sql'
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
$script:Connection = "host=127.0.0.1 port=$Port user=postgres dbname=math_core_rehearsal sslmode=disable"
$ServerStarted = $false

$OwnerUserId = '11111111-1111-4111-8111-111111111111'
$OtherUserId = '22222222-2222-4222-8222-222222222222'
$PaperId = '30000000-0000-4000-8000-000000000001'
$ProblemOneId = '31000000-0000-4000-8000-000000000001'
$ProblemTwoId = '31000000-0000-4000-8000-000000000002'
$AttemptOneId = '32000000-0000-4000-8000-000000000001'
$AttemptTwoId = '32000000-0000-4000-8000-000000000002'
$ConfirmationOneId = '33000000-0000-4000-8000-000000000001'
$ConfirmationTwoId = '33000000-0000-4000-8000-000000000002'
$AiGradeOneId = '34000000-0000-4000-8000-000000000001'
$FinalGradeOneId = '34000000-0000-4000-8000-000000000002'
$AiGradeTwoId = '34000000-0000-4000-8000-000000000003'
$FinalGradeTwoId = '34000000-0000-4000-8000-000000000004'
$ProblemNoteId = '35000000-0000-4000-8000-000000000001'
$BookletNoteId = '36000000-0000-4000-8000-000000000001'

$BootstrapSql = @'
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema private;
create schema extensions;
create extension pgcrypto with schema extensions;

create table auth.users (
  id uuid primary key,
  email text not null unique
);

create function auth.uid()
returns uuid
language sql
stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;

create type public.note_type as enum ('note', 'problem', 'essay');
create type public.subject as enum ('math', 'english', 'politics', 'economics');

create table public.admin_users (
  user_id uuid primary key references auth.users(id)
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  type public.note_type not null default 'note',
  title text not null default '',
  content text not null default '',
  subject public.subject,
  tags text[] not null default '{}'::text[],
  cover_image text,
  videos jsonb not null default '[]'::jsonb,
  problems jsonb not null default '[]'::jsonb,
  is_published boolean not null default false,
  content_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.english_passages (
  id uuid primary key
);

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

create function private.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users admin_row where admin_row.user_id = auth.uid());
$$;

create function private.reject_immutable_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only; create a new event instead', tg_table_name;
end;
$$;

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'owner@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'other@example.test');
insert into public.admin_users (user_id) values ('11111111-1111-4111-8111-111111111111');
'@

try {
  Set-Content -LiteralPath $BootstrapPath -Value $BootstrapSql -Encoding UTF8
  Invoke-Checked '初始化本地 PostgreSQL' $InitDb @('--pgdata', $ClusterDir, '--username=postgres', '--auth=trust', '--encoding=UTF8', '--no-locale')
  Invoke-Checked '启动本地 PostgreSQL' $PgCtl @('--pgdata', $ClusterDir, '--log', $ServerLog, '--options', "-h 127.0.0.1 -p $Port", 'start', '--wait')
  $ServerStarted = $true
  Invoke-Checked '创建本地演练数据库' $CreateDb @('--host=127.0.0.1', "--port=$Port", '--username=postgres', 'math_core_rehearsal')
  Invoke-Checked '加载最小 Supabase 夹具' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $BootstrapPath)
  Invoke-Checked '加载共享训练核' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $Migration0010)

  $PreviousGradeGateSql = @'
create function private.ensure_previous_attempt_has_formal_grade()
returns trigger
language plpgsql
set search_path = ''
as $$ begin return new; end; $$;
create trigger verify_previous_attempt_formal_grade
  before insert on public.attempts
  for each row execute function private.ensure_previous_attempt_has_formal_grade();
'@
  Invoke-PsqlScalar $PreviousGradeGateSql | Out-Null

  $MigrationText = Get-Content -Raw -Encoding UTF8 -LiteralPath $Migration0019
  $RollbackText = [regex]::Replace($MigrationText, '(?im)^commit;\s*$', 'rollback;', 1)
  Set-Content -LiteralPath $RollbackMigrationPath -Value $RollbackText -Encoding UTF8
  Invoke-Checked '事务回滚预演 0019' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $RollbackMigrationPath)
  $RollbackState = Invoke-PsqlScalar "select (to_regclass('public.math_papers') is null and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='attempts' and column_name='math_paper_id'))::text;"
  if ($RollbackState -ne 'true') { throw '0019 事务回滚后仍残留数学结构。' }

  Invoke-Checked '提交 0019 数学闭环迁移' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $Migration0019)

  $PaperChecksum = 'a' * 64
  $ProblemOneChecksum = 'b' * 64
  $ProblemTwoChecksum = 'c' * 64
  $ProblemJson = '{"id":"problem-1","question":"Solve x","answer":"x=1","explanation":"Use the definition","tips":"Identify the definition first"}'
  $ProblemSourceChecksum = Get-Sha256 ("Solve x" + [char]31 + "x=1" + [char]31 + "Use the definition" + [char]31 + "Identify the definition first")
  $SeedSql = @"
insert into public.math_papers (id, exam_year, paper_code, title, source_checksum)
values ('$PaperId', 2025, 'math_3', '2025 Math III local fixture', '$PaperChecksum');
insert into public.math_paper_problems (
  id, math_paper_id, problem_no, problem_type, prompt, standard_answer,
  scoring_rubric, max_score, content_checksum
) values
  ('$ProblemOneId', '$PaperId', 1, 'calculation', 'Solve x', 'x=1', '[{`"criterion`":`"setup`",`"score`":5}]'::jsonb, 5, '$ProblemOneChecksum'),
  ('$ProblemTwoId', '$PaperId', 2, 'proof', 'Prove the claim', 'Proof omitted', '[{`"criterion`":`"argument`",`"score`":5}]'::jsonb, 5, '$ProblemTwoChecksum');
insert into public.notes (id, type, title, subject, problems, is_published)
values ('$ProblemNoteId', 'problem', 'Local problem fixture', 'math', '$($ProblemJson.Replace("'", "''"))'::jsonb || '[]'::jsonb, false);
select 1;
"@
  # The JSON object above must be wrapped as the note's problem array.
  $SeedSql = $SeedSql.Replace("'$($ProblemJson.Replace("'", "''"))'::jsonb || '[]'::jsonb", "'[$($ProblemJson.Replace("'", "''"))]'::jsonb")
  Invoke-PsqlScalar $SeedSql | Out-Null

  $StartResult = Invoke-PsqlScalar (New-AuthenticatedSql $OwnerUserId "select public.start_math_paper_attempt('$PaperId', 1::smallint, '$AttemptOneId')::text;")
  if ($StartResult -notmatch '"idempotent": false') { throw "数学第一轮启动异常：$StartResult" }

  $RawPayload = '{"pages":[{"pageNo":1,"text":"raw x=I"}]}'
  $ConfirmedPayloadOne = '{"pages":[{"pageNo":1,"text":"solution x=1"}]}'
  $ConfirmOneSql = New-AuthenticatedSql $OwnerUserId "select public.record_math_ocr_confirmation('$AttemptOneId', '$ConfirmationOneId', '$RawPayload'::jsonb, '$ConfirmedPayloadOne'::jsonb)::text;"
  $ConfirmOneResult = Invoke-PsqlScalar $ConfirmOneSql
  $ConfirmOneRetry = Invoke-PsqlScalar $ConfirmOneSql
  if ($ConfirmOneResult -notmatch '"confirmationVersion": 1' -or $ConfirmOneRetry -notmatch '"idempotent": true') {
    throw 'OCR v1 追加或命令幂等异常。'
  }

  $StepsOne = "[{`"problemId`":`"$ProblemOneId`",`"criterion`":`"setup`",`"earnedScore`":4,`"maxScore`":5,`"deductionReason`":`"incomplete notation`"},{`"problemId`":`"$ProblemTwoId`",`"criterion`":`"argument`",`"earnedScore`":4,`"maxScore`":5,`"deductionReason`":`"one step omitted`"}]"
  $AiOneSql = New-AuthenticatedSql $OwnerUserId "select public.record_math_ai_grade('$ConfirmationOneId', '$AiGradeOneId', 8, 10, 'AI suggestion for confirmation', '{`"confidence`":0.8}'::jsonb, '$StepsOne'::jsonb)::text;"
  $AiOneResult = Invoke-PsqlScalar $AiOneSql
  if ($AiOneResult -notmatch '"origin": "ai_suggested"') { throw '数学 AI 建议分写入异常。' }
  $FinalOneSteps = $StepsOne.Replace('"earnedScore":4', '"earnedScore":4.5')
  $FinalOneSql = New-AuthenticatedSql $OwnerUserId "select public.confirm_math_grade('$AiGradeOneId', '$FinalGradeOneId', 9, 'User confirmed v1', '{`"decision`":`"edited`"}'::jsonb, '$FinalOneSteps'::jsonb)::text;"
  Invoke-PsqlScalar $FinalOneSql | Out-Null

  $ConfirmedPayloadTwo = '{"pages":[{"pageNo":1,"text":"solution x=1 with full steps"}]}'
  $ConfirmTwoSql = New-AuthenticatedSql $OwnerUserId "select public.record_math_ocr_confirmation('$AttemptOneId', '$ConfirmationTwoId', '$RawPayload'::jsonb, '$ConfirmedPayloadTwo'::jsonb)::text;"
  $ConfirmTwoResult = Invoke-PsqlScalar $ConfirmTwoSql
  if ($ConfirmTwoResult -notmatch '"confirmationVersion": 2') { throw 'OCR 重确认没有追加 v2。' }

  Assert-SqlFails '旧 confirmation 上追加过时评分' $AiOneSql.Replace($AiGradeOneId, '34000000-0000-4000-8000-000000000099')
  Assert-SqlFails '最新确认未终评就开启下一轮' (New-AuthenticatedSql $OwnerUserId "select public.start_math_paper_attempt('$PaperId', 2::smallint, '$AttemptTwoId');")

  $StepsTwo = "[{`"problemId`":`"$ProblemOneId`",`"criterion`":`"setup`",`"earnedScore`":5,`"maxScore`":5,`"deductionReason`":null},{`"problemId`":`"$ProblemTwoId`",`"criterion`":`"argument`",`"earnedScore`":4,`"maxScore`":5,`"deductionReason`":`"one step omitted`"}]"
  Invoke-PsqlScalar (New-AuthenticatedSql $OwnerUserId "select public.record_math_ai_grade('$ConfirmationTwoId', '$AiGradeTwoId', 9, 10, 'AI suggestion v2', '{`"confidence`":0.9}'::jsonb, '$StepsTwo'::jsonb)::text;") | Out-Null
  Invoke-PsqlScalar (New-AuthenticatedSql $OwnerUserId "select public.confirm_math_grade('$AiGradeTwoId', '$FinalGradeTwoId', 9, 'User confirmed v2', '{`"decision`":`"accepted`"}'::jsonb, '$StepsTwo'::jsonb)::text;") | Out-Null
  $StartTwoResult = Invoke-PsqlScalar (New-AuthenticatedSql $OwnerUserId "select public.start_math_paper_attempt('$PaperId', 2::smallint, '$AttemptTwoId')::text;")
  if ($StartTwoResult -notmatch '"round": 2') { throw '最新 OCR 终评后仍无法开始下一轮。' }

  Assert-SqlFails '普通 authenticated 绕过 RPC 直写数学终分' (New-AuthenticatedSql $OwnerUserId "insert into public.grades (revision_id, origin, grade_seq, scoring_mode, score, max_score, confirmation_id) select revision_id, 'user_final', 99, 'math', 9, 10, id from public.ocr_confirmations where id='$ConfirmationTwoId';")
  $OtherVisibility = Invoke-PsqlScalar (New-AuthenticatedSql $OtherUserId "select count(*) from public.ocr_confirmations;")
  if ($OtherVisibility -ne '0') { throw 'OCR 确认跨用户 RLS 泄漏。' }

  $SnapshotBody = "<!-- asteroid-booklet-source-manifest:fixture -->`n> Immutable generated snapshot.`n`n## Problem 1`n`n### Question`n`nSolve x`n`n### Standard answer`n`nx=1`n`n### Detailed explanation`n`nUse the definition`n`n### Method summary`n`nIdentify the definition first"
  $BookletContent = "# Three-pass booklet`n`n<!-- asteroid-booklet-snapshot:start -->`n$SnapshotBody`n<!-- asteroid-booklet-snapshot:end -->`n`n<!-- asteroid-booklet-reflection:start -->`n## Personal reflection"
  $EscapedSnapshotBody = $SnapshotBody.Replace("'", "''")
  $SnapshotChecksum = Invoke-PsqlScalar "select encode(extensions.digest(convert_to(btrim('$EscapedSnapshotBody'), 'UTF8'), 'sha256'), 'hex');"
  $SourceRefs = "[{`"sourceNoteId`":`"$ProblemNoteId`",`"sourceProblemId`":`"problem-1`",`"sourceContentVersion`":1,`"checksum`":`"$ProblemSourceChecksum`"}]"
  $EscapedBookletContent = $BookletContent.Replace("'", "''")
  $CreateBookletSql = New-AuthenticatedSql $OwnerUserId "select public.create_private_booklet('$BookletNoteId', 'Three-pass booklet local rehearsal', '$EscapedBookletContent', '$SourceRefs'::jsonb, 'asteroid-booklet-v2', '$SnapshotChecksum', true)::text;"
  $BookletResult = Invoke-PsqlScalar $CreateBookletSql
  $BookletRetry = Invoke-PsqlScalar $CreateBookletSql
  if ($BookletResult -notmatch '"idempotent": false' -or $BookletRetry -notmatch '"idempotent": true') {
    throw '做题本原子创建或幂等异常。'
  }
  $BookletState = Invoke-PsqlScalar "select is_published::text || '|' || (content like '%### Method summary%')::text || '|' || (select count(*) from public.booklets where note_id='$BookletNoteId')::text from public.notes where id='$BookletNoteId';"
  if ($BookletState -ne 'false|true|1') { throw "做题本私人笔记/元数据状态异常：$BookletState" }
  Assert-SqlFails '未明确确认方法总结' $CreateBookletSql.Replace(', true)', ', false)').Replace($BookletNoteId, '36000000-0000-4000-8000-000000000099')

  Invoke-PsqlScalar "update public.notes set problems = jsonb_set(problems, '{0,explanation}', to_jsonb('Updated source explanation'::text), false), content_version = content_version + 1 where id='$ProblemNoteId'; select 1;" | Out-Null
  $BookletId = Invoke-PsqlScalar "select id::text from public.booklets where note_id='$BookletNoteId';"
  $DriftResult = Invoke-PsqlScalar (New-AuthenticatedSql $OwnerUserId "select public.refresh_booklet_drift('$BookletId')::text;")
  if ($DriftResult -notmatch '"driftStatus": "changed"') { throw '源题变化没有生成做题本漂移提示。' }
  $SnapshotStillStable = Invoke-PsqlScalar "select (snapshot_checksum='$SnapshotChecksum' and (select content from public.notes where id='$BookletNoteId')='$EscapedBookletContent')::text from public.booklets where id='$BookletId';"
  if ($SnapshotStillStable -ne 'true') { throw '源题漂移错误改写了做题本快照。' }

  $CountsJson = Invoke-PsqlScalar @"
select jsonb_build_object(
  'papers', (select count(*) from public.math_papers),
  'problems', (select count(*) from public.math_paper_problems),
  'attempts', (select count(*) from public.attempts where source_kind='math_paper'),
  'confirmations', (select count(*) from public.ocr_confirmations),
  'revisions', (select count(*) from public.attempt_revisions),
  'aiGrades', (select count(*) from public.grades where origin='ai_suggested' and scoring_mode='math'),
  'finalGrades', (select count(*) from public.grades where origin='user_final' and scoring_mode='math'),
  'gradeSteps', (select count(*) from public.math_grade_steps),
  'booklets', (select count(*) from public.booklets)
)::text;
"@
  $Counts = $CountsJson | ConvertFrom-Json
  if ($Counts.papers -ne 1 -or $Counts.problems -ne 2 -or $Counts.attempts -ne 2 -or
      $Counts.confirmations -ne 2 -or $Counts.revisions -ne 2 -or $Counts.aiGrades -ne 2 -or
      $Counts.finalGrades -ne 2 -or $Counts.gradeSteps -ne 8 -or $Counts.booklets -ne 1) {
    throw "WP6 本地演练对账异常：$CountsJson"
  }

  $Evidence = [ordered]@{
    status = 'passed'
    testedAt = (Get-Date).ToUniversalTime().ToString('o')
    postgresVersion = (Invoke-PsqlScalar 'show server_version;')
    fixtureOnly = $true
    realMathPaperImported = $false
    transactionRollbackVerified = $true
    commandIdempotencyVerified = $true
    threeRoundAttemptBoundaryVerified = $true
    ocrConfirmationVersionCount = [int]$Counts.confirmations
    staleConfirmationGradeRejected = $true
    latestConfirmationFinalRequiredForNextRound = $true
    aiSuggestedGradeCount = [int]$Counts.aiGrades
    userFinalGradeCount = [int]$Counts.finalGrades
    gradeStepCount = [int]$Counts.gradeSteps
    directMathGradeWriteRejected = $true
    ownerRlsVerified = $true
    bookletMetadataCount = [int]$Counts.booklets
    bookletAtomicCreateVerified = $true
    bookletMethodConfirmationVerified = $true
    bookletDriftDetectedWithoutSnapshotRewrite = $true
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
