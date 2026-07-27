[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupDir,
  [ValidateSet(
    'preflight',
    'apply-preview',
    'apply',
    'apply-reconcile',
    'postflight',
    'rollback-preview',
    'rollback',
    'rollback-postflight'
  )]
  [string]$Stage = 'preflight',
  [string]$ProposalPath = (Join-Path $PSScriptRoot '..\.local-backups\wp2-markdown-review\wp2-2026-07-12-8e6425fc\production-single-proposal.json'),
  [string]$PreflightEvidencePath = '',
  [string]$ApplyEvidencePath = '',
  [string]$RollbackEvidencePath = '',
  [string]$PriorBatchPostflightEvidencePath = '',
  [string]$CredentialPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-production-db-credential.json'),
  [ValidateRange(1, 24)]
  [int]$MaxBackupAgeHours = 4,
  [switch]$ConfirmProductionRead,
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
$LocalTunnelPort = 15432
$ReadStages = @('preflight', 'apply-reconcile', 'postflight', 'rollback-postflight')
$WriteStages = @('apply-preview', 'apply', 'rollback-preview', 'rollback')
$ConfirmationPhrases = @{
  preflight = "READ $ProductionProjectRef WP2 SINGLE PREFLIGHT"
  'apply-preview' = "PREVIEW $ProductionProjectRef WP2 SINGLE APPLY"
  apply = "COMMIT $ProductionProjectRef WP2 SINGLE APPLY"
  'apply-reconcile' = "READ $ProductionProjectRef WP2 SINGLE APPLY RECONCILE"
  postflight = "READ $ProductionProjectRef WP2 SINGLE POSTFLIGHT"
  'rollback-preview' = "PREVIEW $ProductionProjectRef WP2 SINGLE ROLLBACK"
  rollback = "COMMIT $ProductionProjectRef WP2 SINGLE ROLLBACK"
  'rollback-postflight' = "READ $ProductionProjectRef WP2 SINGLE ROLLBACK POSTFLIGHT"
}

if ($ProductionProjectRef -eq $ShadowProjectRef) {
  throw '生产 ref 与 fixed Shadow ref 相同，执行器已停止。'
}
$ExpectedPhrase = [string]$ConfirmationPhrases[$Stage]
if ($Stage -in $ReadStages -and (-not $ConfirmProductionRead -or $ConfirmationPhrase -cne $ExpectedPhrase)) {
  throw "生产只读阶段需要 -ConfirmProductionRead 和精确确认短语：$ExpectedPhrase"
}
if ($Stage -in $WriteStages -and (-not $ConfirmProductionWrite -or $ConfirmationPhrase -cne $ExpectedPhrase)) {
  throw "生产写入阶段需要 -ConfirmProductionWrite 和精确确认短语：$ExpectedPhrase"
}
if ($Stage -ne 'preflight' -and [string]::IsNullOrWhiteSpace($PreflightEvidencePath)) {
  throw '该阶段必须提供已归档的生产单字段 preflight 证据。'
}
if ($Stage -in @('postflight', 'rollback-preview', 'rollback', 'rollback-postflight') -and [string]::IsNullOrWhiteSpace($ApplyEvidencePath)) {
  throw '该阶段必须提供已归档的生产单字段 apply 证据。'
}
if ($Stage -eq 'rollback-postflight' -and [string]::IsNullOrWhiteSpace($RollbackEvidencePath)) {
  throw 'rollback-postflight 必须提供已归档的生产单字段 rollback 证据。'
}
if ($Stage -ne 'preflight' -and -not [string]::IsNullOrWhiteSpace($PriorBatchPostflightEvidencePath)) {
  throw '上一条批次 postflight 证据只允许用于下一条 preflight。'
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$BackupRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups\wp1-b'))
$ProposalRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups\wp2-markdown-review\wp2-2026-07-12-8e6425fc'))

function Get-StringSha256([string]$Value) {
  $Utf8 = [System.Text.UTF8Encoding]::new($false)
  $Hasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    return [Convert]::ToHexString($Hasher.ComputeHash($Utf8.GetBytes($Value))).ToLowerInvariant()
  } finally {
    $Hasher.Dispose()
  }
}

function Read-JsonFile([string]$Path, [string]$Label) {
  if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "$Label 文件缺失：$Path"
  }
  try {
    return Get-Content -Raw -Encoding UTF8 -LiteralPath $Path | ConvertFrom-Json -Depth 100
  } catch {
    throw "$Label 不是有效 JSON：$Path"
  }
}

function Assert-PathInsideRoot([string]$Path, [string]$Root, [string]$Label) {
  $ResolvedPath = (Resolve-Path -LiteralPath $Path).Path
  $ResolvedRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
  $Prefix = $ResolvedRoot + [System.IO.Path]::DirectorySeparatorChar
  if (-not $ResolvedPath.StartsWith($Prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "$Label 必须位于固定目录：$ResolvedRoot"
  }
  return $ResolvedPath
}

$ResolvedProposalPath = Assert-PathInsideRoot $ProposalPath $ProposalRoot '生产单字段提案'
$ProposalText = Get-Content -Raw -Encoding UTF8 -LiteralPath $ResolvedProposalPath
$Proposal = $ProposalText | ConvertFrom-Json -Depth 100
$ProposalSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $ResolvedProposalPath).Hash.ToLowerInvariant()
$ProposalKind = if ($Proposal.PSObject.Properties.Name -contains 'proposalKind') { [string]$Proposal.proposalKind } else { 'ai-repair' }

