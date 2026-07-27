[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupDir,
  [string]$CredentialPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-production-db-credential.json'),
  [ValidateSet('preflight', '0008', '0009', '0010', '0011', '0012', '0013')]
  [string]$Stage = 'preflight',
  [ValidateRange(1, 24)]
  [int]$MaxBackupAgeHours = 4,
  [ValidateRange(0, 65535)]
  [int]$LocalProxyTunnelPort = 0,
  [switch]$StartLocalProxyTunnel,
  [switch]$ConfirmProductionWrite,
  [string]$ConfirmationPhrase = ''
)

$ErrorActionPreference = 'Stop'
$ProductionProjectRef = 'kysywitrsjhcdlcrfayl'
$ShadowProjectRef = 'qyjfcebqjtphlpsvizxo'
$ExpectedPoolerHost = 'aws-1-ap-southeast-1.pooler.supabase.com'
$ExpectedPoolerPort = 5432
$ExpectedDatabase = 'postgres'
$ExpectedUsername = "postgres.$ProductionProjectRef"
$DefaultTunnelPort = 15432

if ($ProductionProjectRef -eq $ShadowProjectRef) {
  throw '拒绝执行：生产 ref 与 fixed shadow ref 相同。'
}
if ($Stage -ne 'preflight') {
  $ExpectedPhrase = "WRITE $ProductionProjectRef $Stage"
  if (-not $ConfirmProductionWrite -or $ConfirmationPhrase -cne $ExpectedPhrase) {
    throw "本脚本会写入生产。必须同时传入 -ConfirmProductionWrite 和精确确认短语：$ExpectedPhrase"
  }
}
if ($StartLocalProxyTunnel -and $LocalProxyTunnelPort -notin @(0, $DefaultTunnelPort)) {
  throw "内置生产代理隧道只允许固定 loopback 端口 $DefaultTunnelPort。"
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$BackupRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups\wp1-b'))
$ResolvedBackupDir = (Resolve-Path -LiteralPath $BackupDir).Path
$BackupPrefix = $BackupRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $ResolvedBackupDir.StartsWith($BackupPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw '拒绝执行：备份目录不在固定 WP1-B 根目录内。'
}

$BackupManifestPath = Join-Path $ResolvedBackupDir 'backup-manifest.json'
$ProductionAuditPath = Join-Path $ResolvedBackupDir 'production-audit-after.json'
foreach ($RequiredPath in @($BackupManifestPath, $ProductionAuditPath)) {
  if (-not (Test-Path -LiteralPath $RequiredPath -PathType Leaf)) {
    throw "缺少生产执行必需的备份证据：$RequiredPath"
  }
}

$BackupManifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $BackupManifestPath | ConvertFrom-Json
$BackupManifestValid = $BackupManifest.projectRef -eq $ProductionProjectRef -and $BackupManifest.productionStableDuringBackup -eq $true -and $BackupManifest.containsSensitiveData -eq $true
if (-not $BackupManifestValid) {
  throw '备份 manifest 的生产 ref、稳定性或敏感数据标记不符合执行要求。'
}
$CapturedAt = [DateTimeOffset]::Parse([string]$BackupManifest.capturedAt).ToUniversalTime()
$BackupAge = [DateTimeOffset]::UtcNow - $CapturedAt
if ($BackupAge.TotalMinutes -lt -5 -or $BackupAge.TotalHours -gt $MaxBackupAgeHours) {
  throw "生产备份已超出 $MaxBackupAgeHours 小时的新鲜度门，必须重新生成并验证备份。"
}

$Node = (Get-Command node -ErrorAction Stop).Source
& $Node (Join-Path $RepositoryRoot 'scripts\verify-wp1b-backup.mjs') `
  '--dir' $ResolvedBackupDir
if ($LASTEXITCODE -ne 0) { throw '最新生产备份未通过逐文件哈希验证。' }

$Credential = Get-Content -Raw -Encoding UTF8 -LiteralPath $CredentialPath | ConvertFrom-Json
$CredentialShapeMatches =
  $Credential.projectRef -eq $ProductionProjectRef -and
  $Credential.poolerHost -eq $ExpectedPoolerHost -and
  [int]$Credential.poolerPort -eq $ExpectedPoolerPort -and
  $Credential.database -eq $ExpectedDatabase -and
  $Credential.username -eq $ExpectedUsername
if (-not $CredentialShapeMatches -or [string]::IsNullOrWhiteSpace($Credential.databasePassword)) {
  throw '生产凭据的 ref、Pooler、数据库、用户名或密码不符合固定目标。'
}

$ProductionAudit = Get-Content -Raw -Encoding UTF8 -LiteralPath $ProductionAuditPath | ConvertFrom-Json
$PgBin = (Resolve-Path (Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin')).Path
$Psql = Join-Path $PgBin 'psql.exe'
$GateSql = Join-Path $RepositoryRoot 'supabase\wp1c-production-gate.sql'
$MigrationFileMap = @{
  '0008' = '0008_note_version_and_chapter_scope.sql'
  '0009' = '0009_planning_task_status.sql'
  '0010' = '0010_training_event_core.sql'
  '0011' = '0011_jobs_and_source_versions.sql'
  '0012' = '0012_private_note_default.sql'
  '0013' = '0013_boundary_policy_alignment.sql'
}

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

function Invoke-Scalar([string]$Sql) {
  $Rows = & $Psql '--dbname' $script:DatabaseParameters '--no-password' '--no-psqlrc' '--quiet' `
    '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' $Sql
  if ($LASTEXITCODE -ne 0) { throw '生产标量查询失败。' }
  return (($Rows | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Last 1) -join '').Trim()
}

