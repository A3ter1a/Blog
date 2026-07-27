[CmdletBinding()]
param(
  [ValidateSet('preflight', '0015', 'postflight')]
  [string]$Stage = 'preflight',
  [string]$CredentialPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-shadow-credential-v2.json'),
  [switch]$ConfirmShadowWrite,
  [string]$ConfirmationPhrase = ''
)

$ErrorActionPreference = 'Stop'
$ShadowProjectRef = 'qyjfcebqjtphlpsvizxo'
$ProductionProjectRef = 'kysywitrsjhcdlcrfayl'
$ExpectedPhrase = "WRITE $ShadowProjectRef 0015"
$LocalTunnelPort = 15433

if ($ShadowProjectRef -eq $ProductionProjectRef) {
  throw '拒绝执行：fixed shadow ref 与生产 ref 相同。'
}
if ($Stage -eq '0015' -and (-not $ConfirmShadowWrite -or $ConfirmationPhrase -cne $ExpectedPhrase)) {
  throw "执行 0015 需要 -ConfirmShadowWrite 和精确确认短语：$ExpectedPhrase"
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Credential = Get-Content -Raw -Encoding UTF8 -LiteralPath $CredentialPath | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace([string]$Credential.databasePassword)) {
  throw 'fixed shadow 数据库密码缺失。'
}

$PgBin = (Resolve-Path (Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin')).Path
$Psql = Join-Path $PgBin 'psql.exe'
$TunnelScript = Join-Path $RepositoryRoot 'scripts\wp1b-pg-http-connect-tunnel.mjs'
$MigrationPath = Join-Path $RepositoryRoot 'supabase\migrations\0015_content_migration_snapshots.sql'
$DatabaseParameters = @(
  'host=aws-0-ap-southeast-1.pooler.supabase.com',
  'hostaddr=127.0.0.1',
  "port=$LocalTunnelPort",
  'dbname=postgres',
  "user=postgres.$ShadowProjectRef",
  'sslmode=require',
  'connect_timeout=10'
) -join ' '

function Invoke-PsqlJson([string]$Sql) {
  $rows = & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--quiet' `
    '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' $Sql
  if ($LASTEXITCODE -ne 0) { throw 'fixed shadow WP2 SQL 执行失败。' }
  $jsonLine = $rows | Where-Object {
    -not [string]::IsNullOrWhiteSpace($_) -and $_.TrimStart().StartsWith('{')
  } | Select-Object -Last 1
  if ([string]::IsNullOrWhiteSpace([string]$jsonLine)) { throw 'fixed shadow WP2 SQL 没有返回 JSON 证据。' }
  try { return ([string]$jsonLine | ConvertFrom-Json) } catch { throw 'fixed shadow WP2 JSON 证据无效。' }
}

$SnapshotSql = @'
begin transaction read only;
select jsonb_build_object(
  'identityOk', current_database() = 'postgres' and current_user = 'postgres',
  'notesTable', to_regclass('public.notes') is not null,
  'contentVersionColumn', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notes' and column_name = 'content_version'
  ),
  'contentVersionInvalid', coalesce((
    select count(*) from public.notes where content_version < 1
  ), 0),
  'pgcrypto', exists (select 1 from pg_extension where extname = 'pgcrypto'),
  'snapshotTable', to_regclass('public.content_migration_snapshots') is not null,
  'snapshotRows', case when to_regclass('public.content_migration_snapshots') is null then 0 else (select count(*) from public.content_migration_snapshots) end,
  'notesTotal', (select count(*) from public.notes),
  'notesStableMd5', coalesce((
    select md5(string_agg(
      id::text || chr(31) || content_version::text || chr(31) || md5(content),
      chr(30) order by id
    )) from public.notes
  ), '')
)::text;
rollback;
'@

$PreflightSql = @'
begin transaction read only;
select jsonb_build_object(
  'identityOk', current_database() = 'postgres' and current_user = 'postgres',
  'notesTable', to_regclass('public.notes') is not null,
  'contentVersionColumn', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notes' and column_name = 'content_version'
  ),
  'contentVersionInvalid', coalesce((
    select count(*) from public.notes where content_version < 1
  ), 0),
  'pgcrypto', exists (select 1 from pg_extension where extname = 'pgcrypto'),
  'snapshotTable', to_regclass('public.content_migration_snapshots') is not null,
  'snapshotRows', 0,
  'notesTotal', (select count(*) from public.notes),
  'notesStableMd5', coalesce((
    select md5(string_agg(
      id::text || chr(31) || content_version::text || chr(31) || md5(content),
      chr(30) order by id
    )) from public.notes
  ), '')
)::text;
rollback;
'@