if (
  [int]$Proposal.packageVersion -ne 1 -or
  [string]$Proposal.status -cne 'pending_production_preflight' -or
  [string]$Proposal.productionProjectRef -cne $ProductionProjectRef -or
  [string]$Proposal.forbiddenShadowProjectRef -cne $ShadowProjectRef
) {
  throw '生产单字段提案的版本、状态或项目边界不匹配。'
}
if (
  [string]$Proposal.noteId -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' -or
  [string]$Proposal.fieldPath -notmatch '^(content|problems\.[0-9]+\.(question|answer|explanation|tips)|problems\.[0-9]+\.options\.[0-9]+\.content)$'
) {
  throw '生产单字段提案的 noteId 或 fieldPath 不受支持。'
}
if (
  [string]$Proposal.beforeChecksum -notmatch '^[0-9a-f]{64}$' -or
  (Get-StringSha256 ([string]$Proposal.beforeText)) -cne [string]$Proposal.beforeChecksum
) {
  throw '生产单字段提案 before checksum 与文本不一致。'
}
if (
  [string]$Proposal.afterChecksum -notmatch '^[0-9a-f]{64}$' -or
  (Get-StringSha256 ([string]$Proposal.afterText)) -cne [string]$Proposal.afterChecksum
) {
  throw '生产单字段提案 after checksum 与文本不一致。'
}
if ([string]$Proposal.beforeChecksum -ceq [string]$Proposal.afterChecksum) {
  throw '生产单字段提案前后 checksum 相同。'
}
if (
  [string]$Proposal.applyBatchId -notmatch '^wp2-production-single-[0-9a-f]{12}$' -or
  [string]$Proposal.rollbackBatchId -notmatch '^wp2-production-single-rollback-[0-9a-f]{12}$' -or
  [string]$Proposal.applyBatchId -ceq [string]$Proposal.rollbackBatchId -or
  [string]$Proposal.applyBatchId -like 'wp2-shadow-*' -or
  [string]$Proposal.rollbackBatchId -like 'wp2-shadow-*'
) {
  throw '生产 batch 契约无效或复用了 Shadow batch。'
}
if ($ProposalKind -eq 'ui-correction') {
  if (
    $Proposal.aiInvolved -ne $false -or
    -not [string]::IsNullOrWhiteSpace([string]$Proposal.aiProvider) -or
    -not [string]::IsNullOrWhiteSpace([string]$Proposal.aiModel) -or
    -not [string]::IsNullOrWhiteSpace([string]$Proposal.aiRequestId) -or
    [string]$Proposal.validationStatus -cne 'human_approved' -or
    $Proposal.validationDetail.localRendererVerified -ne $true -or
    $Proposal.validationDetail.visibleHashArtifactFound -ne $true -or
    $Proposal.validationDetail.shadowTransactionPreviewVerified -ne $true -or
    $Proposal.validationDetail.productionSnapshotFoundationVerified -ne $true -or
    [string]$Proposal.sourceApplyEvidenceSha256 -cne 'c95ea4a208bfc5ccae27c1e783a7c3d8f8f62c7f49ef0fee29235dbe27ba02aa' -or
    [int64]$Proposal.expectedPriorFieldRows -ne 1
  ) {
    throw '生产 UI 修正提案的本地渲染、人审、Shadow 事务预演或 0015 证据契约不完整。'
  }
} elseif ($ProposalKind -eq 'ai-repair') {
  if (
    $Proposal.aiInvolved -ne $true -or
    [string]$Proposal.aiProvider -cne 'deepseek' -or
    [string]$Proposal.aiModel -cne 'deepseek-v4-pro' -or
    [string]$Proposal.validationStatus -cne 'human_approved' -or
    $Proposal.validationDetail.shadowCommitVerified -ne $true -or
    $Proposal.validationDetail.productionSnapshotFoundationVerified -ne $true
  ) {
    throw '生产提案的 AI、人审或 Shadow/0015 证据契约不完整。'
  }
} else {
  throw '生产单字段提案 proposalKind 不受支持。'
}

