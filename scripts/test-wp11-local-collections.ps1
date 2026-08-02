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

function Assert-Fails([string]$Label, [string]$Sql) {
  $null = & $script:Psql '--dbname' $script:Connection '--no-password' '--no-psqlrc' '--quiet' '--set' 'ON_ERROR_STOP=1' '--command' $Sql 2>&1
  if ($LASTEXITCODE -eq 0) { throw "$Label 应被数据库拒绝，但实际成功。" }
}

function Assert-Blocked([string]$Label, [string]$Sql) {
  $Block = 'do $$ declare changed integer; begin ' + $Sql + '; get diagnostics changed = row_count; if changed = 0 then raise exception ''blocked''; end if; end $$;'
  Assert-Fails $Label (As-Auth $Math 'math-ai@example.test' $Block)
}

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$PgBin = Join-Path $Root '.tools\postgresql\17.10\pgsql\bin'
foreach ($name in @('initdb.exe', 'pg_ctl.exe', 'createdb.exe', 'psql.exe')) {
  if (-not (Test-Path -LiteralPath (Join-Path $PgBin $name))) { throw "缺少本地 PostgreSQL 工具：$name" }
}

$RehearsalRoot = [System.IO.Path]::GetFullPath((Join-Path $Root '.local-backups\wp11-collections-rehearsal'))
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
$script:Connection = "host=127.0.0.1 port=$Port user=postgres dbname=collections_rehearsal sslmode=disable"
$Started = $false

$Admin = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'
$Math = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'
$Economics = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'
$MathNote = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1'
$EconomicsNote = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2'

