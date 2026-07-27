[CmdletBinding()]
param(
  [ValidateSet('preflight', 'transaction-preview', 'apply-rollback', 'postflight')]
  [string]$Stage = 'preflight',
  [string]$ProposalPath = (Join-Path $PSScriptRoot '..\.local-backups\wp2-markdown-review\wp2-2026-07-12-8e6425fc\shadow-single-proposal.json'),
  [string]$CredentialPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-shadow-credential-v2.json'),
  [switch]$ConfirmShadowWrite,
  [string]$ConfirmationPhrase = ''
)

$ErrorActionPreference = 'Stop'
$ShadowProjectRef = 'qyjfcebqjtphlpsvizxo'
$ProductionProjectRef = 'kysywitrsjhcdlcrfayl'
$PreviewPhrase = "PREVIEW $ShadowProjectRef WP2 SINGLE APPLY ROLLBACK"
$CommitPhrase = "COMMIT $ShadowProjectRef WP2 SINGLE APPLY ROLLBACK"
$LocalTunnelPort = 15433

if ($ShadowProjectRef -eq $ProductionProjectRef) {
  throw '拒绝执行：fixed shadow ref 与生产 ref 相同。'
}
if ($Stage -eq 'transaction-preview' -and (-not $ConfirmShadowWrite -or $ConfirmationPhrase -cne $PreviewPhrase)) {
  throw "事务预演需要 -ConfirmShadowWrite 和精确确认短语：$PreviewPhrase"
}
if ($Stage -eq 'apply-rollback' -and (-not $ConfirmShadowWrite -or $ConfirmationPhrase -cne $CommitPhrase)) {
  throw "提交 apply/rollback 需要 -ConfirmShadowWrite 和精确确认短语：$CommitPhrase"
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Proposal = Get-Content -Raw -Encoding UTF8 -LiteralPath $ProposalPath | ConvertFrom-Json -Depth 100
$Credential = Get-Content -Raw -Encoding UTF8 -LiteralPath $CredentialPath | ConvertFrom-Json -Depth 20
$ProposalKind = if ($Proposal.PSObject.Properties.Name -contains 'proposalKind') { [string]$Proposal.proposalKind } else { 'ai-repair' }

if ([string]$Proposal.shadowProjectRef -cne $ShadowProjectRef -or [string]$Proposal.forbiddenProductionProjectRef -cne $ProductionProjectRef) {
  throw '提案包项目边界与 fixed shadow 契约不一致。'
}
if ([string]$Proposal.status -cne 'pending_user_approval' -or [string]$Proposal.validationStatus -cne 'pending_user_approval') {
  throw '提案包不处于待用户批准状态。'
}
if ($ProposalKind -eq 'ui-correction') {
  if ($Proposal.aiInvolved -ne $false -or $Proposal.validationDetail.localRenderVerified -ne $true -or $Proposal.validationDetail.visibleHashArtifactFound -ne $true) {
    throw 'UI 修正提案必须标记为非 AI 写入，并通过本地渲染与可见字符验收。'
  }
} elseif ($ProposalKind -ne 'ai-repair') {
  throw 'Shadow 单篇提案 proposalKind 不受支持。'
}
if ([string]::IsNullOrWhiteSpace([string]$Credential.databasePassword)) {
  throw 'fixed shadow 数据库密码缺失。'
}
if ([string]$Proposal.beforeChecksum -notmatch '^[0-9a-f]{64}$' -or [string]$Proposal.afterChecksum -notmatch '^[0-9a-f]{64}$') {
  throw '提案包 checksum 格式无效。'
}

$PgBin = (Resolve-Path (Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin')).Path
$Psql = Join-Path $PgBin 'psql.exe'
$TunnelScript = Join-Path $RepositoryRoot 'scripts\wp1b-pg-http-connect-tunnel.mjs'
$DatabaseParameters = @(
  'host=aws-0-ap-southeast-1.pooler.supabase.com',
  'hostaddr=127.0.0.1',
  "port=$LocalTunnelPort",
  'dbname=postgres',
  "user=postgres.$ShadowProjectRef",
  'sslmode=require',
  'connect_timeout=10'
) -join ' '

$ValidationDetail = ($Proposal.validationDetail | ConvertTo-Json -Compress -Depth 20)
$AfterTextBase64 = [Convert]::ToBase64String(
  [System.Text.Encoding]::UTF8.GetBytes([string]$Proposal.afterText)
)
$PsqlVariables = @(
  "--set=note_id=$($Proposal.noteId)",
  "--set=field_path=$($Proposal.fieldPath)",
  "--set=before_checksum=$($Proposal.beforeChecksum)",
  "--set=after_checksum=$($Proposal.afterChecksum)",
  "--set=after_text_base64=$AfterTextBase64",
  "--set=rule_version=$($Proposal.ruleVersion)",
  "--set=ai_provider=$($Proposal.aiProvider)",
  "--set=ai_model=$($Proposal.aiModel)",
  "--set=ai_request_id=$($Proposal.aiRequestId)",
  "--set=ai_involved=$(([bool]$Proposal.aiInvolved).ToString().ToLowerInvariant())",
  "--set=validation_detail=$ValidationDetail",
  "--set=apply_batch_id=$($Proposal.applyBatchId)",
  "--set=rollback_batch_id=$($Proposal.rollbackBatchId)"
)

function Invoke-PsqlJson([string]$Sql) {
  $arguments = @(
    '--dbname', $DatabaseParameters,
    '--no-password',
    '--no-psqlrc',
    '--quiet',
    '--tuples-only',
    '--no-align',
    '--set=ON_ERROR_STOP=1'
  ) + $PsqlVariables
  $rows = $Sql | & $Psql @arguments
  if ($LASTEXITCODE -ne 0) { throw 'fixed shadow WP2 单篇 SQL 执行失败。' }
  $jsonLine = $rows | Where-Object {
    -not [string]::IsNullOrWhiteSpace($_) -and $_.TrimStart().StartsWith('{')
  } | Select-Object -Last 1
  if ([string]::IsNullOrWhiteSpace([string]$jsonLine)) { throw 'fixed shadow WP2 单篇 SQL 没有返回 JSON 证据。' }
  try { return ([string]$jsonLine | ConvertFrom-Json) } catch { throw 'fixed shadow WP2 单篇 JSON 证据无效。' }
}

$PreflightSql = @'
begin transaction read only;
with target as (
  select
    note.content_version,
    private.content_sha256(private.read_note_markdown_field(note.content, note.problems, :'field_path')) as field_checksum
  from public.notes note
  where note.id = :'note_id'::uuid
), batch_rows as (
  select count(*)::bigint as row_count
  from public.content_migration_snapshots snapshot
  where snapshot.note_id = :'note_id'::uuid
    and snapshot.field_path = :'field_path'
    and snapshot.batch_id in (:'apply_batch_id', :'rollback_batch_id')
)
select jsonb_build_object(
  'identityOk', current_database() = 'postgres' and current_user = 'postgres',
  'snapshotTable', to_regclass('public.content_migration_snapshots') is not null,
  'applyFunction', to_regprocedure('public.apply_content_migration(uuid,text,text,text,bigint,text,text,text,boolean,text,text,text,text,jsonb)') is not null,
  'rollbackFunction', to_regprocedure('public.rollback_content_migration(uuid,text,bigint,jsonb)') is not null,
  'adminCount', (select count(*) from public.admin_users),
  'adminAuthCount', (
    select count(*)
    from public.admin_users admin_user
    join auth.users auth_user on lower(auth_user.email) = lower(admin_user.email)
  ),
  'targetCount', (select count(*) from target),
  'contentVersion', coalesce((select content_version from target), 0),
  'beforeMatches', coalesce((select field_checksum = :'before_checksum' from target), false),
  'batchRows', (select row_count from batch_rows)
)::text;
rollback;
'@

$MutationSqlTemplate = @'
begin;
do $$
begin
  if (
    select count(*)
    from public.admin_users admin_user
    join auth.users auth_user on lower(auth_user.email) = lower(admin_user.email)
  ) <> 1 then
    raise exception 'fixed shadow must contain exactly one joined admin auth user';
  end if;
end
$$;
select set_config(
  'request.jwt.claim.sub',
  (
    select auth_user.id::text
    from public.admin_users admin_user
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
create temp table wp2_before on commit drop as
select
  note.content_version,
  private.content_sha256(private.read_note_markdown_field(note.content, note.problems, :'field_path')) as field_checksum,
  (select count(*) from public.content_migration_snapshots) as snapshot_count
from public.notes note
where note.id = :'note_id'::uuid;
create temp table wp2_apply on commit drop as
select id, note_content_version_before, note_content_version_after
from public.apply_content_migration(
  :'note_id'::uuid,
  :'field_path',
  :'apply_batch_id',
  :'rule_version',
  (select content_version from wp2_before),
  :'before_checksum',
  convert_from(decode(:'after_text_base64', 'base64'), 'UTF8'),
  :'after_checksum',
  :'ai_involved'::boolean,
  :'ai_provider',
  :'ai_model',
  :'ai_request_id',
  'human_approved',
  :'validation_detail'::jsonb
);
create temp table wp2_after_apply on commit drop as
select
  note.content_version,
  private.content_sha256(private.read_note_markdown_field(note.content, note.problems, :'field_path')) as field_checksum
from public.notes note
where note.id = :'note_id'::uuid;
create temp table wp2_rollback on commit drop as
select id, reverts_snapshot_id, note_content_version_before, note_content_version_after
from public.rollback_content_migration(
  (select id from wp2_apply),
  :'rollback_batch_id',
  (select content_version from wp2_after_apply),
  '{"reason":"fixed-shadow-single-proposal-proof"}'::jsonb
);
create temp table wp2_final on commit drop as
select
  note.content_version,
  private.content_sha256(private.read_note_markdown_field(note.content, note.problems, :'field_path')) as field_checksum,
  (select count(*) from public.content_migration_snapshots) as snapshot_count
from public.notes note
where note.id = :'note_id'::uuid;
select jsonb_build_object(
  'applyRows', (select count(*) from wp2_apply),
  'rollbackRows', (select count(*) from wp2_rollback),
  'applyVersionAdvancedOnce', (select note_content_version_after = note_content_version_before + 1 from wp2_apply),
  'rollbackVersionAdvancedOnce', (select note_content_version_after = note_content_version_before + 1 from wp2_rollback),
  'afterMatches', (select field_checksum = :'after_checksum' from wp2_after_apply),
  'restoredBefore', (select field_checksum = :'before_checksum' from wp2_final),
  'versionAdvancedTwice', (select final.content_version = before.content_version + 2 from wp2_final final cross join wp2_before before),
  'snapshotDelta', (select final.snapshot_count - before.snapshot_count from wp2_final final cross join wp2_before before),
  'rollbackLinksApply', (select rollback.reverts_snapshot_id = apply.id from wp2_rollback rollback cross join wp2_apply apply)
)::text;
__END_TRANSACTION__;
'@

$PostflightSql = @'
begin transaction read only;
with migration as (
  select * from public.content_migration_snapshots
  where note_id = :'note_id'::uuid and field_path = :'field_path' and batch_id = :'apply_batch_id'
), rollback as (
  select * from public.content_migration_snapshots
  where note_id = :'note_id'::uuid and field_path = :'field_path' and batch_id = :'rollback_batch_id'
), target as (
  select
    note.content_version,
    private.content_sha256(private.read_note_markdown_field(note.content, note.problems, :'field_path')) as field_checksum
  from public.notes note
  where note.id = :'note_id'::uuid
)
select jsonb_build_object(
  'migrationRows', (select count(*) from migration),
  'rollbackRows', (select count(*) from rollback),
  'restoredBefore', coalesce((select field_checksum = :'before_checksum' from target), false),
  'versionAdvancedTwice', coalesce((
    select
      migration.note_content_version_after = migration.note_content_version_before + 1
      and rollback.note_content_version_before = migration.note_content_version_after
      and rollback.note_content_version_after = migration.note_content_version_before + 2
      and target.content_version >= rollback.note_content_version_after
    from target cross join migration cross join rollback
  ), false),
  'rollbackLinksApply', coalesce((select rollback.reverts_snapshot_id = migration.id from rollback cross join migration), false),
  'validationHumanApproved', coalesce((select validation_status = 'human_approved' and ai_involved = :'ai_involved'::boolean from migration), false),
  'rollbackVerified', coalesce((select validation_status = 'rollback_verified' and not ai_involved from rollback), false)
)::text;
rollback;
'@

function Assert-Preflight($Result, [bool]$RequireEmptyBatch) {
  if ($Result.identityOk -ne $true -or $Result.snapshotTable -ne $true -or $Result.applyFunction -ne $true -or $Result.rollbackFunction -ne $true -or [int]$Result.adminCount -ne 1 -or [int]$Result.adminAuthCount -ne 1 -or [int]$Result.targetCount -ne 1 -or [int64]$Result.contentVersion -lt 1 -or $Result.beforeMatches -ne $true) {
    throw 'fixed shadow 单篇 preflight 失败。'
  }
  if ($RequireEmptyBatch -and [int64]$Result.batchRows -ne 0) {
    throw 'fixed shadow 已存在当前单篇批次证据，拒绝重复写入。'
  }
}

function Assert-MutationProof($Result) {
  if ([int]$Result.applyRows -ne 1 -or [int]$Result.rollbackRows -ne 1 -or $Result.applyVersionAdvancedOnce -ne $true -or $Result.rollbackVersionAdvancedOnce -ne $true -or $Result.afterMatches -ne $true -or $Result.restoredBefore -ne $true -or $Result.versionAdvancedTwice -ne $true -or [int64]$Result.snapshotDelta -ne 2 -or $Result.rollbackLinksApply -ne $true) {
    throw 'fixed shadow 单篇 apply/rollback 证明矩阵失败。'
  }
}

$TunnelProcess = $null
$PreviousPgPassword = $env:PGPASSWORD
$PreviousPgOptions = $env:PGOPTIONS
try {
  $Node = (Get-Command node -ErrorAction Stop).Source
  $TunnelProcess = Start-Process -FilePath $Node -ArgumentList @($TunnelScript, 'shadow') `
    -WorkingDirectory $RepositoryRoot -WindowStyle Hidden -PassThru

  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
    try {
      $client = [System.Net.Sockets.TcpClient]::new()
      $client.Connect('127.0.0.1', $LocalTunnelPort)
      $client.Dispose()
      $ready = $true
      break
    } catch { Start-Sleep -Milliseconds 250 }
  }
  if (-not $ready) { throw 'fixed shadow loopback 隧道未就绪。' }

  $env:PGPASSWORD = [string]$Credential.databasePassword
  $env:PGOPTIONS = if ($Stage -in @('preflight', 'postflight')) {
    '-c default_transaction_read_only=on -c statement_timeout=60000'
  } else {
    '-c lock_timeout=5000 -c statement_timeout=120000'
  }

  if ($Stage -eq 'postflight') {
    $result = Invoke-PsqlJson $PostflightSql
    if ([int]$result.migrationRows -ne 1 -or [int]$result.rollbackRows -ne 1 -or $result.restoredBefore -ne $true -or $result.versionAdvancedTwice -ne $true -or $result.rollbackLinksApply -ne $true -or $result.validationHumanApproved -ne $true -or $result.rollbackVerified -ne $true) {
      throw 'fixed shadow 单篇 postflight 失败。'
    }
    [pscustomobject]@{ ProjectRef = $ShadowProjectRef; Stage = $Stage; PostflightPassed = $true; NoteRestored = $true; AuditRows = 2 } | ConvertTo-Json -Compress
    return
  }

  $before = Invoke-PsqlJson $PreflightSql
  Assert-Preflight $before ($Stage -ne 'preflight')
  if ($Stage -eq 'preflight') {
    [pscustomobject]@{ ProjectRef = $ShadowProjectRef; Stage = $Stage; PreflightPassed = $true; CandidateIndex = [int]$Proposal.selectedCandidateIndex; FieldPath = [string]$Proposal.fieldPath; ContentVersion = [int64]$before.contentVersion; ExistingBatchRows = [int64]$before.batchRows } | ConvertTo-Json -Compress
    return
  }

  $endTransaction = if ($Stage -eq 'transaction-preview') { 'rollback' } else { 'commit' }
  $mutationSql = $MutationSqlTemplate.Replace('__END_TRANSACTION__', $endTransaction)
  $proof = Invoke-PsqlJson $mutationSql
  Assert-MutationProof $proof

  if ($Stage -eq 'transaction-preview') {
    $after = Invoke-PsqlJson $PreflightSql
    Assert-Preflight $after $true
    if ([int64]$after.contentVersion -ne [int64]$before.contentVersion) {
      throw 'fixed shadow 事务预演回滚后 content_version 未恢复。'
    }
    [pscustomobject]@{ ProjectRef = $ShadowProjectRef; Stage = $Stage; TransactionProofPassed = $true; DatabaseRollbackPassed = $true; NoteRestored = $true; PersistedAuditRows = 0 } | ConvertTo-Json -Compress
    return
  }

  $postflight = Invoke-PsqlJson $PostflightSql
  if ([int]$postflight.migrationRows -ne 1 -or [int]$postflight.rollbackRows -ne 1 -or $postflight.restoredBefore -ne $true -or $postflight.versionAdvancedTwice -ne $true -or $postflight.rollbackLinksApply -ne $true -or $postflight.validationHumanApproved -ne $true -or $postflight.rollbackVerified -ne $true) {
    throw 'fixed shadow 单篇提交后验失败。'
  }
  [pscustomobject]@{ ProjectRef = $ShadowProjectRef; Stage = $Stage; ApplyRollbackPassed = $true; NoteRestored = $true; PersistedAuditRows = 2; ProductionConnected = $false } | ConvertTo-Json -Compress
} finally {
  if ($null -eq $PreviousPgPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD = $PreviousPgPassword }
  if ($null -eq $PreviousPgOptions) { Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue } else { $env:PGOPTIONS = $PreviousPgOptions }
  if ($null -ne $TunnelProcess -and -not $TunnelProcess.HasExited) {
    Stop-Process -Id $TunnelProcess.Id -Force -ErrorAction SilentlyContinue
    $TunnelProcess.WaitForExit(5000) | Out-Null
  }
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    if (-not (Get-NetTCPConnection -LocalPort $LocalTunnelPort -State Listen -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 100
  }
  if (Get-NetTCPConnection -LocalPort $LocalTunnelPort -State Listen -ErrorAction SilentlyContinue) {
    throw "fixed shadow 隧道端口 $LocalTunnelPort 清理失败。"
  }
}