$PriorBatchPostflightEvidence = $null
$PriorBatchPostflightEvidenceSha256 = $null
if (-not [string]::IsNullOrWhiteSpace($PriorBatchPostflightEvidencePath)) {
  $PriorBatchPostflightEvidence = Read-JsonFile $PriorBatchPostflightEvidencePath '上一条批次 postflight 证据'
  if (
    [string]$PriorBatchPostflightEvidence.stage -cne 'postflight' -or
    [string]$PriorBatchPostflightEvidence.projectRef -cne $ProductionProjectRef -or
    $PriorBatchPostflightEvidence.productionConnected -ne $true -or
    $PriorBatchPostflightEvidence.productionWritePerformed -ne $false -or
    $null -eq $PriorBatchPostflightEvidence.baseline
  ) {
    throw '上一条批次 postflight 证据与生产批次链不匹配。'
  }
  $ResolvedPriorBatchPostflightEvidencePath = Assert-PathInsideRoot `
    $PriorBatchPostflightEvidencePath $BackupRoot '上一条批次 postflight 证据'
  $PriorBatchPostflightEvidenceSha256 = (
    Get-FileHash -Algorithm SHA256 -LiteralPath $ResolvedPriorBatchPostflightEvidencePath
  ).Hash.ToLowerInvariant()
}

$PreflightEvidence = $null
$PreflightEvidenceSha256 = $null
$ExpectedContentVersion = [int64]0
if ($Stage -ne 'preflight') {
  $PreflightEvidence = Read-JsonFile $PreflightEvidencePath '生产单字段 preflight 证据'
  if (
    [string]$PreflightEvidence.stage -cne 'preflight' -or
    [string]$PreflightEvidence.projectRef -cne $ProductionProjectRef -or
    [string]$PreflightEvidence.proposalSha256 -cne $ProposalSha256 -or
    $PreflightEvidence.productionWritePerformed -ne $false
  ) {
    throw '生产单字段 preflight 证据与当前提案或生产项目不匹配。'
  }
  $ExpectedContentVersion = [int64]$PreflightEvidence.expectedContentVersion
  if ($ExpectedContentVersion -lt 1) {
    throw '生产单字段 preflight 证据缺少正数 expected content version。'
  }
  if (
    [string]$PreflightEvidence.targetState.fieldChecksum -cne [string]$Proposal.beforeChecksum -or
    [int64]$PreflightEvidence.targetState.contentVersion -ne $ExpectedContentVersion -or
    [int64]$PreflightEvidence.targetState.targetCount -ne 1
  ) {
    throw '生产单字段 preflight 证据的 checksum、version 或目标行数不一致。'
  }
  $ResolvedPreflightEvidencePath = Assert-PathInsideRoot $PreflightEvidencePath $BackupRoot '生产单字段 preflight 证据'
  $PreflightEvidenceSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $ResolvedPreflightEvidencePath).Hash.ToLowerInvariant()
}

$ApplyEvidence = $null
$ApplyEvidenceSha256 = $null
$ApplySnapshotId = '00000000-0000-0000-0000-000000000000'
if ($Stage -in @('postflight', 'rollback-preview', 'rollback', 'rollback-postflight')) {
  $ApplyEvidence = Read-JsonFile $ApplyEvidencePath '生产单字段 apply 证据'
  if (
    [string]$ApplyEvidence.stage -cne 'apply' -or
    [string]$ApplyEvidence.projectRef -cne $ProductionProjectRef -or
    [string]$ApplyEvidence.proposalSha256 -cne $ProposalSha256 -or
    [string]$ApplyEvidence.preflightEvidenceSha256 -cne $PreflightEvidenceSha256 -or
    $ApplyEvidence.productionWritePerformed -ne $true
  ) {
    throw '生产单字段 apply 证据与当前提案、preflight 或生产项目不匹配。'
  }
  $ApplySnapshotId = [string]$ApplyEvidence.afterState.applySnapshotId
  if (
    $ApplySnapshotId -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' -or
    [int64]$ApplyEvidence.afterState.contentVersion -ne ($ExpectedContentVersion + 1) -or
    [string]$ApplyEvidence.afterState.fieldChecksum -cne [string]$Proposal.afterChecksum
  ) {
    throw '生产单字段 apply 证据缺少有效 snapshot、version 或 after checksum。'
  }
  $ResolvedApplyEvidencePath = Assert-PathInsideRoot $ApplyEvidencePath $BackupRoot '生产单字段 apply 证据'
  $ApplyEvidenceSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $ResolvedApplyEvidencePath).Hash.ToLowerInvariant()
}

$RollbackEvidence = $null
$RollbackEvidenceSha256 = $null
if ($Stage -eq 'rollback-postflight') {
  $RollbackEvidence = Read-JsonFile $RollbackEvidencePath '生产单字段 rollback 证据'
  if (
    [string]$RollbackEvidence.stage -cne 'rollback' -or
    [string]$RollbackEvidence.projectRef -cne $ProductionProjectRef -or
    [string]$RollbackEvidence.proposalSha256 -cne $ProposalSha256 -or
    [string]$RollbackEvidence.preflightEvidenceSha256 -cne $PreflightEvidenceSha256 -or
    [string]$RollbackEvidence.applyEvidenceSha256 -cne $ApplyEvidenceSha256 -or
    $RollbackEvidence.productionWritePerformed -ne $true -or
    [int64]$RollbackEvidence.afterState.contentVersion -ne ($ExpectedContentVersion + 2) -or
    [string]$RollbackEvidence.afterState.fieldChecksum -cne [string]$Proposal.beforeChecksum
  ) {
    throw '生产单字段 rollback 证据与当前提案或版本链不匹配。'
  }
  $ResolvedRollbackEvidencePath = Assert-PathInsideRoot $RollbackEvidencePath $BackupRoot '生产单字段 rollback 证据'
  $RollbackEvidenceSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $ResolvedRollbackEvidencePath).Hash.ToLowerInvariant()
}

$ResolvedBackupDir = (Resolve-Path -LiteralPath $BackupDir).Path
$BackupPrefix = $BackupRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $ResolvedBackupDir.StartsWith($BackupPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw '生产备份目录位于固定 WP1-B 备份根目录之外。'
}
$BackupManifestPath = Join-Path $ResolvedBackupDir 'backup-manifest.json'
$ProductionAuditPath = Join-Path $ResolvedBackupDir 'production-audit-after.json'
foreach ($RequiredPath in @($BackupManifestPath, $ProductionAuditPath, $CredentialPath)) {
  if (-not (Test-Path -LiteralPath $RequiredPath -PathType Leaf)) {
    throw "生产阶段所需文件缺失：$RequiredPath"
  }
}
$BackupManifest = Read-JsonFile $BackupManifestPath '生产备份 manifest'
if (
  [string]$BackupManifest.projectRef -cne $ProductionProjectRef -or
  $BackupManifest.productionStableDuringBackup -ne $true -or
  $BackupManifest.containsSensitiveData -ne $true
) {
  throw '生产备份 manifest 与固定、稳定、敏感备份契约不匹配。'
}
$CapturedAt = [DateTimeOffset]::Parse([string]$BackupManifest.capturedAt).ToUniversalTime()
$BackupAge = [DateTimeOffset]::UtcNow - $CapturedAt
if ($BackupAge.TotalMinutes -lt -5 -or $BackupAge.TotalHours -gt $MaxBackupAgeHours) {
  throw "生产备份已超出 $MaxBackupAgeHours 小时新鲜度门。"
}

$Node = (Get-Command node -ErrorAction Stop).Source
& $Node (Join-Path $RepositoryRoot 'scripts\verify-wp1b-backup.mjs') '--dir' $ResolvedBackupDir
if ($LASTEXITCODE -ne 0) {
  throw '生产备份未通过 manifest、SHA-256 或稳定审计验证。'
}

$Credential = Read-JsonFile $CredentialPath '生产数据库凭证'
if (
  [string]$Credential.projectRef -cne $ProductionProjectRef -or
  [string]$Credential.poolerHost -cne $ExpectedPoolerHost -or
  [int]$Credential.poolerPort -ne $ExpectedPoolerPort -or
  [string]$Credential.database -cne $ExpectedDatabase -or
  [string]$Credential.username -cne $ExpectedUsername -or
  [string]::IsNullOrWhiteSpace([string]$Credential.databasePassword)
) {
  throw '生产数据库凭证的项目、Pooler、数据库、用户名或密码形状不匹配。'
}

$ProductionAudit = Read-JsonFile $ProductionAuditPath '生产备份后审计'
$PgBin = (Resolve-Path (Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin')).Path
$Psql = Join-Path $PgBin 'psql.exe'
$TunnelScript = Join-Path $RepositoryRoot 'scripts\wp1b-pg-http-connect-tunnel.mjs'
$GateSql = Join-Path $RepositoryRoot 'supabase\wp1c-production-gate.sql'
$DatabaseParameters = @(
  "host=$ExpectedPoolerHost",
  'hostaddr=127.0.0.1',
  "port=$LocalTunnelPort",
  "dbname=$ExpectedDatabase",
  "user=$ExpectedUsername",
  'sslmode=require',
  'connect_timeout=10'
) -join ' '

$ValidationDetail = $Proposal.validationDetail | ConvertTo-Json -Compress -Depth 30
$RollbackValidationDetail = '{"reason":"production-single-user-approved-rollback"}'
$BeforeTextBase64 = [Convert]::ToBase64String(
  [System.Text.Encoding]::UTF8.GetBytes([string]$Proposal.beforeText)
)
$AfterTextBase64 = [Convert]::ToBase64String(
  [System.Text.Encoding]::UTF8.GetBytes([string]$Proposal.afterText)
)
$PsqlVariables = @(
  "--set=note_id=$($Proposal.noteId)",
  "--set=field_path=$($Proposal.fieldPath)",
  "--set=before_text_base64=$BeforeTextBase64",
  "--set=before_checksum=$($Proposal.beforeChecksum)",
  "--set=after_checksum=$($Proposal.afterChecksum)",
  "--set=after_text_base64=$AfterTextBase64",
  "--set=rule_version=$($Proposal.ruleVersion)",
  "--set=ai_involved=$(([bool]$Proposal.aiInvolved).ToString().ToLowerInvariant())",
  "--set=ai_provider=$($Proposal.aiProvider)",
  "--set=ai_model=$($Proposal.aiModel)",
  "--set=ai_request_id=$($Proposal.aiRequestId)",
  "--set=validation_detail=$ValidationDetail",
  "--set=rollback_validation_detail=$RollbackValidationDetail",
  "--set=apply_batch_id=$($Proposal.applyBatchId)",
  "--set=rollback_batch_id=$($Proposal.rollbackBatchId)",
  "--set=expected_version=$ExpectedContentVersion",
  "--set=apply_snapshot_id=$ApplySnapshotId"
)

function Invoke-PsqlJson([string]$Sql, [switch]$AllowTransientRetry) {
  $Arguments = @(
    '--dbname', $DatabaseParameters,
    '--no-password',
    '--no-psqlrc',
    '--quiet',
    '--tuples-only',
    '--no-align',
    '--set=ON_ERROR_STOP=1'
  ) + $PsqlVariables
  $MaxAttempts = if ($AllowTransientRetry) { 3 } else { 1 }
  for ($Attempt = 1; $Attempt -le $MaxAttempts; $Attempt += 1) {
    $Rows = $Sql | & $Psql @Arguments
    if ($LASTEXITCODE -eq 0) {
      $JsonLine = $Rows | Where-Object {
        -not [string]::IsNullOrWhiteSpace($_) -and $_.TrimStart().StartsWith('{')
      } | Select-Object -Last 1
      if ([string]::IsNullOrWhiteSpace([string]$JsonLine)) {
        throw '固定生产 WP2 单字段 SQL 没有返回 JSON 证据。'
      }
      try {
        return [string]$JsonLine | ConvertFrom-Json -Depth 100
      } catch {
        throw '固定生产 WP2 单字段 SQL 返回了无效 JSON。'
      }
    }
    if ($Attempt -lt $MaxAttempts) { Start-Sleep -Milliseconds (500 * $Attempt) }
  }
  throw '固定生产 WP2 单字段 SQL 执行失败。'
}

function Read-Wp1GateSnapshot {
  $Rows = $null
  $Succeeded = $false
  for ($Attempt = 1; $Attempt -le 3; $Attempt += 1) {
    $Rows = & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--quiet' `
      '--tuples-only' '--no-align' '--set=ON_ERROR_STOP=1' '--file' $GateSql
    if ($LASTEXITCODE -eq 0) {
      $Succeeded = $true
      break
    }
    if ($Attempt -lt 3) { Start-Sleep -Milliseconds (500 * $Attempt) }
  }
  if (-not $Succeeded) { throw '生产稳定基线查询失败。' }
  $JsonLine = (($Rows | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Last 1) -join '').Trim()
  try {
    $Gate = $JsonLine | ConvertFrom-Json -Depth 100
  } catch {
    throw '生产稳定基线返回了无效 JSON。'
  }
  if ($Gate.identity.transactionReadOnly -ne $true) {
    throw '生产稳定基线没有运行在原生只读事务中。'
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
      throw "生产基线行数与新鲜备份不一致：$Name"
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
      throw "生产基线 checksum 与新鲜备份不一致：$Name"
    }
  }
  if (
    [int64]$Gate.integrity.invalidChapterScopeRows -ne 0 -or
    [int64]$Gate.integrity.unmatchedAdminUsers -ne 0 -or
    $Gate.schema.contentVersionReady -ne $true -or
    $Gate.schema.boundaryAlignmentReady -ne $true
  ) {
    throw '生产基线存在完整性、content_version 或边界对齐异常。'
  }
}

