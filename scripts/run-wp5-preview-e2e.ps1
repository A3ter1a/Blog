[CmdletBinding()]
param(
  [int]$Port = 3102,
  [string]$PreviewEnvPath = (Join-Path $PSScriptRoot '..\tmp\wp5-preview.env'),
  [string]$LoginPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b\20260713-103656-160\shadow-login-local.txt'),
  [string]$CredentialPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-shadow-credential-v2.json')
)

$ErrorActionPreference = 'Stop'
$ShadowProjectRef = 'qyjfcebqjtphlpsvizxo'
$ExpectedShadowProjectName = 'Blog-shadow-wp1b'
$ExpectedShadowRegion = 'ap-southeast-1'
$TunnelPort = 15433
$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$BackupRoot = (Resolve-Path (Join-Path $RepositoryRoot '.local-backups')).Path
$BackupPrefix = $BackupRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$TmpRoot = (Resolve-Path (Join-Path $RepositoryRoot 'tmp')).Path
$TmpPrefix = $TmpRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar

function Resolve-RestrictedPath([string]$Path, [string]$ExpectedPrefix, [string]$Label) {
  $Resolved = (Resolve-Path -LiteralPath $Path).Path
  if (-not $Resolved.StartsWith($ExpectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "$Label 不在允许目录内。"
  }
  return $Resolved
}

function Test-TcpPort([int]$TargetPort) {
  $Client = [System.Net.Sockets.TcpClient]::new()
  try {
    $Task = $Client.ConnectAsync('127.0.0.1', $TargetPort)
    return $Task.Wait(350) -and $Client.Connected
  } catch {
    return $false
  } finally {
    $Client.Dispose()
  }
}

function Wait-HttpReady([string]$Url, [System.Diagnostics.Process]$Process) {
  $Deadline = [DateTimeOffset]::UtcNow.AddSeconds(75)
  while ([DateTimeOffset]::UtcNow -lt $Deadline) {
    if ($Process.HasExited) {
      throw "本地 Next 进程提前退出，exitCode=$($Process.ExitCode)"
    }
    try {
      $Response = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec 4 -SkipHttpErrorCheck
      if ($Response.StatusCode -ge 200 -and $Response.StatusCode -lt 500) { return }
    } catch {
      # 继续等待编译完成。
    }
    Start-Sleep -Milliseconds 750
  }
  throw '本地 Next 服务在 75 秒内未就绪。'
}

function Stop-OwnedProcess([System.Diagnostics.Process]$Process) {
  if ($null -eq $Process) { return }
  try {
    if (-not $Process.HasExited) {
      & taskkill.exe '/PID' ([string]$Process.Id) '/T' '/F' | Out-Null
      if ($LASTEXITCODE -ne 0 -and -not $Process.HasExited) {
        Stop-Process -Id $Process.Id -Force -ErrorAction Stop
      }
      $Process.WaitForExit(5000) | Out-Null
    }
  } catch {
    Write-Warning "无法停止受控进程 PID=$($Process.Id)：$($_.Exception.Message)"
  }
}

function Get-LastJsonLine([object[]]$Rows, [string]$Label) {
  $Line = $Rows | Where-Object {
    -not [string]::IsNullOrWhiteSpace([string]$_) -and [string]$_.TrimStart().StartsWith('{')
  } | Select-Object -Last 1
  if ([string]::IsNullOrWhiteSpace([string]$Line)) {
    throw "$Label 没有返回 JSON 证据。"
  }
  return ([string]$Line | ConvertFrom-Json -Depth 20)
}

$ResolvedEnvPath = Resolve-RestrictedPath $PreviewEnvPath $TmpPrefix 'Preview env'
$ResolvedLoginPath = Resolve-RestrictedPath $LoginPath $BackupPrefix '登录文件'
$ResolvedCredentialPath = Resolve-RestrictedPath $CredentialPath $BackupPrefix 'Shadow 数据库凭据'
if (Test-TcpPort $Port) { throw "拒绝启动：本地端口 $Port 已被占用。" }
if (Test-TcpPort $TunnelPort) { throw "拒绝启动：Shadow 隧道端口 $TunnelPort 已被占用。" }

$RunId = [DateTimeOffset]::Now.ToString('yyyyMMdd-HHmmss-fff')
$RunRoot = Join-Path $BackupRoot "wp5-preview-e2e\$RunId"
New-Item -ItemType Directory -Path $RunRoot -Force | Out-Null
$ManifestPath = Join-Path $RunRoot 'manifest.json'
$ResultPath = Join-Path $RunRoot 'result.json'
$LatestResultPath = Join-Path $BackupRoot 'wp5-preview-e2e\latest-result.json'
$NextOutPath = Join-Path $RunRoot 'next.out.log'
$NextErrPath = Join-Path $RunRoot 'next.err.log'
$TunnelOutPath = Join-Path $RunRoot 'tunnel.out.log'
$TunnelErrPath = Join-Path $RunRoot 'tunnel.err.log'
$NodePath = (Get-Command node -ErrorAction Stop).Source
$NextBin = (Resolve-Path (Join-Path $RepositoryRoot 'node_modules\next\dist\bin\next')).Path
$NextLauncher = (Resolve-Path (Join-Path $RepositoryRoot 'scripts\start-next-with-env.mjs')).Path
$E2EScript = (Resolve-Path (Join-Path $RepositoryRoot 'scripts\run-wp5-preview-api-e2e.mjs')).Path
$TunnelScript = (Resolve-Path (Join-Path $RepositoryRoot 'scripts\wp1b-pg-http-connect-tunnel.mjs')).Path
$Psql = (Resolve-Path (Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin\psql.exe')).Path
$BaseUrl = "http://127.0.0.1:$Port"
$NextProcess = $null
$TunnelProcess = $null
$E2EExitCode = 1
$CleanupVerified = $false

try {
  $QuotedEnvPath = '"' + $ResolvedEnvPath + '"'
  $QuotedNextBin = '"' + $NextBin + '"'
  $QuotedNextLauncher = '"' + $NextLauncher + '"'
  $NextProcess = Start-Process -FilePath $NodePath `
    -ArgumentList @($QuotedNextLauncher, $QuotedEnvPath, $QuotedNextBin, [string]$Port) `
    -WorkingDirectory $RepositoryRoot `
    -RedirectStandardOutput $NextOutPath `
    -RedirectStandardError $NextErrPath `
    -WindowStyle Hidden `
    -PassThru
  Wait-HttpReady "$BaseUrl/login" $NextProcess

  & $NodePath $E2EScript `
    '--env-file' $ResolvedEnvPath `
    '--base-url' $BaseUrl `
    '--login-path' $ResolvedLoginPath `
    '--manifest' $ManifestPath `
    '--result' $ResultPath
  $E2EExitCode = $LASTEXITCODE
} finally {
  Stop-OwnedProcess $NextProcess

  try {
    if (Test-Path -LiteralPath $ManifestPath) {
    $Manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $ManifestPath | ConvertFrom-Json
    $UserId = [string]$Manifest.userId
    $ObjectivePassageId = [string]$Manifest.objectivePassageId
    $SubjectivePassageId = [string]$Manifest.subjectivePassageId
    $UuidPattern = '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    if (
      [string]$Manifest.shadowProjectRef -cne $ShadowProjectRef -or
      $UserId -notmatch $UuidPattern -or
      $ObjectivePassageId -notmatch $UuidPattern -or
      $SubjectivePassageId -notmatch $UuidPattern
    ) {
      throw '清理拒绝：E2E manifest 的 fixed Shadow 身份或 UUID 无效。'
    }

    $Credential = Get-Content -Raw -Encoding UTF8 -LiteralPath $ResolvedCredentialPath | ConvertFrom-Json
    if (
      [string]$Credential.projectName -cne $ExpectedShadowProjectName -or
      [string]$Credential.region -cne $ExpectedShadowRegion -or
      [string]::IsNullOrWhiteSpace([string]$Credential.databasePassword)
    ) {
      throw '清理拒绝：fixed Shadow 数据库凭据标记无效。'
    }

    if (Test-TcpPort $TunnelPort) {
      throw "清理拒绝：Shadow 隧道端口 $TunnelPort 被未知进程占用。"
    }
    $QuotedTunnelScript = '"' + $TunnelScript + '"'
    $TunnelProcess = Start-Process -FilePath $NodePath `
      -ArgumentList @($QuotedTunnelScript, 'shadow') `
      -WorkingDirectory $RepositoryRoot `
      -RedirectStandardOutput $TunnelOutPath `
      -RedirectStandardError $TunnelErrPath `
      -WindowStyle Hidden `
      -PassThru
    $TunnelDeadline = [DateTimeOffset]::UtcNow.AddSeconds(15)
    while (-not (Test-TcpPort $TunnelPort)) {
      if ($TunnelProcess.HasExited) {
        throw "Shadow 隧道提前退出，exitCode=$($TunnelProcess.ExitCode)"
      }
      if ([DateTimeOffset]::UtcNow -ge $TunnelDeadline) {
        throw 'Shadow 隧道在 15 秒内未就绪。'
      }
      Start-Sleep -Milliseconds 250
    }

    $DatabaseParameters = @(
      'host=aws-0-ap-southeast-1.pooler.supabase.com',
      'hostaddr=127.0.0.1',
      "port=$TunnelPort",
      'dbname=postgres',
      "user=postgres.$ShadowProjectRef",
      'sslmode=require',
      'connect_timeout=10'
    ) -join ' '
    $CleanupSql = @"
begin;
set local session_replication_role = replica;
delete from public.grades grade
using public.attempt_revisions revision, public.attempts attempt
where grade.revision_id = revision.id
  and revision.attempt_id = attempt.id
  and attempt.user_id = '$UserId'::uuid
  and attempt.source_kind = 'english_passage'
  and attempt.english_passage_id in ('$ObjectivePassageId'::uuid, '$SubjectivePassageId'::uuid);
delete from public.attempt_revisions revision
using public.attempts attempt
where revision.attempt_id = attempt.id
  and attempt.user_id = '$UserId'::uuid
  and attempt.source_kind = 'english_passage'
  and attempt.english_passage_id in ('$ObjectivePassageId'::uuid, '$SubjectivePassageId'::uuid);
delete from public.attempts
where user_id = '$UserId'::uuid
  and source_kind = 'english_passage'
  and english_passage_id in ('$ObjectivePassageId'::uuid, '$SubjectivePassageId'::uuid);
delete from public.english_attempt_answers answer_row
using public.english_attempts legacy
where answer_row.attempt_id = legacy.id
  and legacy.user_id = '$UserId'::uuid
  and legacy.passage_id in ('$ObjectivePassageId'::uuid, '$SubjectivePassageId'::uuid);
delete from public.english_attempts
where user_id = '$UserId'::uuid
  and passage_id in ('$ObjectivePassageId'::uuid, '$SubjectivePassageId'::uuid);
commit;
select jsonb_build_object(
  'sharedAttempts', (
    select count(*) from public.attempts
    where user_id = '$UserId'::uuid
      and source_kind = 'english_passage'
      and english_passage_id in ('$ObjectivePassageId'::uuid, '$SubjectivePassageId'::uuid)
  ),
  'sharedRevisions', (
    select count(*) from public.attempt_revisions revision
    join public.attempts attempt on attempt.id = revision.attempt_id
    where attempt.user_id = '$UserId'::uuid
      and attempt.source_kind = 'english_passage'
      and attempt.english_passage_id in ('$ObjectivePassageId'::uuid, '$SubjectivePassageId'::uuid)
  ),
  'sharedGrades', (
    select count(*) from public.grades grade
    join public.attempt_revisions revision on revision.id = grade.revision_id
    join public.attempts attempt on attempt.id = revision.attempt_id
    where attempt.user_id = '$UserId'::uuid
      and attempt.source_kind = 'english_passage'
      and attempt.english_passage_id in ('$ObjectivePassageId'::uuid, '$SubjectivePassageId'::uuid)
  ),
  'legacyAttempts', (
    select count(*) from public.english_attempts
    where user_id = '$UserId'::uuid
      and passage_id in ('$ObjectivePassageId'::uuid, '$SubjectivePassageId'::uuid)
  ),
  'legacyAnswers', (
    select count(*) from public.english_attempt_answers answer_row
    join public.english_attempts legacy on legacy.id = answer_row.attempt_id
    where legacy.user_id = '$UserId'::uuid
      and legacy.passage_id in ('$ObjectivePassageId'::uuid, '$SubjectivePassageId'::uuid)
  )
);
"@
    $PreviousPgPassword = $env:PGPASSWORD
    try {
      $env:PGPASSWORD = [string]$Credential.databasePassword
      $Rows = & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--quiet' `
        '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' $CleanupSql
      if ($LASTEXITCODE -ne 0) { throw 'fixed Shadow E2E 数据清理 SQL 失败。' }
    } finally {
      $env:PGPASSWORD = $PreviousPgPassword
    }
    $Cleanup = Get-LastJsonLine $Rows 'fixed Shadow E2E 清理'
    $CleanupVerified = @(
      $Cleanup.sharedAttempts,
      $Cleanup.sharedRevisions,
      $Cleanup.sharedGrades,
      $Cleanup.legacyAttempts,
      $Cleanup.legacyAnswers
    ) | Where-Object { [int64]$_ -ne 0 } | Measure-Object | Select-Object -ExpandProperty Count
    $CleanupVerified = $CleanupVerified -eq 0
    if (-not $CleanupVerified) { throw 'fixed Shadow E2E 测试数据未完全清理。' }
    }
  } finally {
    Stop-OwnedProcess $TunnelProcess
    if (Test-Path -LiteralPath $ResolvedEnvPath) {
      Remove-Item -LiteralPath $ResolvedEnvPath -Force
    }
  }
}

if (-not (Test-Path -LiteralPath $ResultPath)) {
  throw 'WP5 Preview API E2E 没有生成结果文件。'
}
$Result = Get-Content -Raw -Encoding UTF8 -LiteralPath $ResultPath | ConvertFrom-Json
$Result | Add-Member -NotePropertyName cleanupVerified -NotePropertyValue $CleanupVerified -Force
$Result | Add-Member -NotePropertyName runId -NotePropertyValue $RunId -Force
$SafeResultJson = $Result | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText($ResultPath, "$SafeResultJson`n", [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($LatestResultPath, "$SafeResultJson`n", [System.Text.UTF8Encoding]::new($false))

if ($E2EExitCode -ne 0 -or -not $Result.ok -or -not $CleanupVerified) {
  throw "WP5 Preview API E2E 未通过；runId=$RunId cleanupVerified=$CleanupVerified"
}
Write-Output $SafeResultJson
