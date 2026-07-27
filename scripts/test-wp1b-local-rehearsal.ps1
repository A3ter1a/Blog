[CmdletBinding()]
param(
  [switch]$KeepArtifacts
)

$ErrorActionPreference = 'Stop'

function Invoke-Checked([string]$Label, [string]$Tool, [string[]]$Arguments) {
  Write-Host "执行：$Label"
  & $Tool @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Label 失败，退出码 $LASTEXITCODE。"
  }
}

function Read-JsonAudit([string]$Psql, [string]$Connection, [string]$SqlPath) {
  $Rows = & $Psql '--dbname' $Connection '--no-password' '--no-psqlrc' '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--file' $SqlPath
  if ($LASTEXITCODE -ne 0) { throw "本地审计 SQL 执行失败，退出码 $LASTEXITCODE。" }
  $Json = ($Rows -join "`n").Trim()
  $null = $Json | ConvertFrom-Json
  return $Json
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$PgBin = Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin'
$RequiredTools = @('initdb.exe', 'pg_ctl.exe', 'createdb.exe', 'psql.exe', 'pg_dump.exe', 'pg_restore.exe')
foreach ($ToolName in $RequiredTools) {
  if (-not (Test-Path -LiteralPath (Join-Path $PgBin $ToolName))) {
    throw "缺少本地演练工具：$ToolName"
  }
}

$RehearsalRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups\wp1-b-rehearsal'))
$RunRoot = Join-Path $RehearsalRoot (Get-Date -Format 'yyyyMMdd-HHmmss-fff')
$ExpectedPrefix = $RehearsalRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $RunRoot.StartsWith($ExpectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "本地演练目录越界：$RunRoot"
}

$ClusterDir = Join-Path $RunRoot 'cluster'
$BackupDir = Join-Path $RunRoot 'backup'
$ServerLog = Join-Path $RunRoot 'postgres.log'
$SourceSqlPath = Join-Path $RunRoot 'source-bootstrap.sql'
$ShadowSqlPath = Join-Path $RunRoot 'shadow-bootstrap.sql'
$AuditSql = Join-Path $RepositoryRoot 'supabase\wp1b-restore-audit.sql'
$AuthManifestSql = Join-Path $RepositoryRoot 'supabase\wp1b-auth-manifest.sql'
$AuthPlaceholderSql = Join-Path $RepositoryRoot 'supabase\wp1b-shadow-auth-placeholders.sql'
$Verifier = Join-Path $RepositoryRoot 'scripts\verify-wp1b-backup.mjs'
$RestoreTocHelper = Join-Path $RepositoryRoot 'scripts\wp1b-restore-toc.ps1'
$BaselineSource = Join-Path $RepositoryRoot 'fable info\evidence\wp1-a\03-production-baseline.json'
$StorageSource = Join-Path $RepositoryRoot 'fable info\evidence\wp1-a\04-storage-manifest.json'
$RehearsalEvidenceDir = $RehearsalRoot
$RehearsalEvidencePath = Join-Path $RehearsalEvidenceDir 'latest-result.json'

New-Item -ItemType Directory -Path $ClusterDir -Force | Out-Null
New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null

$Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$Listener.Start()
$Port = ([System.Net.IPEndPoint]$Listener.LocalEndpoint).Port
$Listener.Stop()

$InitDb = Join-Path $PgBin 'initdb.exe'
$PgCtl = Join-Path $PgBin 'pg_ctl.exe'
$CreateDb = Join-Path $PgBin 'createdb.exe'
$Psql = Join-Path $PgBin 'psql.exe'
$PgDump = Join-Path $PgBin 'pg_dump.exe'
$PgRestore = Join-Path $PgBin 'pg_restore.exe'
$ServerStarted = $false
$Succeeded = $false
$RehearsalEvidence = $null
. $RestoreTocHelper

$SourceBootstrap = @'
create schema auth;
create schema storage;
create schema private;
create schema extensions;
create extension pgcrypto with schema extensions;

create table auth.users (
  instance_id uuid,
  id uuid primary key,
  aud text,
  role text,
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  confirmation_token text,
  recovery_token text,
  email_change text,
  email_change_token_new text,
  is_sso_user boolean not null default false,
  is_anonymous boolean not null default false
);

create table auth.identities (
  id uuid primary key default extensions.gen_random_uuid(),
  provider_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  identity_data jsonb not null,
  provider text not null,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  unique (provider_id, provider)
);

create table storage.buckets (id text primary key);
create table storage.objects (
  id uuid primary key default extensions.gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name text not null,
  metadata jsonb
);

create table public.admin_users (
  email text primary key,
  created_at timestamptz not null default now()
);

create table public.notes (
  id uuid primary key,
  title text not null,
  content text not null,
  problems jsonb not null default '[]'::jsonb,
  is_published boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.chapters (
  id uuid primary key,
  note_id uuid references public.notes(id) on delete cascade,
  parent_id uuid references public.chapters(id) on delete cascade,
  title text not null
);

create table public.english_papers (
  id uuid primary key,
  year integer not null unique
);

create table public.english_passages (
  id uuid primary key,
  paper_id uuid not null references public.english_papers(id) on delete cascade,
  year integer not null
);

create table public.english_questions (
  id uuid primary key,
  passage_id uuid not null references public.english_passages(id) on delete cascade
);

create table public.english_attempts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  passage_id uuid not null references public.english_passages(id) on delete cascade,
  score numeric,
  unique (user_id, passage_id)
);

create table public.english_attempt_answers (
  id uuid primary key,
  attempt_id uuid not null references public.english_attempts(id) on delete cascade,
  question_id uuid not null references public.english_questions(id) on delete cascade,
  user_answer text
);

create table public.english_vocabulary (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  word text not null
);

create table public.flashcards (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  front text not null
);

create table public.math3_self_tests (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  score numeric
);

create table public.problem_practice_statuses (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid not null references public.notes(id) on delete cascade,
  problem_id text not null,
  is_marked boolean not null default false,
  unique (user_id, note_id, problem_id)
);

create table public.site_profile (
  id uuid primary key,
  display_name text not null
);

create function private.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admin_users
    where lower(email) = lower(current_setting('app.user_email', true))
  );
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger notes_set_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

