[CmdletBinding()]
param(
  [string]$CredentialPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-shadow-credential-v2.json'),
  [switch]$ConfirmShadowRead,
  [string]$ConfirmationPhrase = ''
)

$ErrorActionPreference = 'Stop'
$ShadowProjectRef = 'qyjfcebqjtphlpsvizxo'
$ProductionProjectRef = 'kysywitrsjhcdlcrfayl'
$ExpectedPhrase = "READ $ShadowProjectRef WP5 TYPES"

if ($ShadowProjectRef -eq $ProductionProjectRef) {
  throw '拒绝执行：fixed Shadow ref 与生产 ref 相同。'
}
if (-not $ConfirmShadowRead -or $ConfirmationPhrase -cne $ExpectedPhrase) {
  throw "WP5 类型重生成需要 -ConfirmShadowRead 和精确确认短语：$ExpectedPhrase"
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$GeneratedPath = Join-Path $RepositoryRoot 'lib\database.types.ts'
$TypegenScript = Join-Path $RepositoryRoot 'scripts\generate-wp1c-shadow-types.ps1'
$BackupRoot = Join-Path $RepositoryRoot '.local-backups\wp5-typegen-rollback'
$BackupPath = Join-Path $BackupRoot 'database.types.before.ts'
$OriginalExists = Test-Path -LiteralPath $GeneratedPath
New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
if ($OriginalExists) {
  Copy-Item -LiteralPath $GeneratedPath -Destination $BackupPath -Force
}

$RequiredRpcMarkers = @(
  'record_english_training_command',
  'record_english_subjective_submission',
  'confirm_english_subjective_grade'
)

try {
  & $TypegenScript -CredentialPath $CredentialPath
  $GeneratedText = Get-Content -Raw -Encoding UTF8 -LiteralPath $GeneratedPath
  foreach ($Marker in $RequiredRpcMarkers) {
    if (-not $GeneratedText.Contains($Marker)) {
      throw "WP5 类型缺少 RPC：$Marker"
    }
  }
  $GeneratedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $GeneratedPath).Hash.ToLowerInvariant()
  [pscustomobject]@{
    ProjectRef = $ShadowProjectRef
    GeneratedTypePath = $GeneratedPath
    GeneratedTypeSha256 = $GeneratedHash
    RequiredEnglishRpcs = $RequiredRpcMarkers.Count
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
