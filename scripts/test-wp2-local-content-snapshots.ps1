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
  if ($LASTEXITCODE -ne 0) { throw "本地 SQL 失败：$Sql" }
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

function Invoke-PsqlJsonWithVariables([string]$Sql, [string[]]$Variables) {
  $Rows = $Sql | & $script:Psql '--dbname' $script:Connection '--no-password' '--no-psqlrc' '--quiet' `
    '--tuples-only' '--no-align' '--set=ON_ERROR_STOP=1' @Variables
  if ($LASTEXITCODE -ne 0) { throw '生产单字段 runner SQL 本地演练失败。' }
  $JsonLine = $Rows | Where-Object {
    -not [string]::IsNullOrWhiteSpace($_) -and $_.TrimStart().StartsWith('{')
  } | Select-Object -Last 1
  if ([string]::IsNullOrWhiteSpace([string]$JsonLine)) {
    throw '生产单字段 runner SQL 本地演练没有返回 JSON。'
  }
  return [string]$JsonLine | ConvertFrom-Json -Depth 100
}

function Read-RunnerHereString([string]$RunnerText, [string]$VariableName, [ValidateSet('single', 'double')][string]$QuoteStyle) {
  $EscapedVariable = [regex]::Escape("`$$VariableName")
  $Pattern = if ($QuoteStyle -eq 'single') {
    "(?ms)^$EscapedVariable\s*=\s*@'\r?\n(?<body>.*?)\r?\n'@\s*$"
  } else {
    "(?ms)^$EscapedVariable\s*=\s*@`"\r?\n(?<body>.*?)\r?\n`"@\s*$"
  }
  $Match = [regex]::Match($RunnerText, $Pattern)
  if (-not $Match.Success) { throw "未找到 runner SQL here-string：$VariableName" }
  return $Match.Groups['body'].Value
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$PgBin = Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin'
foreach ($ToolName in @('initdb.exe', 'pg_ctl.exe', 'createdb.exe', 'psql.exe')) {
  if (-not (Test-Path -LiteralPath (Join-Path $PgBin $ToolName))) {
    throw "缺少本地 PostgreSQL 演练工具：$ToolName"
  }
}

$RehearsalRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups\wp2-content-snapshot-rehearsal'))
$RunRoot = Join-Path $RehearsalRoot (Get-Date -Format 'yyyyMMdd-HHmmss-fff')
$ExpectedPrefix = $RehearsalRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $RunRoot.StartsWith($ExpectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "本地演练目录越界：$RunRoot"
}

$ClusterDir = Join-Path $RunRoot 'cluster'
$ServerLog = Join-Path $RunRoot 'postgres.log'
$BootstrapPath = Join-Path $RunRoot 'bootstrap.sql'
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
$script:Connection = "host=127.0.0.1 port=$Port user=postgres dbname=content_snapshot_rehearsal sslmode=disable"
$ServerStarted = $false

$AdminUserId = '11111111-1111-1111-1111-111111111111'
$OtherUserId = '22222222-2222-2222-2222-222222222222'
$ContentNoteId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'
$ProblemNoteId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'
$AiNoteId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'

$BootstrapSql = @'
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema private;
create schema extensions;
create extension pgcrypto with schema extensions;

create type public.note_type as enum ('note', 'problem_set');
create type public.subject as enum ('math', 'english', 'politics', 'economics');

create table auth.users (
  id uuid primary key,
  email text not null unique
);

create function auth.uid()
returns uuid
language sql
stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;

create table public.admin_users (email text primary key);
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  note_id uuid references public.notes(id) on delete cascade,
  parent_id uuid references public.chapters(id) on delete cascade,
  title text not null default ''
);

create function private.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admin_users admin_row
    join auth.users user_row on lower(user_row.email) = lower(admin_row.email)
    where user_row.id = auth.uid()
  );
$$;

create function private.reject_immutable_event_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Immutable event rows cannot be updated or deleted';
end;
$$;

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'reader@example.test');
insert into public.admin_users (email) values ('admin@example.test');
'@

try {
  Set-Content -LiteralPath $BootstrapPath -Value $BootstrapSql -Encoding UTF8
  Invoke-Checked '初始化本地 PostgreSQL' $InitDb @('--pgdata', $ClusterDir, '--username=postgres', '--auth=trust', '--encoding=UTF8', '--no-locale')
  Invoke-Checked '启动本地 PostgreSQL' $PgCtl @('--pgdata', $ClusterDir, '--log', $ServerLog, '--options', "-h 127.0.0.1 -p $Port", 'start', '--wait')
  $ServerStarted = $true
  Invoke-Checked '创建本地演练数据库' $CreateDb @('--host=127.0.0.1', "--port=$Port", '--username=postgres', 'content_snapshot_rehearsal')
  Invoke-Checked '加载最小 Supabase 夹具' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $BootstrapPath)
  Invoke-Checked '加载 note content_version 迁移' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', (Join-Path $RepositoryRoot 'supabase\migrations\0008_note_version_and_chapter_scope.sql'))
  Invoke-Checked '加载内容迁移快照迁移' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', (Join-Path $RepositoryRoot 'supabase\migrations\0015_content_migration_snapshots.sql'))

  $SeedSql = @"
insert into public.notes (id, type, title, content, subject, problems) values
  ('$ContentNoteId', 'note', 'Content note', '#Old', 'math', '[]'::jsonb),
  ('$ProblemNoteId', 'problem_set', 'Problem note', '', 'math', '[{`"id`":`"p1`",`"question`":`"x+1`",`"answer`":`"A`",`"explanation`":`"E`",`"tips`":`"T`",`"options`":[{`"content`":`"old option`"}]}]'::jsonb),
  ('$AiNoteId', 'problem_set', 'AI review note', '', 'math', '[{`"id`":`"p2`",`"question`":`"broken$`",`"options`":[{`"content`":`"keep`"}]}]'::jsonb);
