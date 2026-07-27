[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$GeneratorPath = Join-Path $RepositoryRoot 'scripts\prepare-wp2-production-single-proposal.mjs'
$RunnerPath = Join-Path $RepositoryRoot 'scripts\run-wp2-production-single-proposal.ps1'
$ProposalDir = Join-Path $RepositoryRoot '.local-backups\wp2-markdown-review\wp2-2026-07-12-8e6425fc'
$ProposalPath = Join-Path $ProposalDir 'production-single-proposal.json'
$Node = (Get-Command node -ErrorAction Stop).Source
$Pwsh = (Get-Command pwsh -ErrorAction Stop).Source

& $Node $GeneratorPath | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'Production single-proposal generator failed.'
}

$Generator = Get-Content -Raw -Encoding UTF8 -LiteralPath $GeneratorPath
$Runner = Get-Content -Raw -Encoding UTF8 -LiteralPath $RunnerPath
$Proposal = Get-Content -Raw -Encoding UTF8 -LiteralPath $ProposalPath | ConvertFrom-Json -Depth 100
$ProposalSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $ProposalPath).Hash.ToLowerInvariant()

$Tokens = $null
$ParseErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile($RunnerPath, [ref]$Tokens, [ref]$ParseErrors) | Out-Null
if (@($ParseErrors).Count -ne 0) {
  throw "WP2 production single runner has $(@($ParseErrors).Count) PowerShell parse error(s)."
}

function Assert-Contains([string]$Text, [string]$Pattern, [string]$Message) {
  if ($Text -notmatch $Pattern) { throw $Message }
}

