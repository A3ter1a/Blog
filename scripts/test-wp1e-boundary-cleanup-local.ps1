[CmdletBinding()]
param(
  [switch]$KeepArtifacts
)

$ErrorActionPreference = 'Stop'

function Invoke-Checked([string]$Label, [string]$Tool, [string[]]$Arguments) {
  & $Tool @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Label 失败，退出码 $LASTEXITCODE。" }
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$PgBin = Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin'
foreach ($ToolName in @('initdb.exe', 'pg_ctl.exe', 'createdb.exe', 'psql.exe')) {
  if (-not (Test-Path -LiteralPath (Join-Path $PgBin $ToolName))) {
    throw "缺少本地 PostgreSQL 演练工具：$ToolName"
  }
}

$RehearsalRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups\wp1e-boundary-rehearsal'))
$RunRoot = Join-Path $RehearsalRoot (Get-Date -Format 'yyyyMMdd-HHmmss-fff')
$ExpectedPrefix = $RehearsalRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $RunRoot.StartsWith($ExpectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "本地演练目录越界：$RunRoot"
}

$ClusterDir = Join-Path $RunRoot 'cluster'
$ServerLog = Join-Path $RunRoot 'postgres.log'
$MigrationPath = Join-Path $RepositoryRoot 'supabase\migrations\0013_boundary_policy_alignment.sql'
New-Item -ItemType Directory -Path $ClusterDir -Force | Out-Null

$Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$Listener.Start()
$Port = ([System.Net.IPEndPoint]$Listener.LocalEndpoint).Port
$Listener.Stop()

$InitDb = Join-Path $PgBin 'initdb.exe'
$PgCtl = Join-Path $PgBin 'pg_ctl.exe'
$CreateDb = Join-Path $PgBin 'createdb.exe'
$Psql = Join-Path $PgBin 'psql.exe'
$Connection = "host=127.0.0.1 port=$Port user=postgres dbname=wp1e_boundary sslmode=disable"
$ServerStarted = $false

$BootstrapSql = @'
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema private;

create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create function private.current_user_is_admin() returns boolean language sql stable as $$ select true $$;

create table public.admin_users (email text primary key);
create table public.site_profile (id text primary key);
create table public.english_papers (id uuid primary key);
create table public.english_passages (id uuid primary key);
create table public.english_questions (id uuid primary key);
create table public.problem_practice_statuses (id uuid primary key, user_id uuid not null);

alter table public.admin_users enable row level security;
alter table public.site_profile enable row level security;
alter table public.english_papers enable row level security;
alter table public.english_passages enable row level security;
alter table public.english_questions enable row level security;
alter table public.problem_practice_statuses enable row level security;

create policy admin_users_admin_select on public.admin_users for select to authenticated
using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) and (select private.current_user_is_admin()));
create policy admin_read_admin_users on public.admin_users for select to authenticated
using ((select private.current_user_is_admin()));

create policy site_profile_public_select on public.site_profile for select to anon, authenticated using (id = 'main');
create policy site_profile_admin_update on public.site_profile for update to authenticated
using (id = 'main' and (select private.current_user_is_admin()))
with check (id = 'main' and (select private.current_user_is_admin()));
create policy public_read_site_profile on public.site_profile for select to anon, authenticated using (true);
create policy admin_insert_site_profile on public.site_profile for insert to authenticated with check ((select private.current_user_is_admin()));
create policy admin_update_site_profile on public.site_profile for update to authenticated using ((select private.current_user_is_admin()));
create policy admin_delete_site_profile on public.site_profile for delete to authenticated using ((select private.current_user_is_admin()));

create policy english_papers_authenticated_select on public.english_papers for select to authenticated using ((select auth.role()) = 'authenticated');
create policy english_papers_admin_insert on public.english_papers for insert to authenticated with check ((select private.current_user_is_admin()));
create policy english_papers_admin_update on public.english_papers for update to authenticated using ((select private.current_user_is_admin()));
create policy english_papers_admin_delete on public.english_papers for delete to authenticated using ((select private.current_user_is_admin()));
create policy english_passages_authenticated_select on public.english_passages for select to authenticated using ((select auth.role()) = 'authenticated');
create policy english_passages_admin_insert on public.english_passages for insert to authenticated with check ((select private.current_user_is_admin()));
create policy english_passages_admin_update on public.english_passages for update to authenticated using ((select private.current_user_is_admin()));
create policy english_passages_admin_delete on public.english_passages for delete to authenticated using ((select private.current_user_is_admin()));
create policy english_questions_authenticated_select on public.english_questions for select to authenticated using ((select auth.role()) = 'authenticated');
create policy english_questions_admin_insert on public.english_questions for insert to authenticated with check ((select private.current_user_is_admin()));
create policy english_questions_admin_update on public.english_questions for update to authenticated using ((select private.current_user_is_admin()));
create policy english_questions_admin_delete on public.english_questions for delete to authenticated using ((select private.current_user_is_admin()));

