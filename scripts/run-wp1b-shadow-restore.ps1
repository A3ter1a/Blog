[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupDir,
  [string]$CredentialPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-shadow-credential-v2.json'),
  [ValidateRange(0, 65535)]
  [int]$LocalProxyTunnelPort = 0,
  [switch]$ConfirmShadowRestore
)

$ErrorActionPreference = 'Stop'
if (-not $ConfirmShadowRestore) {
  throw '恢复会写入影子数据库。确认后使用 -ConfirmShadowRestore。'
}

$Credential = Get-Content -Raw -Encoding UTF8 -LiteralPath $CredentialPath | ConvertFrom-Json
$ShadowProjectRef = 'qyjfcebqjtphlpsvizxo'
if ([string]::IsNullOrWhiteSpace($Credential.databasePassword)) {
  throw '影子数据库密码缺失，拒绝连接。'
}
$PgBin = (Resolve-Path (Join-Path $PSScriptRoot '..\.tools\postgresql\17.10\pgsql\bin')).Path
$ShadowHostAddress = if ($LocalProxyTunnelPort -gt 0) { '127.0.0.1' } else { '52.77.146.31' }
$ShadowPort = if ($LocalProxyTunnelPort -gt 0) { $LocalProxyTunnelPort } else { 5432 }
$DatabaseParameters = @(
  'host=aws-0-ap-southeast-1.pooler.supabase.com',
  "hostaddr=$ShadowHostAddress",
  "port=$ShadowPort",
  'dbname=postgres',
  "user=postgres.$ShadowProjectRef",
  'sslmode=require',
  'connect_timeout=10'
) -join ' '

try {
  $env:ASTEROID_PG_BIN = $PgBin
  $env:ASTEROID_SHADOW_PROJECT_REF = $ShadowProjectRef
  $env:ASTEROID_SHADOW_DB_URL = $DatabaseParameters
  $env:PGPASSWORD = $Credential.databasePassword

  & (Join-Path $PSScriptRoot 'restore-wp1b-shadow.ps1') `
    -BackupDir $BackupDir `
    -PgBin $PgBin `
    -ConfirmShadowRestore
  if ($LASTEXITCODE -ne 0) { throw "WP1-B 影子恢复失败，退出码 $LASTEXITCODE。" }
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:ASTEROID_SHADOW_DB_URL -ErrorAction SilentlyContinue
  Remove-Item Env:ASTEROID_SHADOW_PROJECT_REF -ErrorAction SilentlyContinue
}