function Assert-RunnerRejects([string[]]$Arguments, [string]$ExpectedText) {
  $Output = & $Pwsh '-NoLogo' '-NoProfile' '-File' $RunnerPath @Arguments 2>&1
  if ($LASTEXITCODE -eq 0) {
    throw "Runner unexpectedly accepted a negative guard case: $($Arguments -join ' ')"
  }
  if (($Output -join "`n") -notlike "*$ExpectedText*") {
    throw "Runner rejected a guard case for the wrong reason: $($Output -join "`n")"
  }
}

if (
  [string]$Proposal.productionProjectRef -cne 'kysywitrsjhcdlcrfayl' -or
  [string]$Proposal.forbiddenShadowProjectRef -cne 'qyjfcebqjtphlpsvizxo' -or
  [string]$Proposal.status -cne 'pending_production_preflight'
) {
  throw 'Generated production proposal does not pin the expected project boundary and status.'
}
if (
  [string]$Proposal.applyBatchId -notmatch '^wp2-production-single-[0-9a-f]{12}$' -or
  [string]$Proposal.rollbackBatchId -notmatch '^wp2-production-single-rollback-[0-9a-f]{12}$' -or
  [string]$Proposal.applyBatchId -ceq [string]$Proposal.rollbackBatchId
) {
  throw 'Generated production proposal batch IDs are not production-specific and distinct.'
}
if (
  [string]$Proposal.applyBatchId -ceq 'wp2-shadow-single-2f1bf66ec605' -or
  [string]$Proposal.rollbackBatchId -ceq 'wp2-shadow-single-rollback-2f1bf66ec605'
) {
  throw 'Generated production proposal reused a fixed Shadow batch ID.'
}

Assert-Contains $Generator 'productionContentVersionSource:\s*"production-readonly-preflight"' 'Generator does not leave content_version to production read-only preflight.'
Assert-Contains $Generator 'shadowCommitVerified:\s*true' 'Generator does not require the Shadow commit proof.'
Assert-Contains $Generator 'productionSnapshotFoundationVerified:\s*true' 'Generator does not require the production 0015 proof.'

Assert-Contains $Runner "ProductionProjectRef\s*=\s*'kysywitrsjhcdlcrfayl'" 'Runner does not pin production.'
Assert-Contains $Runner "ShadowProjectRef\s*=\s*'qyjfcebqjtphlpsvizxo'" 'Runner does not pin fixed Shadow as forbidden.'
Assert-Contains $Runner "LocalTunnelPort\s*=\s*15432" 'Runner does not pin the production loopback port.'
Assert-Contains $Runner 'ArgumentList\s+@\(\$TunnelScript,\s*''production''\)' 'Runner does not pin the production tunnel target.'
Assert-Contains $Runner 'MaxBackupAgeHours' 'Runner is missing the fresh-backup gate.'
Assert-Contains $Runner 'verify-wp1b-backup\.mjs' 'Runner does not verify the production backup.'
Assert-Contains $Runner 'proposalSha256' 'Runner does not bind evidence to the proposal checksum.'
Assert-Contains $Runner 'expectedContentVersion' 'Runner does not freeze and reuse content_version.'
Assert-Contains $Runner 'targetInvariantMd5' 'Runner does not fingerprint the target note outside the authorized field.'
Assert-Contains $Runner 'nonTargetNotesMd5' 'Runner does not fingerprint every non-target note.'
Assert-Contains $Runner 'Assert-BaselineStableExceptAuthorizedTarget' 'Runner does not guard the production baseline around mutation.'
Assert-Contains $Runner "OperationKind\s+-eq\s+'apply'.*ExpectedContentVersion\s+-eq\s+1" 'Runner does not constrain notesAtVersionOne to the exact apply 1→2 delta.'
Assert-Contains $Runner "notesStableChecksum',\s*'notesAtVersionOne'" 'Runner does not isolate the two target-derived baseline fields.'
Assert-Contains $Runner '''apply-reconcile''\s*=\s*"READ \$ProductionProjectRef WP2 SINGLE APPLY RECONCILE"' 'Runner is missing the read-only apply reconciliation gate.'
Assert-Contains $Runner 'reconciliationWritePerformed\s*=\s*\$false' 'Runner reconciliation does not explicitly record zero new writes.'
Assert-Contains $Runner "'apply-preview'.*?rollback" 'Runner is missing an apply transaction preview rollback path.'
Assert-Contains $Runner "'rollback-preview'.*?rollback" 'Runner is missing a rollback transaction preview rollback path.'
Assert-Contains $Runner 'rollbackLinksApply' 'Runner does not verify the immutable rollback link.'
Assert-Contains $Runner 'PriorBatchPostflightEvidencePath' 'Runner cannot chain multiple authorized fields behind one fresh backup.'
Assert-Contains $Runner 'Assert-BaselineMatchesArchivedApply \$BaselineBefore \$PriorBatchPostflightEvidence\.baseline' 'Runner does not bind the next batch preflight to the previous postflight baseline.'
Assert-Contains $Runner '\$Stage -in @\(''apply-preview'', ''apply''\)' 'Runner does not identify apply stages for chained baseline validation.'
Assert-Contains $Runner 'Assert-BaselineMatchesArchivedApply \$BaselineBefore \$PreflightEvidence\.baseline' 'Runner does not bind apply stages to their own fresh preflight baseline.'
Assert-Contains $Runner 'ToBase64String\(\s*\[System\.Text\.Encoding\]::UTF8\.GetBytes\(\[string\]\$Proposal\.beforeText\)' 'Runner does not encode before_text as UTF-8 base64 before invoking psql.'
Assert-Contains $Runner 'ToBase64String\(\s*\[System\.Text\.Encoding\]::UTF8\.GetBytes\(\[string\]\$Proposal\.afterText\)' 'Runner does not encode after_text as UTF-8 base64 before invoking psql.'
Assert-Contains $Runner "convert_from\(decode\(:'after_text_base64',\s*'base64'\),\s*'UTF8'\)" 'Runner does not decode after_text inside PostgreSQL.'
if ($Runner -match '--set=(before|after)_text=') {
  throw 'Runner still passes Markdown text directly through Windows native-process arguments.'
}
Assert-Contains $Runner 'ConnectTask\.Wait\(250\)' 'Runner loopback cleanup probe is not bounded.'
if ($Runner -match 'Get-NetTCPConnection') {
  throw 'Runner still uses the potentially blocking Get-NetTCPConnection cleanup path.'
}

$WrongPhraseCases = @(
  @{ Stage = 'preflight'; Switch = '-ConfirmProductionRead' },
  @{ Stage = 'apply-preview'; Switch = '-ConfirmProductionWrite' },
  @{ Stage = 'apply'; Switch = '-ConfirmProductionWrite' },
  @{ Stage = 'apply-reconcile'; Switch = '-ConfirmProductionRead' },
  @{ Stage = 'postflight'; Switch = '-ConfirmProductionRead' },
  @{ Stage = 'rollback-preview'; Switch = '-ConfirmProductionWrite' },
  @{ Stage = 'rollback'; Switch = '-ConfirmProductionWrite' },
  @{ Stage = 'rollback-postflight'; Switch = '-ConfirmProductionRead' }
)
foreach ($Case in $WrongPhraseCases) {
  Assert-RunnerRejects @(
    '-BackupDir', $RepositoryRoot,
    '-Stage', $Case.Stage,
    $Case.Switch,
    '-ConfirmationPhrase', 'WRONG'
  ) '精确确认短语'
}

$TempFiles = [System.Collections.Generic.List[string]]::new()
try {
  $ChecksumProposalPath = Join-Path $ProposalDir "production-single-proposal-checksum-negative-$([guid]::NewGuid().ToString('N')).json"
  $ChecksumProposal = Get-Content -Raw -Encoding UTF8 -LiteralPath $ProposalPath | ConvertFrom-Json -Depth 100
  $ChecksumProposal.beforeChecksum = '0' * 64
  $ChecksumProposal | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $ChecksumProposalPath -Encoding UTF8
  $TempFiles.Add($ChecksumProposalPath)
  Assert-RunnerRejects @(
    '-BackupDir', $RepositoryRoot,
    '-ProposalPath', $ChecksumProposalPath,
    '-Stage', 'preflight',
    '-ConfirmProductionRead',
    '-ConfirmationPhrase', 'READ kysywitrsjhcdlcrfayl WP2 SINGLE PREFLIGHT'
  ) 'before checksum'

  $BatchProposalPath = Join-Path $ProposalDir "production-single-proposal-batch-negative-$([guid]::NewGuid().ToString('N')).json"
  $BatchProposal = Get-Content -Raw -Encoding UTF8 -LiteralPath $ProposalPath | ConvertFrom-Json -Depth 100
  $BatchProposal.applyBatchId = 'wp2-shadow-single-2f1bf66ec605'
  $BatchProposal | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $BatchProposalPath -Encoding UTF8
  $TempFiles.Add($BatchProposalPath)
  Assert-RunnerRejects @(
    '-BackupDir', $RepositoryRoot,
    '-ProposalPath', $BatchProposalPath,
    '-Stage', 'preflight',
    '-ConfirmProductionRead',
    '-ConfirmationPhrase', 'READ kysywitrsjhcdlcrfayl WP2 SINGLE PREFLIGHT'
  ) 'batch 契约'

  $VersionEvidencePath = Join-Path ([System.IO.Path]::GetTempPath()) "wp2-production-single-version-negative-$([guid]::NewGuid().ToString('N')).json"
  [ordered]@{
    evidenceVersion = 1
    stage = 'preflight'
    projectRef = 'kysywitrsjhcdlcrfayl'
    proposalSha256 = $ProposalSha256
    expectedContentVersion = 0
    targetState = [ordered]@{
      fieldChecksum = $Proposal.beforeChecksum
      contentVersion = 0
      targetCount = 1
    }
    productionWritePerformed = $false
  } | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $VersionEvidencePath -Encoding UTF8
  $TempFiles.Add($VersionEvidencePath)
  Assert-RunnerRejects @(
    '-BackupDir', $RepositoryRoot,
    '-Stage', 'apply-preview',
    '-PreflightEvidencePath', $VersionEvidencePath,
    '-ConfirmProductionWrite',
    '-ConfirmationPhrase', 'PREVIEW kysywitrsjhcdlcrfayl WP2 SINGLE APPLY'
  ) '正数 expected content version'

  Assert-RunnerRejects @(
    '-BackupDir', $RepositoryRoot,
    '-Stage', 'rollback-preview',
    '-PreflightEvidencePath', $VersionEvidencePath,
    '-ConfirmProductionWrite',
    '-ConfirmationPhrase', 'PREVIEW kysywitrsjhcdlcrfayl WP2 SINGLE ROLLBACK'
  ) 'apply 证据'
} finally {
  foreach ($Path in $TempFiles) {
    Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
  }
}

[pscustomobject]@{
  RunnerParseErrors = 0
  RunnerTokenCount = @($Tokens).Count
  GeneratedProposalSha256 = $ProposalSha256
  ProductionSpecificBatchIds = $true
  ContentVersionDeferredToReadOnlyPreflight = $true
  ExactStagePhrases = 8
  NegativeAuthorizationCases = 8
  NegativeChecksumCases = 1
  NegativeBatchCases = 1
  NegativeVersionCases = 1
  NegativeRollbackEvidenceCases = 1
  FreshBackupPerRemoteStage = $true
  ApplyAndRollbackTransactionPreviews = $true
  BoundedTunnelCleanup = $true
} | ConvertTo-Json -Compress
