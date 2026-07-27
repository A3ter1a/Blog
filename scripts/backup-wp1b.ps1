[CmdletBinding()]
param(
  [string]$OutputRoot = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b'),
  [string]$PgBin = $env:ASTEROID_PG_BIN,
  [switch]$AcknowledgeSensitiveBackup
)

$ErrorActionPreference = 'Stop'
$ProductionProjectRef = 'kysywitrsjhcdlcrfayl'

if (-not $AcknowledgeSensitiveBackup) {
  throw '备份可能包含文章正文、作答和 Auth 敏感数据。确认本机目录安全后使用 -AcknowledgeSensitiveBackup。'
}

if ($env:ASTEROID_PRODUCTION_PROJECT_REF -ne $ProductionProjectRef) {
  throw "ASTEROID_PRODUCTION_PROJECT_REF 必须明确等于生产 ref：$ProductionProjectRef。"
}

$DatabaseUrl = $env:ASTEROID_PRODUCTION_DB_URL
if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw '缺少 ASTEROID_PRODUCTION_DB_URL。请只在本机环境变量中设置，不要写入仓库或聊天。'
}

function Resolve-PgTool([string]$Name) {
  if (-not [string]::IsNullOrWhiteSpace($PgBin)) {
    $candidate = Join-Path $PgBin "$Name.exe"
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -ne $command) { return $command.Source }
  throw "未找到 $Name。请安装 PostgreSQL 17 客户端并设置 ASTEROID_PG_BIN。"
}

function Invoke-PgTool([string]$Label, [string]$Tool, [string[]]$Arguments, [int]$MaxAttempts = 1) {
  for ($Attempt = 1; $Attempt -le $MaxAttempts; $Attempt++) {
    Write-Host "执行：$Label（$Attempt/$MaxAttempts）"
    & $Tool @Arguments
    if ($LASTEXITCODE -eq 0) { return }
    if ($Attempt -lt $MaxAttempts) { Start-Sleep -Seconds 1 }
  }
  throw "$Label 失败，已尝试 $MaxAttempts 次。保留现场供排查。"
}

function Read-Audit([string]$Psql, [string]$AuditSql, [string]$TargetUrl) {
  for ($Attempt = 1; $Attempt -le 4; $Attempt++) {
    $rows = & $Psql '--dbname' $TargetUrl '--no-password' '--no-psqlrc' '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--file' $AuditSql
    if ($LASTEXITCODE -eq 0) {
      $json = ($rows -join "`n").Trim()
      $null = $json | ConvertFrom-Json
      return $json
    }
    if ($Attempt -lt 4) { Start-Sleep -Seconds 1 }
  }
  throw '只读指纹审计失败，已尝试 4 次。'
}

function Normalize-Audit([string]$Json) {
  $value = $Json | ConvertFrom-Json
  $value.PSObject.Properties.Remove('capturedAt')
  return ($value | ConvertTo-Json -Depth 20 -Compress)
}

$PgDump = Resolve-PgTool 'pg_dump'
$PgRestore = Resolve-PgTool 'pg_restore'
$Psql = Resolve-PgTool 'psql'
$PgDumpVersion = (& $PgDump '--version') -join ''
if ($LASTEXITCODE -ne 0 -or $PgDumpVersion -notmatch ' 17\.') {
  throw "生产 PostgreSQL 为 17.6，必须使用 PostgreSQL 17 客户端。当前：$PgDumpVersion"
}
$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ExpectedOutputRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups\wp1-b'))
$ResolvedOutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
if ($ResolvedOutputRoot -ne $ExpectedOutputRoot) {
  throw "敏感备份只允许写入固定本地目录：$ExpectedOutputRoot"
}
$AuditSql = Join-Path $RepositoryRoot 'supabase\wp1b-restore-audit.sql'
$AuthManifestSql = Join-Path $RepositoryRoot 'supabase\wp1b-auth-manifest.sql'
$RestoreTocHelper = Join-Path $RepositoryRoot 'scripts\wp1b-restore-toc.ps1'
$BaselineSource = Join-Path $RepositoryRoot 'fable info\evidence\wp1-a\03-production-baseline.json'
$StorageSource = Join-Path $RepositoryRoot 'fable info\evidence\wp1-a\04-storage-manifest.json'

foreach ($required in @($AuditSql, $AuthManifestSql, $RestoreTocHelper, $BaselineSource, $StorageSource)) {
  if (-not (Test-Path -LiteralPath $required)) { throw "缺少 WP1-B 输入：$required" }
}
. $RestoreTocHelper