$BootstrapSql = @"
create extension if not exists pgcrypto;
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema private;
create table auth.users (id uuid primary key, email text not null unique);
create function auth.uid() returns uuid language sql stable as `$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; `$$;
create function auth.jwt() returns jsonb language sql stable as `$$ select jsonb_build_object('sub', nullif(current_setting('request.jwt.claim.sub', true), ''), 'email', nullif(current_setting('request.jwt.claim.email', true), ''), 'role', nullif(current_setting('role', true), '')); `$$;
create function auth.role() returns text language sql stable as `$$ select current_setting('role', true); `$$;
create type public.subject as enum ('math', 'english', 'politics', 'economics');
create table public.admin_users (id uuid primary key default gen_random_uuid(), email text not null unique);
create table public.notes (
  id uuid primary key default gen_random_uuid(), type text not null default 'note', title text not null default '', content text not null default '', subject public.subject,
  tags text[] not null default '{{}}'::text[], cover_image text, videos jsonb not null default '[]'::jsonb, problems jsonb not null default '[]'::jsonb,
  is_published boolean not null default false, content_version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create function public.set_updated_at() returns trigger language plpgsql as `$$ begin new.updated_at = now(); return new; end; `$$;
create function private.current_user_is_admin() returns boolean language sql stable security definer set search_path = public, pg_temp as `$$ select exists (select 1 from public.admin_users where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))); `$$;
grant usage on schema public, auth, private to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;
grant execute on function auth.role() to anon, authenticated;
grant execute on function private.current_user_is_admin() to anon, authenticated;
insert into auth.users (id, email) values ('$Admin', 'admin@example.test'), ('$Math', 'math-ai@example.test'), ('$Economics', 'economics-ai@example.test');
insert into public.admin_users (id, email) values ('$Admin', 'admin@example.test');
insert into public.notes (id, title, content, subject, is_published) values ('$MathNote', '数学 AI 草稿', '# 数学', 'math', false), ('$EconomicsNote', '经济学 AI 草稿', '# 经济学', 'economics', false);
"@

try {
  Set-Content -LiteralPath $Bootstrap -Value $BootstrapSql -Encoding UTF8
  Invoke-Checked '初始化 PostgreSQL' $InitDb @('--pgdata', $Cluster, '--username=postgres', '--auth=trust', '--encoding=UTF8', '--no-locale')
  Invoke-Checked '启动 PostgreSQL' $PgCtl @('--pgdata', $Cluster, '--log', $Log, '--options', "-h 127.0.0.1 -p $Port", 'start', '--wait'); $Started = $true
  Invoke-Checked '创建演练数据库' $CreateDb @('--host=127.0.0.1', "--port=$Port", '--username=postgres', 'collections_rehearsal')
  Invoke-Checked '加载夹具' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $Bootstrap)
  foreach ($migration in @('0023_ai_content_accounts_and_collections.sql', '0024_ai_content_review_comments.sql', '0025_ai_collection_publish_boundary.sql')) {
    Invoke-Checked "加载 $migration" $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', (Join-Path $Root "supabase\migrations\$migration"))
  }
  Invoke-Sql "insert into public.ai_profiles (id, account_key, subject, display_name) values ('$Math', 'math', 'math', 'Math Tutor'), ('$Economics', 'economics', 'economics', 'Economics Tutor'); select 1;" | Out-Null
  Invoke-Sql "grant select on public.notes to anon, authenticated; grant insert, update, delete on public.notes to authenticated; grant select on public.admin_users to authenticated; select 1;" | Out-Null

  $MathOwnedNoteId = Invoke-Sql (As-Auth $Math 'math-ai@example.test' "insert into public.notes (title, content, subject, author_kind, author_profile_id, owner_user_id, is_published) values ('Math owned', '# Math', 'math', 'ai', '$Math', '$Math', false) returning id::text;")
  $EconomicsOwnedNoteId = Invoke-Sql (As-Auth $Economics 'economics-ai@example.test' "insert into public.notes (title, content, subject, author_kind, author_profile_id, owner_user_id, is_published) values ('Economics owned', '# Economics', 'economics', 'ai', '$Economics', '$Economics', false) returning id::text;")
  $CollectionId = Invoke-Sql (As-Auth $Math 'math-ai@example.test' "insert into public.note_collections (owner_user_id, owner_kind, ai_profile_id, title, subject) values ('$Math', 'ai', '$Math', 'Math collection', 'math') returning id::text;")
  Invoke-Sql (As-Auth $Math 'math-ai@example.test' "insert into public.note_collection_items (collection_id, note_id, added_by_user_id) values ('$CollectionId', '$MathOwnedNoteId', '$Math'); select 1;") | Out-Null
  Assert-Fails 'AI 把其他学科文章加入合集' (As-Auth $Math 'math-ai@example.test' "insert into public.note_collection_items (collection_id, note_id, added_by_user_id) values ('$CollectionId', '$EconomicsOwnedNoteId', '$Math'); select 1;")
  Invoke-Sql (As-Auth $Math 'math-ai@example.test' "update public.note_collections set title = 'Math collection edited' where id = '$CollectionId'; select 1;") | Out-Null
  Invoke-Sql (As-Auth $Admin 'admin@example.test' "update public.note_collections set is_published = true where id = '$CollectionId'; select 1;") | Out-Null
  Assert-Blocked 'AI 编辑已发布合集' "update public.note_collections set title = 'forged' where id = '$CollectionId'"
  Assert-Blocked 'AI 修改已发布合集项目' "delete from public.note_collection_items where collection_id = '$CollectionId'"
  $PublicCount = Invoke-Sql "begin; set local role anon; select count(*)::text from public.note_collections where is_published; commit;"
  Assert-Equal '匿名读取已发布合集' '1' $PublicCount
  $PrivateCount = Invoke-Sql "begin; set local role anon; select count(*)::text from public.note_collections where not is_published; commit;"
  Assert-Equal '匿名隔离私有合集' '0' $PrivateCount
  $ItemCount = Invoke-Sql "select count(*)::text from public.note_collection_items where collection_id = '$CollectionId';"
  Assert-Equal '合集逐篇追加' '1' $ItemCount

  $EvidenceObject = [ordered]@{ status = 'passed'; testedAt = (Get-Date).ToUniversalTime().ToString('o'); postgresVersion = (Invoke-Sql 'show server_version;'); aiOwnCollectionEditPassed = $true; crossSubjectItemRejected = $true; adminPublicationPassed = $true; aiPublishedCollectionMutationRejected = $true; anonymousPublishedReadPassed = $true; anonymousPrivateReadRejected = $true; incrementalItemCount = 1; externalConnections = 0 }
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
