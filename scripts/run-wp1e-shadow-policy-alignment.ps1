[CmdletBinding()]
param(
  [string]$BackupDir = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b\20260713-103656-160'),
  [string]$CredentialPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-shadow-credential-v2.json'),
  [switch]$ConfirmShadowWrite
)

$ErrorActionPreference = 'Stop'
$ShadowProjectRef = 'qyjfcebqjtphlpsvizxo'
$ProductionProjectRef = 'kysywitrsjhcdlcrfayl'
$LocalTunnelPort = 15433

if (-not $ConfirmShadowWrite) {
  throw '本脚本会向固定 shadow 提交 0013。确认后使用 -ConfirmShadowWrite。'
}
if ($ShadowProjectRef -eq $ProductionProjectRef) { throw '拒绝执行：shadow ref 与生产 ref 相同。' }

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ResolvedBackupDir = (Resolve-Path -LiteralPath $BackupDir).Path
$ExpectedBackupRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups\wp1-b'))
if (-not $ResolvedBackupDir.StartsWith($ExpectedBackupRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw '拒绝写入 WP1-B 本地证据目录之外。'
}

$Credential = Get-Content -Raw -Encoding UTF8 -LiteralPath $CredentialPath | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($Credential.databasePassword)) { throw '固定 shadow 密码缺失。' }

