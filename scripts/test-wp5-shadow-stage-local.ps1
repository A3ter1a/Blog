$ErrorActionPreference = 'Stop'

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$RunnerPath = Join-Path $RepositoryRoot 'scripts\run-wp5-shadow-stage.ps1'
$TypegenPath = Join-Path $RepositoryRoot 'scripts\generate-wp5-shadow-types.ps1'
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
    Assert-True ($_.Exception.Message.Contains($ExpectedPhrase)) "$Stage 没有在凭据或网络操作前拒绝错误确认短语。"
  }
}

$RunnerTokens = $null
$RunnerErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile($RunnerPath, [ref]$RunnerTokens, [ref]$RunnerErrors) | Out-Null
$TypegenTokens = $null
$TypegenErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile($TypegenPath, [ref]$TypegenTokens, [ref]$TypegenErrors) | Out-Null

Assert-True ($RunnerErrors.Count -eq 0) "WP5 Shadow runner 语法错误：$($RunnerErrors | ForEach-Object Message -join '; ')"
Assert-True ($TypegenErrors.Count -eq 0) "WP5 typegen wrapper 语法错误：$($TypegenErrors | ForEach-Object Message -join '; ')"
Assert-Contains $Runner "ValidateSet\([\s\S]*'preflight'[\s\S]*'preview-0016'[\s\S]*'commit-0018'[\s\S]*'postflight'" 'WP5 Shadow runner 阶段集合不完整。'
Assert-Contains $Runner "ShadowProjectRef\s*=\s*'qyjfcebqjtphlpsvizxo'" 'Runner 未固定 fixed Shadow ref。'
Assert-Contains $Runner "ProductionProjectRef\s*=\s*'kysywitrsjhcdlcrfayl'" 'Runner 未固定生产排除 ref。'
Assert-Contains $Runner "wp1b-pg-http-connect-tunnel\.mjs" 'Runner 未复用固定 loopback tunnel。'
Assert-Contains $Runner "default_transaction_read_only=on" 'preflight/postflight 未强制只读。'
Assert-Contains $Runner 'PREVIEW \$ShadowProjectRef WP5 0016 ROLLBACK' '缺少 0016 rollback 短语。'
Assert-Contains $Runner 'PREVIEW \$ShadowProjectRef WP5 0017 ROLLBACK' '缺少 0017 rollback 短语。'
Assert-Contains $Runner 'PREVIEW \$ShadowProjectRef WP5 0018 ROLLBACK' '缺少 0018 rollback 短语。'
Assert-Contains $Runner 'WRITE \$ShadowProjectRef WP5 0016' '缺少 0016 写入短语。'
Assert-Contains $Runner 'WRITE \$ShadowProjectRef WP5 0017' '缺少 0017 写入短语。'
Assert-Contains $Runner 'WRITE \$ShadowProjectRef WP5 0018' '缺少 0018 写入短语。'
Assert-Contains $Runner '344abe1c7e158906ecd8740e548df9fcbcf15f8787fe67bd5a5e88268e64cf02' '0016 固定哈希缺失。'
Assert-Contains $Runner 'a37670ae61b754f21fe5862bdaa5b091a8930641551817533bcdd05d056b09b7' '0017 固定哈希缺失。'
Assert-Contains $Runner '3792b7e2b1a5f084feb1bf53ad65845bb1eb2a86b5ac68d139c09d4779e74ffa' '0018 固定哈希缺失。'
Assert-Contains $Runner "New-RollbackMigrationCopy" 'Runner 未剥离迁移事务壳。'
Assert-Contains $Runner "--command' 'begin;'[\s\S]*--command' 'rollback;'" 'Runner 未在同一 psql 会话回滚。'
Assert-Contains $Runner 'legacyAttemptFingerprint' 'Runner 未固定 legacy attempt 指纹。'
Assert-Contains $Runner 'legacyAnswerFingerprint' 'Runner 未固定 legacy answer 指纹。'
Assert-Contains $Runner 'commandSecurityDefiner' 'Runner 未验证 0017 SECURITY DEFINER。'
Assert-Contains $Runner 'subjectiveAuthenticatedExecuteCount' 'Runner 未验证 0018 execute 边界。'
Assert-Contains $Runner 'formalGradeTriggerExists' 'Runner 未验证正式评分三轮门 trigger。'
Assert-Contains $Typegen 'READ \$ShadowProjectRef WP5 TYPES' 'WP5 typegen 缺少精确只读短语。'
foreach ($Rpc in @(
  'record_english_training_command',
  'record_english_subjective_submission',
  'confirm_english_subjective_grade'
)) {
  Assert-Contains $Typegen $Rpc "WP5 typegen 未验证 $Rpc。"
}
Assert-Contains $Typegen 'database\.types\.before\.ts' 'WP5 typegen 回滚快照路径缺失。'
Assert-Contains $Typegen 'Copy-Item\s+-LiteralPath\s+\$BackupPath\s+-Destination\s+\$GeneratedPath' 'WP5 typegen 失败恢复动作缺失。'
Assert-True ([string]$Package.scripts.'verify:wp5-shadow-stage-local' -match 'test-wp5-shadow-stage-local\.ps1') 'package.json 未接入 WP5 Shadow 本地验证。'
Assert-True ([string]$Package.scripts.'verify:predeploy' -match 'verify:wp5-shadow-stage-local') 'predeploy 未接入 WP5 Shadow runner 验证。'

Assert-NegativeGuard 'preview-0016' -Preview -ExpectedPhrase 'PREVIEW qyjfcebqjtphlpsvizxo WP5 0016 ROLLBACK'
Assert-NegativeGuard 'preview-0017' -Preview -ExpectedPhrase 'PREVIEW qyjfcebqjtphlpsvizxo WP5 0017 ROLLBACK'
Assert-NegativeGuard 'preview-0018' -Preview -ExpectedPhrase 'PREVIEW qyjfcebqjtphlpsvizxo WP5 0018 ROLLBACK'
Assert-NegativeGuard 'commit-0016' -ExpectedPhrase 'WRITE qyjfcebqjtphlpsvizxo WP5 0016'
Assert-NegativeGuard 'commit-0017' -ExpectedPhrase 'WRITE qyjfcebqjtphlpsvizxo WP5 0017'
Assert-NegativeGuard 'commit-0018' -ExpectedPhrase 'WRITE qyjfcebqjtphlpsvizxo WP5 0018'

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
  StableLegacyFingerprints = 2
  RequiredEnglishRpcTypeMarkers = 3
} | ConvertTo-Json -Compress
