$ErrorActionPreference = 'Stop'

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$RunnerPath = Join-Path $RepositoryRoot 'scripts\run-wp3-shadow-stage.ps1'
$TypegenPath = Join-Path $RepositoryRoot 'scripts\generate-wp3-shadow-types.ps1'
$PackagePath = Join-Path $RepositoryRoot 'package.json'
$Runner = Get-Content -Raw -Encoding UTF8 -LiteralPath $RunnerPath
$Typegen = Get-Content -Raw -Encoding UTF8 -LiteralPath $TypegenPath
$Package = Get-Content -Raw -Encoding UTF8 -LiteralPath $PackagePath | ConvertFrom-Json

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Assert-Contains([string]$Text, [string]$Pattern, [string]$Message) {
  Assert-True ([regex]::IsMatch($Text, $Pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) $Message
}

function Assert-NegativeGuard([string]$Stage, [switch]$Preview, [string]$ExpectedPhrase) {
  try {
    if ($Preview) {
      & $RunnerPath -Stage $Stage -ConfirmShadowPreview -ConfirmationPhrase 'WRONG'
    } else {
      & $RunnerPath -Stage $Stage -ConfirmShadowWrite -ConfirmationPhrase 'WRONG'
    }
    throw "$Stage 错误确认短语被意外接受。"
  } catch {
    Assert-True ($_.Exception.Message.Contains($ExpectedPhrase)) "$Stage 没有在任何凭据或网络操作前拒绝错误确认短语。"
  }
}

$RunnerTokens = $null
$RunnerErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile($RunnerPath, [ref]$RunnerTokens, [ref]$RunnerErrors) | Out-Null
$TypegenTokens = $null
$TypegenErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile($TypegenPath, [ref]$TypegenTokens, [ref]$TypegenErrors) | Out-Null

Assert-True ($RunnerErrors.Count -eq 0) "WP3 Shadow runner 语法错误：$($RunnerErrors | ForEach-Object Message -join '; ')"
Assert-True ($TypegenErrors.Count -eq 0) "WP3 typegen wrapper 语法错误：$($TypegenErrors | ForEach-Object Message -join '; ')"
Assert-Contains $Runner "ValidateSet\('preflight',\s*'preview-0007',\s*'commit-0007',\s*'preview-0014',\s*'commit-0014',\s*'preview-0020',\s*'commit-0020',\s*'postflight'\)" 'WP3 Shadow runner 阶段集合不完整。'
Assert-Contains $Runner "ShadowProjectRef\s*=\s*'qyjfcebqjtphlpsvizxo'" 'Runner 未固定 fixed Shadow ref。'
Assert-Contains $Runner "ProductionProjectRef\s*=\s*'kysywitrsjhcdlcrfayl'" 'Runner 未固定生产排除 ref。'
Assert-Contains $Runner "wp1b-pg-http-connect-tunnel\.mjs" 'Runner 未复用固定 loopback tunnel。'
Assert-Contains $Runner 'ArgumentList\s+@\(\$TunnelScript,\s*''shadow''\)' 'Runner tunnel 未固定 shadow 模式。'
Assert-Contains $Runner "default_transaction_read_only=on" 'preflight/postflight 未要求数据库会话只读。'
Assert-Contains $Runner 'PREVIEW \$ShadowProjectRef WP3 PREREQ 0007 ROLLBACK' '缺少 0007 rollback 预演短语。'
Assert-Contains $Runner 'PREVIEW \$ShadowProjectRef WP3 0014 ROLLBACK' '缺少 0014 rollback 预演短语。'
Assert-Contains $Runner 'PREVIEW \$ShadowProjectRef WP3 0020 ROLLBACK' '缺少 0020 rollback 预演短语。'
Assert-Contains $Runner 'WRITE \$ShadowProjectRef WP3 PREREQ 0007' '缺少 0007 写入短语。'
Assert-Contains $Runner 'WRITE \$ShadowProjectRef WP3 0014' '缺少 0014 写入短语。'
Assert-Contains $Runner 'WRITE \$ShadowProjectRef WP3 0020' '缺少 0020 写入短语。'
Assert-Contains $Runner "cce2b7c4f897ef4ef8a087729290f14e5905787b8398a08ad9a57272bef57be1" '0007 固定哈希缺失。'
Assert-Contains $Runner "7c7af2e7b543e23470a11140653f4ab7a4e543f933206465b4aa0b49e79c6559" '0014 固定哈希缺失。'
Assert-Contains $Runner "e33724b90ce7997650f1a08513f00a93c5e0087c1a7289d3de2a67ac16d57ba2" '0020 固定哈希缺失。'
Assert-Contains $Runner "New-RollbackMigrationCopy" '预演未剥离迁移自带事务壳。'
Assert-Contains $Runner "begin is supplied by the rollback preview runner" '预演未替换内层 BEGIN。'
Assert-Contains $Runner "commit is replaced by rollback" '预演未替换内层 COMMIT。'
Assert-Contains $Runner "--command' 'begin;'[\s\S]*--command' 'rollback;'" '预演未在同一 psql 会话显式回滚。'
Assert-Contains $Runner "authenticatedCanInsertJobItems" 'Runner 未验证 authenticated INSERT 撤销。'
Assert-Contains $Runner "authenticatedCanUpdateJobItems" 'Runner 未验证 authenticated UPDATE 撤销。'
Assert-Contains $Runner "storageObjectsFingerprint" 'Runner 未验证 Storage 对象稳定指纹。'
Assert-Contains $Runner "Assert-StableData" 'Runner 未验证 jobs/job_items/Storage 稳定性。'
Assert-Contains $Typegen 'READ \$ShadowProjectRef WP3 TYPES' 'WP3 typegen 缺少精确只读确认短语。'
foreach ($Rpc in @('enqueue_job_item', 'claim_next_job_item', 'complete_job_item', 'fail_job_item', 'reset_failed_job_item')) {
  Assert-Contains $Typegen $Rpc "WP3 typegen 未验证 $Rpc。"
}
Assert-Contains $Typegen "database\.types\.before\.ts" 'WP3 typegen 回滚快照路径缺失。'
Assert-Contains $Typegen 'Copy-Item\s+-LiteralPath\s+\$BackupPath\s+-Destination\s+\$GeneratedPath' 'WP3 typegen 失败恢复动作缺失。'
Assert-True ([string]$Package.scripts.'verify:wp3-shadow-stage-local' -match 'test-wp3-shadow-stage-local\.ps1') 'package.json 未接入 WP3 Shadow 本地验证。'
Assert-True ([string]$Package.scripts.'verify:predeploy' -match 'verify:wp3-shadow-stage-local') 'predeploy 未接入 WP3 Shadow runner 验证。'

Assert-NegativeGuard 'preview-0007' -Preview -ExpectedPhrase 'PREVIEW qyjfcebqjtphlpsvizxo WP3 PREREQ 0007 ROLLBACK'
Assert-NegativeGuard 'preview-0014' -Preview -ExpectedPhrase 'PREVIEW qyjfcebqjtphlpsvizxo WP3 0014 ROLLBACK'
Assert-NegativeGuard 'preview-0020' -Preview -ExpectedPhrase 'PREVIEW qyjfcebqjtphlpsvizxo WP3 0020 ROLLBACK'
Assert-NegativeGuard 'commit-0007' -ExpectedPhrase 'WRITE qyjfcebqjtphlpsvizxo WP3 PREREQ 0007'
Assert-NegativeGuard 'commit-0014' -ExpectedPhrase 'WRITE qyjfcebqjtphlpsvizxo WP3 0014'
Assert-NegativeGuard 'commit-0020' -ExpectedPhrase 'WRITE qyjfcebqjtphlpsvizxo WP3 0020'

[pscustomobject]@{
  RunnerParseErrors = $RunnerErrors.Count
  TypegenParseErrors = $TypegenErrors.Count
  FixedShadowRef = $true
  ProductionExcluded = $true
  ExactConfirmationPhrases = 7
  NegativeRemoteGuards = 6
  ReadOnlyPreAndPostflight = $true
  RollbackPreviewStripsInnerTransaction = $true
  MigrationHashesPinned = 3
  StableFingerprintGroups = 3
  LeaseRpcTypeMarkers = 5
} | ConvertTo-Json -Compress
Assert-Contains $Runner "ocrPolicyCount" 'Runner 未验证 OCR Storage policies。'