$Psql = Join-Path (Resolve-Path (Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin')).Path 'psql.exe'
$MigrationPath = Join-Path $RepositoryRoot 'supabase\migrations\0013_boundary_policy_alignment.sql'
$MatrixPath = Join-Path $RepositoryRoot 'supabase\wp1c-shadow-rls-matrix.sql'
$RehearsalPath = Join-Path $ResolvedBackupDir 'wp1e-shadow-policy-rehearsal.sql'
$RehearsalEvidencePath = Join-Path $ResolvedBackupDir 'wp1e-shadow-policy-rehearsal.json'
$FinalEvidencePath = Join-Path $ResolvedBackupDir 'wp1e-shadow-rls-matrix.json'
$DatabaseUrl = @(
  'host=aws-0-ap-southeast-1.pooler.supabase.com', 'hostaddr=127.0.0.1', "port=$LocalTunnelPort",
  'dbname=postgres', "user=postgres.$ShadowProjectRef", 'sslmode=require', 'connect_timeout=10'
) -join ' '

function Get-LastJsonLine([object[]]$Lines, [string]$Label) {
  $Json = ($Lines | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Last 1).Trim()
  try { $Audit = $Json | ConvertFrom-Json } catch { throw "$Label 没有返回合法 JSON。" }
  if ($Audit.status -ne 'passed') {
    $Failures = @($Audit.failures | ForEach-Object { "$($_.identity):$($_.check)" }) -join '; '
    throw "$Label 未通过：$($Audit.passedChecks)/$($Audit.totalChecks)。$Failures"
  }
  return @{ Json = $Json; Audit = $Audit }
}

function Invoke-PsqlFile([string]$Path) {
  $Rows = & $Psql '--dbname' $DatabaseUrl '--no-password' '--no-psqlrc' '--tuples-only' '--no-align' '--quiet' `
    '--set' 'ON_ERROR_STOP=1' '--file' $Path
  if ($LASTEXITCODE -ne 0) { throw "shadow SQL 执行失败：$Path" }
  return @($Rows)
}

$TunnelProcess = $null
$ReadyForPostflight = $false
try {
  $Node = (Get-Command node -ErrorAction Stop).Source
  $TunnelProcess = Start-Process -FilePath $Node `
    -ArgumentList @((Join-Path $RepositoryRoot 'scripts\wp1b-pg-http-connect-tunnel.mjs'), 'shadow') `
    -WorkingDirectory $RepositoryRoot -WindowStyle Hidden -PassThru

  $TunnelReady = $false
  for ($i = 0; $i -lt 40; $i += 1) {
    try {
      $Client = [System.Net.Sockets.TcpClient]::new()
      $Client.Connect('127.0.0.1', $LocalTunnelPort)
      $Client.Dispose()
      $TunnelReady = $true
      break
    } catch { Start-Sleep -Milliseconds 250 }
  }
  if (-not $TunnelReady) { throw '固定 shadow 隧道未就绪。' }

  $env:PGPASSWORD = $Credential.databasePassword
  $Identity = ((& $Psql '--dbname' $DatabaseUrl '--no-password' '--no-psqlrc' '--tuples-only' '--no-align' `
    '--set' 'ON_ERROR_STOP=1' '--command' "select current_user || '|' || current_database();") -join '').Trim()
  if ($LASTEXITCODE -ne 0 -or $Identity -ne 'postgres|postgres') { throw "shadow 身份异常：$Identity" }

  $Prerequisites = ((& $Psql '--dbname' $DatabaseUrl '--no-password' '--no-psqlrc' '--tuples-only' '--no-align' `
    '--set' 'ON_ERROR_STOP=1' '--command' @"
select
  to_regclass('public.planning_task_status') is not null
  and to_regclass('public.attempts') is not null
  and to_regclass('public.jobs') is not null
  and to_regclass('public.source_versions') is not null
  and exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notes' and column_name='content_version'
  );
"@) -join '').Trim()
  if ($LASTEXITCODE -ne 0 -or $Prerequisites -ne 't') { throw '拒绝执行：固定 shadow 尚未完整通过 0008–0012。' }

  $AlreadyApplied = ((& $Psql '--dbname' $DatabaseUrl '--no-password' '--no-psqlrc' '--tuples-only' '--no-align' `
    '--set' 'ON_ERROR_STOP=1' '--command' @"
select
  exists (select 1 from pg_policies where schemaname='public' and tablename='english_papers' and policyname='english_papers_authenticated_select')
  and not has_table_privilege('authenticated', 'public.admin_users', 'update')
  and not has_table_privilege('authenticated', 'public.site_profile', 'delete');
"@) -join '').Trim()
  if ($LASTEXITCODE -ne 0) { throw '无法判断 0013 当前状态。' }

  if ($AlreadyApplied -ne 't') {
    $MigrationText = Get-Content -Raw -Encoding UTF8 -LiteralPath $MigrationPath
    $MatrixText = Get-Content -Raw -Encoding UTF8 -LiteralPath $MatrixPath
    $MigrationBody = [regex]::Replace($MigrationText, '(?im)^\s*(begin|commit);\s*$', '')
    $MatrixBody = [regex]::Replace($MatrixText, '(?im)^\s*(\\set\s+ON_ERROR_STOP\s+on|begin;|rollback;)\s*$', '')
    $RehearsalSql = "\set ON_ERROR_STOP on`nbegin;`n$MigrationBody`n$MatrixBody`nrollback;`n"
    Set-Content -LiteralPath $RehearsalPath -Value $RehearsalSql -Encoding UTF8

    $Rehearsal = Get-LastJsonLine (Invoke-PsqlFile $RehearsalPath) '0013 事务预演'
    Set-Content -LiteralPath $RehearsalEvidencePath -Value $Rehearsal.Json -Encoding UTF8
    Write-Output "RehearsalChecks=$($Rehearsal.Audit.passedChecks)/$($Rehearsal.Audit.totalChecks)"

    $null = Invoke-PsqlFile $MigrationPath
    Write-Output 'Apply=0013_boundary_policy_alignment.sql'
  } else {
    Write-Output 'Skip=0013_boundary_policy_alignment.sql'
  }

  $Final = Get-LastJsonLine (Invoke-PsqlFile $MatrixPath) '0013 提交后矩阵'
  Set-Content -LiteralPath $FinalEvidencePath -Value $Final.Json -Encoding UTF8
  Write-Output "FinalChecks=$($Final.Audit.passedChecks)/$($Final.Audit.totalChecks)"
  Write-Output "EvidencePath=$FinalEvidencePath"
  $ReadyForPostflight = $true
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  if ($null -ne $TunnelProcess -and -not $TunnelProcess.HasExited) {
    Stop-Process -Id $TunnelProcess.Id -Force -ErrorAction SilentlyContinue
  }
}

if ($ReadyForPostflight) {
  & 'C:\Program Files\PowerShell\7\pwsh.exe' -NoLogo -NoProfile -File `
    (Join-Path $RepositoryRoot 'scripts\run-wp1c-shadow-postflight.ps1') `
    -BackupDir $ResolvedBackupDir -CredentialPath $CredentialPath
  if ($LASTEXITCODE -ne 0) { throw '0013 提交后 shadow 后验失败。' }
  Write-Output 'WP1-E fixed shadow policy alignment, 36-check matrix, and postflight passed.'
}