$PostflightSql = @'
begin transaction read only;
with apply_fn as (
  select p.oid, pg_get_functiondef(p.oid) as definition
  from pg_proc p
  where p.oid = to_regprocedure('public.apply_content_migration(uuid,text,text,text,bigint,text,text,text,boolean,text,text,text,text,jsonb)')
), rollback_fn as (
  select p.oid, pg_get_functiondef(p.oid) as definition
  from pg_proc p
  where p.oid = to_regprocedure('public.rollback_content_migration(uuid,text,bigint,jsonb)')
)
select jsonb_build_object(
  'identityOk', current_database() = 'postgres' and current_user = 'postgres',
  'snapshotTable', to_regclass('public.content_migration_snapshots') is not null,
  'snapshotRls', coalesce((select relrowsecurity from pg_class where oid = 'public.content_migration_snapshots'::regclass), false),
  'snapshotForceRls', coalesce((select relforcerowsecurity from pg_class where oid = 'public.content_migration_snapshots'::regclass), false),
  'snapshotRows', (select count(*) from public.content_migration_snapshots),
  'adminPolicy', exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'content_migration_snapshots' and policyname = 'content_migration_snapshots_admin_select'),
  'authenticatedSelect', has_table_privilege('authenticated', 'public.content_migration_snapshots', 'select'),
  'authenticatedInsert', has_table_privilege('authenticated', 'public.content_migration_snapshots', 'insert'),
  'authenticatedUpdate', has_table_privilege('authenticated', 'public.content_migration_snapshots', 'update'),
  'authenticatedDelete', has_table_privilege('authenticated', 'public.content_migration_snapshots', 'delete'),
  'anonSelect', has_table_privilege('anon', 'public.content_migration_snapshots', 'select'),
  'applyFunction', exists(select 1 from apply_fn),
  'rollbackFunction', exists(select 1 from rollback_fn),
  'applySecurityDefiner', coalesce((select prosecdef from pg_proc where oid = (select oid from apply_fn)), false),
  'rollbackSecurityDefiner', coalesce((select prosecdef from pg_proc where oid = (select oid from rollback_fn)), false),
  'applySearchPathEmpty', coalesce((select proconfig @> ARRAY['search_path=""'] from pg_proc where oid = (select oid from apply_fn)), false),
  'rollbackSearchPathEmpty', coalesce((select proconfig @> ARRAY['search_path=""'] from pg_proc where oid = (select oid from rollback_fn)), false),
  'applyAuthenticatedExecute', has_function_privilege('authenticated', 'public.apply_content_migration(uuid,text,text,text,bigint,text,text,text,boolean,text,text,text,text,jsonb)', 'execute'),
  'rollbackAuthenticatedExecute', has_function_privilege('authenticated', 'public.rollback_content_migration(uuid,text,bigint,jsonb)', 'execute'),
  'applyAnonExecute', has_function_privilege('anon', 'public.apply_content_migration(uuid,text,text,text,bigint,text,text,text,boolean,text,text,text,text,jsonb)', 'execute'),
  'rollbackAnonExecute', has_function_privilege('anon', 'public.rollback_content_migration(uuid,text,bigint,jsonb)', 'execute'),
  'immutableTrigger', exists (
    select 1 from pg_trigger
    where tgrelid = 'public.content_migration_snapshots'::regclass
      and tgname = 'reject_content_migration_snapshot_mutation'
  )
)::text;
rollback;
'@

