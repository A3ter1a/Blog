[CmdletBinding()]
param(
  [string]$ProposalPath = (Join-Path $PSScriptRoot '..\.local-backups\wp2-markdown-review\wp2-2026-07-12-8e6425fc\shadow-ui-correction-proposal.json'),
  [string]$CredentialPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-shadow-credential-v2.json')
)

$ErrorActionPreference = 'Stop'
$ShadowProjectRef = 'qyjfcebqjtphlpsvizxo'
$ProductionProjectRef = 'kysywitrsjhcdlcrfayl'
$LocalTunnelPort = 15433
$RebuildApplyBatchId = 'wp2-shadow-ui-rebuild-39cb53431c70'
$RebuildRollbackBatchId = 'wp2-shadow-ui-rebuild-rollback-39cb53431c70'

if ($ShadowProjectRef -eq $ProductionProjectRef) {
  throw '拒绝执行：fixed shadow ref 与生产 ref 相同。'
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Proposal = Get-Content -Raw -Encoding UTF8 -LiteralPath $ProposalPath | ConvertFrom-Json -Depth 100
$Credential = Get-Content -Raw -Encoding UTF8 -LiteralPath $CredentialPath | ConvertFrom-Json -Depth 20
if ([string]$Proposal.noteId -ne 'e8265c20-04dd-4003-a378-b50bd995299f' -or [string]$Proposal.fieldPath -ne 'problems.95.options.2.content') {
  throw 'UI 修正提案目标不是固定的单字段。'
}
if ([string]$Proposal.applyBatchId -ne 'wp2-shadow-single-39cb53431c70' -or [string]$Proposal.rollbackBatchId -ne 'wp2-shadow-single-rollback-39cb53431c70') {
  throw 'UI 修正提案批次不是固定的 Shadow 预演批次。'
}
if ([string]$Proposal.shadowProjectRef -cne $ShadowProjectRef -or [string]$Proposal.forbiddenProductionProjectRef -cne $ProductionProjectRef) {
  throw '提案包项目边界与 fixed shadow 契约不一致。'
}
if ([string]::IsNullOrWhiteSpace([string]$Credential.databasePassword)) {
  throw 'fixed shadow 数据库密码缺失。'
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
$RebuildValidationDetail = '{"source":"fixed-shadow-ui-chain-rebuild","priorProductionText":"#$(X_1, X)$"}'
$PsqlVariables = @(
  "--set=note_id=$($Proposal.noteId)",
  "--set=field_path=$($Proposal.fieldPath)",
  "--set=original_before_checksum=5a5dc166e84d57b650dc9b094caeece22bc56360dc37b7fb9c6a7a1f1eda46a7",
  '--set=rebuild_after_text=#$(X_1, X)$',
  "--set=rebuild_after_checksum=0e0b2e08a8ab8ba069c4b7d489d75e46bf4acaa6765c777abc3554b452ff2001",
  "--set=ui_before_checksum=$($Proposal.beforeChecksum)",
  "--set=ui_after_text=$($Proposal.afterText)",
  "--set=ui_after_checksum=$($Proposal.afterChecksum)",
  "--set=rebuild_apply_batch_id=$RebuildApplyBatchId",
  "--set=rebuild_rollback_batch_id=$RebuildRollbackBatchId",
  "--set=ui_apply_batch_id=$($Proposal.applyBatchId)",
  "--set=ui_rollback_batch_id=$($Proposal.rollbackBatchId)",
  "--set=rule_version=$($Proposal.ruleVersion)",
  "--set=ui_ai_provider=$($Proposal.aiProvider)",
  "--set=ui_ai_model=$($Proposal.aiModel)",
  "--set=ui_ai_request_id=$($Proposal.aiRequestId)",
  "--set=validation_detail=$ValidationDetail",
  "--set=rebuild_validation_detail=$RebuildValidationDetail"
)

function Invoke-PsqlJson([string]$Sql, [string]$PgOptions) {
  $previous = $env:PGOPTIONS
  $env:PGOPTIONS = $PgOptions
  try {
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
    if ($LASTEXITCODE -ne 0) { throw 'fixed shadow WP2 UI chain SQL 执行失败。' }
    $jsonLine = $rows | Where-Object {
      -not [string]::IsNullOrWhiteSpace($_) -and $_.TrimStart().StartsWith('{')
    } | Select-Object -Last 1
    if ([string]::IsNullOrWhiteSpace([string]$jsonLine)) { throw 'fixed shadow WP2 UI chain 没有返回 JSON 证据。' }
    try { return ([string]$jsonLine | ConvertFrom-Json) } catch { throw 'fixed shadow WP2 UI chain JSON 证据无效。' }
  } finally {
    if ($null -eq $previous) { Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue } else { $env:PGOPTIONS = $previous }
  }
}

$TransactionSql = @'
begin;
do $$
begin
  if (current_database() <> 'postgres' or current_user <> 'postgres') then
    raise exception 'fixed shadow identity mismatch';
  end if;
  if (select count(*) from public.admin_users admin_user join auth.users auth_user on lower(auth_user.email) = lower(admin_user.email)) <> 1 then
    raise exception 'fixed shadow must contain exactly one joined admin auth user';
  end if;
  if exists (
    select 1 from public.content_migration_snapshots snapshot
    where snapshot.note_id = 'e8265c20-04dd-4003-a378-b50bd995299f'::uuid
      and snapshot.field_path = 'problems.95.options.2.content'
      and snapshot.batch_id in (
        'wp2-shadow-ui-rebuild-39cb53431c70',
        'wp2-shadow-ui-rebuild-rollback-39cb53431c70',
        'wp2-shadow-single-39cb53431c70',
        'wp2-shadow-single-rollback-39cb53431c70'
      )
  ) then
    raise exception 'fixed shadow UI chain batch already exists';
  end if;
  if not exists (
    select 1 from public.notes note
    where note.id = 'e8265c20-04dd-4003-a378-b50bd995299f'::uuid
      and note.content_version = 3
      and private.content_sha256(private.read_note_markdown_field(note.content, note.problems, 'problems.95.options.2.content')) = '5a5dc166e84d57b650dc9b094caeece22bc56360dc37b7fb9c6a7a1f1eda46a7'
  ) then
    raise exception 'fixed shadow original before state mismatch';
  end if;
end
$$;
select set_config(
  'request.jwt.claim.sub',
  (select auth_user.id::text from public.admin_users admin_user join auth.users auth_user on lower(auth_user.email) = lower(admin_user.email) limit 1),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  (select jsonb_build_object('sub', auth_user.id, 'email', admin_user.email, 'role', 'authenticated')::text
   from public.admin_users admin_user join auth.users auth_user on lower(auth_user.email) = lower(admin_user.email) limit 1),
  true
);
create temp table wp2_before on commit drop as
select note.content_version,
  private.content_sha256(private.read_note_markdown_field(note.content, note.problems, :'field_path')) as field_checksum,
  (select count(*) from public.content_migration_snapshots) as snapshot_count
from public.notes note where note.id = :'note_id'::uuid;
create temp table wp2_rebuild on commit drop as
select id, note_content_version_before, note_content_version_after
from public.apply_content_migration(
  :'note_id'::uuid, :'field_path', :'rebuild_apply_batch_id', :'rule_version',
  (select content_version from wp2_before), :'original_before_checksum', :'rebuild_after_text', :'rebuild_after_checksum',
  true, 'deepseek', 'deepseek-v4-pro', 'review-70c08975b21e', 'human_approved', :'rebuild_validation_detail'::jsonb
);
create temp table wp2_after_rebuild on commit drop as
select note.content_version,
  private.content_sha256(private.read_note_markdown_field(note.content, note.problems, :'field_path')) as field_checksum
from public.notes note where note.id = :'note_id'::uuid;
create temp table wp2_ui on commit drop as
select id, note_content_version_before, note_content_version_after
from public.apply_content_migration(
  :'note_id'::uuid, :'field_path', :'ui_apply_batch_id', :'rule_version',
  (select content_version from wp2_after_rebuild), :'ui_before_checksum', :'ui_after_text', :'ui_after_checksum',
  false, null, null, null, 'human_approved', :'validation_detail'::jsonb
);
create temp table wp2_after_ui on commit drop as
select note.content_version,
  private.content_sha256(private.read_note_markdown_field(note.content, note.problems, :'field_path')) as field_checksum
from public.notes note where note.id = :'note_id'::uuid;
create temp table wp2_ui_rollback on commit drop as
select id, reverts_snapshot_id, note_content_version_before, note_content_version_after
from public.rollback_content_migration(
  (select id from wp2_ui), :'ui_rollback_batch_id', (select content_version from wp2_after_ui),
  '{"reason":"fixed-shadow-ui-chain-proof","chain":"ui-correction"}'::jsonb
);
create temp table wp2_after_ui_rollback on commit drop as
select note.content_version,
  private.content_sha256(private.read_note_markdown_field(note.content, note.problems, :'field_path')) as field_checksum
from public.notes note where note.id = :'note_id'::uuid;
create temp table wp2_rebuild_rollback on commit drop as
select id, reverts_snapshot_id, note_content_version_before, note_content_version_after
from public.rollback_content_migration(
  (select id from wp2_rebuild), :'rebuild_rollback_batch_id', (select content_version from wp2_after_ui_rollback),
  '{"reason":"fixed-shadow-ui-chain-proof","chain":"rebuild"}'::jsonb
);
create temp table wp2_final on commit drop as
select note.content_version,
  private.content_sha256(private.read_note_markdown_field(note.content, note.problems, :'field_path')) as field_checksum,
  (select count(*) from public.content_migration_snapshots) as snapshot_count
from public.notes note where note.id = :'note_id'::uuid;
select jsonb_build_object(
  'rebuildApplyRows', (select count(*) from wp2_rebuild),
  'uiApplyRows', (select count(*) from wp2_ui),
  'uiRollbackRows', (select count(*) from wp2_ui_rollback),
  'rebuildRollbackRows', (select count(*) from wp2_rebuild_rollback),
  'rebuildAfterMatches', (select field_checksum = :'ui_before_checksum' from wp2_after_rebuild),
  'uiAfterMatches', (select field_checksum = :'ui_after_checksum' from wp2_after_ui),
  'uiRollbackRestoresRebuild', (select field_checksum = :'ui_before_checksum' from wp2_after_ui_rollback),
  'finalRestoresOriginal', (select field_checksum = :'original_before_checksum' from wp2_final),
  'versionChain', (
    select (rebuild.note_content_version_before = before.content_version
      and rebuild.note_content_version_after = before.content_version + 1
      and ui.note_content_version_before = before.content_version + 1
      and ui.note_content_version_after = before.content_version + 2
      and ui_rollback.note_content_version_before = before.content_version + 2
      and ui_rollback.note_content_version_after = before.content_version + 3
      and rebuild_rollback.note_content_version_before = before.content_version + 3
      and rebuild_rollback.note_content_version_after = before.content_version + 4
      and final.content_version = before.content_version + 4)
    from wp2_before before cross join wp2_rebuild rebuild cross join wp2_ui ui
      cross join wp2_ui_rollback ui_rollback cross join wp2_rebuild_rollback rebuild_rollback cross join wp2_final final
  ),
  'rollbackLinks', ((select reverts_snapshot_id from wp2_ui_rollback) = (select id from wp2_ui)
    and (select reverts_snapshot_id from wp2_rebuild_rollback) = (select id from wp2_rebuild)),
  'snapshotDelta', (select final.snapshot_count - before.snapshot_count from wp2_final final cross join wp2_before before)
)::text;
rollback;
'@

$PostflightSql = @'
begin transaction read only;
with target as (
  select note.content_version,
    private.content_sha256(private.read_note_markdown_field(note.content, note.problems, :'field_path')) as field_checksum
  from public.notes note where note.id = :'note_id'::uuid
), batches as (
  select count(*)::bigint as row_count
  from public.content_migration_snapshots snapshot
  where snapshot.note_id = :'note_id'::uuid and snapshot.field_path = :'field_path'
    and snapshot.batch_id in (:'rebuild_apply_batch_id', :'rebuild_rollback_batch_id', :'ui_apply_batch_id', :'ui_rollback_batch_id')
)
select jsonb_build_object(
  'contentVersion', (select content_version from target),
  'fieldChecksum', (select field_checksum from target),
  'restoredOriginal', (select content_version = 3 and field_checksum = :'original_before_checksum' from target),
  'newBatchRows', (select row_count from batches)
)::text;
rollback;
'@

$TunnelProcess = $null
$PreviousPgPassword = $env:PGPASSWORD
try {
  $Node = (Get-Command node -ErrorAction Stop).Source
  $TunnelProcess = Start-Process -FilePath $Node -ArgumentList @($TunnelScript, 'shadow') -WorkingDirectory $RepositoryRoot -WindowStyle Hidden -PassThru
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
  $proof = Invoke-PsqlJson $TransactionSql '-c lock_timeout=5000 -c statement_timeout=120000'
  $proofChecks = @(
    ([int]$proof.rebuildApplyRows -eq 1),
    ([int]$proof.uiApplyRows -eq 1),
    ([int]$proof.uiRollbackRows -eq 1),
    ([int]$proof.rebuildRollbackRows -eq 1),
    ($proof.rebuildAfterMatches -eq $true),
    ($proof.uiAfterMatches -eq $true),
    ($proof.uiRollbackRestoresRebuild -eq $true),
    ($proof.finalRestoresOriginal -eq $true),
    ($proof.versionChain -eq $true),
    ($proof.rollbackLinks -eq $true),
    ([int64]$proof.snapshotDelta -eq 4)
  )
  if ($proofChecks -contains $false) { throw 'fixed shadow UI chain 事务证明矩阵失败。' }
  $postflight = Invoke-PsqlJson $PostflightSql '-c default_transaction_read_only=on -c statement_timeout=60000'
  if ($postflight.restoredOriginal -ne $true -or [int64]$postflight.newBatchRows -ne 0) {
    throw 'fixed shadow UI chain 回滚后只读后验失败。'
  }
  [pscustomobject]@{
    ProjectRef = $ShadowProjectRef
    Stage = 'transaction-preview'
    TransactionProofPassed = $true
    DatabaseRollbackPassed = $true
    NoteRestored = $true
    OriginalContentVersion = [int64]$postflight.contentVersion
    OriginalChecksum = [string]$postflight.fieldChecksum
    PersistedNewBatchRows = [int64]$postflight.newBatchRows
    ProductionConnected = $false
  } | ConvertTo-Json -Compress
} finally {
  if ($null -eq $PreviousPgPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD = $PreviousPgPassword }
  if ($null -ne $TunnelProcess -and -not $TunnelProcess.HasExited) {
    Stop-Process -Id $TunnelProcess.Id -Force -ErrorAction SilentlyContinue
    $TunnelProcess.WaitForExit(5000) | Out-Null
  }
}