alter table public.notes enable row level security;
create policy notes_public_read on public.notes
for select to anon, authenticated
using (is_published);
create policy notes_admin_all on public.notes
for all to authenticated
using (private.current_user_is_admin())
with check (private.current_user_is_admin());

grant usage on schema public to anon, authenticated;
grant usage on schema private to authenticated;
grant select on public.notes to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function private.current_user_is_admin() to authenticated;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'admin@example.test', 'not-a-real-password', now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'reader@example.test', 'not-a-real-password', now());

insert into public.admin_users (email) values ('admin@example.test');
insert into public.notes (id, title, content, problems, is_published) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Published', '# Published', '[{"id":"problem-1"}]', true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Private', '# Private', '[]', false);
insert into public.chapters (id, note_id, title) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Chapter');
insert into public.english_papers (id, year) values ('cccccccc-cccc-cccc-cccc-ccccccccccc1', 2025);
insert into public.english_passages (id, paper_id, year) values ('cccccccc-cccc-cccc-cccc-ccccccccccc2', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', 2025);
insert into public.english_questions (id, passage_id) values ('cccccccc-cccc-cccc-cccc-ccccccccccc3', 'cccccccc-cccc-cccc-cccc-ccccccccccc2');
insert into public.english_attempts (id, user_id, passage_id, score) values ('cccccccc-cccc-cccc-cccc-ccccccccccc4', '11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-ccccccccccc2', 2);
insert into public.english_attempt_answers (id, attempt_id, question_id, user_answer) values ('cccccccc-cccc-cccc-cccc-ccccccccccc5', 'cccccccc-cccc-cccc-cccc-ccccccccccc4', 'cccccccc-cccc-cccc-cccc-ccccccccccc3', 'A');
insert into public.english_vocabulary (id, user_id, word) values ('dddddddd-dddd-dddd-dddd-dddddddddd01', '11111111-1111-1111-1111-111111111111', 'elasticity');
insert into public.flashcards (id, user_id, front) values ('dddddddd-dddd-dddd-dddd-dddddddddd02', '11111111-1111-1111-1111-111111111111', 'Demand');
insert into public.math3_self_tests (id, user_id, score) values ('dddddddd-dddd-dddd-dddd-dddddddddd03', '11111111-1111-1111-1111-111111111111', 10);
insert into public.problem_practice_statuses (id, user_id, note_id, problem_id, is_marked) values ('dddddddd-dddd-dddd-dddd-dddddddddd04', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'problem-1', true);
insert into public.site_profile (id, display_name) values ('dddddddd-dddd-dddd-dddd-dddddddddd05', 'Asteroid');
insert into storage.buckets (id) values ('note-images'), ('ocr-documents');
insert into storage.objects (bucket_id, name, metadata) values ('note-images', 'demo.png', '{"size":123,"mimetype":"image/png"}');
'@

$ShadowBootstrap = @'
create schema auth;
create schema storage;
create schema extensions;
create extension pgcrypto with schema extensions;

create table auth.users (
  instance_id uuid,
  id uuid primary key,
  aud text,
  role text,
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  confirmation_token text,
  recovery_token text,
  email_change text,
  email_change_token_new text,
  is_sso_user boolean not null default false,
  is_anonymous boolean not null default false
);

create table auth.identities (
  id uuid primary key default extensions.gen_random_uuid(),
  provider_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  identity_data jsonb not null,
  provider text not null,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  unique (provider_id, provider)
);

create table storage.buckets (id text primary key);
create table storage.objects (
  id uuid primary key default extensions.gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name text not null,
  metadata jsonb
);
'@

try {
  Set-Content -LiteralPath $SourceSqlPath -Value $SourceBootstrap -Encoding UTF8
  Set-Content -LiteralPath $ShadowSqlPath -Value $ShadowBootstrap -Encoding UTF8

  Invoke-Checked '初始化临时 PostgreSQL 集群' $InitDb @('--pgdata', $ClusterDir, '--username', 'postgres', '--auth', 'trust', '--encoding', 'UTF8', '--no-locale')
  Invoke-Checked '启动临时 PostgreSQL' $PgCtl @('--pgdata', $ClusterDir, '--log', $ServerLog, '--options', "-p $Port -h 127.0.0.1", '--wait', 'start')
  $ServerStarted = $true

  $AdminConnection = "host=127.0.0.1 port=$Port dbname=postgres user=postgres"
  Invoke-Checked '创建模拟 Supabase 角色' $Psql @('--dbname', $AdminConnection, '--no-password', '--set', 'ON_ERROR_STOP=1', '--command', 'create role anon nologin; create role authenticated nologin;')
  Invoke-Checked '创建 source 数据库' $CreateDb @('--host', '127.0.0.1', '--port', "$Port", '--username', 'postgres', '--no-password', 'source')
  Invoke-Checked '创建 shadow 数据库' $CreateDb @('--host', '127.0.0.1', '--port', "$Port", '--username', 'postgres', '--no-password', 'shadow')

  $SourceConnection = "host=127.0.0.1 port=$Port dbname=source user=postgres"
  $ShadowConnection = "host=127.0.0.1 port=$Port dbname=shadow user=postgres"
  Invoke-Checked '建立 source 结构与模拟数据' $Psql @('--dbname', $SourceConnection, '--no-password', '--set', 'ON_ERROR_STOP=1', '--file', $SourceSqlPath)
  Invoke-Checked '建立 shadow 基础平台结构' $Psql @('--dbname', $ShadowConnection, '--no-password', '--set', 'ON_ERROR_STOP=1', '--file', $ShadowSqlPath)

  $BeforeAudit = Read-JsonAudit $Psql $SourceConnection $AuditSql
  Set-Content -LiteralPath (Join-Path $BackupDir 'production-audit-before.json') -Value $BeforeAudit -Encoding UTF8

  $DumpPath = Join-Path $BackupDir 'full.dump'
  $RestoreTocPath = Join-Path $BackupDir 'restore-public-private.toc'
  Invoke-Checked '本地 custom-format 全库备份' $PgDump @('--dbname', $SourceConnection, '--no-password', '--format=custom', '--file', $DumpPath, '--no-owner')
  New-Wp1bRestoreToc -PgRestore $PgRestore -DumpPath $DumpPath -OutputPath $RestoreTocPath
  Invoke-Checked '从本地 dump 导出 schema 检查稿' $PgRestore @('--file', (Join-Path $BackupDir 'app-schema.sql'), '--schema-only', '--use-list', $RestoreTocPath, '--no-owner', $DumpPath)
  Invoke-Checked '从本地 dump 导出 data 检查稿' $PgRestore @('--file', (Join-Path $BackupDir 'app-data.sql'), '--data-only', '--use-list', $RestoreTocPath, '--no-owner', $DumpPath)

  $AfterAudit = Read-JsonAudit $Psql $SourceConnection $AuditSql
  Set-Content -LiteralPath (Join-Path $BackupDir 'production-audit-after.json') -Value $AfterAudit -Encoding UTF8
  if (($BeforeAudit | ConvertFrom-Json | ConvertTo-Json -Depth 30 -Compress) -ne ($AfterAudit | ConvertFrom-Json | ConvertTo-Json -Depth 30 -Compress)) {
    $BeforeStable = $BeforeAudit | ConvertFrom-Json
    $AfterStable = $AfterAudit | ConvertFrom-Json
    $BeforeStable.PSObject.Properties.Remove('capturedAt')
    $AfterStable.PSObject.Properties.Remove('capturedAt')
    if (($BeforeStable | ConvertTo-Json -Depth 30 -Compress) -ne ($AfterStable | ConvertTo-Json -Depth 30 -Compress)) {
      throw '本地 source 在备份期间发生非时间戳差异。'
    }
  }

  $AuthManifest = Read-JsonAudit $Psql $SourceConnection $AuthManifestSql
  Set-Content -LiteralPath (Join-Path $BackupDir 'auth-user-manifest.json') -Value $AuthManifest -Encoding UTF8
  Copy-Item -LiteralPath $BaselineSource -Destination (Join-Path $BackupDir 'wp1a-production-baseline.json')
  Copy-Item -LiteralPath $StorageSource -Destination (Join-Path $BackupDir 'storage-manifest.json')

  $Files = Get-ChildItem -LiteralPath $BackupDir -File | Sort-Object Name | ForEach-Object {
    [ordered]@{
      name = $_.Name
      sizeBytes = $_.Length
      sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }
  $RehearsalEvidence = [ordered]@{
    manifestVersion = 1
    projectRef = 'kysywitrsjhcdlcrfayl'
    capturedAt = (Get-Date).ToString('o')
    productionStableDuringBackup = $true
    containsSensitiveData = $true
    restoreScope = 'local rehearsal of public/private schema, data and ACL'
    files = $Files
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $BackupDir 'backup-manifest.json') -Encoding UTF8

  Invoke-Checked '校验本地备份 manifest' (Get-Command node).Source @($Verifier, '--dir', $BackupDir)

  $AuthUsers = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $BackupDir 'auth-user-manifest.json') | ConvertFrom-Json
  foreach ($AuthUser in $AuthUsers) {
    Invoke-Checked "创建本地 shadow Auth 占位用户 $($AuthUser.email)" $Psql @(
      '--dbname', $ShadowConnection,
      '--no-password',
      '--set', 'ON_ERROR_STOP=1',
      '--set', "user_id=$($AuthUser.id)",
      '--set', "user_email=$($AuthUser.email)",
      '--set', "shadow_password=$([guid]::NewGuid().ToString('N'))Aa1!",
      '--file', $AuthPlaceholderSql
    )
  }

  $AuthTokenRows = & $Psql '--dbname' $ShadowConnection '--no-password' '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' @'
select count(*)
from auth.users
where confirmation_token = ''
  and recovery_token = ''
  and email_change = ''
  and email_change_token_new = '';
'@
  $AuthTokenCount = @($AuthTokenRows | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })[-1].Trim()
  if ($LASTEXITCODE -ne 0 -or $AuthTokenCount -ne [string]$AuthUsers.Count) {
    throw "shadow Auth 占位用户 token 兼容性演练失败：$($AuthTokenRows -join '|')"
  }

  $IdentityTimestampRows = & $Psql '--dbname' $ShadowConnection '--no-password' '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' @'
select count(*)
from auth.identities
where last_sign_in_at is not null
  and created_at is not null
  and updated_at is not null;
'@
  $IdentityTimestampCount = @($IdentityTimestampRows | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })[-1].Trim()
  if ($LASTEXITCODE -ne 0 -or $IdentityTimestampCount -ne [string]$AuthUsers.Count) {
    throw "shadow Auth identity 时间字段兼容性演练失败：$($IdentityTimestampRows -join '|')"
  }

  Invoke-Checked '恢复 public/private schema、data 与 ACL' $PgRestore @('--dbname', $ShadowConnection, '--no-password', '--no-owner', '--exit-on-error', '--single-transaction', '--use-list', $RestoreTocPath, $DumpPath)
  $ShadowAudit = Read-JsonAudit $Psql $ShadowConnection $AuditSql
  $ShadowAuditPath = Join-Path $BackupDir 'shadow-restore-audit.json'
  Set-Content -LiteralPath $ShadowAuditPath -Value $ShadowAudit -Encoding UTF8
  Invoke-Checked '校验本地 shadow 恢复一致性' (Get-Command node).Source @($Verifier, '--dir', $BackupDir, '--restore-audit', $ShadowAuditPath)

  $AnonRows = & $Psql '--dbname' $ShadowConnection '--no-password' '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' 'set role anon; select count(*) from public.notes;'
  $AnonCount = @($AnonRows | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })[-1].Trim()
  if ($LASTEXITCODE -ne 0 -or $AnonCount -ne '1') { throw "anon RLS 演练失败：$($AnonRows -join '|')" }
  $ReaderRows = & $Psql '--dbname' $ShadowConnection '--no-password' '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' "set role authenticated; set app.user_email = 'reader@example.test'; select count(*) from public.notes;"
  $ReaderCount = @($ReaderRows | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })[-1].Trim()
  if ($LASTEXITCODE -ne 0 -or $ReaderCount -ne '1') { throw "非管理员 RLS 演练失败：$($ReaderRows -join '|')" }
  $AdminRows = & $Psql '--dbname' $ShadowConnection '--no-password' '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' "set role authenticated; set app.user_email = 'admin@example.test'; select count(*) from public.notes;"
  $AdminCount = @($AdminRows | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })[-1].Trim()
  if ($LASTEXITCODE -ne 0 -or $AdminCount -ne '2') { throw "管理员 RLS 演练失败：$($AdminRows -join '|')" }

  $SourceAuditObject = $AfterAudit | ConvertFrom-Json
  $ShadowAuditObject = $ShadowAudit | ConvertFrom-Json
  New-Item -ItemType Directory -Path $RehearsalEvidenceDir -Force | Out-Null
  [ordered]@{
    rehearsalVersion = 1
    completedAt = (Get-Date).ToString('o')
    postgresClientVersion = '17.10'
    externalConnections = 0
    fixtureDataOnly = $true
    checks = [ordered]@{
      customFormatDump = $true
      manifestSha256 = $true
      controlledRestoreToc = $true
      privateSchemaRestored = $true
      schemaDataAclFingerprintMatched = $true
      tableFingerprintMatched = $true
      contentIntegrityMatched = $true
      authCountAndAdminMatch = $true
      authPlaceholderTokensNonNull = ($AuthTokenCount -eq [string]$AuthUsers.Count)
      authPlaceholderIdentityTimestamps = ($IdentityTimestampCount -eq [string]$AuthUsers.Count)
      anonPublishedOnly = ($AnonCount -eq '1')
      authenticatedNonAdminPublishedOnly = ($ReaderCount -eq '1')
      adminPublishedAndPrivate = ($AdminCount -eq '2')
    }
    sourceAudit = [ordered]@{
      auditVersion = $SourceAuditObject.auditVersion
      tableCount = @($SourceAuditObject.tables.PSObject.Properties).Count
      authUserCount = $SourceAuditObject.auth.userCount
      storageObjectCount = $SourceAuditObject.storage.objectCount
    }
    shadowAudit = [ordered]@{
      auditVersion = $ShadowAuditObject.auditVersion
      tableCount = @($ShadowAuditObject.tables.PSObject.Properties).Count
      authUserCount = $ShadowAuditObject.auth.userCount
      storageObjectCount = $ShadowAuditObject.storage.objectCount
    }
  }

  Write-Host 'WP1-B 本地全链路演练通过：备份、schema/data/ACL 恢复、checksum 与三主体 RLS 均一致。'
  $Succeeded = $true
} finally {
  $ServerStopped = -not $ServerStarted
  if ($ServerStarted) {
    & $PgCtl '--pgdata' $ClusterDir '--mode' 'fast' '--wait' 'stop' | Out-Null
    $ServerStopped = $LASTEXITCODE -eq 0
  }
  if ($Succeeded -and -not $ServerStopped) {
    throw '本地演练完成但临时 PostgreSQL 未能停止，拒绝写入通过证据。'
  }
  if ($Succeeded -and $null -ne $RehearsalEvidence) {
    $RehearsalEvidence.checks['temporaryServerStopped'] = $true
    Set-Content -LiteralPath $RehearsalEvidencePath -Value ($RehearsalEvidence | ConvertTo-Json -Depth 8) -Encoding UTF8
    if (-not (Test-Path -LiteralPath $RehearsalEvidencePath)) {
      throw "本地演练通过但证据文件未写入：$RehearsalEvidencePath"
    }
    Write-Host "本地演练证据已写入：$RehearsalEvidencePath"
  }

  if ($Succeeded -and -not $KeepArtifacts) {
    $ResolvedRunRoot = [System.IO.Path]::GetFullPath($RunRoot)
    if (-not $ResolvedRunRoot.StartsWith($ExpectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "拒绝清理演练根目录之外的路径：$ResolvedRunRoot"
    }
    Remove-Item -LiteralPath $ResolvedRunRoot -Recurse -Force
  } elseif (-not $Succeeded) {
    Write-Warning "本地演练失败，已保留诊断目录：$RunRoot"
  }
}
