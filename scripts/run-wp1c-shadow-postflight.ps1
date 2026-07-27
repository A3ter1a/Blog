[CmdletBinding()]
param(
  [string]$BackupDir = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b\20260713-103656-160'),
  [string]$CredentialPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-shadow-credential-v2.json')
)

$ErrorActionPreference = 'Stop'
$ShadowProjectRef = 'qyjfcebqjtphlpsvizxo'
$ProductionProjectRef = 'kysywitrsjhcdlcrfayl'
$LocalTunnelPort = 15433
if ($ShadowProjectRef -eq $ProductionProjectRef) { throw '拒绝执行：shadow ref 与生产 ref 相同。' }

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ResolvedBackupDir = (Resolve-Path -LiteralPath $BackupDir).Path
$ExpectedBackupRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups\wp1-b'))
if (-not $ResolvedBackupDir.StartsWith($ExpectedBackupRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw '拒绝写入 WP1-B 本地备份目录之外的后验文件。'
}

$Credential = Get-Content -Raw -Encoding UTF8 -LiteralPath $CredentialPath | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($Credential.databasePassword)) { throw '固定 shadow 密码缺失。' }
$PgBin = (Resolve-Path (Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin')).Path
$Psql = Join-Path $PgBin 'psql.exe'
$AuditSql = Join-Path $RepositoryRoot 'supabase\wp1c-shadow-postflight.sql'
$AuditPath = Join-Path $ResolvedBackupDir 'wp1c-shadow-postflight.json'
$BaselinePath = Join-Path $ResolvedBackupDir 'shadow-restore-audit.json'
$AuthManifestPath = Join-Path $ResolvedBackupDir 'auth-user-manifest.json'
$DatabaseUrl = @(
  'host=aws-0-ap-southeast-1.pooler.supabase.com', 'hostaddr=127.0.0.1', "port=$LocalTunnelPort",
  'dbname=postgres', "user=postgres.$ShadowProjectRef", 'sslmode=require', 'connect_timeout=10'
) -join ' '

$TunnelProcess = $null
try {
  $Node = (Get-Command node -ErrorAction Stop).Source
  $TunnelProcess = Start-Process -FilePath $Node `
    -ArgumentList @((Join-Path $RepositoryRoot 'scripts\wp1b-pg-http-connect-tunnel.mjs'), 'shadow') `
    -WorkingDirectory $RepositoryRoot -WindowStyle Hidden -PassThru

  $Ready = $false
  for ($i = 0; $i -lt 40; $i += 1) {
    try {
      $Client = [System.Net.Sockets.TcpClient]::new()
      $Client.Connect('127.0.0.1', $LocalTunnelPort)
      $Client.Dispose()
      $Ready = $true
      break
    } catch { Start-Sleep -Milliseconds 250 }
  }
  if (-not $Ready) { throw '固定 shadow 隧道未就绪。' }

  $env:PGPASSWORD = $Credential.databasePassword
  $Identity = ((& $Psql '--dbname' $DatabaseUrl '--no-password' '--no-psqlrc' '--tuples-only' '--no-align' `
    '--set' 'ON_ERROR_STOP=1' '--command' "select current_user || '|' || current_database();") -join '').Trim()
  if ($LASTEXITCODE -ne 0 -or $Identity -ne 'postgres|postgres') { throw "shadow 身份异常：$Identity" }

  $AuditJson = ((& $Psql '--dbname' $DatabaseUrl '--no-password' '--no-psqlrc' '--tuples-only' '--no-align' `
    '--set' 'ON_ERROR_STOP=1' '--file' $AuditSql) -join "`n").Trim()
  if ($LASTEXITCODE -ne 0) { throw '固定 shadow 后验 SQL 失败。' }
  $null = $AuditJson | ConvertFrom-Json
  Set-Content -LiteralPath $AuditPath -Value $AuditJson -Encoding UTF8

  & $Node (Join-Path $RepositoryRoot 'scripts\verify-wp1c-shadow-postflight.mjs') `
    '--baseline' $BaselinePath '--audit' $AuditPath '--auth-manifest' $AuthManifestPath
  if ($LASTEXITCODE -ne 0) { throw '固定 shadow 后验指纹不匹配。' }
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  if ($null -ne $TunnelProcess -and -not $TunnelProcess.HasExited) {
    Stop-Process -Id $TunnelProcess.Id -Force -ErrorAction SilentlyContinue
  }
}
