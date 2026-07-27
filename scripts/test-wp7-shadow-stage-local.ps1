$ErrorActionPreference = 'Stop'
$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$RunnerPath = Join-Path $RepositoryRoot 'scripts\run-wp7-shadow-stage.ps1'
$TypegenPath = Join-Path $RepositoryRoot 'scripts\generate-wp7-shadow-types.ps1'
$Runner = Get-Content -Raw -Encoding UTF8 -LiteralPath $RunnerPath
$Typegen = Get-Content -Raw -Encoding UTF8 -LiteralPath $TypegenPath
$Package = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $RepositoryRoot 'package.json') | ConvertFrom-Json
function Assert-True([bool]$Condition,[string]$Message) { if (-not $Condition) { throw $Message } }
function Assert-Contains([string]$Text,[string]$Pattern,[string]$Message) { Assert-True ([regex]::IsMatch($Text,$Pattern,[System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) $Message }
$RunnerTokens=$null; $RunnerErrors=$null; [System.Management.Automation.Language.Parser]::ParseFile($RunnerPath,[ref]$RunnerTokens,[ref]$RunnerErrors) | Out-Null
$TypegenTokens=$null; $TypegenErrors=$null; [System.Management.Automation.Language.Parser]::ParseFile($TypegenPath,[ref]$TypegenTokens,[ref]$TypegenErrors) | Out-Null
Assert-True ($RunnerErrors.Count -eq 0) "WP7 runner 语法错误：$($RunnerErrors | ForEach-Object Message -join '; ')"
Assert-True ($TypegenErrors.Count -eq 0) "WP7 typegen 语法错误：$($TypegenErrors | ForEach-Object Message -join '; ')"
Assert-Contains $Runner "ValidateSet\('preflight', 'preview-0021', 'commit-0021', 'postflight'\)" 'WP7 阶段集合不完整。'
Assert-Contains $Runner "ShadowProjectRef\s*=\s*'qyjfcebqjtphlpsvizxo'" '未固定 Shadow ref。'
Assert-Contains $Runner "ProductionProjectRef\s*=\s*'kysywitrsjhcdlcrfayl'" '未排除生产 ref。'
Assert-Contains $Runner 'PREVIEW \$ShadowProjectRef WP7 0021 ROLLBACK' '缺少 WP7 rollback 短语。'
Assert-Contains $Runner 'WRITE \$ShadowProjectRef WP7 0021' '缺少 WP7 write 短语。'
Assert-Contains $Runner '8a5a14c117ff8e7e39ca2cd915277be1b4cbb36f20892176f550a9de7f78f97f' '0021 固定哈希缺失。'
Assert-Contains $Runner 'default_transaction_read_only=on' 'pre/postflight 未强制只读。'
Assert-Contains $Runner 'targetSecurityDefinerCount' '缺少 SECURITY DEFINER 后验。'
Assert-Contains $Runner 'targetForceRlsCount' '缺少 FORCE RLS 后验。'
Assert-Contains $Runner 'MigrationCommitted[\s\S]*PostflightPending[\s\S]*禁止重复提交' '未区分提交成功与后验失败。'
Assert-Contains $Typegen 'READ \$ShadowProjectRef WP7 TYPES' 'typegen 缺少精确读取短语。'
foreach ($Marker in @('rag_chunks','memory_candidates','sync_private_note_rag','search_private_note_rag','propose_assistant_memory','decide_assistant_memory','list_assistant_memories')) { Assert-Contains $Typegen $Marker "typegen 未验证 $Marker。" }
Assert-True ([string]$Package.scripts.'verify:wp7-shadow-stage-local' -match 'test-wp7-shadow-stage-local\.ps1') 'package 未接 WP7 Shadow 本地门。'
try { & $RunnerPath -Stage preview-0021 -ConfirmShadowPreview -ConfirmationPhrase 'WRONG'; throw '错误 preview 短语被接受。' } catch { Assert-True ($_.Exception.Message.Contains('PREVIEW qyjfcebqjtphlpsvizxo WP7 0021 ROLLBACK')) 'preview 未在外连前拒绝。' }
try { & $RunnerPath -Stage commit-0021 -ConfirmShadowWrite -ConfirmationPhrase 'WRONG'; throw '错误 write 短语被接受。' } catch { Assert-True ($_.Exception.Message.Contains('WRITE qyjfcebqjtphlpsvizxo WP7 0021')) 'write 未在外连前拒绝。' }
[pscustomobject]@{ RunnerParseErrors=$RunnerErrors.Count; TypegenParseErrors=$TypegenErrors.Count; FixedShadowRef=$true; ProductionExcluded=$true; NegativeRemoteGuards=2; ReadOnlyPreAndPostflight=$true; MigrationHashesPinned=1; RequiredWp7TypeMarkers=7 } | ConvertTo-Json -Compress