function Assert-BaselineStableExceptAuthorizedTarget(
  [object]$Before,
  [object]$After,
  [ValidateSet('apply', 'rollback')][string]$OperationKind
) {
  $ExpectedNotesAtVersionOne = [int64]$Before.baseline.notesAtVersionOne
  if ($OperationKind -eq 'apply' -and $ExpectedContentVersion -eq 1) {
    $ExpectedNotesAtVersionOne -= 1
  }
  if ([int64]$After.baseline.notesAtVersionOne -ne $ExpectedNotesAtVersionOne) {
    throw '单字段操作没有产生唯一允许的 notesAtVersionOne 精确变化。'
  }
  foreach ($Property in $Before.baseline.psobject.Properties) {
    if ($Property.Name -in @('notesStableChecksum', 'notesAtVersionOne')) { continue }
    if ([string]$Property.Value -cne [string]$After.baseline.($Property.Name)) {
      throw "单字段操作改变了受保护生产基线：$($Property.Name)"
    }
  }
  if (
    ($Before.integrity | ConvertTo-Json -Compress -Depth 20) -cne ($After.integrity | ConvertTo-Json -Compress -Depth 20) -or
    ($Before.schema | ConvertTo-Json -Compress -Depth 20) -cne ($After.schema | ConvertTo-Json -Compress -Depth 20)
  ) {
    throw '单字段操作改变了生产完整性或 schema 指纹。'
  }
}

function Assert-BaselineMatchesArchivedApply([object]$Current, [object]$Archived) {
  foreach ($Property in $Archived.baseline.psobject.Properties) {
    if ([string]$Current.baseline.($Property.Name) -cne [string]$Property.Value) {
      throw "生产当前基线与已归档 apply 后验不一致：$($Property.Name)"
    }
  }
  if (
    ($Current.integrity | ConvertTo-Json -Compress -Depth 20) -cne ($Archived.integrity | ConvertTo-Json -Compress -Depth 20) -or
    ($Current.schema | ConvertTo-Json -Compress -Depth 20) -cne ($Archived.schema | ConvertTo-Json -Compress -Depth 20)
  ) {
    throw '生产当前完整性或 schema 与已归档 apply 后验不一致。'
  }
}

