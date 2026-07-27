[CmdletBinding()]
param(
  [string]$CredentialPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-shadow-credential-v2.json'),
  [switch]$ConfirmShadowRead,
  [string]$ConfirmationPhrase = ''
)

$ErrorActionPreference = 'Stop'
$ShadowProjectRef = 'qyjfcebqjtphlpsvizxo'
$ProductionProjectRef = 'kysywitrsjhcdlcrfayl'
$ExpectedPhrase = "READ $ShadowProjectRef WP6 TYPES"

if ($ShadowProjectRef -eq $ProductionProjectRef) {
  throw '拒绝执行：fixed Shadow ref 与生产 ref 相同。'
}
if (-not $ConfirmShadowRead -or $ConfirmationPhrase -cne $ExpectedPhrase) {
  throw "WP6 类型重生成需要 -ConfirmShadowRead 和精确确认短语：$ExpectedPhrase"
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$GeneratedPath = Join-Path $RepositoryRoot 'lib\database.types.ts'
$TypegenScript = Join-Path $RepositoryRoot 'scripts\generate-wp1c-shadow-types.ps1'
$BackupRoot = Join-Path $RepositoryRoot '.local-backups\wp6-typegen-rollback'
$BackupPath = Join-Path $BackupRoot 'database.types.before.ts'
$OriginalExists = Test-Path -LiteralPath $GeneratedPath
New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
if ($OriginalExists) {
  Copy-Item -LiteralPath $GeneratedPath -Destination $BackupPath -Force
}

$RequiredRpcMarkers = @(
  'start_math_paper_attempt',
  'record_math_ocr_confirmation',
  'record_math_ai_grade',
  'confirm_math_grade',
  'list_math_papers',
  'get_math_training_state',
  'get_math_grade_source',
  'create_private_booklet',
  'refresh_booklet_drift'
)
$RequiredTableMarkers = @(
  'math_papers',
  'math_paper_problems',
  'ocr_confirmations',
  'math_grade_steps',
  'booklets'
)

try {
  & $TypegenScript -CredentialPath $CredentialPath
  $GeneratedText = Get-Content -Raw -Encoding UTF8 -LiteralPath $GeneratedPath
  foreach ($Marker in @($RequiredRpcMarkers + $RequiredTableMarkers)) {
    if (-not $GeneratedText.Contains($Marker)) {
      throw "WP6 类型缺少标记：$Marker"
    }
  }
  $GeneratedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $GeneratedPath).Hash.ToLowerInvariant()
  [pscustomobject]@{
    ProjectRef = $ShadowProjectRef
    GeneratedTypePath = $GeneratedPath
    GeneratedTypeSha256 = $GeneratedHash
    RequiredMathRpcs = $RequiredRpcMarkers.Count
    RequiredMathTables = $RequiredTableMarkers.Count
    DeterministicTypeGeneration = $true
  } | ConvertTo-Json -Compress
} catch {
  if ($OriginalExists -and (Test-Path -LiteralPath $BackupPath)) {
    Copy-Item -LiteralPath $BackupPath -Destination $GeneratedPath -Force
  } elseif (-not $OriginalExists -and (Test-Path -LiteralPath $GeneratedPath)) {
    Remove-Item -LiteralPath $GeneratedPath -Force
  }
  throw
} finally {
  if (Test-Path -LiteralPath $BackupRoot) {
    $ResolvedBackupRoot = (Resolve-Path -LiteralPath $BackupRoot).Path
    $ExpectedLocalBackupRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups'))
    if (-not $ResolvedBackupRoot.StartsWith($ExpectedLocalBackupRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw '拒绝清理 .local-backups 之外的类型回滚目录。'
    }
    Remove-Item -LiteralPath $ResolvedBackupRoot -Recurse -Force
  }
}
