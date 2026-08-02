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

function Invoke-AuthenticatedSql([string]$UserId, [string]$Email, [string]$Body) {
  return @"
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$UserId', true);
select set_config('request.jwt.claim.email', '$Email', true);
$Body
commit;
"@
}

function Assert-SqlFails([string]$Label, [string]$Sql) {
  $null = & $script:Psql '--dbname' $script:Connection '--no-password' '--no-psqlrc' '--quiet' `
    '--set' 'ON_ERROR_STOP=1' '--command' $Sql 2>&1
  if ($LASTEXITCODE -eq 0) { throw "$Label 应被数据库拒绝，但实际成功。" }
}

function Assert-AuthenticatedUpdateBlocked([string]$Label, [string]$UserId, [string]$Email, [string]$UpdateBody) {
  $Block = 'do $$ declare changed integer; begin ' + $UpdateBody + '; get diagnostics changed = row_count; if changed = 0 then raise exception ''blocked''; end if; end $$;'
  Assert-SqlFails $Label (Invoke-AuthenticatedSql $UserId $Email $Block)
}

function Assert-Equal([string]$Label, [string]$Expected, [string]$Actual) {
  if ($Expected -cne $Actual) { throw "$Label：期望 '$Expected'，实际 '$Actual'。" }
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$PgBin = Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin'
foreach ($ToolName in @('initdb.exe', 'pg_ctl.exe', 'createdb.exe', 'psql.exe')) {
  if (-not (Test-Path -LiteralPath (Join-Path $PgBin $ToolName))) {
    throw "缺少本地 PostgreSQL 演练工具：$ToolName"
  }
}

$RehearsalRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups\wp8-ai-content-rehearsal'))
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
$script:Connection = "host=127.0.0.1 port=$Port user=postgres dbname=ai_content_rehearsal sslmode=disable"
$ServerStarted = $false

$AdminId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'
$MathId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'
$EconomicsId = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'
$HumanId = 'dddddddd-dddd-dddd-dddd-ddddddddddd1'
$HumanNoteId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1'
$MathNoteId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2'
$EconomicsNoteId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee3'

$BootstrapSql = @"
create extension if not exists pgcrypto;
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema private;
create table auth.users (id uuid primary key, email text not null unique);
create function auth.uid() returns uuid language sql stable as `$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; `$$;
create function auth.jwt() returns jsonb language sql stable as `$$
  select jsonb_build_object(
    'sub', nullif(current_setting('request.jwt.claim.sub', true), ''),
    'email', nullif(current_setting('request.jwt.claim.email', true), ''),
    'role', nullif(current_setting('role', true), '')
  );
`$$;
create function auth.role() returns text language sql stable as `$$ select current_setting('role', true); `$$;
create type public.subject as enum ('math', 'english', 'politics', 'economics');
create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique
);
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'note',
  title text not null default '',
  content text not null default '',
  subject public.subject,
  tags text[] not null default '{{}}'::text[],
  cover_image text,
  videos jsonb not null default '[]'::jsonb,
  problems jsonb not null default '[]'::jsonb,
  is_published boolean not null default false,
  content_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create function public.set_updated_at() returns trigger language plpgsql as `$$
begin new.updated_at = now(); return new; end;
`$$;
create function private.current_user_is_admin() returns boolean language sql stable security definer
set search_path = public, pg_temp as `$$
select exists (
  select 1 from public.admin_users
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);
`$$;
grant usage on schema public, auth, private to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;
grant execute on function auth.role() to anon, authenticated;
grant execute on function private.current_user_is_admin() to anon, authenticated;
insert into auth.users (id, email) values
  ('$AdminId', 'admin@example.test'),
  ('$MathId', 'math-ai@example.test'),
  ('$EconomicsId', 'economics-ai@example.test'),
  ('$HumanId', 'learner@example.test');
insert into public.admin_users (id, email) values ('$AdminId', 'admin@example.test');
insert into public.notes (id, title, content, subject, is_published)
values
  ('$HumanNoteId', '人工文章', '# 人工文章', 'math', false),
  ('$MathNoteId', '数学草稿', '# 数学草稿', 'math', false),
  ('$EconomicsNoteId', '经济学草稿', '# 经济学草稿', 'economics', false);
"@

try {
  Set-Content -LiteralPath $BootstrapPath -Value $BootstrapSql -Encoding UTF8
  Invoke-Checked '初始化本地 PostgreSQL' $InitDb @('--pgdata', $ClusterDir, '--username=postgres', '--auth=trust', '--encoding=UTF8', '--no-locale')
  Invoke-Checked '启动本地 PostgreSQL' $PgCtl @('--pgdata', $ClusterDir, '--log', $ServerLog, '--options', "-h 127.0.0.1 -p $Port", 'start', '--wait')
  $ServerStarted = $true
  Invoke-Checked '创建本地演练数据库' $CreateDb @('--host=127.0.0.1', "--port=$Port", '--username=postgres', 'ai_content_rehearsal')
  Invoke-Checked '加载 Supabase 最小夹具' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $BootstrapPath)
  Invoke-Checked '加载 AI 内容迁移' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', (Join-Path $RepositoryRoot 'supabase\migrations\0023_ai_content_accounts_and_collections.sql'))
  Invoke-Checked '加载 AI 审核批注迁移' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', (Join-Path $RepositoryRoot 'supabase\migrations\0024_ai_content_review_comments.sql'))
  Invoke-Checked '加载 AI 提交审核 RPC 迁移' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', (Join-Path $RepositoryRoot 'supabase\migrations\0029_ai_content_submission_rpc.sql'))

  Invoke-PsqlScalar @"
insert into public.ai_profiles (id, account_key, subject, display_name)
values
  ('$MathId', 'math', 'math', 'Math Tutor'),
  ('$EconomicsId', 'economics', 'economics', 'Economics Tutor');
select 1;
"@ | Out-Null

  # The test accounts receive only the same table privileges as a Supabase JWT client.
  Invoke-PsqlScalar @"
grant select on public.notes to anon, authenticated;
grant insert, update, delete on public.notes to authenticated;
grant select on public.admin_users to authenticated;
select 1;
"@ | Out-Null

  $MathProposalId = Invoke-PsqlScalar (Invoke-AuthenticatedSql $MathId 'math-ai@example.test' @"
insert into public.ai_content_proposals (owner_user_id, ai_profile_id, title, content, subject)
values ('$MathId', '$MathId', 'Math proposal', '# Math proposal', 'math')
returning id::text;
"@)
  if ([string]::IsNullOrWhiteSpace($MathProposalId)) { throw '数学 AI 创建自己的 proposal 失败。' }

  $VisibleOwn = Invoke-PsqlScalar (Invoke-AuthenticatedSql $MathId 'math-ai@example.test' "select count(*)::text from public.ai_content_proposals where id = '$MathProposalId';")
  Assert-Equal 'AI 读取自己的 proposal' '1' $VisibleOwn
  $VisibleOther = Invoke-PsqlScalar (Invoke-AuthenticatedSql $MathId 'math-ai@example.test' "select count(*)::text from public.ai_content_proposals where owner_user_id = '$EconomicsId';")
  Assert-Equal 'AI 隔离其他学科 proposal' '0' $VisibleOther

  Invoke-PsqlScalar (Invoke-AuthenticatedSql $MathId 'math-ai@example.test' "update public.ai_content_proposals set review_status = 'self_checked', self_check = jsonb_build_object('passed', true), source_checksum = repeat('a', 64) where id = '$MathProposalId'; select 1;") | Out-Null
  Assert-AuthenticatedUpdateBlocked 'AI 直接批准 proposal' $MathId 'math-ai@example.test' "update public.ai_content_proposals set review_status = 'approved' where id = '$MathProposalId'"
  Assert-SqlFails 'AI 伪造其他学科 proposal' (Invoke-AuthenticatedSql $MathId 'math-ai@example.test' "insert into public.ai_content_proposals (owner_user_id, ai_profile_id, title, content, subject) values ('$MathId', '$MathId', 'Forged', '# Forged', 'economics'); select 1;")
  Assert-AuthenticatedUpdateBlocked 'AI 修改人工文章' $MathId 'math-ai@example.test' "update public.notes set title = 'Forged edit' where id = '$HumanNoteId'"

  $MathNoteOwned = Invoke-PsqlScalar (Invoke-AuthenticatedSql $MathId 'math-ai@example.test' @"
insert into public.notes (title, content, subject, author_kind, author_profile_id, owner_user_id, is_published)
values ('Math AI draft', '# Draft', 'math', 'ai', '$MathId', '$MathId', false)
returning id::text;
"@)
  if ([string]::IsNullOrWhiteSpace($MathNoteOwned)) { throw 'AI 创建自己的私有 note 失败。' }
  Assert-AuthenticatedUpdateBlocked 'AI 直接发布 note' $MathId 'math-ai@example.test' "update public.notes set is_published = true where id = '$MathNoteOwned'"
  Assert-SqlFails 'AI 伪造人工 note' (Invoke-AuthenticatedSql $MathId 'math-ai@example.test' "insert into public.notes (title, content, subject, author_kind, is_published) values ('Forged human', '# Forged', 'math', 'human', false); select 1;")

  $EconomicsOwn = Invoke-PsqlScalar (Invoke-AuthenticatedSql $EconomicsId 'economics-ai@example.test' @"
insert into public.ai_content_proposals (owner_user_id, ai_profile_id, title, content, subject)
values ('$EconomicsId', '$EconomicsId', 'Economics proposal', '# Economics proposal', 'economics')
returning id::text;
"@)
  Assert-AuthenticatedUpdateBlocked 'AI 修改其他学科 proposal' $MathId 'math-ai@example.test' "update public.ai_content_proposals set title = 'Forged' where id = '$EconomicsOwn'"
  $OtherNoteVisible = Invoke-PsqlScalar (Invoke-AuthenticatedSql $MathId 'math-ai@example.test' "select count(*)::text from public.notes where id = '$EconomicsNoteId';")
  Assert-Equal 'AI 隔离其他学科私有 note' '0' $OtherNoteVisible

  $CollectionId = Invoke-PsqlScalar (Invoke-AuthenticatedSql $MathId 'math-ai@example.test' @"
insert into public.note_collections (owner_user_id, owner_kind, ai_profile_id, title, subject)
values ('$MathId', 'ai', '$MathId', 'Math collection', 'math')
returning id::text;
"@)
  Invoke-PsqlScalar (Invoke-AuthenticatedSql $MathId 'math-ai@example.test' @"
insert into public.note_collection_items (collection_id, note_id, added_by_user_id)
values ('$CollectionId', '$MathNoteOwned', '$MathId');
select 1;
"@) | Out-Null
  Assert-SqlFails 'AI 把其他学科 note 加入合集' (Invoke-AuthenticatedSql $MathId 'math-ai@example.test' "insert into public.note_collection_items (collection_id, note_id, added_by_user_id) values ('$CollectionId', '$EconomicsNoteId', '$MathId'); select 1;")
  Assert-AuthenticatedUpdateBlocked 'AI 修改其他学科合集' $EconomicsId 'economics-ai@example.test' "update public.note_collections set title = 'Forged collection' where id = '$CollectionId'"

  $AdminProposalCount = Invoke-PsqlScalar (Invoke-AuthenticatedSql $AdminId 'admin@example.test' "select count(*)::text from public.ai_content_proposals;")
  Assert-Equal '管理员读取全部 proposal' '2' $AdminProposalCount
  $SubmittedStatus = Invoke-PsqlScalar (Invoke-AuthenticatedSql $MathId 'math-ai@example.test' "select (public.submit_ai_content_proposal('$MathProposalId')).review_status;")
  Assert-Equal 'AI 通过受控 RPC 提交 proposal' 'pending_review' $SubmittedStatus
  $IdempotentSubmittedStatus = Invoke-PsqlScalar (Invoke-AuthenticatedSql $MathId 'math-ai@example.test' "select (public.submit_ai_content_proposal('$MathProposalId')).review_status;")
  Assert-Equal 'AI 重复提交 proposal 保持幂等' 'pending_review' $IdempotentSubmittedStatus
  Assert-AuthenticatedUpdateBlocked 'AI 提交后修改 proposal 正文' $MathId 'math-ai@example.test' "update public.ai_content_proposals set content = '# Changed after submit' where id = '$MathProposalId'"
  Invoke-PsqlScalar (Invoke-AuthenticatedSql $AdminId 'admin@example.test' "update public.ai_content_proposals set review_status = 'approved', reviewer_user_id = '$AdminId', reviewed_at = now() where id = '$MathProposalId'; select 1;") | Out-Null
  $AdminCollectionCount = Invoke-PsqlScalar (Invoke-AuthenticatedSql $AdminId 'admin@example.test' "select count(*)::text from public.note_collections;")
  Assert-Equal '管理员读取合集' '1' $AdminCollectionCount

  $CommentId = Invoke-PsqlScalar (Invoke-AuthenticatedSql $AdminId 'admin@example.test' @"
insert into public.ai_content_proposal_comments (
  proposal_id, author_user_id, proposal_content_version, selection_start, selection_end, quoted_text, body
)
values ('$MathProposalId', '$AdminId', 1, 0, 2, '# ', 'Add learning objectives.')
returning id::text;
"@)
  if ([string]::IsNullOrWhiteSpace($CommentId)) { throw '管理员创建批注失败。' }
  $MathOwnComments = Invoke-PsqlScalar (Invoke-AuthenticatedSql $MathId 'math-ai@example.test' "select count(*)::text from public.ai_content_proposal_comments where proposal_id = '$MathProposalId';")
  Assert-Equal 'AI 读取自己提案批注' '1' $MathOwnComments
  $EconomicsCommentVisible = Invoke-PsqlScalar (Invoke-AuthenticatedSql $MathId 'math-ai@example.test' "select count(*)::text from public.ai_content_proposal_comments where proposal_id = '$EconomicsOwn';")
  Assert-Equal 'AI 隔离其他提案批注' '0' $EconomicsCommentVisible
  Assert-SqlFails 'AI 创建审核批注' (Invoke-AuthenticatedSql $MathId 'math-ai@example.test' "insert into public.ai_content_proposal_comments (proposal_id, author_user_id, proposal_content_version, selection_start, selection_end, body) values ('$MathProposalId', '$MathId', 1, 0, 1, 'forged'); select 1;")
  Assert-AuthenticatedUpdateBlocked 'AI 解决审核批注' $MathId 'math-ai@example.test' "update public.ai_content_proposal_comments set status = 'resolved' where id = '$CommentId'"
  Assert-AuthenticatedUpdateBlocked 'AI 删除审核批注' $MathId 'math-ai@example.test' "delete from public.ai_content_proposal_comments where id = '$CommentId'"
  Invoke-PsqlScalar (Invoke-AuthenticatedSql $AdminId 'admin@example.test' "update public.ai_content_proposal_comments set status = 'resolved' where id = '$CommentId'; select 1;") | Out-Null
  $CommentStatus = Invoke-PsqlScalar "select status from public.ai_content_proposal_comments where id = '$CommentId';"
  Assert-Equal '管理员解决批注' 'resolved' $CommentStatus

  Assert-SqlFails 'AI 调用发布 RPC' (Invoke-AuthenticatedSql $MathId 'math-ai@example.test' "select public.publish_ai_content_proposal('$MathProposalId');")
  $PublishedStatus = Invoke-PsqlScalar (Invoke-AuthenticatedSql $AdminId 'admin@example.test' "select (public.publish_ai_content_proposal('$MathProposalId')).review_status;")
  Assert-Equal '管理员事务发布 proposal' 'published' $PublishedStatus
  $PublishedNoteShape = Invoke-PsqlScalar "select count(*)::text from public.notes where author_kind = 'ai' and author_profile_id = '$MathId' and owner_user_id = '$MathId' and is_published and title = 'Math proposal';"
  Assert-Equal '发布写入 AI note 身份' '1' $PublishedNoteShape
  $PublishedNoteCount = Invoke-PsqlScalar "select count(*)::text from public.notes where title = 'Math proposal';"
  Assert-Equal '重复发布保持单篇 note' '1' $PublishedNoteCount
  $IdempotentStatus = Invoke-PsqlScalar (Invoke-AuthenticatedSql $AdminId 'admin@example.test' "select (public.publish_ai_content_proposal('$MathProposalId')).review_status;")
  Assert-Equal '重复发布幂等' 'published' $IdempotentStatus

  $PublicProfiles = Invoke-PsqlScalar "begin; set local role anon; select count(*)::text from public.ai_profiles where is_active; commit;"
  Assert-Equal '匿名读取激活 AI profile' '2' $PublicProfiles
  $PublicDraftNotes = Invoke-PsqlScalar "begin; set local role anon; select count(*)::text from public.notes where not is_published; commit;"
  Assert-Equal '匿名不可读私有文章' '0' $PublicDraftNotes

  $Evidence = [ordered]@{
    status = 'passed'
    testedAt = (Get-Date).ToUniversalTime().ToString('o')
    postgresVersion = (Invoke-PsqlScalar 'show server_version;')
    aiProfiles = 2
    proposalsCreated = 2
    ownProposalVisible = 1
    crossSubjectProposalVisible = 0
    crossSubjectNoteVisible = 0
    directApprovalRejected = $true
    controlledSubmissionPassed = $true
    submissionIdempotencyPassed = $true
    submittedBodyFrozen = $true
    directPublishRejected = $true
    humanNoteMutationRejected = $true
    forgedHumanNoteRejected = $true
    collectionAppendAndIsolationPassed = $true
    adminAuditReadPassed = $true
    reviewCommentsOwnerReadPassed = $true
    reviewCommentsAiWriteRejected = $true
    reviewCommentsAdminResolvePassed = $true
    transactionalPublicationPassed = $true
    publicationIdempotencyPassed = $true
    anonymousPrivateReadRejected = $true
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
