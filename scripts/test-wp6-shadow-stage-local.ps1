$ErrorActionPreference = 'Stop'

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$RunnerPath = Join-Path $RepositoryRoot 'scripts\run-wp6-shadow-stage.ps1'
$TypegenPath = Join-Path $RepositoryRoot 'scripts\generate-wp6-shadow-types.ps1'
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

$RunnerTokens = $null
$RunnerErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile($RunnerPath, [ref]$RunnerTokens, [ref]$RunnerErrors) | Out-Null
$TypegenTokens = $null
$TypegenErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile($TypegenPath, [ref]$TypegenTokens, [ref]$TypegenErrors) | Out-Null

Assert-True ($RunnerErrors.Count -eq 0) "WP6 Shadow runner 语法错误：$($RunnerErrors | ForEach-Object Message -join '; ')"
Assert-True ($TypegenErrors.Count -eq 0) "WP6 typegen wrapper 语法错误：$($TypegenErrors | ForEach-Object Message -join '; ')"
Assert-Contains $Runner "ValidateSet\('preflight', 'preview-0019', 'commit-0019', 'postflight'\)" 'WP6 Shadow runner 阶段集合不完整。'
Assert-Contains $Runner "ShadowProjectRef\s*=\s*'qyjfcebqjtphlpsvizxo'" 'Runner 未固定 fixed Shadow ref。'
Assert-Contains $Runner "ProductionProjectRef\s*=\s*'kysywitrsjhcdlcrfayl'" 'Runner 未固定生产排除 ref。'
Assert-Contains $Runner 'PREVIEW \$ShadowProjectRef WP6 0019 ROLLBACK' '缺少 0019 rollback 短语。'
Assert-Contains $Runner 'WRITE \$ShadowProjectRef WP6 0019' '缺少 0019 写入短语。'
Assert-Contains $Runner '00ee78bfc527e46f6829a1b67688ef1a945beb3b5ed23d33c0d0df035a4e81b6' '0019 固定哈希缺失。'
Assert-Contains $Runner 'default_transaction_read_only=on' 'preflight/postflight 未强制只读。'
Assert-Contains $Runner 'New-RollbackMigrationCopy' 'Runner 未剥离迁移事务壳。'
Assert-Contains $Runner "--command' 'begin;'[\s\S]*--command' 'rollback;'" 'Runner 未在同一 psql 会话回滚。'
Assert-Contains $Runner 'targetSecurityDefinerCount' 'Runner 未验证 SECURITY DEFINER。'
Assert-Contains $Runner 'targetAuthenticatedExecuteCount' 'Runner 未验证 authenticated execute 边界。'
Assert-Contains $Runner 'targetAnonExecuteCount' 'Runner 未验证 anon execute 边界。'
Assert-Contains $Runner 'targetForceRlsCount' 'Runner 未验证 FORCE RLS。'
Assert-Contains $Runner 'StableBaseDataCounts' 'Runner 未验证迁移前后基础数据计数。'
Assert-Contains $Runner 'MigrationCommitted[\s\S]*PostflightPending[\s\S]*禁止重复提交' 'Runner 未区分已提交迁移与后验连接失败。'
Assert-Contains $Typegen 'READ \$ShadowProjectRef WP6 TYPES' 'WP6 typegen 缺少精确只读短语。'
foreach ($Marker in @(
  'start_math_paper_attempt', 'record_math_ocr_confirmation', 'record_math_ai_grade',
  'confirm_math_grade', 'list_math_papers', 'get_math_training_state', 'get_math_grade_source',
  'create_private_booklet', 'refresh_booklet_drift', 'math_papers', 'math_paper_problems',
  'ocr_confirmations', 'math_grade_steps', 'booklets'
)) {
  Assert-Contains $Typegen $Marker "WP6 typegen 未验证 $Marker。"
}
Assert-Contains $Typegen 'database\.types\.before\.ts' 'WP6 typegen 回滚快照路径缺失。'
Assert-True ([string]$Package.scripts.'verify:wp6-shadow-stage-local' -match 'test-wp6-shadow-stage-local\.ps1') 'package.json 未接入 WP6 Shadow 本地验证。'
Assert-True ([string]$Package.scripts.'verify:predeploy' -match 'verify:wp6-shadow-stage-local') 'predeploy 未接入 WP6 Shadow runner 验证。'

try {
  & $RunnerPath -Stage preview-0019 -ConfirmShadowPreview -ConfirmationPhrase 'WRONG'
  throw 'preview-0019 错误确认短语被意外接受。'
} catch {
  Assert-True ($_.Exception.Message.Contains('PREVIEW qyjfcebqjtphlpsvizxo WP6 0019 ROLLBACK')) 'preview-0019 未在凭据或网络操作前拒绝错误短语。'
}
try {
  & $RunnerPath -Stage commit-0019 -ConfirmShadowWrite -ConfirmationPhrase 'WRONG'
  throw 'commit-0019 错误确认短语被意外接受。'
} catch {
  Assert-True ($_.Exception.Message.Contains('WRITE qyjfcebqjtphlpsvizxo WP6 0019')) 'commit-0019 未在凭据或网络操作前拒绝错误短语。'
}

[pscustomobject]@{
  RunnerParseErrors = $RunnerErrors.Count
  TypegenParseErrors = $TypegenErrors.Count
  FixedShadowRef = $true
  ProductionExcluded = $true
  ExactConfirmationPhrases = 3
  NegativeRemoteGuards = 2
  ReadOnlyPreAndPostflight = $true
  RollbackPreviewStripsInnerTransaction = $true
  MigrationHashesPinned = 1
  RequiredMathRpcTypeMarkers = 9
  RequiredMathTableTypeMarkers = 5
} | ConvertTo-Json -Compress
