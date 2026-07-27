[CmdletBinding()]
param(
  [string]$CredentialPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-shadow-credential-v2.json')
)

$ErrorActionPreference = 'Stop'
$ShadowProjectRef = 'qyjfcebqjtphlpsvizxo'
$ProductionProjectRef = 'kysywitrsjhcdlcrfayl'
$SupabaseCliVersion = '2.109.1'
$PostgresMetaVersion = '0.96.6'
$LocalTunnelPort = 15433
if ($ShadowProjectRef -eq $ProductionProjectRef) { throw '拒绝执行：shadow ref 与生产 ref 相同。' }

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Credential = Get-Content -Raw -Encoding UTF8 -LiteralPath $CredentialPath | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($Credential.databasePassword)) { throw '固定 shadow 密码缺失。' }

$GeneratedPath = Join-Path $RepositoryRoot 'lib\database.types.ts'
$TempRoot = Join-Path $RepositoryRoot '.local-backups\wp1c-typegen'
$FirstPath = Join-Path $TempRoot 'database.types.first.ts'
$SecondPath = Join-Path $TempRoot 'database.types.second.ts'
$PostgresMetaRuntime = Join-Path $TempRoot 'postgres-meta-runtime'
$CliErrorPath = Join-Path $TempRoot 'supabase-cli-error.log'
New-Item -ItemType Directory -Path $TempRoot -Force | Out-Null

$EncodedUser = [System.Uri]::EscapeDataString("postgres.$ShadowProjectRef")
$EncodedPassword = [System.Uri]::EscapeDataString([string]$Credential.databasePassword)
$DatabaseUrl = "postgresql://${EncodedUser}:${EncodedPassword}@127.0.0.1:$LocalTunnelPort/postgres?sslmode=require"
$TunnelProcess = $null
$PostgresMetaEntry = $null

function Resolve-PinnedPostgresMeta() {
  $PackagePath = Join-Path $PostgresMetaRuntime 'node_modules\@supabase\postgres-meta\package.json'
  if (-not (Test-Path -LiteralPath $PackagePath)) {
    # CLI 2.109.1 invokes this exact official engine through a container. Install the
    # same pinned package locally because this Windows host has no Docker/Podman runtime.
    & npm.cmd 'install' '--prefix' $PostgresMetaRuntime '--no-save' '--ignore-scripts' `
      '--registry=https://registry.npmjs.org' "@supabase/postgres-meta@$PostgresMetaVersion"
    if ($LASTEXITCODE -ne 0) { throw '固定版本 Supabase postgres-meta 安装失败。' }
  }
  $Package = Get-Content -Raw -Encoding UTF8 -LiteralPath $PackagePath | ConvertFrom-Json
  if ($Package.name -ne '@supabase/postgres-meta' -or $Package.version -ne $PostgresMetaVersion) {
    throw "postgres-meta 版本异常：$($Package.name)@$($Package.version)"
  }
  return (Resolve-Path (Join-Path $PostgresMetaRuntime 'node_modules\@supabase\postgres-meta\dist\server\server.js')).Path
}

function Invoke-TypeGeneration([string]$OutputPath) {
  Remove-Item -LiteralPath $CliErrorPath -Force -ErrorAction SilentlyContinue
  $StartInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $StartInfo.FileName = $Node
  $StartInfo.ArgumentList.Add($PostgresMetaEntry)
  $StartInfo.WorkingDirectory = $RepositoryRoot
  $StartInfo.UseShellExecute = $false
  $StartInfo.CreateNoWindow = $true
  $StartInfo.RedirectStandardOutput = $true
  $StartInfo.RedirectStandardError = $true
  $StartInfo.Environment['PG_META_DB_URL'] = $DatabaseUrl
  $StartInfo.Environment['PG_CONN_TIMEOUT_SECS'] = '60'
  $StartInfo.Environment['PG_QUERY_TIMEOUT_SECS'] = '60'
  $StartInfo.Environment['PG_META_GENERATE_TYPES'] = 'typescript'
  $StartInfo.Environment['PG_META_GENERATE_TYPES_INCLUDED_SCHEMAS'] = 'public'
  $StartInfo.Environment['PG_META_GENERATE_TYPES_DETECT_ONE_TO_ONE_RELATIONSHIPS'] = 'true'

  $Process = [System.Diagnostics.Process]::new()
  $Process.StartInfo = $StartInfo
  $null = $Process.Start()
  $StdoutTask = $Process.StandardOutput.ReadToEndAsync()
  $StderrTask = $Process.StandardError.ReadToEndAsync()
  if (-not $Process.WaitForExit(120000)) {
    $Process.Kill($true)
    throw 'Supabase postgres-meta 类型生成超时。'
  }
  $GeneratedText = $StdoutTask.GetAwaiter().GetResult()
  $RawError = $StderrTask.GetAwaiter().GetResult()
  if ($Process.ExitCode -ne 0) {
    $SafeError = $RawError.Replace([string]$Credential.databasePassword, '[REDACTED]').Replace($EncodedPassword, '[REDACTED]')
    throw "Supabase postgres-meta 类型生成失败：`n$SafeError"
  }
  foreach ($Marker in @('export type Database', 'planning_task_status', 'attempt_revisions', 'source_versions')) {
    if (-not $GeneratedText.Contains($Marker)) { throw "生成类型缺少 WP1-C 标记：$Marker" }
  }
  Set-Content -LiteralPath $OutputPath -Value $GeneratedText -Encoding UTF8 -NoNewline
}

try {
  $Node = (Get-Command node -ErrorAction Stop).Source
  $PostgresMetaEntry = Resolve-PinnedPostgresMeta
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

  Invoke-TypeGeneration $FirstPath
  Invoke-TypeGeneration $SecondPath
  $FirstHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $FirstPath).Hash
  $SecondHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $SecondPath).Hash
  if ($FirstHash -ne $SecondHash) { throw 'Supabase 类型连续生成不一致。' }

  Copy-Item -LiteralPath $FirstPath -Destination $GeneratedPath -Force
  Write-Output "SupabaseCliVersion=$SupabaseCliVersion"
  Write-Output "PostgresMetaVersion=$PostgresMetaVersion"
  Write-Output "GeneratedTypeSha256=$FirstHash"
  Write-Output "GeneratedTypePath=$GeneratedPath"
  Write-Output 'DeterministicTypeGeneration=passed'
} finally {
  $DatabaseUrl = $null
  $EncodedPassword = $null
  Remove-Item -LiteralPath $CliErrorPath -Force -ErrorAction SilentlyContinue
  if ($null -ne $TunnelProcess -and -not $TunnelProcess.HasExited) {
    Stop-Process -Id $TunnelProcess.Id -Force -ErrorAction SilentlyContinue
  }
}
