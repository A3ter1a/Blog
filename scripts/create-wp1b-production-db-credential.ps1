[CmdletBinding()]
param(
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-production-db-credential.json'),
  [switch]$AllowCreateProductionCredential
)

$ErrorActionPreference = 'Stop'

if (-not $AllowCreateProductionCredential) {
  throw '该脚本会生成新的生产数据库直连密码候选并写入被 Git 忽略的本地文件。确认后使用 -AllowCreateProductionCredential。'
}

$ResolvedPath = [System.IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $ResolvedPath) {
  throw "生产数据库凭据文件已存在，拒绝覆盖：$ResolvedPath"
}

$Parent = Split-Path -Parent $ResolvedPath
New-Item -ItemType Directory -Path $Parent -Force | Out-Null

$Bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($Bytes)
$Password = ([Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+', 'C').Replace('/', 'd') + 'Aa1!')

$Credential = [ordered]@{
  projectRef = 'kysywitrsjhcdlcrfayl'
  poolerHost = 'aws-1-ap-southeast-1.pooler.supabase.com'
  poolerHostAddress = $null
  poolerPort = 5432
  database = 'postgres'
  username = 'postgres.kysywitrsjhcdlcrfayl'
  databasePassword = $Password
  createdAt = (Get-Date).ToString('o')
  appliedToProduction = $false
}

$Credential | ConvertTo-Json | Set-Content -LiteralPath $ResolvedPath -Encoding UTF8

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$RepositoryOwner = (Get-Acl -LiteralPath $RepositoryRoot).Owner
$CurrentIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$AllowedIdentities = @($RepositoryOwner, $CurrentIdentity) | Select-Object -Unique
foreach ($Identity in $AllowedIdentities) {
  & icacls.exe $ResolvedPath '/grant:r' "${Identity}:(F)" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "无法为生产凭据授权本机账户：$Identity" }
}
& icacls.exe $ResolvedPath '/inheritance:r' | Out-Null
if ($LASTEXITCODE -ne 0) { throw '无法关闭生产凭据的 ACL 继承。' }

Write-Host "生产数据库密码候选已生成：$ResolvedPath"
Write-Host '尚未提交到 Supabase；文件被 Git 忽略且仅项目用户与当前执行账户可访问，不要发送或提交。'