$StateSql = @'
begin transaction read only;
with path_shape as (
  select
    regexp_match(:'field_path', '^problems\.([0-9]+)\.(question|answer|explanation|tips)$') as direct_match,
    regexp_match(:'field_path', '^problems\.([0-9]+)\.options\.([0-9]+)\.content$') as option_match
), target as (
  select
    note.id,
    note.content_version,
    private.content_sha256(private.read_note_markdown_field(note.content, note.problems, :'field_path')) as field_checksum,
    case
      when :'field_path' = 'content' then
        (to_jsonb(note) - 'updated_at' - 'content_version' - 'content')
          || jsonb_build_object('content', '__WP2_AUTHORIZED_TARGET__')
      when path_shape.direct_match is not null then
        (to_jsonb(note) - 'updated_at' - 'content_version' - 'problems')
          || jsonb_build_object(
            'problems',
            jsonb_set(
              note.problems,
              array[path_shape.direct_match[1], path_shape.direct_match[2]],
              to_jsonb('__WP2_AUTHORIZED_TARGET__'::text),
              false
            )
          )
      when path_shape.option_match is not null then
        (to_jsonb(note) - 'updated_at' - 'content_version' - 'problems')
          || jsonb_build_object(
            'problems',
            jsonb_set(
              note.problems,
              array[path_shape.option_match[1], 'options', path_shape.option_match[2], 'content'],
              to_jsonb('__WP2_AUTHORIZED_TARGET__'::text),
              false
            )
          )
      else null
    end as invariant_json
  from public.notes note
  cross join path_shape
  where note.id = :'note_id'::uuid
), apply_snapshot as (
  select snapshot.*
  from public.content_migration_snapshots snapshot
  where snapshot.note_id = :'note_id'::uuid
    and snapshot.field_path = :'field_path'
    and snapshot.batch_id = :'apply_batch_id'
), rollback_snapshot as (
  select snapshot.*
  from public.content_migration_snapshots snapshot
  where snapshot.note_id = :'note_id'::uuid
    and snapshot.field_path = :'field_path'
    and snapshot.batch_id = :'rollback_batch_id'
)
select jsonb_build_object(
  'identityOk', current_database() = 'postgres' and current_user = 'postgres',
  'snapshotTable', to_regclass('public.content_migration_snapshots') is not null,
  'applyFunction', to_regprocedure('public.apply_content_migration(uuid,text,text,text,bigint,text,text,text,boolean,text,text,text,text,jsonb)') is not null,
  'rollbackFunction', to_regprocedure('public.rollback_content_migration(uuid,text,bigint,jsonb)') is not null,
  'adminCount', (select count(*) from public.admin_users),
  'adminAuthCount', (
    select count(*) from public.admin_users admin_user
    join auth.users auth_user on lower(auth_user.email) = lower(admin_user.email)
  ),
  'targetCount', (select count(*) from target),
  'contentVersion', coalesce((select content_version from target), 0),
  'fieldChecksum', coalesce((select field_checksum from target), ''),
  'targetInvariantMd5', coalesce((select md5(invariant_json::text) from target), ''),
  'nonTargetNotesMd5', coalesce((
    select md5(string_agg(to_jsonb(note_row)::text, chr(30) order by note_row.id))
    from public.notes note_row where note_row.id <> :'note_id'::uuid
  ), ''),
  'snapshotCount', (select count(*) from public.content_migration_snapshots),
  'fieldRows', (
    select count(*) from public.content_migration_snapshots
    where note_id = :'note_id'::uuid and field_path = :'field_path'
  ),
  'applyBatchRows', (select count(*) from apply_snapshot),
  'rollbackBatchRows', (select count(*) from rollback_snapshot),
  'applySnapshotId', coalesce((select id::text from apply_snapshot), ''),
  'rollbackSnapshotId', coalesce((select id::text from rollback_snapshot), ''),
  'applyVersionBefore', coalesce((select note_content_version_before from apply_snapshot), 0),
  'applyVersionAfter', coalesce((select note_content_version_after from apply_snapshot), 0),
  'rollbackVersionBefore', coalesce((select note_content_version_before from rollback_snapshot), 0),
  'rollbackVersionAfter', coalesce((select note_content_version_after from rollback_snapshot), 0),
  'applyExact', coalesce((
    select operation_kind = 'migration'
      and reverts_snapshot_id is null
      and rule_version = :'rule_version'
      and before_text = convert_from(decode(:'before_text_base64', 'base64'), 'UTF8')
      and after_text = convert_from(decode(:'after_text_base64', 'base64'), 'UTF8')
      and before_checksum = :'before_checksum'
      and after_checksum = :'after_checksum'
      and ai_involved = :'ai_involved'::boolean
      and ai_provider is not distinct from nullif(:'ai_provider', '')
      and ai_model is not distinct from nullif(:'ai_model', '')
      and ai_request_id is not distinct from nullif(:'ai_request_id', '')
      and validation_status = 'human_approved'
      and validation_detail = :'validation_detail'::jsonb
    from apply_snapshot
  ), false),
  'rollbackExact', coalesce((
    select operation_kind = 'rollback'
      and reverts_snapshot_id = (select id from apply_snapshot)
      and rule_version = :'rule_version'
      and before_text = convert_from(decode(:'after_text_base64', 'base64'), 'UTF8')
      and after_text = convert_from(decode(:'before_text_base64', 'base64'), 'UTF8')
      and before_checksum = :'after_checksum'
      and after_checksum = :'before_checksum'
      and not ai_involved
      and validation_status = 'rollback_verified'
      and (validation_detail - 'revertsSnapshotId') = :'rollback_validation_detail'::jsonb
    from rollback_snapshot
  ), false),
  'rollbackLinksApply', coalesce((
    select rollback.reverts_snapshot_id = apply.id
    from rollback_snapshot rollback cross join apply_snapshot apply
  ), false)
)::text;
rollback;
'@

$AdminClaimSql = @'
do $$
begin
  if (
    select count(*) from public.admin_users admin_user
    join auth.users auth_user on lower(auth_user.email) = lower(admin_user.email)
  ) <> 1 then
    raise exception 'fixed production must contain exactly one joined admin auth user';
  end if;
end
$$;
select set_config(
  'request.jwt.claim.sub',
  (
    select auth_user.id::text from public.admin_users admin_user
    join auth.users auth_user on lower(auth_user.email) = lower(admin_user.email)
    limit 1
  ),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  (
    select jsonb_build_object(
      'sub', auth_user.id,
      'email', admin_user.email,
      'role', 'authenticated'
    )::text
    from public.admin_users admin_user
    join auth.users auth_user on lower(auth_user.email) = lower(admin_user.email)
    limit 1
  ),
  true
);
'@

$ApplyMutationSqlTemplate = @"
begin;
$AdminClaimSql
create temp table wp2_before on commit drop as
select note.content_version,
  private.content_sha256(private.read_note_markdown_field(note.content, note.problems, :'field_path')) as field_checksum,
  (select count(*) from public.content_migration_snapshots) as snapshot_count
from public.notes note where note.id = :'note_id'::uuid;
create temp table wp2_apply on commit drop as
select id, note_content_version_before, note_content_version_after
from public.apply_content_migration(
  :'note_id'::uuid,
  :'field_path',
  :'apply_batch_id',
  :'rule_version',
  :'expected_version'::bigint,
  :'before_checksum',
  convert_from(decode(:'after_text_base64', 'base64'), 'UTF8'),
  :'after_checksum',
  :'ai_involved'::boolean,
  nullif(:'ai_provider', ''),
  nullif(:'ai_model', ''),
  nullif(:'ai_request_id', ''),
  'human_approved',
  :'validation_detail'::jsonb
);
create temp table wp2_after on commit drop as
select note.content_version,
  private.content_sha256(private.read_note_markdown_field(note.content, note.problems, :'field_path')) as field_checksum,
  (select count(*) from public.content_migration_snapshots) as snapshot_count
from public.notes note where note.id = :'note_id'::uuid;
select jsonb_build_object(
  'applyRows', (select count(*) from wp2_apply),
  'snapshotId', (select id::text from wp2_apply),
  'versionBefore', (select note_content_version_before from wp2_apply),
  'versionAfter', (select note_content_version_after from wp2_apply),
  'afterMatches', (select field_checksum = :'after_checksum' from wp2_after),
  'snapshotDelta', (select after.snapshot_count - before.snapshot_count from wp2_after after cross join wp2_before before)
)::text;
__END_TRANSACTION__;
"@

$RollbackMutationSqlTemplate = @"
begin;
$AdminClaimSql
create temp table wp2_before on commit drop as
select note.content_version,
  private.content_sha256(private.read_note_markdown_field(note.content, note.problems, :'field_path')) as field_checksum,
  (select count(*) from public.content_migration_snapshots) as snapshot_count
from public.notes note where note.id = :'note_id'::uuid;
create temp table wp2_rollback on commit drop as
select id, reverts_snapshot_id, note_content_version_before, note_content_version_after
from public.rollback_content_migration(
  :'apply_snapshot_id'::uuid,
  :'rollback_batch_id',
  (:'expected_version'::bigint + 1),
  :'rollback_validation_detail'::jsonb
);
create temp table wp2_after on commit drop as
select note.content_version,
  private.content_sha256(private.read_note_markdown_field(note.content, note.problems, :'field_path')) as field_checksum,
  (select count(*) from public.content_migration_snapshots) as snapshot_count