$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$BackupDir = Join-Path $ResolvedOutputRoot $Timestamp
if (Test-Path -LiteralPath $BackupDir) {
  throw "备份目录已存在，拒绝混入旧文件：$BackupDir"
}
New-Item -ItemType Directory -Path $BackupDir | Out-Null

$RepositoryOwner = (Get-Acl -LiteralPath $RepositoryRoot).Owner
$CurrentIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$AllowedIdentities = @($RepositoryOwner, $CurrentIdentity) | Select-Object -Unique
foreach ($Identity in $AllowedIdentities) {
  & icacls.exe $BackupDir '/grant:r' "${Identity}:(OI)(CI)(F)" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "无法为备份目录授权本机账户：$Identity" }
}
& icacls.exe $BackupDir '/inheritance:r' | Out-Null
if ($LASTEXITCODE -ne 0) { throw '无法关闭备份目录的 ACL 继承。' }

$BeforePath = Join-Path $BackupDir 'production-audit-before.json'
$AfterPath = Join-Path $BackupDir 'production-audit-after.json'
$DumpPath = Join-Path $BackupDir 'full.dump'
$SchemaPath = Join-Path $BackupDir 'app-schema.sql'
$DataPath = Join-Path $BackupDir 'app-data.sql'
$RestoreTocPath = Join-Path $BackupDir 'restore-public-private.toc'

$BeforeAudit = Read-Audit $Psql $AuditSql $DatabaseUrl
Set-Content -LiteralPath $BeforePath -Value $BeforeAudit -Encoding UTF8

Invoke-PgTool '生产数据库单一快照逻辑备份' $PgDump @(
  '--dbname', $DatabaseUrl,
  '--no-password',
  '--format=custom',
  '--file', $DumpPath,
  '--no-owner',
  '--verbose'
) -MaxAttempts 4

New-Wp1bRestoreToc -PgRestore $PgRestore -DumpPath $DumpPath -OutputPath $RestoreTocPath

Invoke-PgTool '从同一快照导出应用 schema 检查稿' $PgRestore @(
  '--file', $SchemaPath,
  '--schema-only',
  '--use-list', $RestoreTocPath,
  '--no-owner',
  $DumpPath
)

Invoke-PgTool '从同一快照导出应用 data 检查稿' $PgRestore @(
  '--file', $DataPath,
  '--data-only',
  '--use-list', $RestoreTocPath,
  '--no-owner',
  $DumpPath
)

$AfterAudit = Read-Audit $Psql $AuditSql $DatabaseUrl
Set-Content -LiteralPath $AfterPath -Value $AfterAudit -Encoding UTF8

if ((Normalize-Audit $BeforeAudit) -ne (Normalize-Audit $AfterAudit)) {
  Set-Content -LiteralPath (Join-Path $BackupDir 'INVALID-production-changed-during-backup.txt') `
    -Value '备份前后 checksum 不一致。本目录不得用于恢复，请在无写入窗口重新执行。' -Encoding UTF8
  throw '备份期间生产数据发生变化，当前备份无效。'
}

Copy-Item -LiteralPath $BaselineSource -Destination (Join-Path $BackupDir 'wp1a-production-baseline.json')
Copy-Item -LiteralPath $StorageSource -Destination (Join-Path $BackupDir 'storage-manifest.json')
$AuthManifest = Read-Audit $Psql $AuthManifestSql $DatabaseUrl
Set-Content -LiteralPath (Join-Path $BackupDir 'auth-user-manifest.json') -Value $AuthManifest -Encoding UTF8

$Files = Get-ChildItem -LiteralPath $BackupDir -File | Sort-Object Name | ForEach-Object {
  [ordered]@{
    name = $_.Name
    sizeBytes = $_.Length
    sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  }
}

$Manifest = [ordered]@{
  manifestVersion = 1
  projectRef = $ProductionProjectRef
  capturedAt = (Get-Date).ToString('o')
  productionStableDuringBackup = $true
  containsSensitiveData = $true
  restoreScope = 'full cold dump; shadow restore replays public/private schema, data and ACL'
  files = $Files
}

$Manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $BackupDir 'backup-manifest.json') -Encoding UTF8
Write-Host "WP1-B 逻辑备份完成：$BackupDir"
Write-Host '不要提交、同步到公开网盘或发送其中的 full.dump/app-data.sql。'
