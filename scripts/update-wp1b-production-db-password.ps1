[CmdletBinding()]
param(
  [string]$CredentialPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-production-db-credential.json'),
  [switch]$AllowUpdateProductionCredential
)

$ErrorActionPreference = 'Stop'
if (-not $AllowUpdateProductionCredential) {
  throw '该脚本只更新本机 Git 忽略凭据中的数据库密码。确认后使用 -AllowUpdateProductionCredential。'
}

$ResolvedPath = [System.IO.Path]::GetFullPath($CredentialPath)
if (-not (Test-Path -LiteralPath $ResolvedPath)) {
  throw "生产凭据文件不存在：$ResolvedPath"
}

$Credential = Get-Content -Raw -Encoding UTF8 -LiteralPath $ResolvedPath | ConvertFrom-Json
$ExpectedProjectRef = 'kysywitrsjhcdlcrfayl'
$ExpectedHost = 'aws-1-ap-southeast-1.pooler.supabase.com'
$ExpectedUsername = "postgres.$ExpectedProjectRef"
$CredentialTargetMatches =
  $Credential.projectRef -eq $ExpectedProjectRef -and
  $Credential.poolerHost -eq $ExpectedHost -and
  [int]$Credential.poolerPort -eq 5432 -and
  $Credential.database -eq 'postgres' -and
  $Credential.username -eq $ExpectedUsername
if (-not $CredentialTargetMatches) {
  throw '凭据目标与固定生产基线不匹配，拒绝更新。'
}

$SecurePassword = Read-Host '请输入当前 Supabase 数据库密码（输入不会显示）' -AsSecureString
$PasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)
try {
  $PlainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($PasswordPointer)
  if ([string]::IsNullOrWhiteSpace($PlainPassword)) {
    throw '数据库密码为空，未修改凭据文件。'
  }
  $Credential.databasePassword = $PlainPassword
  $Credential.appliedToProduction = $false
  $Credential | ConvertTo-Json | Set-Content -LiteralPath $ResolvedPath -Encoding UTF8
} finally {
  if ($PasswordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($PasswordPointer)
  }
  $PlainPassword = $null
}

Write-Host '本机生产数据库密码已安全更新；没有输出密码。现在可重新运行只读备份 runner。'