function Test-DatabaseCandidate([string]$Parameters) {
  $Rows = & $Psql '--dbname' $Parameters '--no-password' '--no-psqlrc' '--quiet' `
    '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' `
    "select case when current_database()='$ExpectedDatabase' and current_user='postgres' then 'ok' else 'wrong-target' end;" 2>$null
  if ($LASTEXITCODE -ne 0) { return $false }
  return (($Rows -join '').Trim() -eq 'ok')
}

function Read-GateSnapshot {
  $Rows = & $Psql '--dbname' $script:DatabaseParameters '--no-password' '--no-psqlrc' '--quiet' `
    '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--file' $GateSql
  if ($LASTEXITCODE -ne 0) { throw '生产只读 gate 快照失败。' }
  $Json = (($Rows | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Last 1) -join '').Trim()
  try { $Gate = $Json | ConvertFrom-Json } catch { throw '生产 gate 没有返回合法 JSON。' }
  if ($Gate.identity.transactionReadOnly -ne $true) {
    throw '生产 gate 未处于数据库原生 READ ONLY 事务，拒绝接受证据。'
  }
  return $Gate
}

function Assert-BaselineMatchesBackup([object]$Gate) {
  $ExpectedCounts = @{
    notesTotal = [int64]$ProductionAudit.tables.notes.rowCount
    chaptersTotal = [int64]$ProductionAudit.tables.chapters.rowCount
    englishAttemptsTotal = [int64]$ProductionAudit.tables.english_attempts.rowCount
    englishAttemptAnswersTotal = [int64]$ProductionAudit.tables.english_attempt_answers.rowCount
    adminUsersTotal = [int64]$ProductionAudit.tables.admin_users.rowCount
  }
  foreach ($Name in $ExpectedCounts.Keys) {
    if ([int64]$Gate.baseline.$Name -ne $ExpectedCounts[$Name]) {
      throw "生产 gate 与最新备份行数不一致：$Name。必须停止并重新审计/备份。"
    }
  }
  $ExpectedChecksums = @{
    notesStableChecksum = [string]$ProductionAudit.tables.notes.checksum
    chaptersChecksum = [string]$ProductionAudit.tables.chapters.checksum
    englishAttemptsChecksum = [string]$ProductionAudit.tables.english_attempts.checksum
    englishAttemptAnswersChecksum = [string]$ProductionAudit.tables.english_attempt_answers.checksum
    adminUsersChecksum = [string]$ProductionAudit.tables.admin_users.checksum
  }
  foreach ($Name in $ExpectedChecksums.Keys) {
    if ([string]$Gate.baseline.$Name -cne $ExpectedChecksums[$Name]) {
      throw "生产 gate 与最新备份内容指纹不一致：$Name。必须停止并重新审计/备份。"
    }
  }
  if ([int64]$Gate.integrity.invalidChapterScopeRows -ne 0 -or [int64]$Gate.integrity.unmatchedAdminUsers -ne 0) {
    throw '生产 gate 发现 chapter scope 或管理员 Auth 对账异常。'
  }
}

function Assert-StagePrecondition([string]$TargetStage, [object]$Schema) {
  $Actual = @(
    [bool]$Schema.contentVersionReady,
    [bool]$Schema.planningReady,
    [bool]$Schema.trainingCoreReady,
    [bool]$Schema.jobsAndSourcesReady,
    [bool]$Schema.privateNoteDefaultReady,
    [bool]$Schema.boundaryAlignmentReady
  )
  $ExpectedBefore = @{
    '0008' = @($false, $false, $false, $false, $false, $false)
    '0009' = @($true,  $false, $false, $false, $false, $false)
    '0010' = @($true,  $true,  $false, $false, $false, $false)
    '0011' = @($true,  $true,  $true,  $false, $false, $false)
    '0012' = @($true,  $true,  $true,  $true,  $false, $false)
    '0013' = @($true,  $true,  $true,  $true,  $true,  $false)
  }
  $Expected = $ExpectedBefore[$TargetStage]
  for ($Index = 0; $Index -lt $Expected.Count; $Index += 1) {
    if ($Actual[$Index] -ne $Expected[$Index]) {
      throw "生产 schema 不处于 $TargetStage 的唯一允许前置状态，拒绝跳批、重放或在未知部分状态继续。"
    }
  }
}

function Assert-StageApplied([string]$TargetStage, [object]$Schema) {
  $Index = [int]$TargetStage - 8
  $Actual = @(
    [bool]$Schema.contentVersionReady,
    [bool]$Schema.planningReady,
    [bool]$Schema.trainingCoreReady,
    [bool]$Schema.jobsAndSourcesReady,
    [bool]$Schema.privateNoteDefaultReady,
    [bool]$Schema.boundaryAlignmentReady
  )
  if ($Index -lt 0 -or $Index -ge $Actual.Count -or -not $Actual[$Index]) {
    throw "生产迁移 $TargetStage 执行后没有形成预期 schema 状态。"
  }
}

function Assert-BaselineStable([object]$Before, [object]$After) {
  foreach ($Name in @(
    'notesTotal', 'notesPublished', 'notesPrivate', 'notesStableChecksum', 'publishedNoteIdsMd5',
    'chaptersTotal', 'chaptersChecksum', 'englishAttemptsTotal', 'englishAttemptsChecksum',
    'englishAttemptAnswersTotal', 'englishAttemptAnswersChecksum', 'adminUsersTotal', 'adminUsersChecksum'
  )) {
    if ([string]$Before.baseline.$Name -cne [string]$After.baseline.$Name) {
      throw "生产迁移前后基线发生非预期变化：$Name。停止后续批次。"
    }
  }
}

$TunnelProcess = $null
try {
  if ($StartLocalProxyTunnel) {
    $LocalProxyTunnelPort = $DefaultTunnelPort
    $TunnelProcess = Start-Process -FilePath $Node `
      -ArgumentList @((Join-Path $RepositoryRoot 'scripts\wp1b-pg-http-connect-tunnel.mjs'), 'production') `
      -WorkingDirectory $RepositoryRoot -WindowStyle Hidden -PassThru
    $TunnelReady = $false
    for ($Attempt = 0; $Attempt -lt 40; $Attempt += 1) {
      try {
        $Client = [System.Net.Sockets.TcpClient]::new()
        $Client.Connect('127.0.0.1', $LocalProxyTunnelPort)
        $Client.Dispose()
        $TunnelReady = $true
        break
      } catch { Start-Sleep -Milliseconds 250 }
    }
    if (-not $TunnelReady) { throw '生产 loopback 代理隧道未就绪。' }
  }

  $env:PGPASSWORD = $Credential.databasePassword
  if ($Stage -eq 'preflight') {
    $env:PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=60000'
  } else {
    $env:PGOPTIONS = '-c lock_timeout=5000 -c statement_timeout=120000'
  }

  $script:DatabaseParameters = $null
  if ($LocalProxyTunnelPort -gt 0) {
    $Candidate = New-DatabaseParameters '127.0.0.1' $LocalProxyTunnelPort
    $script:DatabaseParameters = $Candidate
  } else {
    $Addresses = [System.Net.Dns]::GetHostAddresses($ExpectedPoolerHost) |
      Where-Object { $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork } |
      ForEach-Object { $_.IPAddressToString } |
      Select-Object -Unique
    foreach ($Address in $Addresses) {
      $Candidate = New-DatabaseParameters $Address $ExpectedPoolerPort
      if (Test-DatabaseCandidate $Candidate) {
        $script:DatabaseParameters = $Candidate
        break
      }
    }
  }
  if ([string]::IsNullOrWhiteSpace($script:DatabaseParameters)) { throw '生产 Session Pooler 目标身份校验失败。' }

  $Identity = Invoke-Scalar "select case when current_database()='$ExpectedDatabase' and current_user='postgres' then 'ok' else 'wrong-target' end;"
  if ($Identity -ne 'ok') { throw '拒绝执行：当前数据库身份不是固定生产 postgres。' }

  $BeforeGate = Read-GateSnapshot
  Assert-BaselineMatchesBackup $BeforeGate
  $Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'

  if ($Stage -eq 'preflight') {
    $EvidencePath = Join-Path $ResolvedBackupDir "wp1-production-preflight-$Timestamp.json"
    $BeforeGate | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
    Write-Output "PreflightEvidence=$EvidencePath"
    Write-Output 'WP1 production read-only preflight passed; no migration was executed.'
    return
  }

  Assert-StagePrecondition $Stage $BeforeGate.schema
  $MigrationFile = $MigrationFileMap[$Stage]
  $MigrationPath = Join-Path $RepositoryRoot "supabase\migrations\$MigrationFile"
  $MigrationHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $MigrationPath).Hash.ToLowerInvariant()
  & $Psql '--dbname' $script:DatabaseParameters '--no-password' '--no-psqlrc' `
    '--set' 'ON_ERROR_STOP=1' '--file' $MigrationPath
  if ($LASTEXITCODE -ne 0) { throw "生产迁移失败：$MigrationFile。停止后续批次。" }

  $AfterGate = Read-GateSnapshot
  $Evidence = [ordered]@{
    evidenceVersion = 1
    stage = $Stage
    projectRef = $ProductionProjectRef
    migrationFile = $MigrationFile
    migrationSha256 = $MigrationHash
    backupCapturedAt = $BackupManifest.capturedAt
    completedAt = [DateTimeOffset]::UtcNow.ToString('o')
    postCommitGatePassed = $false
    postCommitGateError = $null
    before = $BeforeGate
    after = $AfterGate
  }
  $EvidencePath = Join-Path $ResolvedBackupDir "wp1-production-$Stage-$Timestamp.json"
  try {
    Assert-BaselineStable $BeforeGate $AfterGate
    Assert-StageApplied $Stage $AfterGate.schema
    $Evidence['postCommitGatePassed'] = $true
  } catch {
    $Evidence['postCommitGateError'] = $_.Exception.Message
    $Evidence | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
    Write-Output "PostCommitFailureEvidence=$EvidencePath"
    throw
  }
  $Evidence | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
  Write-Output "MigrationEvidence=$EvidencePath"
  Write-Output "WP1 production stage $Stage passed. Stop here and review evidence before authorizing the next stage."
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue
  $script:DatabaseParameters = $null
  if ($null -ne $TunnelProcess -and -not $TunnelProcess.HasExited) {
    Stop-Process -Id $TunnelProcess.Id -Force -ErrorAction SilentlyContinue
  }
}
