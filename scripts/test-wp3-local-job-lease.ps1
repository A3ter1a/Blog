[CmdletBinding()]
param(
  [switch]$KeepArtifacts
)

$ErrorActionPreference = 'Stop'

function Invoke-Checked([string]$Label, [string]$Tool, [string[]]$Arguments) {
  & $Tool @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Label 失败，退出码 $LASTEXITCODE。"
  }
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

function Start-PsqlQuery([string]$Sql) {
  $StartInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $StartInfo.FileName = $script:Psql
  $StartInfo.UseShellExecute = $false
  $StartInfo.RedirectStandardOutput = $true
  $StartInfo.RedirectStandardError = $true
  foreach ($Argument in @(
    '--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--quiet',
    '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1', '--command', $Sql
  )) {
    $null = $StartInfo.ArgumentList.Add($Argument)
  }

  $Process = [System.Diagnostics.Process]::new()
  $Process.StartInfo = $StartInfo
  if (-not $Process.Start()) { throw '无法启动并发 psql 会话。' }
  return $Process
}

function Read-PsqlProcess([System.Diagnostics.Process]$Process, [string]$Label) {
  if (-not $Process.WaitForExit(20000)) {
    $Process.Kill($true)
    throw "$Label 超时。"
  }
  $Output = $Process.StandardOutput.ReadToEnd()
  $ErrorOutput = $Process.StandardError.ReadToEnd()
  if ($Process.ExitCode -ne 0) {
    throw "$Label 失败：$ErrorOutput"
  }
  return (($Output -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Last 1) -join '').Trim()
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$PgBin = Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin'
foreach ($ToolName in @('initdb.exe', 'pg_ctl.exe', 'createdb.exe', 'psql.exe')) {
  if (-not (Test-Path -LiteralPath (Join-Path $PgBin $ToolName))) {
    throw "缺少本地 PostgreSQL 演练工具：$ToolName"
  }
}

$RehearsalRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups\wp3-job-lease-rehearsal'))
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
$script:Connection = "host=127.0.0.1 port=$Port user=postgres dbname=lease_rehearsal sslmode=disable"
$ServerStarted = $false
$Succeeded = $false

$OwnerUserId = '11111111-1111-1111-1111-111111111111'
$OtherUserId = '22222222-2222-2222-2222-222222222222'
$OwnerJobId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'
$OtherJobId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'
$FirstItemId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'
$SecondItemId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2'

$BootstrapSql = @'
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema private;

create table auth.users (
  id uuid primary key,
  email text not null unique
);

create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table public.admin_users (email text primary key);
create table public.notes (
  id uuid primary key,
  content_version bigint not null default 1
);

create function private.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select false; $$;

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

create function private.reject_immutable_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Immutable event rows cannot be updated or deleted';
end;
$$;

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'other@example.test');
'@

try {
  Set-Content -LiteralPath $BootstrapPath -Value $BootstrapSql -Encoding UTF8
  Invoke-Checked '初始化本地 PostgreSQL' $InitDb @('--pgdata', $ClusterDir, '--username=postgres', '--auth=trust', '--encoding=UTF8', '--no-locale')
  Invoke-Checked '启动本地 PostgreSQL' $PgCtl @('--pgdata', $ClusterDir, '--log', $ServerLog, '--options', "-h 127.0.0.1 -p $Port", 'start', '--wait')
  $ServerStarted = $true
  Invoke-Checked '创建本地演练数据库' $CreateDb @('--host=127.0.0.1', "--port=$Port", '--username=postgres', 'lease_rehearsal')
  Invoke-Checked '加载最小 Supabase 夹具' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $BootstrapPath)
  Invoke-Checked '加载 jobs/job_items 基础迁移' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', (Join-Path $RepositoryRoot 'supabase\migrations\0011_jobs_and_source_versions.sql'))
  Invoke-Checked '加载原子 lease 迁移' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', (Join-Path $RepositoryRoot 'supabase\migrations\0014_job_item_lease_rpc.sql'))

  $RpcCatalogState = Invoke-PsqlScalar @"
