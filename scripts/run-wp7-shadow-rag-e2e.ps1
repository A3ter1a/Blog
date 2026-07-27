[CmdletBinding()]
param(
  [string]$PreviewEnvPath = (Join-Path $PSScriptRoot '..\tmp\wp7-preview.env'),
  [string]$LoginPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b\20260713-103656-160\shadow-login-local.txt'),
  [string]$CredentialPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-shadow-credential-v2.json')
)

$ErrorActionPreference = 'Stop'
$ShadowProjectRef = 'qyjfcebqjtphlpsvizxo'
$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$BackupRoot = (Resolve-Path (Join-Path $RepositoryRoot '.local-backups')).Path
$RunRoot = Join-Path $BackupRoot ("wp7-shadow-e2e\" + [DateTimeOffset]::Now.ToString('yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $RunRoot -Force | Out-Null
$ResultPath = Join-Path $RunRoot 'result.json'
$LatestPath = Join-Path $BackupRoot 'wp7-shadow-e2e\latest-result.json'
$Node = (Get-Command node -ErrorAction Stop).Source
$TunnelProcess = $null
try {
  & $Node (Join-Path $RepositoryRoot 'scripts\run-wp7-shadow-rag-e2e.mjs') '--env-file' (Resolve-Path $PreviewEnvPath).Path '--login-path' (Resolve-Path $LoginPath).Path '--result' $ResultPath
  if ($LASTEXITCODE -ne 0) { throw 'WP7 Shadow RAG E2E 核心失败。' }
  $Result = Get-Content -Raw -Encoding UTF8 -LiteralPath $ResultPath | ConvertFrom-Json
  if (-not $Result.ok -or [string]$Result.shadowProjectRef -cne $ShadowProjectRef -or [string]$Result.memoryCandidateId -notmatch '^[0-9a-f-]{36}$') { throw 'WP7 E2E 结果身份无效。' }
  $Credential = Get-Content -Raw -Encoding UTF8 -LiteralPath (Resolve-Path $CredentialPath).Path | ConvertFrom-Json
  $TunnelProcess = Start-Process -FilePath $Node -ArgumentList @((Join-Path $RepositoryRoot 'scripts\wp1b-pg-http-connect-tunnel.mjs'),'shadow') -WorkingDirectory $RepositoryRoot -WindowStyle Hidden -PassThru
  $Ready = $false
  for ($Attempt=0; $Attempt -lt 40; $Attempt+=1) { try { $Client=[System.Net.Sockets.TcpClient]::new(); $Client.Connect('127.0.0.1',15433); $Client.Dispose(); $Ready=$true; break } catch { Start-Sleep -Milliseconds 250 } }
  if (-not $Ready) { throw 'Shadow 清理隧道未就绪。' }
  $Psql = (Resolve-Path (Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin\psql.exe')).Path
  $Db = "host=aws-0-ap-southeast-1.pooler.supabase.com hostaddr=127.0.0.1 port=15433 dbname=postgres user=postgres.$ShadowProjectRef sslmode=require connect_timeout=10"
  $PreviousPassword=$env:PGPASSWORD
  try {
    $env:PGPASSWORD=[string]$Credential.databasePassword
    $CandidateId=[string]$Result.memoryCandidateId
    $Rows=& $Psql '--dbname' $Db '--no-password' '--no-psqlrc' '--quiet' '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' "delete from public.memory_candidates where id='$CandidateId'::uuid; select count(*) from public.memory_candidates where id='$CandidateId'::uuid;"
    if ($LASTEXITCODE -ne 0 -or [string]($Rows | Select-Object -Last 1).Trim() -cne '0') { throw '临时记忆候选未精确清理。' }
  } finally { if ($null -eq $PreviousPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD=$PreviousPassword } }
  $Result | Add-Member -NotePropertyName temporaryMemoryCleaned -NotePropertyValue $true -Force
  $SafeJson=$Result | ConvertTo-Json -Depth 10
  [System.IO.File]::WriteAllText($ResultPath,"$SafeJson`n",[System.Text.UTF8Encoding]::new($false))
  New-Item -ItemType Directory -Path (Split-Path $LatestPath) -Force | Out-Null
  [System.IO.File]::WriteAllText($LatestPath,"$SafeJson`n",[System.Text.UTF8Encoding]::new($false))
  [pscustomobject]@{ Ok=$true; ShadowProjectRef=$ShadowProjectRef; NoteCount=[int]$Result.noteCount; IndexedNotes=[int]$Result.indexedNotes; IndexedChunks=[int]$Result.indexedChunks; CreatedVersions=[int]$Result.createdVersions; Unchanged=[int]$Result.unchanged; SearchResultCount=[int]$Result.searchResultCount; StableCitationCount=[int]$Result.stableCitationCount; MemoryConfirmationPassed=$true; TemporaryMemoryCleaned=$true; ExternalModelCalled=$false } | ConvertTo-Json -Compress
} finally {
  if ($null -ne $TunnelProcess -and -not $TunnelProcess.HasExited) { Stop-Process -Id $TunnelProcess.Id -Force -ErrorAction SilentlyContinue; $TunnelProcess.WaitForExit(5000) | Out-Null }
  if (Test-Path -LiteralPath $PreviewEnvPath) { Remove-Item -LiteralPath $PreviewEnvPath -Force }
}