$TunnelProcess = $null
$PreviousPgPassword = $env:PGPASSWORD
$PreviousPgOptions = $env:PGOPTIONS
try {
  $Node = (Get-Command node -ErrorAction Stop).Source
  $TunnelProcess = Start-Process -FilePath $Node -ArgumentList @($TunnelScript, 'shadow') `
    -WorkingDirectory $RepositoryRoot -WindowStyle Hidden -PassThru

  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
    try {
      $client = [System.Net.Sockets.TcpClient]::new()
      $client.Connect('127.0.0.1', $LocalTunnelPort)
      $client.Dispose()
      $ready = $true
      break
    } catch { Start-Sleep -Milliseconds 250 }
  }
  if (-not $ready) { throw 'fixed shadow loopback 隧道未就绪。' }

  $env:PGPASSWORD = [string]$Credential.databasePassword
  if ($Stage -eq 'preflight') {
    $env:PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=60000'
  } else {
    $env:PGOPTIONS = '-c lock_timeout=5000 -c statement_timeout=120000'
  }

  $beforeSql = if ($Stage -in @('preflight', '0015')) { $PreflightSql } else { $PostflightSql }
  $before = Invoke-PsqlJson $beforeSql
  if ($Stage -in @('preflight', '0015') -and ($before.identityOk -ne $true -or $before.notesTable -ne $true -or $before.contentVersionColumn -ne $true -or [int64]$before.contentVersionInvalid -ne 0 -or $before.pgcrypto -ne $true)) {
    throw 'fixed shadow 未处于 WP2 0015 唯一允许前置状态。'
  }
  if ($Stage -eq 'postflight') {
    $stable = Invoke-PsqlJson $SnapshotSql
    [pscustomobject]@{
      ProjectRef = $ShadowProjectRef
      Stage = 'postflight'
      IdentityOk = $before.identityOk
      SnapshotTable = $before.snapshotTable
      SnapshotRls = $before.snapshotRls
      SnapshotForceRls = $before.snapshotForceRls
      SnapshotRows = [int64]$before.snapshotRows
      AdminPolicy = $before.adminPolicy
      AuthenticatedSelect = $before.authenticatedSelect
      AuthenticatedInsert = $before.authenticatedInsert
      AuthenticatedUpdate = $before.authenticatedUpdate
      AuthenticatedDelete = $before.authenticatedDelete
      AnonSelect = $before.anonSelect
      ApplyFunction = $before.applyFunction
      RollbackFunction = $before.rollbackFunction
      ApplySecurityDefiner = $before.applySecurityDefiner
      RollbackSecurityDefiner = $before.rollbackSecurityDefiner
      ApplySearchPathEmpty = $before.applySearchPathEmpty
      RollbackSearchPathEmpty = $before.rollbackSearchPathEmpty
      ApplyAuthenticatedExecute = $before.applyAuthenticatedExecute
      RollbackAuthenticatedExecute = $before.rollbackAuthenticatedExecute
      ApplyAnonExecute = $before.applyAnonExecute
      RollbackAnonExecute = $before.rollbackAnonExecute
      ImmutableTrigger = $before.immutableTrigger
      NotesTotal = [int64]$stable.notesTotal
      NotesContentVersionInvalid = [int64]$stable.contentVersionInvalid
      NotesStableFingerprintCaptured = $true
    } | ConvertTo-Json -Compress
    return
  }
  if ($Stage -eq 'preflight') {
    if ($before.snapshotTable -eq $true) { throw 'fixed shadow 已存在 0015 对象，拒绝重复执行。' }
    [pscustomobject]@{
      ProjectRef = $ShadowProjectRef
      Stage = 'preflight'
      IdentityOk = $true
      ContentVersionReady = $true
      PgcryptoReady = $true
      SnapshotTableAbsent = $true
      SnapshotRowsBefore = [int64]$before.snapshotRows
      NotesStableBefore = $true
    } | ConvertTo-Json -Compress
    return
  }

  if ($before.snapshotTable -eq $true -or [int64]$before.snapshotRows -ne 0) {
    throw 'fixed shadow 0015 对象或快照数据已存在，拒绝重复执行。'
  }
  & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--set' 'ON_ERROR_STOP=1' '--file' $MigrationPath
  if ($LASTEXITCODE -ne 0) { throw 'fixed shadow 0015 执行失败。' }

  $after = Invoke-PsqlJson $PostflightSql
  if ($after.identityOk -ne $true -or $after.snapshotTable -ne $true -or $after.snapshotRls -ne $true -or $after.snapshotForceRls -ne $true -or [int64]$after.snapshotRows -ne 0 -or $after.adminPolicy -ne $true -or $after.authenticatedSelect -ne $true -or $after.authenticatedInsert -ne $false -or $after.authenticatedUpdate -ne $false -or $after.authenticatedDelete -ne $false -or $after.anonSelect -ne $false -or $after.applyFunction -ne $true -or $after.rollbackFunction -ne $true -or $after.applySecurityDefiner -ne $true -or $after.rollbackSecurityDefiner -ne $true -or $after.applySearchPathEmpty -ne $true -or $after.rollbackSearchPathEmpty -ne $true -or $after.applyAuthenticatedExecute -ne $true -or $after.rollbackAuthenticatedExecute -ne $true -or $after.applyAnonExecute -ne $false -or $after.rollbackAnonExecute -ne $false -or $after.immutableTrigger -ne $true) {
    throw 'fixed shadow 0015 后验门失败。'
  }
  $stable = Invoke-PsqlJson $SnapshotSql
  if ([int64]$stable.notesTotal -ne [int64]$before.notesTotal -or [string]$stable.notesStableMd5 -cne [string]$before.notesStableMd5) {
    throw 'fixed shadow 0015 前后 notes 稳定指纹变化。'
  }
  [pscustomobject]@{
    ProjectRef = $ShadowProjectRef
    Stage = '0015'
    SnapshotTableCreated = $true
    SnapshotRows = [int64]$after.snapshotRows
    RlsAndPermissionsPassed = $true
    RpcSecurityPassed = $true
    NotesStable = $true
  } | ConvertTo-Json -Compress
} finally {
  if ($null -eq $PreviousPgPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD = $PreviousPgPassword }
  if ($null -eq $PreviousPgOptions) { Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue } else { $env:PGOPTIONS = $PreviousPgOptions }
  if ($null -ne $TunnelProcess -and -not $TunnelProcess.HasExited) {
    Stop-Process -Id $TunnelProcess.Id -Force -ErrorAction SilentlyContinue
    $TunnelProcess.WaitForExit(5000) | Out-Null
  }
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    if (-not (Get-NetTCPConnection -LocalPort $LocalTunnelPort -State Listen -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 100
  }
  if (Get-NetTCPConnection -LocalPort $LocalTunnelPort -State Listen -ErrorAction SilentlyContinue) {
    throw "fixed shadow 隧道端口 $LocalTunnelPort 清理失败。"
  }
}