select count(*)::text || '|' || count(*) filter (
  where procedure.prosecdef
    and pg_get_userbyid(procedure.proowner) not in ('anon', 'authenticated')
    and coalesce(array_to_string(procedure.proconfig, ','), '') like '%search_path=`"`"%'
)::text
from pg_proc procedure
join pg_namespace namespace on namespace.oid = procedure.pronamespace
where namespace.nspname = 'public'
  and procedure.proname in ('enqueue_job_item', 'claim_next_job_item', 'complete_job_item', 'fail_job_item', 'reset_failed_job_item');
"@
  if ($RpcCatalogState -ne '5|5') { throw "RPC SECURITY DEFINER catalog 异常：$RpcCatalogState" }

  $SeedSql = @"
insert into public.jobs (id, user_id, job_class, job_kind, title)
values
  ('$OwnerJobId', '$OwnerUserId', 'internal', 'local_rehearsal', 'Owner job'),
  ('$OtherJobId', '$OtherUserId', 'internal', 'local_rehearsal', 'Other job');
select 1;
"@
  Invoke-PsqlScalar $SeedSql | Out-Null

  $FirstItemId = Invoke-PsqlScalar (New-AuthenticatedSql $OwnerUserId "select id::text from public.enqueue_job_item('$OwnerJobId', 0, 'first', '{`"part`":1}'::jsonb);")
  $SecondItemId = Invoke-PsqlScalar (New-AuthenticatedSql $OwnerUserId "select id::text from public.enqueue_job_item('$OwnerJobId', 1, 'second', '{`"part`":2}'::jsonb);")
  $IdempotentFirstItemId = Invoke-PsqlScalar (New-AuthenticatedSql $OwnerUserId "select id::text from public.enqueue_job_item('$OwnerJobId', 0, 'first', '{`"part`":1}'::jsonb);")
  if ($IdempotentFirstItemId -ne $FirstItemId) { throw '相同幂等输入必须返回同一个 job item。' }
  Assert-SqlFails '幂等键输入漂移' (New-AuthenticatedSql $OwnerUserId "select id from public.enqueue_job_item('$OwnerJobId', 0, 'first', '{`"part`":999}'::jsonb);")

  # Gate holds an exclusive advisory lock. Session A locks ordinal 0, then waits on the gate.
  # While A visibly waits and retains the row lock, B must SKIP LOCKED and claim ordinal 1.
  $GateProcess = Start-PsqlQuery "select pg_advisory_lock(424242); select pg_sleep(6); select pg_advisory_unlock(424242);"
  $GateReady = $false
  for ($Index = 0; $Index -lt 60; $Index += 1) {
    $ExclusiveLocks = [int](Invoke-PsqlScalar "select count(*) from pg_locks where locktype = 'advisory' and objid = 424242 and mode = 'ExclusiveLock' and granted;")
    if ($ExclusiveLocks -eq 1) { $GateReady = $true; break }
    Start-Sleep -Milliseconds 50
  }
  if (-not $GateReady) { throw '并发屏障未取得独占锁。' }

  $ClaimA = "begin; select id from public.job_items where id = '$FirstItemId' for update; set local role authenticated; select set_config('request.jwt.claim.sub', '$OwnerUserId', true); select pg_advisory_xact_lock_shared(424242); select id::text || '|' || attempt_count::text || '|' || claimed_by from public.claim_next_job_item('$OwnerJobId', 'worker-a', 60); commit;"
  $ProcessA = Start-PsqlQuery $ClaimA
  $RowLockOverlapObserved = $false
  for ($Index = 0; $Index -lt 60; $Index += 1) {
    $WaitingSharedLocks = [int](Invoke-PsqlScalar "select count(*) from pg_locks where locktype = 'advisory' and objid = 424242 and mode = 'ShareLock' and not granted;")
    if ($WaitingSharedLocks -eq 1) { $RowLockOverlapObserved = $true; break }
    Start-Sleep -Milliseconds 50
  }
  if (-not $RowLockOverlapObserved) { throw '未观察到持有 item 行锁的会话 A 在并发屏障等待。' }

  $ClaimB = New-AuthenticatedSql $OwnerUserId "select id::text || '|' || attempt_count::text || '|' || claimed_by from public.claim_next_job_item('$OwnerJobId', 'worker-b', 60);"
  $ProcessB = Start-PsqlQuery $ClaimB
  $ClaimBResult = Read-PsqlProcess $ProcessB '并发领取 B'
  $ClaimAResult = Read-PsqlProcess $ProcessA '并发领取 A'
  $null = Read-PsqlProcess $GateProcess '并发屏障'

  $ClaimAParts = $ClaimAResult -split '\|'
  $ClaimBParts = $ClaimBResult -split '\|'
  if ($ClaimAParts.Count -ne 3 -or $ClaimBParts.Count -ne 3) { throw '并发领取返回格式异常。' }
  if ($ClaimAParts[0] -ne $FirstItemId -or $ClaimBParts[0] -ne $SecondItemId) {
    throw "SKIP LOCKED 未按预期分流：A=$ClaimAResult B=$ClaimBResult"
  }
  if ($ClaimAParts[1] -ne '1' -or $ClaimBParts[1] -ne '1') { throw '首次领取的 fencing 代次必须为 1。' }

  $FirstWorker = $ClaimAParts[2]
  $SecondWorker = $ClaimBParts[2]
  $LeasedRetryItemId = Invoke-PsqlScalar (New-AuthenticatedSql $OwnerUserId "select id::text from public.enqueue_job_item('$OwnerJobId', 0, 'first', '{`"part`":1}'::jsonb);")
  if ($LeasedRetryItemId -ne $FirstItemId) { throw 'leased 状态的同输入重试必须返回原 item。' }
  Invoke-PsqlScalar "update public.jobs set status = 'running' where id = '$OwnerJobId'; select 1;" | Out-Null
  $RunningJobRetryItemId = Invoke-PsqlScalar (New-AuthenticatedSql $OwnerUserId "select id::text from public.enqueue_job_item('$OwnerJobId', 0, 'first', '{`"part`":1}'::jsonb);")
  if ($RunningJobRetryItemId -ne $FirstItemId) { throw '父 job 离开 queued 后，同输入重试仍必须返回原 item。' }
  Assert-SqlFails 'running job 添加新 item' (New-AuthenticatedSql $OwnerUserId "select id from public.enqueue_job_item('$OwnerJobId', 2, 'third', '{}'::jsonb);")

  $ActiveRetryCount = [int](Invoke-PsqlScalar (New-AuthenticatedSql $OwnerUserId "select count(*) from public.claim_next_job_item('$OwnerJobId', 'worker-c', 60);"))
  if ($ActiveRetryCount -ne 0) { throw '活跃 lease 期间不应被再次领取。' }

  $NonOwnerCount = [int](Invoke-PsqlScalar (New-AuthenticatedSql $OtherUserId "select count(*) from public.claim_next_job_item('$OwnerJobId', 'intruder', 60);"))
  if ($NonOwnerCount -ne 0) { throw '非 owner 不应领取 job item。' }

  Assert-SqlFails 'authenticated 直接 INSERT' (New-AuthenticatedSql $OwnerUserId "insert into public.job_items (id, job_id, ordinal, idempotency_key, status, attempt_count) values ('cccccccc-cccc-cccc-cccc-ccccccccccc1', '$OwnerJobId', 9, 'forged', 'succeeded', 99);")
  Assert-SqlFails 'authenticated 直接 UPDATE' (New-AuthenticatedSql $OwnerUserId "update public.job_items set status = 'pending' where id = '$FirstItemId';")
  Invoke-PsqlScalar "update public.job_items set lease_expires_at = statement_timestamp() - interval '1 second' where id = '$FirstItemId'; select 1;" | Out-Null

  $ExpiredReclaimResult = Invoke-PsqlScalar (New-AuthenticatedSql $OwnerUserId "select id::text || '|' || attempt_count::text || '|' || claimed_by from public.claim_next_job_item('$OwnerJobId', '$FirstWorker', 60);")
  $ExpiredReclaimParts = $ExpiredReclaimResult -split '\|'
  if ($ExpiredReclaimParts[0] -ne $FirstItemId -or $ExpiredReclaimParts[1] -ne '2' -or $ExpiredReclaimParts[2] -ne $FirstWorker) {
    throw "同 worker 过期重领异常：$ExpiredReclaimResult"
  }
  $ExpiredReclaimCount = 1

  Assert-SqlFails '同 worker 上一代迟到完成' (New-AuthenticatedSql $OwnerUserId "select count(*) from public.complete_job_item('$FirstItemId', '$FirstWorker', 1, '{`"stale`":true}'::jsonb);")
  $CompleteCount = [int](Invoke-PsqlScalar (New-AuthenticatedSql $OwnerUserId "select count(*) from public.complete_job_item('$FirstItemId', '$FirstWorker', 2, '{`"ok`":true}'::jsonb);"))
  if ($CompleteCount -ne 1) { throw '当前 worker 应能完成未过期 lease。' }
  Assert-SqlFails '重复完成' (New-AuthenticatedSql $OwnerUserId "select count(*) from public.complete_job_item('$FirstItemId', '$FirstWorker', 2, '{}'::jsonb);")

  $FirstState = Invoke-PsqlScalar "select status || '|' || attempt_count || '|' || claimed_by from public.job_items where id = '$FirstItemId';"
  if ($FirstState -ne "succeeded|2|$FirstWorker") { throw "完成态异常：$FirstState" }
  $SucceededRetryItemId = Invoke-PsqlScalar (New-AuthenticatedSql $OwnerUserId "select id::text from public.enqueue_job_item('$OwnerJobId', 0, 'first', '{`"part`":1}'::jsonb);")
  if ($SucceededRetryItemId -ne $FirstItemId) { throw 'succeeded 状态的同输入重试必须返回原 item。' }

  $FailCount = [int](Invoke-PsqlScalar (New-AuthenticatedSql $OwnerUserId "select count(*) from public.fail_job_item('$SecondItemId', '$SecondWorker', 1, 'expected rehearsal failure');"))
  if ($FailCount -ne 1) { throw '当前 worker 应能把 item 标记为 failed。' }
  $ResetCount = [int](Invoke-PsqlScalar (New-AuthenticatedSql $OwnerUserId "select count(*) from public.reset_failed_job_item('$SecondItemId');"))
  if ($ResetCount -ne 1) { throw 'owner 应能显式 reset failed item。' }
  $ReclaimAfterResetResult = Invoke-PsqlScalar (New-AuthenticatedSql $OwnerUserId "select id::text || '|' || attempt_count::text || '|' || claimed_by from public.claim_next_job_item('$OwnerJobId', 'worker-e', 60);")
  if ($ReclaimAfterResetResult -ne "$SecondItemId|2|worker-e") { throw "reset 后重领异常：$ReclaimAfterResetResult" }
  $null = Invoke-PsqlScalar (New-AuthenticatedSql $OwnerUserId "select count(*) from public.complete_job_item('$SecondItemId', 'worker-e', 2, '{}'::jsonb);")

  $SecondState = Invoke-PsqlScalar "select status || '|' || attempt_count || '|' || claimed_by from public.job_items where id = '$SecondItemId';"
  if ($SecondState -ne 'succeeded|2|worker-e') { throw "失败重试链异常：$SecondState" }

  Assert-SqlFails 'anon 调用 lease RPC' "begin; set local role anon; select count(*) from public.claim_next_job_item('$OwnerJobId', 'anon-worker', 60); commit;"
  Assert-SqlFails '非法 TTL' (New-AuthenticatedSql $OwnerUserId "select count(*) from public.claim_next_job_item('$OwnerJobId', 'worker-z', 1);")

  $Evidence = [ordered]@{
    status = 'passed'
    testedAt = (Get-Date).ToUniversalTime().ToString('o')
    postgresVersion = (Invoke-PsqlScalar 'show server_version;')
    hardenedRpcCatalogCount = 5
    idempotentRetryStates = @('pending', 'leased', 'succeeded', 'parent_running')
    synchronizedOverlapObserved = $RowLockOverlapObserved
    skipLockedDistinctClaims = 2
    activeLeaseDuplicateClaims = $ActiveRetryCount
    expiredLeaseReclaims = $ExpiredReclaimCount
    nonOwnerClaims = $NonOwnerCount
    sameWorkerStaleGenerationRejected = $true
    duplicateCompletionRejected = $true
    directAuthenticatedInsertRejected = $true
    directAuthenticatedUpdateRejected = $true
    anonRpcRejected = $true
    resetPreservedAttemptCount = $true
    externalConnections = 0
  }
  New-Item -ItemType Directory -Path $RehearsalRoot -Force | Out-Null
  Set-Content -LiteralPath $EvidencePath -Value ($Evidence | ConvertTo-Json -Depth 5) -Encoding UTF8
  $Succeeded = $true
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