from public.notes note where note.id = :'note_id'::uuid;
select jsonb_build_object(
  'rollbackRows', (select count(*) from wp2_rollback),
  'snapshotId', (select id::text from wp2_rollback),
  'revertsApply', (select reverts_snapshot_id = :'apply_snapshot_id'::uuid from wp2_rollback),
  'versionBefore', (select note_content_version_before from wp2_rollback),
  'versionAfter', (select note_content_version_after from wp2_rollback),
  'restoredBefore', (select field_checksum = :'before_checksum' from wp2_after),
  'snapshotDelta', (select after.snapshot_count - before.snapshot_count from wp2_after after cross join wp2_before before)
)::text;
__END_TRANSACTION__;
"@

function Assert-ObjectsReady([object]$State) {
  if (
    $State.identityOk -ne $true -or
    $State.snapshotTable -ne $true -or
    $State.applyFunction -ne $true -or
    $State.rollbackFunction -ne $true -or
    [int64]$State.adminCount -ne 1 -or
    [int64]$State.adminAuthCount -ne 1 -or
    [int64]$State.targetCount -ne 1
  ) {
    throw '生产单字段对象、管理员或目标行前置状态不完整。'
  }
}

function Assert-AnchorsStable([object]$State, [object]$Anchor) {
  foreach ($Name in @('targetInvariantMd5', 'nonTargetNotesMd5')) {
    if ([string]$State.$Name -cne [string]$Anchor.$Name) {
      throw "生产单字段之外的 notes 指纹发生变化：$Name"
    }
  }
}

function Assert-BeforeState([object]$State, [object]$Anchor) {
  Assert-ObjectsReady $State
  Assert-AnchorsStable $State $Anchor
  if (
    [int64]$State.contentVersion -ne $ExpectedContentVersion -or
    [string]$State.fieldChecksum -cne [string]$Proposal.beforeChecksum -or
    [int64]$State.snapshotCount -ne [int64]$Anchor.snapshotCount -or
    [int64]$State.fieldRows -ne [int64]$Anchor.fieldRows -or
    [int64]$State.applyBatchRows -ne 0 -or
    [int64]$State.rollbackBatchRows -ne 0
  ) {
    throw '生产目标不再符合冻结的 before checksum/version/batch 状态。'
  }
}

function Assert-AfterApplyState([object]$State, [object]$Anchor) {
  Assert-ObjectsReady $State
  Assert-AnchorsStable $State $Anchor
  if (
    [int64]$State.contentVersion -ne ($ExpectedContentVersion + 1) -or
    [string]$State.fieldChecksum -cne [string]$Proposal.afterChecksum -or
    [int64]$State.snapshotCount -ne ([int64]$Anchor.snapshotCount + 1) -or
    [int64]$State.fieldRows -ne ([int64]$Anchor.fieldRows + 1) -or
    [int64]$State.applyBatchRows -ne 1 -or
    [int64]$State.rollbackBatchRows -ne 0 -or
    $State.applyExact -ne $true -or
    [int64]$State.applyVersionBefore -ne $ExpectedContentVersion -or
    [int64]$State.applyVersionAfter -ne ($ExpectedContentVersion + 1)
  ) {
    throw '生产 apply 后的 checksum/version/snapshot 状态不满足精确契约。'
  }
  if ($null -ne $ApplyEvidence -and [string]$State.applySnapshotId -cne $ApplySnapshotId) {
    throw '生产 apply snapshot ID 与已归档 apply 证据不一致。'
  }
}

function Assert-AfterRollbackState([object]$State, [object]$Anchor) {
  Assert-ObjectsReady $State
  Assert-AnchorsStable $State $Anchor
  if (
    [int64]$State.contentVersion -ne ($ExpectedContentVersion + 2) -or
    [string]$State.fieldChecksum -cne [string]$Proposal.beforeChecksum -or
    [int64]$State.snapshotCount -ne ([int64]$Anchor.snapshotCount + 2) -or
    [int64]$State.fieldRows -ne ([int64]$Anchor.fieldRows + 2) -or
    [int64]$State.applyBatchRows -ne 1 -or
    [int64]$State.rollbackBatchRows -ne 1 -or
    $State.applyExact -ne $true -or
    $State.rollbackExact -ne $true -or
    $State.rollbackLinksApply -ne $true -or
    [int64]$State.rollbackVersionBefore -ne ($ExpectedContentVersion + 1) -or
    [int64]$State.rollbackVersionAfter -ne ($ExpectedContentVersion + 2)
  ) {
    throw '生产 rollback 后的 checksum/version/snapshot 链不满足精确契约。'
  }
}

function Assert-StatesEqual([object]$Left, [object]$Right) {
  foreach ($Name in @(
    'contentVersion', 'fieldChecksum', 'targetInvariantMd5', 'nonTargetNotesMd5',
    'snapshotCount', 'fieldRows', 'applyBatchRows', 'rollbackBatchRows',
    'applySnapshotId', 'rollbackSnapshotId', 'applyExact', 'rollbackExact', 'rollbackLinksApply'
  )) {
    if ([string]$Left.$Name -cne [string]$Right.$Name) {
      throw "事务预演没有完整恢复数据库状态：$Name"
    }
  }
}

function Assert-ApplyMutation([object]$Mutation) {
  if (
    [int64]$Mutation.applyRows -ne 1 -or
    [string]$Mutation.snapshotId -notmatch '^[0-9a-f-]{36}$' -or
    [int64]$Mutation.versionBefore -ne $ExpectedContentVersion -or
    [int64]$Mutation.versionAfter -ne ($ExpectedContentVersion + 1) -or
    $Mutation.afterMatches -ne $true -or
    [int64]$Mutation.snapshotDelta -ne 1
  ) {
    throw '生产 apply 事务内证明失败。'
  }
}

function Assert-RollbackMutation([object]$Mutation) {
  if (
    [int64]$Mutation.rollbackRows -ne 1 -or
    [string]$Mutation.snapshotId -notmatch '^[0-9a-f-]{36}$' -or
    $Mutation.revertsApply -ne $true -or
    [int64]$Mutation.versionBefore -ne ($ExpectedContentVersion + 1) -or
    [int64]$Mutation.versionAfter -ne ($ExpectedContentVersion + 2) -or
    $Mutation.restoredBefore -ne $true -or
    [int64]$Mutation.snapshotDelta -ne 1
  ) {
    throw '生产 rollback 事务内证明失败。'
  }
}

function Test-LoopbackPortListening([int]$Port) {
  $Client = [System.Net.Sockets.TcpClient]::new()
  try {
    $ConnectTask = $Client.ConnectAsync('127.0.0.1', $Port)
    if (-not $ConnectTask.Wait(250)) { return $false }
    return $Client.Connected
  } catch {
    return $false
  } finally {
    $Client.Dispose()
  }
}

