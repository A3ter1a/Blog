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

function Assert-MigrationFails([string]$Label, [string]$MigrationPath) {
  $null = & $script:Psql '--dbname' $script:Connection '--no-password' '--no-psqlrc' '--quiet' `
    '--set' 'ON_ERROR_STOP=1' '--file' $MigrationPath 2>&1
  if ($LASTEXITCODE -eq 0) { throw "$Label 应失败，但实际成功。" }
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$PgBin = Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin'
foreach ($ToolName in @('initdb.exe', 'pg_ctl.exe', 'createdb.exe', 'psql.exe')) {
  if (-not (Test-Path -LiteralPath (Join-Path $PgBin $ToolName))) {
    throw "缺少本地 PostgreSQL 演练工具：$ToolName"
  }
}

$RehearsalRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups\wp3-problem-ocr-storage-rehearsal'))
$RunRoot = Join-Path $RehearsalRoot (Get-Date -Format 'yyyyMMdd-HHmmss-fff')
$ExpectedPrefix = $RehearsalRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $RunRoot.StartsWith($ExpectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "本地演练目录越界：$RunRoot"
}

$ClusterDir = Join-Path $RunRoot 'cluster'
$ServerLog = Join-Path $RunRoot 'postgres.log'
$BootstrapPath = Join-Path $RunRoot 'bootstrap.sql'
$EvidencePath = Join-Path $RehearsalRoot 'latest-result.json'
$MigrationPath = Join-Path $RepositoryRoot 'supabase\migrations\0020_problem_ocr_job_assets.sql'
New-Item -ItemType Directory -Path $ClusterDir -Force | Out-Null

$Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$Listener.Start()
$Port = ([System.Net.IPEndPoint]$Listener.LocalEndpoint).Port
$Listener.Stop()

$InitDb = Join-Path $PgBin 'initdb.exe'
$PgCtl = Join-Path $PgBin 'pg_ctl.exe'
$CreateDb = Join-Path $PgBin 'createdb.exe'
$script:Psql = Join-Path $PgBin 'psql.exe'
$script:Connection = "host=127.0.0.1 port=$Port user=postgres dbname=problem_ocr_storage_rehearsal sslmode=disable"
$ServerStarted = $false

$BootstrapSql = @'
create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ocr-documents', 'ocr-documents', false, 52428800, array['application/pdf']);
'@

try {
  Set-Content -LiteralPath $BootstrapPath -Value $BootstrapSql -Encoding UTF8
  Invoke-Checked '初始化本地 PostgreSQL' $InitDb @('--pgdata', $ClusterDir, '--username=postgres', '--auth=trust', '--encoding=UTF8', '--no-locale')
  Invoke-Checked '启动本地 PostgreSQL' $PgCtl @('--pgdata', $ClusterDir, '--log', $ServerLog, '--options', "-h 127.0.0.1 -p $Port", 'start', '--wait')
  $ServerStarted = $true
  Invoke-Checked '创建本地演练数据库' $CreateDb @('--host=127.0.0.1', "--port=$Port", '--username=postgres', 'problem_ocr_storage_rehearsal')
  Invoke-Checked '加载最小 Storage 夹具' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $BootstrapPath)

  Invoke-Checked '首次应用 0020' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $MigrationPath)
  $ExpectedState = 'false|52428800|application/pdf,image/jpeg,image/png,image/webp'
  $AppliedState = Invoke-PsqlScalar "select public::text || '|' || file_size_limit::text || '|' || array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'ocr-documents';"
  if ($AppliedState -ne $ExpectedState) { throw "0020 应用后 bucket 配置异常：$AppliedState" }
  if ((Invoke-PsqlScalar "select count(*) from storage.buckets where id = 'ocr-documents';") -ne '1') { throw '0020 不得创建重复 bucket。' }

  Invoke-Checked '重复应用 0020' $script:Psql @('--dbname', $script:Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $MigrationPath)
  $IdempotentState = Invoke-PsqlScalar "select public::text || '|' || file_size_limit::text || '|' || array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'ocr-documents';"
  if ($IdempotentState -ne $ExpectedState) { throw "0020 重复应用不幂等：$IdempotentState" }

  Invoke-PsqlScalar "begin; update storage.buckets set allowed_mime_types = array['application/pdf'] where id = 'ocr-documents'; rollback; select 1;" | Out-Null
  $RollbackState = Invoke-PsqlScalar "select public::text || '|' || file_size_limit::text || '|' || array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'ocr-documents';"
  if ($RollbackState -ne $ExpectedState) { throw "事务回滚改变了已应用配置：$RollbackState" }

  Invoke-PsqlScalar "delete from storage.buckets where id = 'ocr-documents'; select 1;" | Out-Null
  Assert-MigrationFails '缺少前置 bucket 的 0020 guard' $MigrationPath
  if ((Invoke-PsqlScalar "select count(*) from storage.buckets where id = 'ocr-documents';") -ne '0') { throw '失败迁移不应伪造 bucket。' }

  $Evidence = [ordered]@{
    status = 'passed'
    testedAt = (Get-Date).ToUniversalTime().ToString('o')
    postgresVersion = (Invoke-PsqlScalar 'show server_version;')
    firstApplyState = $AppliedState
    idempotentApplyState = $IdempotentState
    rollbackPreservedState = $RollbackState
    missingBucketGuardRejected = $true
    storageObjectWrites = 0
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