create policy problem_practice_statuses_owner_select on public.problem_practice_statuses for select to authenticated
using (user_id = (select auth.uid()) or (select private.current_user_is_admin()));
create policy problem_practice_statuses_owner_insert on public.problem_practice_statuses for insert to authenticated
with check (user_id = (select auth.uid()));
create policy problem_practice_statuses_owner_update on public.problem_practice_statuses for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy problem_practice_statuses_owner_delete on public.problem_practice_statuses for delete to authenticated
using (user_id = (select auth.uid()));
create policy admin_read_problem_practice_statuses on public.problem_practice_statuses for select to authenticated using ((select private.current_user_is_admin()));
create policy admin_insert_problem_practice_statuses on public.problem_practice_statuses for insert to authenticated with check ((select private.current_user_is_admin()));
create policy admin_update_problem_practice_statuses on public.problem_practice_statuses for update to authenticated using ((select private.current_user_is_admin()));
create policy admin_delete_problem_practice_statuses on public.problem_practice_statuses for delete to authenticated using ((select private.current_user_is_admin()));

revoke all on public.admin_users, public.site_profile, public.english_papers, public.english_passages,
  public.english_questions, public.problem_practice_statuses from anon, authenticated;
grant select on public.admin_users to authenticated;
grant select on public.site_profile to anon, authenticated;
grant update on public.site_profile to authenticated;
grant select, insert, update, delete on public.english_papers, public.english_passages,
  public.english_questions, public.problem_practice_statuses to authenticated;
'@

$VerificationSql = @'
with boundary_tables(table_name) as (
  values ('admin_users'), ('site_profile'), ('english_papers'), ('english_passages'),
    ('english_questions'), ('problem_practice_statuses')
), legacy_policies(policy_name) as (
  values
    ('admin_read_admin_users'), ('public_read_site_profile'),
    ('admin_insert_site_profile'), ('admin_update_site_profile'), ('admin_delete_site_profile'),
    ('admin_read_problem_practice_statuses'), ('admin_insert_problem_practice_statuses'),
    ('admin_update_problem_practice_statuses'), ('admin_delete_problem_practice_statuses')
)
select json_build_object(
  'policyCount', (
    select count(*) from pg_policies policies
    join boundary_tables on boundary_tables.table_name = policies.tablename
    where policies.schemaname = 'public'
  ),
  'legacyPolicyCount', (
    select count(*) from pg_policies policies
    join legacy_policies on legacy_policies.policy_name = policies.policyname
    where policies.schemaname = 'public'
  ),
  'adminWriteGrant', (
    has_table_privilege('authenticated', 'public.admin_users', 'insert')
    or has_table_privilege('authenticated', 'public.admin_users', 'update')
    or has_table_privilege('authenticated', 'public.admin_users', 'delete')
  ),
  'siteInsertDeleteGrant', (
    has_table_privilege('authenticated', 'public.site_profile', 'insert')
    or has_table_privilege('authenticated', 'public.site_profile', 'delete')
  ),
  'anonEnglishReadGrant', (
    has_table_privilege('anon', 'public.english_papers', 'select')
    or has_table_privilege('anon', 'public.english_passages', 'select')
    or has_table_privilege('anon', 'public.english_questions', 'select')
  ),
  'authenticatedEnglishReadGrant', (
    has_table_privilege('authenticated', 'public.english_papers', 'select')
    and has_table_privilege('authenticated', 'public.english_passages', 'select')
    and has_table_privilege('authenticated', 'public.english_questions', 'select')
  )
)::text;
'@

try {
  Invoke-Checked '初始化本地 PostgreSQL' $InitDb @(
    '--pgdata', $ClusterDir, '--username=postgres', '--auth=trust', '--encoding=UTF8', '--no-locale'
  )
  Invoke-Checked '启动本地 PostgreSQL' $PgCtl @(
    '--pgdata', $ClusterDir, '--log', $ServerLog, '--options', "-h 127.0.0.1 -p $Port", 'start', '--wait'
  )
  $ServerStarted = $true
  Invoke-Checked '创建本地边界演练数据库' $CreateDb @(
    '--host=127.0.0.1', "--port=$Port", '--username=postgres', 'wp1e_boundary'
  )
  Invoke-Checked '加载生产遗留策略夹具' $Psql @(
    '--dbname', $Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--command', $BootstrapSql
  )
  Invoke-Checked '首次执行 0013 清理' $Psql @(
    '--dbname', $Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $MigrationPath
  )
  Invoke-Checked '第二次执行 0013 幂等重放' $Psql @(
    '--dbname', $Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $MigrationPath
  )

  $Rows = & $Psql '--dbname' $Connection '--no-password' '--no-psqlrc' '--quiet' `
    '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' $VerificationSql
  if ($LASTEXITCODE -ne 0) { throw '0013 本地后验查询失败。' }
  $Json = (($Rows | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Last 1) -join '').Trim()
  try { $Result = $Json | ConvertFrom-Json } catch { throw '0013 本地后验没有返回合法 JSON。' }

  if (
    [int64]$Result.policyCount -ne 19 -or
    [int64]$Result.legacyPolicyCount -ne 0 -or
    [bool]$Result.adminWriteGrant -or
    [bool]$Result.siteInsertDeleteGrant -or
    [bool]$Result.anonEnglishReadGrant -or
    -not [bool]$Result.authenticatedEnglishReadGrant
  ) {
    throw '0013 本地遗留策略清理或 grants 后验失败。'
  }

  [ordered]@{
    status = 'passed'
    testedAt = [DateTimeOffset]::UtcNow.ToString('o')
    postgresVersion = ((& $Psql '--dbname' $Connection '--no-password' '--no-psqlrc' '--quiet' '--tuples-only' '--no-align' '--command' 'show server_version;') -join '').Trim()
    migrationReplayCount = 2
    policyCount = [int64]$Result.policyCount
    legacyPolicyCount = [int64]$Result.legacyPolicyCount
    externalConnections = 0
  } | ConvertTo-Json
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
