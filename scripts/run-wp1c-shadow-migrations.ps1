[CmdletBinding()]
param(
  [string]$CredentialPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-shadow-credential-v2.json'),
  [switch]$ConfirmShadowWrite
)

$ErrorActionPreference = 'Stop'
$ShadowProjectRef = 'qyjfcebqjtphlpsvizxo'
$ProductionProjectRef = 'kysywitrsjhcdlcrfayl'
$LocalTunnelPort = 15433

if (-not $ConfirmShadowWrite) {
  throw '本脚本会写入固定 shadow 数据库。确认后使用 -ConfirmShadowWrite。'
}
if ($ShadowProjectRef -eq $ProductionProjectRef) {
  throw '拒绝执行：shadow project ref 与生产项目相同。'
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Credential = Get-Content -Raw -Encoding UTF8 -LiteralPath $CredentialPath | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($Credential.databasePassword)) {
  throw '固定 shadow 数据库密码缺失。'
}

$PgBin = (Resolve-Path (Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin')).Path
$Psql = Join-Path $PgBin 'psql.exe'
$TunnelScript = Join-Path $RepositoryRoot 'scripts\wp1b-pg-http-connect-tunnel.mjs'
$VerificationSql = Join-Path $RepositoryRoot 'supabase\wp1c-shadow-verification.sql'
$DatabaseUrl = @(
  'host=aws-0-ap-southeast-1.pooler.supabase.com',
  'hostaddr=127.0.0.1',
  "port=$LocalTunnelPort",
  'dbname=postgres',
  "user=postgres.$ShadowProjectRef",
  'sslmode=require',
  'connect_timeout=10'
) -join ' '

function Invoke-Scalar([string]$Sql) {
  $result = (& $Psql '--dbname' $DatabaseUrl '--no-password' '--no-psqlrc' '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' $Sql) -join ''
  if ($LASTEXITCODE -ne 0) { throw "shadow 查询失败：$Sql" }
  return $result.Trim()
}

$TunnelProcess = $null
try {
  $Node = (Get-Command node -ErrorAction Stop).Source
  $TunnelProcess = Start-Process -FilePath $Node -ArgumentList @($TunnelScript, 'shadow') -WorkingDirectory $RepositoryRoot -WindowStyle Hidden -PassThru

  $Ready = $false
  for ($i = 0; $i -lt 40; $i += 1) {
    try {
      $Client = [System.Net.Sockets.TcpClient]::new()
      $Client.Connect('127.0.0.1', $LocalTunnelPort)
      $Client.Dispose()
      $Ready = $true
      break
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }
  if (-not $Ready) { throw '固定 shadow 本地隧道未就绪。' }

  $env:PGPASSWORD = $Credential.databasePassword
  $Identity = Invoke-Scalar "select current_user || '|' || current_database();"
  if ($Identity -ne 'postgres|postgres') {
    throw "拒绝执行：数据库身份不符合固定 shadow 预期：$Identity"
  }

  $Before = Invoke-Scalar @"
select json_build_object(
  'notes', (select count(*) from public.notes),
  'published_notes', (select count(*) from public.notes where is_published),
  'chapters', (select count(*) from public.chapters),
  'english_attempts', (select count(*) from public.english_attempts),
  'admin_users', (select count(*) from public.admin_users)
);
"@
  Write-Output "Before=$Before"

  $Migrations = @(
    @{ File = '0008_note_version_and_chapter_scope.sql'; Ready = "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='notes' and column_name='content_version');" },
    @{ File = '0009_planning_task_status.sql'; Ready = "select to_regclass('public.planning_task_status') is not null;" },
    @{ File = '0010_training_event_core.sql'; Ready = "select to_regclass('public.attempts') is not null and to_regclass('public.attempt_revisions') is not null and to_regclass('public.grades') is not null;" },
    @{ File = '0011_jobs_and_source_versions.sql'; Ready = "select to_regclass('public.jobs') is not null and to_regclass('public.job_items') is not null and to_regclass('public.source_documents') is not null and to_regclass('public.source_versions') is not null;" },
    @{ File = '0012_private_note_default.sql'; Ready = "select position('false' in lower(column_default)) > 0 from information_schema.columns where table_schema='public' and table_name='notes' and column_name='is_published';" }
  )

  foreach ($Migration in $Migrations) {
    if ((Invoke-Scalar $Migration.Ready) -eq 't') {
      Write-Output "Skip=$($Migration.File)"
      continue
    }

    $MigrationPath = Join-Path $RepositoryRoot "supabase\migrations\$($Migration.File)"
    Write-Output "Apply=$($Migration.File)"
    & $Psql '--dbname' $DatabaseUrl '--no-password' '--no-psqlrc' '--set' 'ON_ERROR_STOP=1' '--file' $MigrationPath
    if ($LASTEXITCODE -ne 0) { throw "shadow 迁移失败：$($Migration.File)" }
  }

  & $Psql '--dbname' $DatabaseUrl '--no-password' '--no-psqlrc' '--set' 'ON_ERROR_STOP=1' '--file' $VerificationSql
  if ($LASTEXITCODE -ne 0) { throw 'WP1-C shadow 行为验证失败。' }

  $After = Invoke-Scalar @"
select json_build_object(
  'notes', (select count(*) from public.notes),
  'published_notes', (select count(*) from public.notes where is_published),
  'chapters', (select count(*) from public.chapters),
  'english_attempts', (select count(*) from public.english_attempts),
  'admin_users', (select count(*) from public.admin_users),
  'notes_at_version_one', (select count(*) from public.notes where content_version = 1),
  'wp1c_tables', (
    select count(*) from information_schema.tables
    where table_schema='public'
      and table_name in ('planning_task_status','attempts','attempt_revisions','grades','jobs','job_items','source_documents','source_versions')
  )
);
"@
  Write-Output "After=$After"
  Write-Output 'WP1-C fixed shadow migration and transactional verification passed.'
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  if ($null -ne $TunnelProcess -and -not $TunnelProcess.HasExited) {
    Stop-Process -Id $TunnelProcess.Id -Force -ErrorAction SilentlyContinue
  }
}
