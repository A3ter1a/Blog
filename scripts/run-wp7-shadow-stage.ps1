[CmdletBinding()]
param(
  [ValidateSet('preflight', 'preview-0021', 'commit-0021', 'postflight')]
  [string]$Stage = 'preflight',
  [string]$CredentialPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-shadow-credential-v2.json'),
  [switch]$ConfirmShadowPreview,
  [switch]$ConfirmShadowWrite,
  [string]$ConfirmationPhrase = ''
)

$ErrorActionPreference = 'Stop'
$ShadowProjectRef = 'qyjfcebqjtphlpsvizxo'
$ProductionProjectRef = 'kysywitrsjhcdlcrfayl'
$ExpectedShadowProjectName = 'Blog-shadow-wp1b'
$ExpectedShadowRegion = 'ap-southeast-1'
$LocalTunnelPort = 15433
$Expected0021Hash = '8a5a14c117ff8e7e39ca2cd915277be1b4cbb36f20892176f550a9de7f78f97f'
$PreviewPhrase = "PREVIEW $ShadowProjectRef WP7 0021 ROLLBACK"
$WritePhrase = "WRITE $ShadowProjectRef WP7 0021"

if ($ShadowProjectRef -eq $ProductionProjectRef) { throw '拒绝执行：fixed Shadow ref 与生产 ref 相同。' }
if ($Stage -eq 'preview-0021' -and (-not $ConfirmShadowPreview -or $ConfirmationPhrase -cne $PreviewPhrase)) {
  throw "事务预演需要精确确认短语：$PreviewPhrase"
}
if ($Stage -eq 'commit-0021' -and (-not $ConfirmShadowWrite -or $ConfirmationPhrase -cne $WritePhrase)) {
  throw "Shadow 提交需要精确确认短语：$WritePhrase"
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ResolvedCredentialPath = (Resolve-Path -LiteralPath $CredentialPath).Path
$LocalBackupRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups'))
$LocalBackupPrefix = $LocalBackupRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $ResolvedCredentialPath.StartsWith($LocalBackupPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw '拒绝读取 .local-backups 之外的 Shadow 凭据。'
}
$Credential = Get-Content -Raw -Encoding UTF8 -LiteralPath $ResolvedCredentialPath | ConvertFrom-Json
if ([string]$Credential.projectName -cne $ExpectedShadowProjectName -or
  [string]$Credential.region -cne $ExpectedShadowRegion -or
  [string]::IsNullOrWhiteSpace([string]$Credential.databasePassword)) {
  throw '固定 Shadow 凭据形状或目标标记不符合预期。'
}

$PgBin = (Resolve-Path (Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin')).Path
$Psql = Join-Path $PgBin 'psql.exe'
$TunnelScript = Join-Path $RepositoryRoot 'scripts\wp1b-pg-http-connect-tunnel.mjs'
$Migration0021 = Join-Path $RepositoryRoot 'supabase\migrations\0021_private_note_rag_and_memory.sql'
$PreviewRoot = Join-Path $RepositoryRoot '.local-backups\wp7-shadow-preview'
$DatabaseParameters = @(
  'host=aws-0-ap-southeast-1.pooler.supabase.com', 'hostaddr=127.0.0.1', "port=$LocalTunnelPort",
  'dbname=postgres', "user=postgres.$ShadowProjectRef", 'sslmode=require', 'connect_timeout=10'
) -join ' '

function Get-LastJson([object[]]$Rows, [string]$Label) {
  $JsonLine = $Rows | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) -and [string]$_.TrimStart().StartsWith('{') } | Select-Object -Last 1
  if ([string]::IsNullOrWhiteSpace([string]$JsonLine)) { throw "$Label 没有返回 JSON 证据。" }
  try { return ([string]$JsonLine | ConvertFrom-Json -Depth 30) } catch { throw "$Label 返回的 JSON 无效。" }
}

function Invoke-PsqlJson([string]$Sql, [string]$Label) {
  $Rows = & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--quiet' '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' $Sql
  if ($LASTEXITCODE -ne 0) { throw "$Label SQL 执行失败。" }
  return Get-LastJson $Rows $Label
}

function New-RollbackMigrationCopy() {
  New-Item -ItemType Directory -Path $PreviewRoot -Force | Out-Null
  $Lines = [System.Collections.Generic.List[string]]::new()
  Get-Content -Encoding UTF8 -LiteralPath $Migration0021 | ForEach-Object { $Lines.Add($_) }
  $First = -1
  for ($Index = 0; $Index -lt $Lines.Count; $Index += 1) {
    if ($Lines[$Index].Trim() -and -not $Lines[$Index].Trim().StartsWith('--')) { $First = $Index; break }
  }
  $Last = -1
  for ($Index = $Lines.Count - 1; $Index -ge 0; $Index -= 1) { if ($Lines[$Index].Trim()) { $Last = $Index; break } }
  if ($First -lt 0 -or $Lines[$First].Trim().ToLowerInvariant() -cne 'begin;' -or
      $Last -lt 0 -or $Lines[$Last].Trim().ToLowerInvariant() -cne 'commit;') {
    throw '0021 预演拒绝：迁移事务壳不符合预期。'
  }
  $Lines[$First] = '-- transaction begin supplied by runner'
  $Lines[$Last] = '-- transaction commit replaced by rollback'
  $PreviewPath = Join-Path $PreviewRoot '0021-body.sql'
  [System.IO.File]::WriteAllLines($PreviewPath, $Lines, [System.Text.UTF8Encoding]::new($false))
  return $PreviewPath
}

$SnapshotCoreSql = @'
with required_functions(signature) as (
  values
    ('public.sync_private_note_rag(uuid,bigint,text,text,jsonb)'),
    ('public.search_private_note_rag(text,extensions.vector,uuid,integer)'),
    ('public.propose_assistant_memory(uuid,text,text,text)'),
    ('public.decide_assistant_memory(uuid,text)'),
    ('public.list_assistant_memories()')
), function_state as (
  select required.signature, proc.oid, proc.proowner, proc.prosecdef, proc.proconfig, proc.proacl
  from required_functions required left join pg_proc proc on proc.oid = to_regprocedure(required.signature)
), target_tables as (
  select class.oid, class.relrowsecurity, class.relforcerowsecurity
  from pg_class class join pg_namespace namespace on namespace.oid = class.relnamespace
  where namespace.nspname = 'public' and class.relname in ('rag_chunks', 'memory_candidates')
)
select jsonb_build_object(
  'identityOk', current_database() = 'postgres' and current_user = 'postgres',
  'prerequisiteTableCount', (select count(*) from unnest(array[to_regclass('public.notes'),to_regclass('public.source_documents'),to_regclass('public.source_versions')]) item where item is not null),
  'prerequisiteFunctionCount', (select count(*) from unnest(array[to_regprocedure('private.reject_immutable_event_mutation()'),to_regprocedure('private.current_user_is_admin()'),to_regprocedure('extensions.digest(bytea,text)')]) item where item is not null),
  'vectorAvailable', exists (select 1 from pg_available_extensions where name = 'vector'),
  'vectorInstalled', exists (select 1 from pg_extension where extname = 'vector'),
  'baseNoteCount', (select count(*) from public.notes),
  'baseSourceDocumentCount', (select count(*) from public.source_documents),
  'baseSourceVersionCount', (select count(*) from public.source_versions),
  'targetTableCount', (select count(*) from target_tables),
  'targetRlsCount', (select count(*) from target_tables where relrowsecurity),
  'targetForceRlsCount', (select count(*) from target_tables where relforcerowsecurity),
  'targetFunctionCount', (select count(*) from function_state where oid is not null),
  'targetSecurityDefinerCount', (select count(*) from function_state where oid is not null and prosecdef),
  'targetEmptySearchPathCount', (select count(*) from function_state where oid is not null and coalesce(proconfig,array[]::text[]) @> array['search_path=""']::text[]),
  'targetAuthenticatedExecuteCount', (select count(*) from function_state where oid is not null and has_function_privilege('authenticated',oid,'EXECUTE')),
  'targetAnonExecuteCount', (select count(*) from function_state where oid is not null and has_function_privilege('anon',oid,'EXECUTE')),
  'targetPublicExecuteCount', (select count(*) from function_state where oid is not null and exists (select 1 from aclexplode(coalesce(function_state.proacl,acldefault('f',function_state.proowner))) privilege where privilege.grantee = 0 and privilege.privilege_type = 'EXECUTE')),
  'targetPolicyCount', (select count(*) from pg_policies where schemaname = 'public' and policyname in ('rag_chunks_owner_select','memory_candidates_owner_select')),
  'targetTriggerCount', (select count(*) from pg_trigger where not tgisinternal and tgname = 'reject_rag_chunk_mutation'),
  'targetIndexCount', (select count(*) from pg_indexes where schemaname = 'public' and indexname in ('rag_chunks_source_version_idx','rag_chunks_search_vector_idx','rag_chunks_content_trgm_idx','rag_chunks_embedding_hnsw_idx','memory_candidates_user_status_created_idx')),
  'currentVersionSearchReady', exists (select 1 from pg_proc where oid = to_regprocedure('public.search_private_note_rag(text,extensions.vector,uuid,integer)') and pg_get_functiondef(oid) ilike '%current_version_id = version.id%')
)::text;
'@
$SnapshotSql = "begin transaction read only;`n$SnapshotCoreSql`nrollback;"
$DataSql = @'
begin transaction read only;
select jsonb_build_object(
  'ragChunkCount', (select count(*) from public.rag_chunks),
  'indexedSourceCount', (select count(distinct source_version_id) from public.rag_chunks),
  'memoryCandidateCount', (select count(*) from public.memory_candidates)
)::text;
rollback;
'@

function Assert-Prerequisites([object]$Snapshot) {
  if ($Snapshot.identityOk -ne $true -or [int]$Snapshot.prerequisiteTableCount -ne 3 -or
      [int]$Snapshot.prerequisiteFunctionCount -ne 3 -or $Snapshot.vectorAvailable -ne $true) {
    throw 'WP7 fixed Shadow 缺少 notes/source_versions/安全函数/pgcrypto/pgvector 前置结构。'
  }
}
function Test-0021Ready([object]$Snapshot) {
  return ($Snapshot.vectorInstalled -eq $true -and [int]$Snapshot.targetTableCount -eq 2 -and
    [int]$Snapshot.targetRlsCount -eq 2 -and [int]$Snapshot.targetForceRlsCount -eq 2 -and
    [int]$Snapshot.targetFunctionCount -eq 5 -and [int]$Snapshot.targetSecurityDefinerCount -eq 5 -and
    [int]$Snapshot.targetEmptySearchPathCount -eq 5 -and [int]$Snapshot.targetAuthenticatedExecuteCount -eq 5 -and
    [int]$Snapshot.targetAnonExecuteCount -eq 0 -and [int]$Snapshot.targetPublicExecuteCount -eq 0 -and
    [int]$Snapshot.targetPolicyCount -eq 2 -and [int]$Snapshot.targetTriggerCount -eq 1 -and
    [int]$Snapshot.targetIndexCount -eq 5 -and $Snapshot.currentVersionSearchReady -eq $true)
}
function Assert-0021Ready([object]$Snapshot) {
  if (-not (Test-0021Ready $Snapshot)) {
    throw "0021 后验失败：tables=$($Snapshot.targetTableCount)/2 functions=$($Snapshot.targetFunctionCount)/5 policies=$($Snapshot.targetPolicyCount)/2 triggers=$($Snapshot.targetTriggerCount)/1 indexes=$($Snapshot.targetIndexCount)/5"
  }
}
function Test-0021PartiallyApplied([object]$Snapshot) {
  return ([int]$Snapshot.targetTableCount -gt 0 -or [int]$Snapshot.targetFunctionCount -gt 0 -or [int]$Snapshot.targetPolicyCount -gt 0 -or [int]$Snapshot.targetTriggerCount -gt 0 -or [int]$Snapshot.targetIndexCount -gt 0)
}
function Assert-BaseCountsStable([object]$Before, [object]$After, [string]$Label) {
  foreach ($Property in @('baseNoteCount','baseSourceDocumentCount','baseSourceVersionCount')) {
    if ([string]$Before.$Property -cne [string]$After.$Property) { throw "$Label 稳定数据计数变化：$Property" }
  }
}

function Get-ReviewedMigrationHash([string]$Path) {
  $Text = Get-Content -Raw -Encoding UTF8 -LiteralPath $Path
  $CanonicalText = $Text.Replace("`r`n", "`n").Replace("`r", "`n")
  $Bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($CanonicalText)
  $Sha256 = [System.Security.Cryptography.SHA256]::Create()
  try { return [System.Convert]::ToHexString($Sha256.ComputeHash($Bytes)).ToLowerInvariant() } finally { $Sha256.Dispose() }
}

$ActualHash = Get-ReviewedMigrationHash $Migration0021
if ($ActualHash -cne $Expected0021Hash) { throw "0021 SHA-256 漂移：expected=$Expected0021Hash actual=$ActualHash" }

$PreviousPgPassword = $env:PGPASSWORD
$PreviousPgOptions = $env:PGOPTIONS
$TunnelProcess = $null
try {
  $Node = (Get-Command node -ErrorAction Stop).Source
  $TunnelProcess = Start-Process -FilePath $Node -ArgumentList @($TunnelScript,'shadow') -WorkingDirectory $RepositoryRoot -WindowStyle Hidden -PassThru
  $Ready = $false
  for ($Attempt = 0; $Attempt -lt 40; $Attempt += 1) {
    try { $Client = [System.Net.Sockets.TcpClient]::new(); $Client.Connect('127.0.0.1',$LocalTunnelPort); $Client.Dispose(); $Ready = $true; break } catch { Start-Sleep -Milliseconds 250 }
  }
  if (-not $Ready) { throw '固定 Shadow 本地隧道未就绪。' }
  $env:PGPASSWORD = [string]$Credential.databasePassword
  if ($Stage -in @('preflight','postflight')) { $env:PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=60000 -c lock_timeout=5000' }
  else { $env:PGOPTIONS = '-c statement_timeout=120000 -c lock_timeout=10000' }

  $Before = Invoke-PsqlJson $SnapshotSql 'WP7 fixed Shadow snapshot'
  Assert-Prerequisites $Before
  $Ready0021 = Test-0021Ready $Before
  if ($Stage -eq 'preflight') {
    if (-not $Ready0021 -and (Test-0021PartiallyApplied $Before)) { throw '0021 处于部分应用状态。' }
    [pscustomobject]@{ ProjectRef=$ShadowProjectRef; Stage=$Stage; ReadOnly=$true; Migration0021Ready=$Ready0021; Migration0021PartiallyApplied=$false; Migration0021Sha256=$Expected0021Hash; VectorAvailable=$Before.vectorAvailable; VectorInstalled=$Before.vectorInstalled; BaseNoteCount=[int64]$Before.baseNoteCount; BaseSourceDocumentCount=[int64]$Before.baseSourceDocumentCount; BaseSourceVersionCount=[int64]$Before.baseSourceVersionCount } | ConvertTo-Json -Compress
    return
  }
  if ($Stage -eq 'postflight') {
    Assert-0021Ready $Before
    $Data = Invoke-PsqlJson $DataSql 'WP7 fixed Shadow data postflight'
    [pscustomobject]@{ ProjectRef=$ShadowProjectRef; Stage=$Stage; ReadOnly=$true; Migration0021Ready=$true; RlsAndRpcBoundaryPassed=$true; RagChunkCount=[int64]$Data.ragChunkCount; IndexedSourceCount=[int64]$Data.indexedSourceCount; MemoryCandidateCount=[int64]$Data.memoryCandidateCount } | ConvertTo-Json -Compress
    return
  }
  if ($Ready0021) { [pscustomobject]@{ ProjectRef=$ShadowProjectRef; Stage=$Stage; AlreadyReady=$true } | ConvertTo-Json -Compress; return }
  if (Test-0021PartiallyApplied $Before) { throw '0021 处于部分应用状态，拒绝覆盖。' }

  if ($Stage -eq 'preview-0021') {
    $PreviewPath = New-RollbackMigrationCopy
    try {
      $Rows = & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--quiet' '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' 'begin;' '--file' $PreviewPath '--command' $SnapshotCoreSql '--command' 'rollback;'
      if ($LASTEXITCODE -ne 0) { throw '0021 fixed Shadow 事务预演失败。' }
      $Inside = Get-LastJson $Rows '0021 fixed Shadow 事务预演'
    } finally { Remove-Item -LiteralPath $PreviewPath -Force -ErrorAction SilentlyContinue }
    Assert-0021Ready $Inside
    $AfterRollback = Invoke-PsqlJson $SnapshotSql '0021 rollback snapshot'
    Assert-BaseCountsStable $Before $AfterRollback '0021 rollback'
    if (Test-0021Ready $AfterRollback -or (Test-0021PartiallyApplied $AfterRollback)) { throw '0021 事务预演未恢复迁移前状态。' }
    [pscustomobject]@{ ProjectRef=$ShadowProjectRef; Stage=$Stage; TransactionRolledBack=$true; MigrationReadyInsideTransaction=$true; StableBaseDataCounts=$true } | ConvertTo-Json -Compress
    return
  }

  & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--quiet' '--set' 'ON_ERROR_STOP=1' '--file' $Migration0021
  if ($LASTEXITCODE -ne 0) { throw '0021 fixed Shadow 提交失败。' }
  try {
    $After = Invoke-PsqlJson $SnapshotSql '0021 commit snapshot'
    Assert-BaseCountsStable $Before $After '0021 commit'
    Assert-0021Ready $After
    $Data = Invoke-PsqlJson $DataSql '0021 commit data postflight'
  } catch {
    [pscustomobject]@{ ProjectRef=$ShadowProjectRef; Stage=$Stage; MigrationCommitted=$true; PostflightPending=$true; RequiredNextStage='postflight'; Message='0021 已成功提交，但独立后验未完成；禁止重复提交，必须运行只读 postflight。' } | ConvertTo-Json -Compress
    return
  }
  [pscustomobject]@{ ProjectRef=$ShadowProjectRef; Stage=$Stage; MigrationReady=$true; StableBaseDataCounts=$true; RagChunkCount=[int64]$Data.ragChunkCount; IndexedSourceCount=[int64]$Data.indexedSourceCount; MemoryCandidateCount=[int64]$Data.memoryCandidateCount; PostflightPending=$false } | ConvertTo-Json -Compress
} finally {
  if ($null -eq $PreviousPgPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD = $PreviousPgPassword }
  if ($null -eq $PreviousPgOptions) { Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue } else { $env:PGOPTIONS = $PreviousPgOptions }
  if ($null -ne $TunnelProcess -and -not $TunnelProcess.HasExited) { Stop-Process -Id $TunnelProcess.Id -Force -ErrorAction SilentlyContinue; $TunnelProcess.WaitForExit(5000) | Out-Null }
  if (Test-Path -LiteralPath $PreviewRoot) {
    $ResolvedPreviewRoot = (Resolve-Path -LiteralPath $PreviewRoot).Path
    if (-not $ResolvedPreviewRoot.StartsWith($LocalBackupPrefix,[System.StringComparison]::OrdinalIgnoreCase)) { throw "拒绝清理 .local-backups 之外的目录：$ResolvedPreviewRoot" }
    Remove-Item -LiteralPath $ResolvedPreviewRoot -Recurse -Force
  }
}