$TunnelProcess = $null
$PreviousPgPassword = $env:PGPASSWORD
$PreviousPgOptions = $env:PGOPTIONS
try {
  $TunnelProcess = Start-Process -FilePath $Node -ArgumentList @($TunnelScript, 'production') `
    -WorkingDirectory $RepositoryRoot -WindowStyle Hidden -PassThru
  $TunnelReady = $false
  for ($Attempt = 0; $Attempt -lt 40; $Attempt += 1) {
    try {
      $Client = [System.Net.Sockets.TcpClient]::new()
      $Client.Connect('127.0.0.1', $LocalTunnelPort)
      $Client.Dispose()
      $TunnelReady = $true
      break
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }
  if (-not $TunnelReady) {
    throw '固定生产 loopback tunnel 未在限定时间内就绪。'
  }

  $env:PGPASSWORD = [string]$Credential.databasePassword
  $env:PGOPTIONS = if ($Stage -in $ReadStages) {
    '-c default_transaction_read_only=on -c statement_timeout=60000'
  } else {
    '-c lock_timeout=5000 -c statement_timeout=120000'
  }

  $BaselineBefore = Read-Wp1GateSnapshot
  if ($Stage -eq 'preflight' -and $null -ne $PriorBatchPostflightEvidence) {
    Assert-BaselineMatchesArchivedApply $BaselineBefore $PriorBatchPostflightEvidence.baseline
  } elseif ($Stage -in @('apply-preview', 'apply')) {
    Assert-BaselineMatchesArchivedApply $BaselineBefore $PreflightEvidence.baseline
  } elseif ($Stage -eq 'apply-reconcile') {
    Assert-BaselineStableExceptAuthorizedTarget $PreflightEvidence.baseline $BaselineBefore 'apply'
  } elseif ($Stage -eq 'postflight') {
    Assert-BaselineStableExceptAuthorizedTarget $PreflightEvidence.baseline $BaselineBefore 'apply'
    Assert-BaselineMatchesArchivedApply $BaselineBefore $ApplyEvidence.baselineAfter
  } else {
    Assert-BaselineMatchesBackup $BaselineBefore
  }
  $StateBefore = Invoke-PsqlJson $StateSql -AllowTransientRetry
  Assert-ObjectsReady $StateBefore
  $Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'

  if ($Stage -eq 'preflight') {
    $ExpectedPriorFieldRows = if ($ProposalKind -eq 'ui-correction') { [int64]$Proposal.expectedPriorFieldRows } else { [int64]0 }
    if (
      [int64]$StateBefore.contentVersion -lt 1 -or
      [string]$StateBefore.fieldChecksum -cne [string]$Proposal.beforeChecksum -or
      [int64]$StateBefore.fieldRows -ne $ExpectedPriorFieldRows -or
      [int64]$StateBefore.applyBatchRows -ne 0 -or
      [int64]$StateBefore.rollbackBatchRows -ne 0
    ) {
      throw '生产单字段 preflight 的 before checksum、version 或 batch 状态不唯一。'
    }
    $Evidence = [ordered]@{
      evidenceVersion = 1
      stage = 'preflight'
      projectRef = $ProductionProjectRef
      proposalPath = $ResolvedProposalPath
      proposalSha256 = $ProposalSha256
      backupCapturedAt = $BackupManifest.capturedAt
      priorBatchPostflightEvidenceSha256 = $PriorBatchPostflightEvidenceSha256
      expectedContentVersion = [int64]$StateBefore.contentVersion
      completedAt = [DateTimeOffset]::UtcNow.ToString('o')
      targetState = $StateBefore
      baseline = $BaselineBefore
      productionConnected = $true
      productionWritePerformed = $false
    }
    $EvidencePath = Join-Path $ResolvedBackupDir "wp2-production-single-preflight-$Timestamp.json"
    $Evidence | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
    Write-Output "PreflightEvidence=$EvidencePath"
    Write-Output 'WP2 生产单字段只读 preflight 已通过；content_version 已冻结，未写入正文。'
    return
  }

  $Anchor = $PreflightEvidence.targetState
  if ($Stage -eq 'apply-reconcile') {
    Assert-AfterApplyState $StateBefore $Anchor
    $ReconciledMutation = [ordered]@{
      applyRows = 1
      snapshotId = [string]$StateBefore.applySnapshotId
      versionBefore = [int64]$StateBefore.applyVersionBefore
      versionAfter = [int64]$StateBefore.applyVersionAfter
      afterMatches = $true
      snapshotDelta = 1
      reconstructedFromImmutableSnapshot = $true
    }
    $Evidence = [ordered]@{
      evidenceVersion = 1
      stage = 'apply'
      projectRef = $ProductionProjectRef
      proposalSha256 = $ProposalSha256
      preflightEvidenceSha256 = $PreflightEvidenceSha256
      backupCapturedAt = $BackupManifest.capturedAt
      expectedContentVersion = $ExpectedContentVersion
      completedAt = [DateTimeOffset]::UtcNow.ToString('o')
      beforeState = $Anchor
      mutation = $ReconciledMutation
      afterState = $StateBefore
      baselineBefore = $PreflightEvidence.baseline
      baselineAfter = $BaselineBefore
      productionConnected = $true
      productionWritePerformed = $true
      databaseTransactionRolledBack = $false
      reconciledAfterCommittedRunnerPostcheckFailure = $true
      reconciliationWritePerformed = $false
    }
    $EvidencePath = Join-Path $ResolvedBackupDir "wp2-production-single-apply-reconciled-$Timestamp.json"
    $Evidence | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
    Write-Output "ApplyEvidence=$EvidencePath"
    Write-Output 'WP2 生产单字段 apply 已只读对账并恢复证据；本阶段没有再次写入。'
    return
  }
  if ($Stage -in @('apply-preview', 'apply')) {
    Assert-BeforeState $StateBefore $Anchor
    $EndTransaction = if ($Stage -eq 'apply-preview') { 'rollback' } else { 'commit' }
    $MutationSql = $ApplyMutationSqlTemplate.Replace('__END_TRANSACTION__', $EndTransaction)
    $Mutation = Invoke-PsqlJson $MutationSql
    Assert-ApplyMutation $Mutation
    $StateAfter = Invoke-PsqlJson $StateSql -AllowTransientRetry
    if ($Stage -eq 'apply-preview') {
      Assert-StatesEqual $StateBefore $StateAfter
      $ProductionWritePerformed = $false
    } else {
      Assert-AfterApplyState $StateAfter $Anchor
      $BaselineAfter = Read-Wp1GateSnapshot
      Assert-BaselineStableExceptAuthorizedTarget $BaselineBefore $BaselineAfter 'apply'
      $ProductionWritePerformed = $true
    }
    $Evidence = [ordered]@{
      evidenceVersion = 1
      stage = $Stage
      projectRef = $ProductionProjectRef
      proposalSha256 = $ProposalSha256
      preflightEvidenceSha256 = $PreflightEvidenceSha256
      backupCapturedAt = $BackupManifest.capturedAt
      expectedContentVersion = $ExpectedContentVersion
      completedAt = [DateTimeOffset]::UtcNow.ToString('o')
      beforeState = $StateBefore
      mutation = $Mutation
      afterState = $StateAfter
      baselineBefore = $BaselineBefore
      baselineAfter = if ($Stage -eq 'apply') { $BaselineAfter } else { $BaselineBefore }
      productionConnected = $true
      productionWritePerformed = $ProductionWritePerformed
      databaseTransactionRolledBack = ($Stage -eq 'apply-preview')
    }
    $EvidencePath = Join-Path $ResolvedBackupDir "wp2-production-single-$Stage-$Timestamp.json"
    $Evidence | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
    Write-Output "StageEvidence=$EvidencePath"
    if ($Stage -eq 'apply-preview') {
      Write-Output 'WP2 生产单字段 apply 事务预演已通过并由数据库 ROLLBACK；正文保持原样。'
    } else {
      Write-Output 'WP2 生产单字段 apply 已精确提交；请先完成页面验收，再决定是否回退。'
    }
    return
  }

  if ($Stage -eq 'postflight') {
    Assert-AfterApplyState $StateBefore $Anchor
    $Evidence = [ordered]@{
      evidenceVersion = 1
      stage = 'postflight'
      projectRef = $ProductionProjectRef
      proposalSha256 = $ProposalSha256
      preflightEvidenceSha256 = $PreflightEvidenceSha256
      applyEvidenceSha256 = $ApplyEvidenceSha256
      backupCapturedAt = $BackupManifest.capturedAt
      expectedContentVersion = $ExpectedContentVersion
      completedAt = [DateTimeOffset]::UtcNow.ToString('o')
      targetState = $StateBefore
      baseline = $BaselineBefore
      productionConnected = $true
      productionWritePerformed = $false
    }
    $EvidencePath = Join-Path $ResolvedBackupDir "wp2-production-single-postflight-$Timestamp.json"
    $Evidence | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
    Write-Output "PostflightEvidence=$EvidencePath"
    Write-Output 'WP2 生产单字段 apply 独立只读 postflight 已通过。'
    return
  }

  if ($Stage -in @('rollback-preview', 'rollback')) {
    Assert-AfterApplyState $StateBefore $Anchor
    $EndTransaction = if ($Stage -eq 'rollback-preview') { 'rollback' } else { 'commit' }
    $MutationSql = $RollbackMutationSqlTemplate.Replace('__END_TRANSACTION__', $EndTransaction)
    $Mutation = Invoke-PsqlJson $MutationSql
    Assert-RollbackMutation $Mutation
    $StateAfter = Invoke-PsqlJson $StateSql -AllowTransientRetry
    if ($Stage -eq 'rollback-preview') {
      Assert-StatesEqual $StateBefore $StateAfter
      $ProductionWritePerformed = $false
    } else {
      Assert-AfterRollbackState $StateAfter $Anchor
      $BaselineAfter = Read-Wp1GateSnapshot
      Assert-BaselineStableExceptAuthorizedTarget $BaselineBefore $BaselineAfter 'rollback'
      $ProductionWritePerformed = $true
    }
    $Evidence = [ordered]@{
      evidenceVersion = 1
      stage = $Stage
      projectRef = $ProductionProjectRef
      proposalSha256 = $ProposalSha256
      preflightEvidenceSha256 = $PreflightEvidenceSha256
      applyEvidenceSha256 = $ApplyEvidenceSha256
      backupCapturedAt = $BackupManifest.capturedAt
      expectedContentVersion = $ExpectedContentVersion
      completedAt = [DateTimeOffset]::UtcNow.ToString('o')
      beforeState = $StateBefore
      mutation = $Mutation
      afterState = $StateAfter
      baselineBefore = $BaselineBefore
      baselineAfter = if ($Stage -eq 'rollback') { $BaselineAfter } else { $BaselineBefore }
      productionConnected = $true
      productionWritePerformed = $ProductionWritePerformed
      databaseTransactionRolledBack = ($Stage -eq 'rollback-preview')
    }
    $EvidencePath = Join-Path $ResolvedBackupDir "wp2-production-single-$Stage-$Timestamp.json"
    $Evidence | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
    Write-Output "StageEvidence=$EvidencePath"
    if ($Stage -eq 'rollback-preview') {
      Write-Output 'WP2 生产单字段 rollback 事务预演已通过并由数据库 ROLLBACK；apply 状态保持不变。'
    } else {
      Write-Output 'WP2 生产单字段 rollback 已精确提交；原字段已恢复并追加不可变回退证据。'
    }
    return
  }

  Assert-AfterRollbackState $StateBefore $Anchor
  if ([string]$StateBefore.rollbackSnapshotId -cne [string]$RollbackEvidence.afterState.rollbackSnapshotId) {
    throw '生产 rollback snapshot ID 与已归档 rollback 证据不一致。'
  }
  $Evidence = [ordered]@{
    evidenceVersion = 1
    stage = 'rollback-postflight'
    projectRef = $ProductionProjectRef
    proposalSha256 = $ProposalSha256
    preflightEvidenceSha256 = $PreflightEvidenceSha256
    applyEvidenceSha256 = $ApplyEvidenceSha256
    rollbackEvidenceSha256 = $RollbackEvidenceSha256
    backupCapturedAt = $BackupManifest.capturedAt
    expectedContentVersion = $ExpectedContentVersion
    completedAt = [DateTimeOffset]::UtcNow.ToString('o')
    targetState = $StateBefore
    baseline = $BaselineBefore
    productionConnected = $true
    productionWritePerformed = $false
  }
  $EvidencePath = Join-Path $ResolvedBackupDir "wp2-production-single-rollback-postflight-$Timestamp.json"
  $Evidence | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
  Write-Output "RollbackPostflightEvidence=$EvidencePath"
  Write-Output 'WP2 生产单字段 rollback 独立只读 postflight 已通过。'
} finally {
  if ($null -eq $PreviousPgPassword) {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  } else {
    $env:PGPASSWORD = $PreviousPgPassword
  }
  if ($null -eq $PreviousPgOptions) {
    Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue
  } else {
    $env:PGOPTIONS = $PreviousPgOptions
  }
  if ($null -ne $TunnelProcess -and -not $TunnelProcess.HasExited) {
    Stop-Process -Id $TunnelProcess.Id -Force -ErrorAction SilentlyContinue
    $TunnelProcess.WaitForExit(5000) | Out-Null
  }
  for ($Attempt = 0; $Attempt -lt 20; $Attempt += 1) {
    if (-not (Test-LoopbackPortListening $LocalTunnelPort)) { break }
    Start-Sleep -Milliseconds 100
  }
  if (Test-LoopbackPortListening $LocalTunnelPort) {
    throw "固定生产 tunnel 端口 $LocalTunnelPort 未清理。"
  }
}
