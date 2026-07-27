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

$RehearsalRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups\wp1-production-gate-rehearsal'))
$RunRoot = Join-Path $RehearsalRoot (Get-Date -Format 'yyyyMMdd-HHmmss-fff')
$ExpectedPrefix = $RehearsalRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $RunRoot.StartsWith($ExpectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "本地演练目录越界：$RunRoot"
}

$ClusterDir = Join-Path $RunRoot 'cluster'
$ServerLog = Join-Path $RunRoot 'postgres.log'
$GateSql = Join-Path $RepositoryRoot 'supabase\wp1c-production-gate.sql'
New-Item -ItemType Directory -Path $ClusterDir -Force | Out-Null

$Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$Listener.Start()
$Port = ([System.Net.IPEndPoint]$Listener.LocalEndpoint).Port
$Listener.Stop()

$InitDb = Join-Path $PgBin 'initdb.exe'
$PgCtl = Join-Path $PgBin 'pg_ctl.exe'
$CreateDb = Join-Path $PgBin 'createdb.exe'
$Psql = Join-Path $PgBin 'psql.exe'
$Connection = "host=127.0.0.1 port=$Port user=postgres dbname=wp1_gate_rehearsal sslmode=disable"
$ServerStarted = $false

$BootstrapSql = @'
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text not null unique);
create table public.notes (id uuid primary key, title text not null default '', is_published boolean not null default true);
create table public.chapters (id uuid primary key, note_id uuid, parent_id uuid);
create table public.english_attempts (id uuid primary key);
create table public.english_attempt_answers (id uuid primary key);
create table public.admin_users (email text primary key);
create table public.english_papers (id uuid primary key);
create table public.site_profile (id text primary key);
insert into auth.users (id, email)
values ('11111111-1111-4111-8111-111111111111', 'admin@example.test');
insert into public.admin_users (email) values ('admin@example.test');
insert into public.notes (id, title, is_published)
values ('22222222-2222-4222-8222-222222222222', 'fixture', true);
'@

try {
  Invoke-Checked '初始化本地 PostgreSQL' $InitDb @(
    '--pgdata', $ClusterDir, '--username=postgres', '--auth=trust', '--encoding=UTF8', '--no-locale'
  )
  Invoke-Checked '启动本地 PostgreSQL' $PgCtl @(
    '--pgdata', $ClusterDir, '--log', $ServerLog, '--options', "-h 127.0.0.1 -p $Port", 'start', '--wait'
  )
  $ServerStarted = $true
  Invoke-Checked '创建本地演练数据库' $CreateDb @(
    '--host=127.0.0.1', "--port=$Port", '--username=postgres', 'wp1_gate_rehearsal'
  )
  Invoke-Checked '加载迁移前最小夹具' $Psql @(
    '--dbname', $Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--command', $BootstrapSql
  )

  $Rows = & $Psql '--dbname' $Connection '--no-password' '--no-psqlrc' '--quiet' `
    '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--file' $GateSql
  if ($LASTEXITCODE -ne 0) { throw 'WP1 production gate SQL 本地执行失败。' }
  $Json = (($Rows | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Last 1) -join '').Trim()
  try { $Gate = $Json | ConvertFrom-Json } catch { throw 'WP1 production gate 没有返回合法 JSON。' }

  $GateBaselineValid = $Gate.gateVersion -eq 1 -and $Gate.identity.transactionReadOnly -eq $true -and [int64]$Gate.baseline.notesTotal -eq 1 -and [int64]$Gate.baseline.notesPublished -eq 1 -and [int64]$Gate.baseline.notesAtVersionOne -eq 0 -and [int64]$Gate.baseline.notesInvalidContentVersions -eq 0 -and [int64]$Gate.integrity.invalidChapterScopeRows -eq 0 -and [int64]$Gate.integrity.unmatchedAdminUsers -eq 0
  if (-not $GateBaselineValid) {
    throw 'WP1 production gate 基线或完整性断言失败。'
  }
  foreach ($Flag in @(
    'contentVersionReady', 'notesVersionTriggerReady', 'chapterScopeTriggerReady', 'planningReady',
    'planningTableReady', 'planningColumnsReady', 'planningConstraintsReady', 'planningRlsReady',
    'planningTriggerReady', 'planningPoliciesReady', 'planningPermissionsReady', 'trainingCoreReady',
    'trainingTablesReady', 'trainingColumnsReady', 'trainingConstraintsReady', 'trainingIndexesReady',
    'trainingRlsReady', 'trainingTriggersReady', 'trainingPoliciesReady', 'trainingFunctionsReady',
    'trainingPermissionsReady', 'jobsAndSourcesReady',
    'jobsSourceTablesReady', 'jobsSourceColumnsReady', 'jobsSourceConstraintsReady', 'jobsSourceIndexesReady',
    'jobsSourceRlsReady', 'jobsSourceTriggersReady', 'jobsSourcePoliciesReady', 'jobsSourceFunctionsReady',
    'jobsSourcePermissionsReady', 'privateNoteDefaultReady', 'boundaryAlignmentReady',
    'boundaryRlsReady', 'boundaryPoliciesReady', 'boundaryExpressionsReady', 'boundaryGrantsReady'
  )) {
    if ([bool]$Gate.schema.$Flag) { throw "迁移前 gate 标记应为 false：$Flag" }
  }
  foreach ($Checksum in @(
    'notesStableChecksum', 'chaptersChecksum', 'englishAttemptsChecksum',
    'englishAttemptAnswersChecksum', 'adminUsersChecksum'
  )) {
    if ([string]::IsNullOrWhiteSpace([string]$Gate.baseline.$Checksum)) {
      throw "gate 缺少稳定 checksum：$Checksum"
    }
  }

  [ordered]@{
    status = 'passed'
    testedAt = [DateTimeOffset]::UtcNow.ToString('o')
    postgresVersion = (($Rows = & $Psql '--dbname' $Connection '--no-password' '--no-psqlrc' '--quiet' '--tuples-only' '--no-align' '--command' 'show server_version;') -join '').Trim()
    gateVersion = [int]$Gate.gateVersion
    transactionReadOnly = [bool]$Gate.identity.transactionReadOnly
    preMigrationFlagsFalse = $true
    stableChecksumsPresent = $true
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