select 1;
"@
  Invoke-PsqlScalar $SeedSql | Out-Null

  $ContentBefore = '#Old'
  $ContentAfter = '# Old'
  $ContentBeforeHash = Get-Sha256 $ContentBefore
  $ContentAfterHash = Get-Sha256 $ContentAfter
  $ApplyContentSql = New-AuthenticatedSql $AdminUserId "select id::text from public.apply_content_migration('$ContentNoteId', 'content', 'batch-content-1', 'asteroid-markdown-v1', 1, '$ContentBeforeHash', '$ContentAfter', '$ContentAfterHash', false, null, null, null, 'deterministic_passed', '{`"source`":`"local-rehearsal`"}'::jsonb);"
  $ContentSnapshotId = Invoke-PsqlScalar $ApplyContentSql
  $ContentState = Invoke-PsqlScalar "select content || '|' || content_version from public.notes where id = '$ContentNoteId';"
  if ($ContentState -ne '# Old|2') { throw "正文迁移结果异常：$ContentState" }

  $RetrySnapshotId = Invoke-PsqlScalar $ApplyContentSql
  if ($RetrySnapshotId -ne $ContentSnapshotId) { throw 'apply 响应丢失重试必须返回原快照。' }
  $ContentSnapshotCount = [int](Invoke-PsqlScalar "select count(*) from public.content_migration_snapshots where note_id = '$ContentNoteId';")
  if ($ContentSnapshotCount -ne 1) { throw '幂等 apply 不得创建重复快照。' }
  Assert-SqlFails '相同 batch 输入漂移' (New-AuthenticatedSql $AdminUserId "select id from public.apply_content_migration('$ContentNoteId', 'content', 'batch-content-1', 'asteroid-markdown-v1', 1, '$ContentBeforeHash', '# Different', '$(Get-Sha256 '# Different')', false, null, null, null, 'deterministic_passed', '{}'::jsonb);")

  $RollbackSql = New-AuthenticatedSql $AdminUserId "select id::text from public.rollback_content_migration('$ContentSnapshotId', 'batch-content-rollback-1', 2, '{`"reason`":`"local-proof`"}'::jsonb);"
  $RollbackSnapshotId = Invoke-PsqlScalar $RollbackSql
  $RollbackState = Invoke-PsqlScalar "select content || '|' || content_version from public.notes where id = '$ContentNoteId';"
  if ($RollbackState -ne '#Old|3') { throw "正文回退结果异常：$RollbackState" }
  $RollbackRetryId = Invoke-PsqlScalar $RollbackSql
  if ($RollbackRetryId -ne $RollbackSnapshotId) { throw 'rollback 响应丢失重试必须返回原回退事件。' }
  Assert-SqlFails 'rollback 重试版本漂移' (New-AuthenticatedSql $AdminUserId "select id from public.rollback_content_migration('$ContentSnapshotId', 'batch-content-rollback-1', 3, '{`"reason`":`"local-proof`"}'::jsonb);")
  Assert-SqlFails 'rollback 重试验证说明漂移' (New-AuthenticatedSql $AdminUserId "select id from public.rollback_content_migration('$ContentSnapshotId', 'batch-content-rollback-1', 2, '{`"reason`":`"changed`"}'::jsonb);")
  Assert-SqlFails '同一快照二次回退' (New-AuthenticatedSql $AdminUserId "select id from public.rollback_content_migration('$ContentSnapshotId', 'batch-content-rollback-2', 3, '{}'::jsonb);")

  $QuestionBefore = 'x+1'
  $QuestionAfter = '$x+1$'
  $QuestionBeforeHash = Get-Sha256 $QuestionBefore
  $QuestionAfterHash = Get-Sha256 $QuestionAfter
  Assert-SqlFails 'after checksum 伪造' (New-AuthenticatedSql $AdminUserId "select id from public.apply_content_migration('$ProblemNoteId', 'problems.0.question', 'batch-question-bad-hash', 'asteroid-markdown-v1', 1, '$QuestionBeforeHash', '$QuestionAfter', '$ContentAfterHash', false, null, null, null, 'deterministic_passed', '{}'::jsonb);")
  $QuestionSnapshotId = Invoke-PsqlScalar (New-AuthenticatedSql $AdminUserId "select id::text from public.apply_content_migration('$ProblemNoteId', 'problems.0.question', 'batch-question-1', 'asteroid-markdown-v1', 1, '$QuestionBeforeHash', '$QuestionAfter', '$QuestionAfterHash', false, null, null, null, 'deterministic_passed', '{}'::jsonb);")
  $QuestionState = Invoke-PsqlScalar "select (problems -> 0 ->> 'question') || '|' || content_version from public.notes where id = '$ProblemNoteId';"
  if ($QuestionState -ne '$x+1$|2') { throw "题目字段迁移异常：$QuestionState" }

  Invoke-PsqlScalar "update public.notes set problems = jsonb_set(problems, '{0,question}', to_jsonb('manual edit'::text), false) where id = '$ProblemNoteId'; select 1;" | Out-Null
  Assert-SqlFails '正文变化后回退' (New-AuthenticatedSql $AdminUserId "select id from public.rollback_content_migration('$QuestionSnapshotId', 'batch-question-rollback', 3, '{}'::jsonb);")

  $AiBefore = 'broken$'
  $AiAfter = '$broken$'
  $AiBeforeHash = Get-Sha256 $AiBefore
  $AiAfterHash = Get-Sha256 $AiAfter
  Assert-SqlFails 'AI 未经人工确认' (New-AuthenticatedSql $AdminUserId "select id from public.apply_content_migration('$AiNoteId', 'problems.0.question', 'batch-ai-unconfirmed', 'asteroid-markdown-v1', 1, '$AiBeforeHash', '$AiAfter', '$AiAfterHash', true, 'deepseek', 'v4-pro', 'local-request-1', 'deterministic_passed', '{}'::jsonb);")
  $AiSnapshotId = Invoke-PsqlScalar (New-AuthenticatedSql $AdminUserId "select id::text from public.apply_content_migration('$AiNoteId', 'problems.0.question', 'batch-ai-approved', 'asteroid-markdown-v1', 1, '$AiBeforeHash', '$AiAfter', '$AiAfterHash', true, 'deepseek', 'v4-pro', 'local-request-1', 'human_approved', '{`"reviewed`":true}'::jsonb);")
  $AiState = Invoke-PsqlScalar "select (problems -> 0 ->> 'question') || '|' || content_version from public.notes where id = '$AiNoteId';"
  if ($AiState -ne '$broken$|2') { throw "AI 人工确认迁移异常：$AiState" }

  $OptionBefore = 'keep'
  $OptionAfter = 'keep unchanged meaning'
  $OptionBeforeHash = Get-Sha256 $OptionBefore
  $OptionAfterHash = Get-Sha256 $OptionAfter
  $OptionSnapshotId = Invoke-PsqlScalar (New-AuthenticatedSql $AdminUserId "select id::text from public.apply_content_migration('$AiNoteId', 'problems.0.options.0.content', 'batch-option-1', 'asteroid-markdown-v1', 2, '$OptionBeforeHash', '$OptionAfter', '$OptionAfterHash', false, null, null, null, 'human_approved', '{`"reviewed`":true}'::jsonb);")
  $OptionState = Invoke-PsqlScalar "select (problems -> 0 -> 'options' -> 0 ->> 'content') || '|' || content_version from public.notes where id = '$AiNoteId';"
  if ($OptionState -ne 'keep unchanged meaning|3') { throw "选项字段迁移异常：$OptionState" }

  Assert-SqlFails '非管理员 apply' (New-AuthenticatedSql $OtherUserId "select id from public.apply_content_migration('$ContentNoteId', 'content', 'batch-intruder', 'v1', 3, '$ContentBeforeHash', '$ContentAfter', '$ContentAfterHash', false, null, null, null, 'deterministic_passed', '{}'::jsonb);")
  Assert-SqlFails 'anon apply' "begin; set local role anon; select id from public.apply_content_migration('$ContentNoteId', 'content', 'batch-anon', 'v1', 3, '$ContentBeforeHash', '$ContentAfter', '$ContentAfterHash', false, null, null, null, 'deterministic_passed', '{}'::jsonb); commit;"
  Assert-SqlFails 'authenticated 直接 INSERT 快照' (New-AuthenticatedSql $AdminUserId "insert into public.content_migration_snapshots (note_id, batch_id, field_path, operation_kind, rule_version, before_text, after_text, before_checksum, after_checksum, note_content_version_before, note_content_version_after, validation_status, created_by) values ('$ContentNoteId', 'forged', 'content', 'migration', 'v1', 'a', 'b', '$ContentBeforeHash', '$ContentAfterHash', 3, 4, 'deterministic_passed', '$AdminUserId');")
  Assert-SqlFails '历史快照 UPDATE' "update public.content_migration_snapshots set validation_status = 'human_approved' where id = '$ContentSnapshotId';"
  Assert-SqlFails '历史快照 DELETE' "delete from public.content_migration_snapshots where id = '$ContentSnapshotId';"

  $AdminVisible = [int](Invoke-PsqlScalar (New-AuthenticatedSql $AdminUserId 'select count(*) from public.content_migration_snapshots;'))
  $OtherVisible = [int](Invoke-PsqlScalar (New-AuthenticatedSql $OtherUserId 'select count(*) from public.content_migration_snapshots;'))
  if ($AdminVisible -ne 5 -or $OtherVisible -ne 0) { throw "快照 RLS 异常：admin=$AdminVisible other=$OtherVisible" }
  $AiAuditState = Invoke-PsqlScalar "select ai_involved::text || '|' || ai_provider || '|' || ai_model || '|' || validation_status from public.content_migration_snapshots where id = '$AiSnapshotId';"
  if ($AiAuditState -ne 'true|deepseek|v4-pro|human_approved') { throw "AI 审计字段异常：$AiAuditState" }
  $RollbackAuditState = Invoke-PsqlScalar "select operation_kind || '|' || (reverts_snapshot_id = '$ContentSnapshotId')::text || '|' || validation_status from public.content_migration_snapshots where id = '$RollbackSnapshotId';"
  if ($RollbackAuditState -ne 'rollback|true|rollback_verified') { throw "回退审计字段异常：$RollbackAuditState" }

  $ProductionRunnerPath = Join-Path $RepositoryRoot 'scripts\run-wp2-production-single-proposal.ps1'
  $ProductionRunner = Get-Content -Raw -Encoding UTF8 -LiteralPath $ProductionRunnerPath
  $StateSql = Read-RunnerHereString $ProductionRunner 'StateSql' 'single'
  $AdminClaimSql = Read-RunnerHereString $ProductionRunner 'AdminClaimSql' 'single'
  $ApplyMutationSqlTemplate = Read-RunnerHereString $ProductionRunner 'ApplyMutationSqlTemplate' 'double'
  $RollbackMutationSqlTemplate = Read-RunnerHereString $ProductionRunner 'RollbackMutationSqlTemplate' 'double'

  $RunnerValidationDetail = '{"source":"production-runner-local-sql"}'
  $StateVariables = @(
    "--set=note_id=$AiNoteId",
    '--set=field_path=problems.0.options.0.content',
    "--set=before_text=$OptionBefore",
    "--set=after_text=$OptionAfter",
    "--set=before_checksum=$OptionBeforeHash",
    "--set=after_checksum=$OptionAfterHash",
    '--set=rule_version=asteroid-markdown-v1',
    '--set=ai_involved=true',
    '--set=ai_provider=deepseek',
    '--set=ai_model=deepseek-v4-pro',
    '--set=ai_request_id=local-runner-state',
    '--set=validation_detail={"reviewed":true}',
    '--set=rollback_validation_detail={"reason":"production-single-user-approved-rollback"}',
    '--set=apply_batch_id=batch-option-1',
    '--set=rollback_batch_id=production-runner-rollback-preview-local',
    '--set=expected_version=2',
    "--set=apply_snapshot_id=$OptionSnapshotId"
  )
  $RunnerState = Invoke-PsqlJsonWithVariables $StateSql $StateVariables
  if (
    [int64]$RunnerState.targetCount -ne 1 -or
    [int64]$RunnerState.contentVersion -ne 3 -or
    [string]$RunnerState.fieldChecksum -cne $OptionAfterHash -or
    [int64]$RunnerState.applyBatchRows -ne 1 -or
    [string]::IsNullOrWhiteSpace([string]$RunnerState.targetInvariantMd5) -or
    [string]::IsNullOrWhiteSpace([string]$RunnerState.nonTargetNotesMd5)
  ) {
    throw '生产单字段 runner 状态 SQL 的本地结果不满足目标/版本/指纹契约。'
  }

  $ApplyPreviewAfter = '# Old preview'
  $ApplyPreviewAfterHash = Get-Sha256 $ApplyPreviewAfter
  $ApplyVariables = @(
    "--set=note_id=$ContentNoteId",
    '--set=field_path=content',
    "--set=before_text=$ContentBefore",
    "--set=after_text=$ApplyPreviewAfter",
    "--set=before_checksum=$ContentBeforeHash",
    "--set=after_checksum=$ApplyPreviewAfterHash",
    '--set=rule_version=asteroid-markdown-v1',
    '--set=ai_involved=true',
    '--set=ai_provider=deepseek',
    '--set=ai_model=deepseek-v4-pro',
    '--set=ai_request_id=local-runner-apply-preview',
    "--set=validation_detail=$RunnerValidationDetail",
    '--set=rollback_validation_detail={"reason":"production-single-user-approved-rollback"}',
    '--set=apply_batch_id=production-runner-apply-preview-local',
    '--set=rollback_batch_id=production-runner-rollback-preview-local',
    '--set=expected_version=3',
    '--set=apply_snapshot_id=00000000-0000-0000-0000-000000000000'
  )
  $ApplyPreviewSql = $ApplyMutationSqlTemplate.Replace('$AdminClaimSql', $AdminClaimSql).Replace('__END_TRANSACTION__', 'rollback')
  $ApplyPreview = Invoke-PsqlJsonWithVariables $ApplyPreviewSql $ApplyVariables
  if (
    [int64]$ApplyPreview.applyRows -ne 1 -or
    [int64]$ApplyPreview.versionBefore -ne 3 -or
    [int64]$ApplyPreview.versionAfter -ne 4 -or
    $ApplyPreview.afterMatches -ne $true -or
    [int64]$ApplyPreview.snapshotDelta -ne 1
  ) {
    throw '生产单字段 runner apply-preview SQL 的事务内证明失败。'
  }
  $ApplyPreviewRestored = Invoke-PsqlScalar "select content || '|' || content_version from public.notes where id = '$ContentNoteId';"
  $ApplyPreviewRows = [int](Invoke-PsqlScalar "select count(*) from public.content_migration_snapshots where batch_id = 'production-runner-apply-preview-local';")
  if ($ApplyPreviewRestored -ne '#Old|3' -or $ApplyPreviewRows -ne 0) {
    throw '生产单字段 runner apply-preview 没有由数据库完整回滚。'
  }

  $RollbackPreviewSql = $RollbackMutationSqlTemplate.Replace('$AdminClaimSql', $AdminClaimSql).Replace('__END_TRANSACTION__', 'rollback')
  $RollbackPreview = Invoke-PsqlJsonWithVariables $RollbackPreviewSql $StateVariables
  if (
    [int64]$RollbackPreview.rollbackRows -ne 1 -or
    [int64]$RollbackPreview.versionBefore -ne 3 -or
    [int64]$RollbackPreview.versionAfter -ne 4 -or
    $RollbackPreview.revertsApply -ne $true -or
    $RollbackPreview.restoredBefore -ne $true -or
    [int64]$RollbackPreview.snapshotDelta -ne 1
  ) {
    throw '生产单字段 runner rollback-preview SQL 的事务内证明失败。'
  }
  $RollbackPreviewRestored = Invoke-PsqlScalar "select (problems -> 0 -> 'options' -> 0 ->> 'content') || '|' || content_version from public.notes where id = '$AiNoteId';"
  $RollbackPreviewRows = [int](Invoke-PsqlScalar "select count(*) from public.content_migration_snapshots where batch_id = 'production-runner-rollback-preview-local';")
  if ($RollbackPreviewRestored -ne 'keep unchanged meaning|3' -or $RollbackPreviewRows -ne 0) {
    throw '生产单字段 runner rollback-preview 没有由数据库完整回滚。'
  }

  $Evidence = [ordered]@{
    status = 'passed'
    testedAt = (Get-Date).ToUniversalTime().ToString('o')
    postgresVersion = (Invoke-PsqlScalar 'show server_version;')
    appliedSnapshotCount = 4
    rollbackSnapshotCount = 1
    contentApplyAndRestore = $true
    questionPathApply = $true
    optionPathApply = $true
    aiRequiresHumanApproval = $true
    sourceChecksumConflictRejected = $true
    idempotentApplyAndRollback = $true
    rollbackImmutableInputDriftRejected = $true
    immutableHistoryEnforced = $true
    productionRunnerStateSqlVerified = $true
    productionRunnerApplyPreviewVerified = $true
    productionRunnerRollbackPreviewVerified = $true
    nonAdminRowsVisible = $OtherVisible
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
