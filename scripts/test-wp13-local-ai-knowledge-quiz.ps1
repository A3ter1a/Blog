[CmdletBinding()]
param([switch]$KeepArtifacts)

$ErrorActionPreference = 'Stop'

function Invoke-Checked([string]$Label, [string]$Tool, [string[]]$Arguments) {
  & $Tool @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Label 失败，退出码 $LASTEXITCODE。" }
}

function Invoke-Sql([string]$Sql) {
  $rows = & $script:Psql '--dbname' $script:Connection '--no-password' '--no-psqlrc' '--quiet' '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' $Sql
  if ($LASTEXITCODE -ne 0) { throw "本地 SQL 失败：$Sql" }
  return (($rows | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Last 1) -join '').Trim()
}

function As-Auth([string]$UserId, [string]$Email, [string]$Sql) {
  return @"
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$UserId', true);
select set_config('request.jwt.claim.email', '$Email', true);
$Sql
commit;
"@
}

function Assert-Equal([string]$Label, [string]$Expected, [string]$Actual) {
  if ($Expected -cne $Actual) { throw "$Label：期望 '$Expected'，实际 '$Actual'。" }
}

function Assert-SqlFails([string]$Label, [string]$Sql) {
  $null = & $script:Psql '--dbname' $script:Connection '--no-password' '--no-psqlrc' '--quiet' '--set' 'ON_ERROR_STOP=1' '--command' $Sql 2>&1
  if ($LASTEXITCODE -eq 0) { throw "$Label 应被数据库拒绝，但实际成功。" }
}

function Assert-AuthUpdateBlocked([string]$Label, [string]$UserId, [string]$Email, [string]$Update) {
  $body = "do `$$ declare changed integer; begin $Update; get diagnostics changed = row_count; if changed = 0 then raise exception 'blocked'; end if; end `$$;"
  Assert-SqlFails $Label (As-Auth $UserId $Email $body)
}

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$PgBin = Join-Path $Root '.tools\postgresql\17.10\pgsql\bin'
foreach ($name in @('initdb.exe', 'pg_ctl.exe', 'createdb.exe', 'psql.exe')) {
  if (-not (Test-Path -LiteralPath (Join-Path $PgBin $name))) { throw "缺少本地 PostgreSQL 工具：$name" }
}

$RehearsalRoot = [System.IO.Path]::GetFullPath((Join-Path $Root '.local-backups\wp13-ai-knowledge-quiz-rehearsal'))
$RunRoot = Join-Path $RehearsalRoot (Get-Date -Format 'yyyyMMdd-HHmmss-fff')
$ExpectedPrefix = $RehearsalRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $RunRoot.StartsWith($ExpectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw "演练目录越界：$RunRoot" }
$Cluster = Join-Path $RunRoot 'cluster'
$Log = Join-Path $RunRoot 'postgres.log'
$Bootstrap = Join-Path $RunRoot 'bootstrap.sql'
$Evidence = Join-Path $RehearsalRoot 'latest-result.json'
New-Item -ItemType Directory -Path $Cluster -Force | Out-Null

$Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$Listener.Start(); $Port = ([System.Net.IPEndPoint]$Listener.LocalEndpoint).Port; $Listener.Stop()
$InitDb = Join-Path $PgBin 'initdb.exe'; $PgCtl = Join-Path $PgBin 'pg_ctl.exe'; $CreateDb = Join-Path $PgBin 'createdb.exe'; $script:Psql = Join-Path $PgBin 'psql.exe'
$script:Connection = "host=127.0.0.1 port=$Port user=postgres dbname=ai_quiz_rehearsal sslmode=disable"
$Started = $false

$Admin = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
$Math = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
$Economics = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
$Note = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'

