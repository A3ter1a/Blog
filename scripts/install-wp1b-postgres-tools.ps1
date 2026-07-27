[CmdletBinding()]
param(
  [string]$InstallRoot = (Join-Path $PSScriptRoot '..\.tools\postgresql'),
  [switch]$AllowDownload
)

$ErrorActionPreference = 'Stop'
$Version = '17.10'
$OfficialPage = 'https://www.postgresql.org/download/windows/'
$DownloadUrl = 'https://sbp.enterprisedb.com/getfile.jsp?fileid=1260307'
$ExpectedArchiveSha256 = 'ef9b1e5e23d2e8a83914ba13d9dc536a72210fba53fd1808ff1f7e06bb22b106'

if (-not $AllowDownload) {
  throw '该脚本会从 PostgreSQL 官方页面指向的 EDB Windows x86-64 archive 下载文件。确认后使用 -AllowDownload。'
}

$ResolvedRoot = [System.IO.Path]::GetFullPath($InstallRoot)
$VersionRoot = Join-Path $ResolvedRoot $Version
$ArchivePath = Join-Path $ResolvedRoot "postgresql-$Version-windows-x64-binaries.zip"
$HashPath = "$ArchivePath.sha256"

New-Item -ItemType Directory -Path $ResolvedRoot -Force | Out-Null

if (-not (Test-Path -LiteralPath $ArchivePath)) {
  Write-Host "从官方推荐的 EDB archive 下载 PostgreSQL $Version Windows x86-64 客户端。"
  Write-Host "来源说明：$OfficialPage"
  Invoke-WebRequest -Uri $DownloadUrl -OutFile $ArchivePath -UseBasicParsing
}

$ArchiveHash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($ArchiveHash -ne $ExpectedArchiveSha256) {
  throw "PostgreSQL archive SHA-256 不匹配。预期：$ExpectedArchiveSha256；实际：$ArchiveHash。已拒绝解压和使用。"
}
Set-Content -LiteralPath $HashPath -Value "$ArchiveHash  $([System.IO.Path]::GetFileName($ArchivePath))" -Encoding UTF8

if (-not (Test-Path -LiteralPath $VersionRoot)) {
  Expand-Archive -LiteralPath $ArchivePath -DestinationPath $VersionRoot -Force
}

$PgDump = Get-ChildItem -LiteralPath $VersionRoot -Recurse -Filter 'pg_dump.exe' | Select-Object -First 1
$PgRestore = Get-ChildItem -LiteralPath $VersionRoot -Recurse -Filter 'pg_restore.exe' | Select-Object -First 1
$Psql = Get-ChildItem -LiteralPath $VersionRoot -Recurse -Filter 'psql.exe' | Select-Object -First 1

if ($null -eq $PgDump -or $null -eq $PgRestore -or $null -eq $Psql) {
  throw 'archive 解压后缺少 pg_dump/pg_restore/psql，拒绝继续。'
}

$VersionOutput = (& $PgDump.FullName '--version') -join ''
if ($LASTEXITCODE -ne 0 -or $VersionOutput -notmatch ' 17\.10') {
  throw "客户端版本验证失败：$VersionOutput"
}

$BinDir = $PgDump.Directory.FullName
Write-Host "PostgreSQL 客户端准备完成：$BinDir"
Write-Host "Archive SHA-256：$ArchiveHash"
Write-Host '仅对当前 PowerShell 会话设置：'
Write-Host ('$env:ASTEROID_PG_BIN=' + "'$BinDir'")
