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

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$PgBin = Join-Path $Root '.tools\postgresql\17.10\pgsql\bin'
foreach ($name in @('initdb.exe', 'pg_ctl.exe', 'createdb.exe', 'psql.exe')) {
  if (-not (Test-Path -LiteralPath (Join-Path $PgBin $name))) { throw "缺少本地 PostgreSQL 工具：$name" }
}

$RehearsalRoot = [System.IO.Path]::GetFullPath((Join-Path $Root '.local-backups\wp12-job-center-rehearsal'))
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
$script:Connection = "host=127.0.0.1 port=$Port user=postgres dbname=job_center_rehearsal sslmode=disable"
$Started = $false

$Alice = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
$Bob = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'

$BootstrapSql = @"
create extension if not exists pgcrypto;
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema private;
create table auth.users (id uuid primary key, email text not null unique);
create function auth.uid() returns uuid language sql stable as `$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; `$$;
create function auth.jwt() returns jsonb language sql stable as `$$ select jsonb_build_object('sub', nullif(current_setting('request.jwt.claim.sub', true), ''), 'email', nullif(current_setting('request.jwt.claim.email', true), '')); `$$;
create function private.current_user_is_admin() returns boolean language sql stable as `$$ select false; `$$;
grant usage on schema public, auth, private to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;
grant execute on function private.current_user_is_admin() to anon, authenticated;
insert into auth.users (id, email) values ('$Alice', 'alice@example.test'), ('$Bob', 'bob@example.test');
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  job_class text not null,
  job_kind text not null,
  status text not null default 'queued',
  title text not null,
  provider text,
  external_task_id text,
  progress_current integer not null default 0,
  progress_total integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  source_storage_bucket text,
  source_storage_path text,
  heartbeat_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_class_check check (job_class in ('external', 'internal')),
  constraint jobs_status_check check (status in ('queued', 'dispatched', 'running', 'waiting_for_trigger', 'succeeded', 'failed', 'stalled', 'claimed')),
  constraint jobs_kind_nonempty check (btrim(job_kind) <> ''),
  constraint jobs_title_nonempty check (btrim(title) <> ''),
  constraint jobs_progress_check check (progress_current >= 0 and progress_total >= 0 and progress_current <= progress_total)
);
alter table public.jobs enable row level security;
alter table public.jobs force row level security;
create policy jobs_owner_select on public.jobs for select to authenticated using (user_id = (select auth.uid()) or (select private.current_user_is_admin()));
create policy jobs_owner_insert on public.jobs for insert to authenticated with check (user_id = (select auth.uid()));
create policy jobs_owner_update on public.jobs for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.jobs from anon, authenticated;
grant select, insert, update on public.jobs to authenticated;
"@

try {
  Set-Content -LiteralPath $Bootstrap -Value $BootstrapSql -Encoding UTF8
  Invoke-Checked '初始化 PostgreSQL' $InitDb @('--pgdata', $Cluster, '--username=postgres', '--auth=trust', '--encoding=UTF8', '--no-locale')
  Invoke-Checked '启动 PostgreSQL' $PgCtl @('--pgdata', $Cluster, '--log', $Log, '--options', "-h 127.0.0.1 -p $Port", 'start', '--wait'); $Started = $true
  Invoke-Checked '创建演练数据库' $CreateDb @('--host=127.0.0.1', "--port=$Port", '--username=postgres', 'job_center_rehearsal')
  Invoke-Checked '加载夹具' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $Bootstrap)
  Invoke-Checked '加载 0026_job_center_lifecycle.sql' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', (Join-Path $Root 'supabase\migrations\0026_job_center_lifecycle.sql'))

  $AliceJob = Invoke-Sql (As-Auth $Alice 'alice@example.test' "insert into public.jobs (user_id, job_class, job_kind, status, title) values ('$Alice', 'external', 'document_ocr', 'running', 'Alice OCR') returning id::text;")
  $BobJob = Invoke-Sql (As-Auth $Bob 'bob@example.test' "insert into public.jobs (user_id, job_class, job_kind, status, title) values ('$Bob', 'external', 'document_ocr', 'running', 'Bob OCR') returning id::text;")
  $Cancelled = Invoke-Sql (As-Auth $Alice 'alice@example.test' "update public.jobs set status = 'cancelled', finished_at = now() where id = '$AliceJob' and status in ('queued', 'running') returning status;")
  Assert-Equal '所有者取消任务' 'cancelled' $Cancelled

  $CrossRead = Invoke-Sql (As-Auth $Alice 'alice@example.test' "select count(*)::text from public.jobs where id = '$BobJob';")
  Assert-Equal '跨用户读取隔离' '0' $CrossRead
  $CrossUpdate = Invoke-Sql (As-Auth $Alice 'alice@example.test' "with changed as (update public.jobs set status = 'cancelled' where id = '$BobJob' returning id) select count(*)::text from changed;")
  Assert-Equal '跨用户取消隔离' '0' $CrossUpdate

  $ActiveDelete = Invoke-Sql (As-Auth $Bob 'bob@example.test' "with deleted as (delete from public.jobs where id = '$BobJob' returning id) select count(*)::text from deleted;")
  Assert-Equal '活动任务不可删除' '0' $ActiveDelete

  $OldJob = Invoke-Sql (As-Auth $Alice 'alice@example.test' "insert into public.jobs (user_id, job_class, job_kind, status, title, updated_at) values ('$Alice', 'external', 'document_ocr', 'cancelled', 'Old cancellation', now() - interval '4 days') returning id::text;")
  $FreshJob = Invoke-Sql (As-Auth $Alice 'alice@example.test' "insert into public.jobs (user_id, job_class, job_kind, status, title, updated_at) values ('$Alice', 'external', 'document_ocr', 'failed', 'Fresh failure', now() - interval '1 day') returning id::text;")
  $Deleted = Invoke-Sql (As-Auth $Alice 'alice@example.test' "delete from public.jobs where user_id = '$Alice' and status in ('succeeded', 'failed', 'stalled', 'claimed', 'cancelled') and updated_at < now() - interval '3 days' returning id::text;")
  Assert-Equal '三天终态清理' $OldJob $Deleted
  $FreshCount = Invoke-Sql (As-Auth $Alice 'alice@example.test' "select count(*)::text from public.jobs where id = '$FreshJob';")
  Assert-Equal '三天内终态保留' '1' $FreshCount

  $EvidenceObject = [ordered]@{
    status = 'passed'
    testedAt = (Get-Date).ToUniversalTime().ToString('o')
    postgresVersion = (Invoke-Sql 'show server_version;')
    ownerCancellationPassed = $true
    crossUserReadBlocked = $true
    crossUserCancellationBlocked = $true
    activeDeleteBlocked = $true
    terminalRetentionPassed = $true
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
