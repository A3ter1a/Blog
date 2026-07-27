[CmdletBinding()]
param(
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-shadow-credential.json'),
  [switch]$AllowCreateShadowCredential
)

$ErrorActionPreference = 'Stop'

if (-not $AllowCreateShadowCredential) {
  throw '该脚本会生成影子数据库密码并写入被 Git 忽略的本地文件。确认后使用 -AllowCreateShadowCredential。'
}

$ResolvedPath = [System.IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $ResolvedPath) {
  throw "影子凭据文件已存在，拒绝覆盖：$ResolvedPath"
}

$Parent = Split-Path -Parent $ResolvedPath
New-Item -ItemType Directory -Path $Parent -Force | Out-Null

$Bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($Bytes)
$Password = ([Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+', 'A').Replace('/', 'b') + 'Aa1!')

$Credential = [ordered]@{
  projectName = 'Blog-shadow-wp1b'
  region = 'ap-southeast-1'
  databasePassword = $Password
  createdAt = (Get-Date).ToString('o')
}

$Credential | ConvertTo-Json | Set-Content -LiteralPath $ResolvedPath -Encoding UTF8

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$RepositoryOwner = (Get-Acl -LiteralPath $RepositoryRoot).Owner
$CurrentIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$AllowedIdentities = @($RepositoryOwner, $CurrentIdentity) | Select-Object -Unique
foreach ($Identity in $AllowedIdentities) {
  & icacls.exe $ResolvedPath '/grant:r' "${Identity}:(F)" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "无法为影子凭据授权本机账户：$Identity" }
}
& icacls.exe $ResolvedPath '/inheritance:r' | Out-Null
if ($LASTEXITCODE -ne 0) { throw '无法关闭影子凭据的 ACL 继承。' }

Write-Host "影子凭据已生成：$ResolvedPath"
Write-Host '文件仅供项目用户与当前执行账户在本机恢复脚本中使用，不要提交或发送。'
