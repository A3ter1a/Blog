[CmdletBinding()]
param(
  [string]$CredentialPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-production-db-credential.json'),
  [ValidateRange(0, 65535)]
  [int]$LocalProxyTunnelPort = 0,
  [switch]$AcknowledgeSensitiveBackup
)

$ErrorActionPreference = 'Stop'
if (-not $AcknowledgeSensitiveBackup) {
  throw '生产备份包含敏感数据。确认后使用 -AcknowledgeSensitiveBackup。'
}

$Credential = Get-Content -Raw -Encoding UTF8 -LiteralPath $CredentialPath | ConvertFrom-Json
$ExpectedProjectRef = 'kysywitrsjhcdlcrfayl'
$ExpectedPoolerHost = 'aws-1-ap-southeast-1.pooler.supabase.com'
$ExpectedPoolerPort = 5432
$ExpectedDatabase = 'postgres'
$ExpectedUsername = "postgres.$ExpectedProjectRef"

$CredentialShapeMatches =
  $Credential.projectRef -eq $ExpectedProjectRef -and
  $Credential.poolerHost -eq $ExpectedPoolerHost -and
  [int]$Credential.poolerPort -eq $ExpectedPoolerPort -and
  $Credential.database -eq $ExpectedDatabase -and
  $Credential.username -eq $ExpectedUsername
if (-not $CredentialShapeMatches) {
  throw '生产凭据中的 project ref 或连接目标与固定生产基线不匹配，拒绝发送密码。'
}
if ([string]::IsNullOrWhiteSpace($Credential.databasePassword)) {
  throw '生产数据库密码缺失，拒绝连接。'
}

$PgBin = (Resolve-Path (Join-Path $PSScriptRoot '..\.tools\postgresql\17.10\pgsql\bin')).Path
$Psql = Join-Path $PgBin 'psql.exe'

function New-DatabaseParameters([string]$HostAddress, [int]$Port) {
  return @(
    "host=$ExpectedPoolerHost",
    "hostaddr=$HostAddress",
    "port=$Port",
    "dbname=$ExpectedDatabase",
    "user=$ExpectedUsername",
    'sslmode=require',
    'connect_timeout=5'
  ) -join ' '
}

try {
  $env:ASTEROID_PG_BIN = $PgBin
  $env:ASTEROID_PRODUCTION_PROJECT_REF = $Credential.projectRef
  $env:PGPASSWORD = $Credential.databasePassword
  $env:PGOPTIONS = '-c default_transaction_read_only=on'

  $DatabaseParameters = $null
  if ($LocalProxyTunnelPort -gt 0) {
    for ($ProbeRound = 1; $ProbeRound -le 4 -and [string]::IsNullOrWhiteSpace($DatabaseParameters); $ProbeRound++) {
      $CandidateParameters = New-DatabaseParameters '127.0.0.1' $LocalProxyTunnelPort
      $TargetCheck = (& $Psql '--dbname' $CandidateParameters '--no-password' '--no-psqlrc' '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' "select case when current_database() = 'postgres' and current_user = 'postgres' then 'ok' else 'wrong-target' end;" 2>$null) -join ''
      if ($LASTEXITCODE -eq 0 -and $TargetCheck.Trim() -eq 'ok') {
        $DatabaseParameters = $CandidateParameters
        break
      }
      if ($ProbeRound -lt 4) { Start-Sleep -Seconds 1 }
    }
  } else {
    for ($ProbeRound = 1; $ProbeRound -le 4 -and [string]::IsNullOrWhiteSpace($DatabaseParameters); $ProbeRound++) {
    $PoolerAddresses = [System.Net.Dns]::GetHostAddresses($ExpectedPoolerHost) |
      Where-Object { $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork } |
      ForEach-Object { $_.IPAddressToString } |
      Select-Object -Unique
    if (@($PoolerAddresses).Count -eq 0) {
      throw 'Session Pooler 没有解析到 IPv4 地址，未开始备份。'
    }

    foreach ($PoolerAddress in $PoolerAddresses) {
      $CandidateParameters = New-DatabaseParameters $PoolerAddress $ExpectedPoolerPort
      $TargetCheck = (& $Psql '--dbname' $CandidateParameters '--no-password' '--no-psqlrc' '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' "select case when current_database() = 'postgres' and current_user = 'postgres' then 'ok' else 'wrong-target' end;" 2>$null) -join ''
      if ($LASTEXITCODE -eq 0 -and $TargetCheck.Trim() -eq 'ok') {
        $DatabaseParameters = $CandidateParameters
        break
      }
    }

    if ([string]::IsNullOrWhiteSpace($DatabaseParameters) -and $ProbeRound -lt 4) {
      Start-Sleep -Seconds 1
    }
  }
  }
  if ([string]::IsNullOrWhiteSpace($DatabaseParameters)) {
    throw '四轮探测后，所有当前 Session Pooler IPv4 节点仍未通过验密和身份校验，未开始备份。'
  }

  $env:ASTEROID_PRODUCTION_DB_URL = $DatabaseParameters

  $Credential.appliedToProduction = $true
  $Credential | ConvertTo-Json | Set-Content -LiteralPath $CredentialPath -Encoding UTF8

  & (Join-Path $PSScriptRoot 'backup-wp1b.ps1') -PgBin $PgBin -AcknowledgeSensitiveBackup
  if ($LASTEXITCODE -ne 0) { throw "WP1-B 生产备份失败，退出码 $LASTEXITCODE。" }
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:ASTEROID_PRODUCTION_DB_URL -ErrorAction SilentlyContinue
  Remove-Item Env:ASTEROID_PRODUCTION_PROJECT_REF -ErrorAction SilentlyContinue
  Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue
}
