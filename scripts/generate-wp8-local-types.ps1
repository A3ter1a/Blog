[CmdletBinding()]
param(
  [string]$SchemaDump = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b\20260727-194412-521\full.dump'),
  [switch]$KeepArtifacts
)

$ErrorActionPreference = 'Stop'

function Invoke-Checked([string]$Label, [string]$Tool, [string[]]$Arguments) {
  & $Tool @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Label 失败，退出码 $LASTEXITCODE。" }
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$DumpPath = (Resolve-Path -LiteralPath $SchemaDump).Path
$LocalBackupRoot = (Resolve-Path (Join-Path $RepositoryRoot '.local-backups')).Path
$DumpRoot = [System.IO.Path]::GetDirectoryName($DumpPath)
if (-not $DumpPath.StartsWith($LocalBackupRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "拒绝使用 .local-backups 之外的 schema dump：$DumpPath"
}
if (-not $DumpPath.EndsWith('.dump', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw '类型生成只接受本地 custom-format schema dump。'
}

$PgBin = Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin'
foreach ($ToolName in @('initdb.exe', 'pg_ctl.exe', 'createdb.exe', 'pg_restore.exe', 'psql.exe')) {
  if (-not (Test-Path -LiteralPath (Join-Path $PgBin $ToolName))) {
    throw "缺少本地 PostgreSQL 演练工具：$ToolName"
  }
}

$MetaEntry = Join-Path $LocalBackupRoot 'wp1c-typegen\postgres-meta-runtime\node_modules\@supabase\postgres-meta\dist\server\server.js'
if (-not (Test-Path -LiteralPath $MetaEntry)) { throw "缺少已锁定的 postgres-meta runtime：$MetaEntry" }

$RunRoot = Join-Path $LocalBackupRoot ('wp8-typegen\' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
$ExpectedPrefix = [System.IO.Path]::GetFullPath((Join-Path $LocalBackupRoot 'wp8-typegen')).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not ([System.IO.Path]::GetFullPath($RunRoot)).StartsWith($ExpectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "类型生成目录越界：$RunRoot"
}

$ClusterDir = Join-Path $RunRoot 'cluster'
$ServerLog = Join-Path $RunRoot 'postgres.log'
$GeneratedOne = Join-Path $RunRoot 'database.types.first.ts'
$GeneratedTwo = Join-Path $RunRoot 'database.types.second.ts'
$RagCompatPath = Join-Path $RunRoot 'wp7-local-compat.sql'
$TypesPath = Join-Path $RepositoryRoot 'lib\database.types.ts'
$TypesBackup = Join-Path $RunRoot 'database.types.before.ts'
New-Item -ItemType Directory -Path $ClusterDir -Force | Out-Null

$Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$Listener.Start()
$Port = ([System.Net.IPEndPoint]$Listener.LocalEndpoint).Port
$Listener.Stop()

$InitDb = Join-Path $PgBin 'initdb.exe'
$PgCtl = Join-Path $PgBin 'pg_ctl.exe'
$CreateDb = Join-Path $PgBin 'createdb.exe'
$PgRestore = Join-Path $PgBin 'pg_restore.exe'
$Psql = Join-Path $PgBin 'psql.exe'
$Connection = "host=127.0.0.1 port=$Port user=postgres dbname=wp8_typegen sslmode=disable"
$MetaConnection = "postgresql://postgres@127.0.0.1:$Port/wp8_typegen?sslmode=disable"
$ServerStarted = $false
$OriginalTypesExists = Test-Path -LiteralPath $TypesPath

function Invoke-MetaTypegen([string]$OutputPath) {
  $Previous = @{}
  foreach ($Name in @('PG_META_DB_URL', 'PG_CONN_TIMEOUT_SECS', 'PG_QUERY_TIMEOUT_SECS', 'PG_META_GENERATE_TYPES', 'PG_META_GENERATE_TYPES_INCLUDED_SCHEMAS', 'PG_META_GENERATE_TYPES_DETECT_ONE_TO_ONE_RELATIONSHIPS')) {
    $Previous[$Name] = [Environment]::GetEnvironmentVariable($Name, 'Process')
  }
  try {
    $env:PG_META_DB_URL = $MetaConnection
    $env:PG_CONN_TIMEOUT_SECS = '60'
    $env:PG_QUERY_TIMEOUT_SECS = '60'
    $env:PG_META_GENERATE_TYPES = 'typescript'
    $env:PG_META_GENERATE_TYPES_INCLUDED_SCHEMAS = 'public'
    $env:PG_META_GENERATE_TYPES_DETECT_ONE_TO_ONE_RELATIONSHIPS = 'true'
    $Output = & (Get-Command node -ErrorAction Stop).Source $MetaEntry 2>&1
    if ($LASTEXITCODE -ne 0) { throw "postgres-meta 类型生成失败：$($Output -join [Environment]::NewLine)" }
    $Generated = ($Output -join [Environment]::NewLine)
    foreach ($Marker in @('export type Database', 'ai_profiles', 'ai_content_proposals', 'note_collections', 'memory_candidates')) {
      if (-not $Generated.Contains($Marker)) { throw "生成类型缺少阶段 2 标记：$Marker" }
    }
    Set-Content -LiteralPath $OutputPath -Value $Generated -Encoding UTF8 -NoNewline
  } finally {
    foreach ($Name in $Previous.Keys) { [Environment]::SetEnvironmentVariable($Name, $Previous[$Name], 'Process') }
  }
}

try {
  if ($OriginalTypesExists) { Copy-Item -LiteralPath $TypesPath -Destination $TypesBackup -Force }
  Invoke-Checked '初始化本地类型演练 PostgreSQL' $InitDb @('--pgdata', $ClusterDir, '--username=postgres', '--auth=trust', '--encoding=UTF8', '--no-locale')
  Invoke-Checked '启动本地类型演练 PostgreSQL' $PgCtl @('--pgdata', $ClusterDir, '--log', $ServerLog, '--options', "-h 127.0.0.1 -p $Port", 'start', '--wait')
  $ServerStarted = $true
  Invoke-Checked '创建类型演练数据库' $CreateDb @('--host=127.0.0.1', "--port=$Port", '--username=postgres', 'wp8_typegen')
  Invoke-Checked '创建 Supabase schema、扩展与 JWT 角色' $Psql @('--dbname', $Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--command', 'create role anon nologin; create role authenticated nologin; create schema if not exists auth; create schema if not exists extensions; create schema if not exists storage; create schema if not exists private; create extension if not exists pgcrypto with schema extensions; create extension if not exists pg_trgm with schema extensions;')
  Invoke-Checked '恢复本地 schema-only dump' $PgRestore @('--dbname', $Connection, '--no-owner', '--no-privileges', '--exit-on-error', '--schema-only', '--schema=extensions', '--schema=auth', '--schema=storage', '--schema=public', '--schema=private', $DumpPath)
  # The bundled PostgreSQL runtime does not ship pgvector. For type generation only,
  # recreate the already-reviewed WP7 public shape with a text-backed domain. This
  # preserves Supabase's generated string mapping without changing repository SQL or
  # pretending that vector search was locally exercised.
  $RagCompatSql = @'
create schema if not exists extensions;
do $$
begin
  create domain extensions.vector as text;
exception when duplicate_object then null;
end
$$;
create or replace function extensions.vector_dims(extensions.vector)
returns integer language sql immutable as $$ select 256 $$;
create table if not exists public.rag_chunks (
  id uuid primary key default gen_random_uuid(),
  source_version_id uuid not null references public.source_versions(id) on delete restrict,
  chunk_no integer not null,
  content text not null,
  source_label text not null,
  href text not null,
  embedding extensions.vector not null,
  search_vector tsvector,
  created_at timestamptz not null default now()
);
create table if not exists public.memory_candidates (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  content text not null,
  reason text not null,
  source_path text not null,
  status text not null default 'proposed',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create or replace function public.sync_private_note_rag(
  p_note_id uuid, p_note_content_version bigint, p_checksum text, p_raw_text text, p_chunks jsonb
) returns jsonb language sql as $$ select '{}'::jsonb $$;
create or replace function public.search_private_note_rag(
  p_query text, p_query_embedding extensions.vector, p_note_id uuid default null, p_limit integer default 8
) returns jsonb language sql as $$ select '[]'::jsonb $$;
create or replace function public.propose_assistant_memory(
  p_command_id uuid, p_content text, p_reason text, p_source_path text
) returns jsonb language sql as $$ select '{}'::jsonb $$;
create or replace function public.decide_assistant_memory(
  p_candidate_id uuid, p_decision text
) returns jsonb language sql as $$ select '{}'::jsonb $$;
create or replace function public.list_assistant_memories()
returns json language sql as $$ select '[]'::json $$;
'@
  Set-Content -LiteralPath $RagCompatPath -Value $RagCompatSql -Encoding UTF8
  foreach ($Migration in @('0014_job_item_lease_rpc.sql', '0016_english_training_core_backfill.sql', '0017_english_training_command_rpc.sql', '0018_english_subjective_grade_rpc.sql', '0019_math_training_and_booklet_core.sql', '0020_problem_ocr_job_assets.sql')) {
    if ($Migration -eq '0020_problem_ocr_job_assets.sql') {
      Invoke-Checked '创建 0020 所需的本地 OCR bucket 夹具' $Psql @('--dbname', $Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--command', "insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('ocr-documents', 'ocr-documents', false, 52428800, array['application/pdf']) on conflict (id) do nothing;")
    }
    Invoke-Checked "加载 $Migration" $Psql @('--dbname', $Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', (Join-Path $RepositoryRoot "supabase\migrations\$Migration"))
  }
  Invoke-Checked '加载本地 WP7 类型兼容夹具' $Psql @('--dbname', $Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $RagCompatPath)
  Invoke-Checked '加载 0023_ai_content_accounts_and_collections.sql' $Psql @('--dbname', $Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', (Join-Path $RepositoryRoot 'supabase\migrations\0023_ai_content_accounts_and_collections.sql'))
  Invoke-Checked '加载 0024_ai_content_review_comments.sql' $Psql @('--dbname', $Connection, '--no-password', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', (Join-Path $RepositoryRoot 'supabase\migrations\0024_ai_content_review_comments.sql'))
  Invoke-MetaTypegen $GeneratedOne
  Invoke-MetaTypegen $GeneratedTwo
  $FirstHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $GeneratedOne).Hash
  $SecondHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $GeneratedTwo).Hash
  if ($FirstHash -ne $SecondHash) { throw '本地 schema 连续类型生成不一致。' }
  Copy-Item -LiteralPath $GeneratedOne -Destination $TypesPath -Force
  [pscustomobject]@{
    status = 'passed'
    sourceDump = $DumpPath
     migrations = @('0014_job_item_lease_rpc.sql', '0016_english_training_core_backfill.sql', '0017_english_training_command_rpc.sql', '0018_english_subjective_grade_rpc.sql', '0019_math_training_and_booklet_core.sql', '0020_problem_ocr_job_assets.sql', 'local WP7 type-shape compatibility (pgvector unavailable)', '0023_ai_content_accounts_and_collections.sql', '0024_ai_content_review_comments.sql')
    generatedTypePath = $TypesPath
    generatedTypeSha256 = $FirstHash.ToLowerInvariant()
    deterministicTypeGeneration = $true
    externalConnections = 0
  } | ConvertTo-Json -Depth 5
} catch {
  if ($OriginalTypesExists -and (Test-Path -LiteralPath $TypesBackup)) { Copy-Item -LiteralPath $TypesBackup -Destination $TypesPath -Force }
  throw
} finally {
  if ($ServerStarted) { & $PgCtl '--pgdata' $ClusterDir 'stop' '--mode=fast' '--wait' | Out-Null }
  if (-not $KeepArtifacts -and (Test-Path -LiteralPath $RunRoot)) {
    $ResolvedRunRoot = (Resolve-Path -LiteralPath $RunRoot).Path
    if (-not $ResolvedRunRoot.StartsWith($ExpectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "拒绝清理类型演练目录外路径：$ResolvedRunRoot"
    }
    Remove-Item -LiteralPath $ResolvedRunRoot -Recurse -Force
  }
}