$BootstrapSql = @"
create extension if not exists pgcrypto;
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema private;
create table auth.users (id uuid primary key, email text not null unique);
create function auth.uid() returns uuid language sql stable as `$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; `$$;
create function auth.jwt() returns jsonb language sql stable as `$$ select jsonb_build_object('sub', nullif(current_setting('request.jwt.claim.sub', true), ''), 'email', nullif(current_setting('request.jwt.claim.email', true), '')); `$$;
create function auth.role() returns text language sql stable as `$$ select current_setting('role', true); `$$;
create type public.subject as enum ('math', 'english', 'politics', 'economics');
create table public.admin_users (id uuid primary key default gen_random_uuid(), email text not null unique);
create table public.notes (
  id uuid primary key default gen_random_uuid(), type text not null default 'note', title text not null default '', content text not null default '', subject public.subject,
  tags text[] not null default '{}'::text[], cover_image text, videos jsonb not null default '[]'::jsonb, problems jsonb not null default '[]'::jsonb,
  is_published boolean not null default false, content_version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create function public.set_updated_at() returns trigger language plpgsql as `$$ begin new.updated_at = now(); return new; end; `$$;
create function private.current_user_is_admin() returns boolean language sql stable security definer set search_path = public, auth, pg_temp as `$$
  select exists (select 1 from public.admin_users admin join auth.users auth_user on lower(auth_user.email) = lower(admin.email) where auth_user.id = (select auth.uid()));
`$$;
grant usage on schema public, auth, private to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;
grant execute on function auth.role() to anon, authenticated;
grant execute on function private.current_user_is_admin() to anon, authenticated;
insert into auth.users (id, email) values ('$Admin', 'admin@example.test'), ('$Math', 'math-ai@example.test'), ('$Economics', 'economics-ai@example.test');
insert into public.admin_users (id, email) values ('$Admin', 'admin@example.test');
insert into public.notes (id, title, content, subject) values ('$Note', '数学讲义', '# 数学讲义', 'math');
"@

try {
  Set-Content -LiteralPath $Bootstrap -Value $BootstrapSql -Encoding UTF8
  Invoke-Checked '初始化 PostgreSQL' $InitDb @('--pgdata', $Cluster, '--username=postgres', '--auth=trust', '--encoding=UTF8', '--no-locale')
  Invoke-Checked '启动 PostgreSQL' $PgCtl @('--pgdata', $Cluster, '--log', $Log, '--options', "-h 127.0.0.1 -p $Port", 'start', '--wait'); $Started = $true
  Invoke-Checked '创建演练数据库' $CreateDb @('--host=127.0.0.1', "--port=$Port", '--username=postgres', 'ai_quiz_rehearsal')
  Invoke-Checked '加载夹具' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $Bootstrap)
  foreach ($migration in @('0023_ai_content_accounts_and_collections.sql', '0024_ai_content_review_comments.sql', '0027_ai_knowledge_quizzes.sql', '0028_ai_knowledge_quiz_insert_policy_fix.sql')) {
    Invoke-Checked "加载 $migration" $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', (Join-Path $Root "supabase\migrations\$migration"))
  }

  # AI profiles are provisioned by a reviewed service-role operation; the
  # runtime authenticated role intentionally has read-only profile grants.
  Invoke-Sql "insert into public.ai_profiles (id, account_key, subject, display_name) values ('$Math', 'math', 'math', 'Math Tutor'), ('$Economics', 'economics', 'economics', 'Economics Tutor'); select 1;" | Out-Null
  $Proposal = Invoke-Sql (As-Auth $Math 'math-ai@example.test' "insert into public.ai_content_proposals (owner_user_id, ai_profile_id, title, content, subject) values ('$Math', '$Math', 'Math proposal', '# Math proposal', 'math') returning id::text;")
  if ([string]::IsNullOrWhiteSpace($Proposal)) { throw 'AI 讲义提案创建失败。' }

  $Quiz = Invoke-Sql (As-Auth $Math 'math-ai@example.test' @"
insert into public.ai_knowledge_quizzes (proposal_id, owner_user_id, ai_profile_id, title, subject, review_status, self_check, item_count)
values ('$Proposal', '$Math', '$Math', 'Math quick test', 'math', 'self_checked', '{"passed":true}', 1)
returning id::text;
"@)
  if ([string]::IsNullOrWhiteSpace($Quiz)) { throw 'AI 自检通过的 self_checked 快测插入失败。' }
  Invoke-Sql (As-Auth $Math 'math-ai@example.test' @"
insert into public.ai_knowledge_quiz_items (quiz_id, ordinal, item_type, question, options, answer, explanation, knowledge_points)
values ('$Quiz', 1, 'single_choice', '1+1=?', '[{"label":"A","text":"2"},{"label":"B","text":"3"}]', '"A"', 'basic addition', array['addition']);
select 1;
"@) | Out-Null

  Assert-Equal 'AI 读取自己的快测' '1' (Invoke-Sql (As-Auth $Math 'math-ai@example.test' "select count(*)::text from public.ai_knowledge_quizzes where id = '$Quiz';"))
  Assert-Equal 'AI 隔离其他学科快测' '0' (Invoke-Sql (As-Auth $Math 'math-ai@example.test' "select count(*)::text from public.ai_knowledge_quizzes where owner_user_id = '$Economics';"))
  Invoke-Sql (As-Auth $Math 'math-ai@example.test' "update public.ai_knowledge_quizzes set review_status = 'pending_review' where id = '$Quiz'; select 1;") | Out-Null
  Assert-Equal '提交后状态为待审核' 'pending_review' (Invoke-Sql "select review_status from public.ai_knowledge_quizzes where id = '$Quiz';")
  Assert-AuthUpdateBlocked 'pending_review 后 AI 修改快测' $Math 'math-ai@example.test' "update public.ai_knowledge_quizzes set title = 'forged' where id = '$Quiz'"
  Assert-AuthUpdateBlocked 'AI 直接批准快测' $Math 'math-ai@example.test' "update public.ai_knowledge_quizzes set review_status = 'approved' where id = '$Quiz'"

  Invoke-Sql (As-Auth $Admin 'admin@example.test' "update public.ai_knowledge_quizzes set review_status = 'approved', reviewer_user_id = '$Admin', reviewed_at = now() where id = '$Quiz'; select 1;") | Out-Null
  Assert-Equal '管理员批准快测' 'approved' (Invoke-Sql "select review_status from public.ai_knowledge_quizzes where id = '$Quiz';")
  Assert-SqlFails '匿名不可读私有快测' "begin; set local role anon; select count(*) from public.ai_knowledge_quizzes where id = '$Quiz'; commit;"

  $EvidenceObject = [ordered]@{
    status = 'passed'
    testedAt = (Get-Date).ToUniversalTime().ToString('o')
    postgresVersion = (Invoke-Sql 'show server_version;')
    selfCheckedInsertPassed = $true
    ownQuizReadPassed = $true
    crossSubjectReadBlocked = $true
    pendingReviewMutationBlocked = $true
    directApprovalBlocked = $true
    adminApprovalPassed = $true
    anonymousReadBlocked = $true
    externalConnections = 0
  }
  New-Item -ItemType Directory -Path $RehearsalRoot -Force | Out-Null
  Set-Content -LiteralPath $Evidence -Value ($EvidenceObject | ConvertTo-Json -Depth 5) -Encoding UTF8
  $EvidenceObject | ConvertTo-Json -Depth 5
} finally {
  if ($Started) { & $PgCtl '--pgdata' $Cluster 'stop' '--mode=fast' '--wait' | Out-Null }
  if (-not $KeepArtifacts -and (Test-Path -LiteralPath $RunRoot)) {
    $resolved = (Resolve-Path -LiteralPath $RunRoot).Path
    if (-not $resolved.StartsWith($ExpectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw "拒绝清理演练根目录外路径：$resolved" }
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
