[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$RunnerPath = Join-Path $RepositoryRoot 'scripts\run-wp2-production-stage.ps1'
$MigrationPath = Join-Path $RepositoryRoot 'supabase\migrations\0015_content_migration_snapshots.sql'
$Runner = Get-Content -Raw -Encoding UTF8 -LiteralPath $RunnerPath
$Migration = Get-Content -Raw -Encoding UTF8 -LiteralPath $MigrationPath
$MigrationSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $MigrationPath).Hash.ToLowerInvariant()

$Tokens = $null
$ParseErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile($RunnerPath, [ref]$Tokens, [ref]$ParseErrors) | Out-Null
if (@($ParseErrors).Count -ne 0) {
  throw "WP2 production runner has $(@($ParseErrors).Count) PowerShell parse error(s)."
}

function Assert-Contains([string]$Pattern, [string]$Message) {
  if ($Runner -notmatch $Pattern) {
    throw $Message
  }
}

function Assert-RunnerRejects([string[]]$Arguments, [string]$ExpectedText) {
  $Pwsh = (Get-Command pwsh -ErrorAction Stop).Source
  $Output = & $Pwsh '-NoLogo' '-NoProfile' '-File' $RunnerPath @Arguments 2>&1
  if ($LASTEXITCODE -eq 0) {
    throw "Runner unexpectedly accepted a negative guard case: $($Arguments -join ' ')"
  }
  if (($Output -join "`n") -notlike "*$ExpectedText*") {
    throw "Runner rejected a guard case for the wrong reason: $($Output -join ' ')"
  }
}

Assert-Contains "ProductionProjectRef\s*=\s*'kysywitrsjhcdlcrfayl'" 'Runner does not pin the production project ref.'
Assert-Contains "ShadowProjectRef\s*=\s*'qyjfcebqjtphlpsvizxo'" 'Runner does not pin the forbidden fixed shadow ref.'
Assert-Contains 'READ \$ProductionProjectRef WP2 0015 PREFLIGHT' 'Runner is missing the exact read-only preflight phrase.'
Assert-Contains 'READ \$ProductionProjectRef WP2 0015 POSTFLIGHT' 'Runner is missing the exact read-only postflight phrase.'
Assert-Contains 'WRITE \$ProductionProjectRef 0015' 'Runner is missing the exact production write phrase.'
Assert-Contains 'MaxBackupAgeHours' 'Runner is missing the fresh-backup age gate.'
Assert-Contains 'verify-wp1b-backup\.mjs' 'Runner does not verify backup hashes and stable audits.'
Assert-Contains 'productionStableDuringBackup' 'Runner does not require a stable production backup.'
Assert-Contains 'StartsWith\(\$BackupPrefix' 'Runner does not confine backup paths to the fixed root.'
Assert-Contains 'default_transaction_read_only=on' 'Runner does not force read-only preflight/postflight sessions.'
Assert-Contains '(?s)ArgumentList\s+@\(\$TunnelScript,\s*''production''\)' 'Runner does not pin the production tunnel target.'
Assert-Contains 'LocalTunnelPort\s*=\s*15432' 'Runner does not pin the production loopback port.'
Assert-Contains 'snapshotTable\s*-ne\s*\$false' 'Runner does not require the unique pre-0015 state.'
Assert-Contains 'snapshotRows\s*-ne\s*0' 'Runner does not require an empty new snapshot table.'
Assert-Contains 'Assert-BaselineMatchesBackup' 'Runner does not compare live production to the fresh backup.'
Assert-Contains 'Assert-BaselineStable' 'Runner does not prove protected production data stayed stable.'
Assert-Contains 'MigrationHash' 'Runner does not freeze the 0015 migration checksum.'
Assert-Contains "ExpectedMigrationSha256\s*=\s*'$MigrationSha256'" 'Runner expected migration checksum does not match the reviewed 0015 file.'
Assert-Contains 'function Test-LoopbackPortListening' 'Runner is missing the bounded loopback cleanup probe.'
Assert-Contains 'ConnectTask\.Wait\(250\)' 'Runner loopback cleanup probe does not have a bounded wait.'
Assert-Contains 'Test-LoopbackPortListening \$LocalTunnelPort' 'Runner does not verify tunnel cleanup.'
if ($Runner -match 'Get-NetTCPConnection') {
  throw 'Runner still uses Get-NetTCPConnection, which can hang during Windows cleanup.'
}

if ($Migration -notmatch '(?is)^\s*--.*?begin\s*;.*commit\s*;\s*$') {
  throw '0015 is not a single explicit transaction.'
}
if ($Migration -match '(?im)^\s*select\s+(?:\*\s+from\s+)?public\.(?:apply|rollback)_content_migration\s*\(') {
  throw '0015 invokes a content mutation RPC while installing schema.'
}
if ($Migration -notmatch '(?is)before\s+update\s+or\s+delete\s+on\s+public\.content_migration_snapshots') {
  throw '0015 is missing immutable snapshot mutation rejection.'
}

Assert-RunnerRejects @('-BackupDir', $RepositoryRoot, '-Stage', 'preflight') 'exact phrase'
Assert-RunnerRejects @('-BackupDir', $RepositoryRoot, '-Stage', '0015', '-ConfirmProductionWrite', '-ConfirmationPhrase', 'WRONG') 'exact phrase'
Assert-RunnerRejects @('-BackupDir', $RepositoryRoot, '-Stage', 'postflight', '-ConfirmProductionRead', '-ConfirmationPhrase', 'WRONG') 'exact phrase'

[pscustomobject]@{
  RunnerParseErrors = 0
  RunnerTokenCount = @($Tokens).Count
  FixedProductionRef = $true
  FixedShadowExclusion = $true
  ExactReadAndWritePhrases = $true
  NegativeRuntimeGuards = 3
  FreshBackupGate = $true
  NativeReadOnlyGate = $true
  ProtectedBaselineGate = $true
  FrozenMigrationSha256 = $MigrationSha256
  TunnelCleanupGate = $true
  MigrationSingleTransaction = $true
  MigrationDoesNotInvokeContentMutationRpc = $true
} | ConvertTo-Json -Compress
