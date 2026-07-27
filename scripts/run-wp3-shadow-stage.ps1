[CmdletBinding()]
param(
  [ValidateSet('preflight', 'preview-0007', 'commit-0007', 'preview-0014', 'commit-0014', 'preview-0020', 'commit-0020', 'postflight')]
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
$Expected0007Hash = 'cce2b7c4f897ef4ef8a087729290f14e5905787b8398a08ad9a57272bef57be1'
$Expected0014Hash = '7c7af2e7b543e23470a11140653f4ab7a4e543f933206465b4aa0b49e79c6559'
$Expected0020Hash = 'e33724b90ce7997650f1a08513f00a93c5e0087c1a7289d3de2a67ac16d57ba2'
$PreviewPhrases = @{
  'preview-0007' = "PREVIEW $ShadowProjectRef WP3 PREREQ 0007 ROLLBACK"
  'preview-0014' = "PREVIEW $ShadowProjectRef WP3 0014 ROLLBACK"
  'preview-0020' = "PREVIEW $ShadowProjectRef WP3 0020 ROLLBACK"
}
$WritePhrases = @{
  'commit-0007' = "WRITE $ShadowProjectRef WP3 PREREQ 0007"
  'commit-0014' = "WRITE $ShadowProjectRef WP3 0014"
  'commit-0020' = "WRITE $ShadowProjectRef WP3 0020"
}

if ($ShadowProjectRef -eq $ProductionProjectRef) {
  throw '拒绝执行：fixed Shadow ref 与生产 ref 相同。'
}
if ($PreviewPhrases.ContainsKey($Stage) -and (
  -not $ConfirmShadowPreview -or $ConfirmationPhrase -cne $PreviewPhrases[$Stage]
)) {
  throw "事务预演需要 -ConfirmShadowPreview 和精确确认短语：$($PreviewPhrases[$Stage])"
}
if ($WritePhrases.ContainsKey($Stage) -and (
  -not $ConfirmShadowWrite -or $ConfirmationPhrase -cne $WritePhrases[$Stage]
)) {
  throw "Shadow 提交需要 -ConfirmShadowWrite 和精确确认短语：$($WritePhrases[$Stage])"
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ResolvedCredentialPath = (Resolve-Path -LiteralPath $CredentialPath).Path
$ExpectedCredentialRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups'))
$ExpectedCredentialPrefix = $ExpectedCredentialRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $ResolvedCredentialPath.StartsWith($ExpectedCredentialPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw '拒绝读取 .local-backups 之外的 Shadow 凭据。'
}

$Credential = Get-Content -Raw -Encoding UTF8 -LiteralPath $ResolvedCredentialPath | ConvertFrom-Json
if (
  [string]$Credential.projectName -cne $ExpectedShadowProjectName -or
  [string]$Credential.region -cne $ExpectedShadowRegion -or
  [string]::IsNullOrWhiteSpace([string]$Credential.databasePassword)
) {
  throw '固定 Shadow 凭据形状或目标标记不符合预期。'
}

$PgBin = (Resolve-Path (Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin')).Path
$Psql = Join-Path $PgBin 'psql.exe'
$TunnelScript = Join-Path $RepositoryRoot 'scripts\wp1b-pg-http-connect-tunnel.mjs'
$Migration0007 = Join-Path $RepositoryRoot 'supabase\migrations\0007_document_ocr_storage.sql'
$Migration0014 = Join-Path $RepositoryRoot 'supabase\migrations\0014_job_item_lease_rpc.sql'
$Migration0020 = Join-Path $RepositoryRoot 'supabase\migrations\0020_problem_ocr_job_assets.sql'
$PreviewRoot = Join-Path $RepositoryRoot '.local-backups\wp3-shadow-preview'
$DatabaseParameters = @(
  'host=aws-0-ap-southeast-1.pooler.supabase.com',
  'hostaddr=127.0.0.1',
  "port=$LocalTunnelPort",
  'dbname=postgres',
  "user=postgres.$ShadowProjectRef",
  'sslmode=require',
  'connect_timeout=10'
) -join ' '

function Assert-FileHash([string]$Path, [string]$ExpectedHash, [string]$Label) {
  $ActualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
  if ($ActualHash -cne $ExpectedHash) {
    throw "$Label SHA-256 漂移：expected=$ExpectedHash actual=$ActualHash"
  }
}

function Get-LastJson([object[]]$Rows, [string]$Label) {
  $JsonLine = $Rows | Where-Object {
    -not [string]::IsNullOrWhiteSpace([string]$_) -and [string]$_.TrimStart().StartsWith('{')
  } | Select-Object -Last 1
  if ([string]::IsNullOrWhiteSpace([string]$JsonLine)) {
    throw "$Label 没有返回 JSON 证据。"
  }
  try {
    return ([string]$JsonLine | ConvertFrom-Json -Depth 30)
  } catch {
    throw "$Label 返回的 JSON 无效。"
  }
}

function Invoke-PsqlJson([string]$Sql, [string]$Label) {
  $Rows = & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--quiet' `
    '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' $Sql
  if ($LASTEXITCODE -ne 0) { throw "$Label SQL 执行失败。" }
  return Get-LastJson $Rows $Label
}

function New-RollbackMigrationCopy([string]$MigrationPath, [string]$Label) {
  New-Item -ItemType Directory -Path $PreviewRoot -Force | Out-Null
  $Lines = [System.Collections.Generic.List[string]]::new()
  Get-Content -Encoding UTF8 -LiteralPath $MigrationPath | ForEach-Object { $Lines.Add($_) }
  $FirstSqlIndex = -1
  for ($Index = 0; $Index -lt $Lines.Count; $Index += 1) {
    $Trimmed = $Lines[$Index].Trim()
    if ($Trimmed -and -not $Trimmed.StartsWith('--')) {
      $FirstSqlIndex = $Index
      break
    }
  }
  $LastSqlIndex = -1
  for ($Index = $Lines.Count - 1; $Index -ge 0; $Index -= 1) {
    if ($Lines[$Index].Trim()) {
      $LastSqlIndex = $Index
      break
    }
  }
  if ($FirstSqlIndex -lt 0 -or $Lines[$FirstSqlIndex].Trim().ToLowerInvariant() -cne 'begin;') {
    throw "$Label 预演拒绝：原迁移不再以 BEGIN 开始。"
  }
  if ($LastSqlIndex -lt 0 -or $Lines[$LastSqlIndex].Trim().ToLowerInvariant() -cne 'commit;') {
    throw "$Label 预演拒绝：原迁移不再以 COMMIT 结束。"
  }
  $Lines[$FirstSqlIndex] = '-- transaction begin is supplied by the rollback preview runner'
  $Lines[$LastSqlIndex] = '-- transaction commit is replaced by rollback in the preview runner'
  $PreviewPath = Join-Path $PreviewRoot "$Label-body.sql"
  [System.IO.File]::WriteAllLines($PreviewPath, $Lines, [System.Text.UTF8Encoding]::new($false))
  return $PreviewPath
}

function Invoke-RollbackPreview([string]$MigrationPath, [string]$VerificationSql, [string]$Label) {
  $PreviewPath = New-RollbackMigrationCopy $MigrationPath $Label
  try {
    $Rows = & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--quiet' `
      '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' `
      '--command' 'begin;' '--file' $PreviewPath '--command' $VerificationSql '--command' 'rollback;'
    if ($LASTEXITCODE -ne 0) { throw "$Label 事务预演失败。" }
    return Get-LastJson $Rows "$Label 事务预演"
  } finally {
    Remove-Item -LiteralPath $PreviewPath -Force -ErrorAction SilentlyContinue
  }
}

$PrerequisiteSql = @'
begin transaction read only;
select jsonb_build_object(
  'identityOk', current_database() = 'postgres' and current_user = 'postgres',
  'jobsTable', to_regclass('public.jobs') is not null,
  'jobItemsTable', to_regclass('public.job_items') is not null,
  'ocrDocumentsBucket', exists (
    select 1 from storage.buckets where id = 'ocr-documents' and name = 'ocr-documents'
  )
)::text;
rollback;
'@

$SnapshotSql = @'
begin transaction read only;
with lease_functions as (
  select proc.oid, proc.proowner, proc.proacl, proc.prosecdef, proc.proconfig
  from pg_proc proc
  join pg_namespace ns on ns.oid = proc.pronamespace
  where ns.nspname = 'public'
    and proc.proname in (
      'enqueue_job_item',
      'claim_next_job_item',
      'complete_job_item',
      'fail_job_item',
      'reset_failed_job_item'
    )
), bucket as (
  select public, file_size_limit, allowed_mime_types
  from storage.buckets
  where id = 'ocr-documents' and name = 'ocr-documents'
)
select jsonb_build_object(
  'identityOk', current_database() = 'postgres' and current_user = 'postgres',
  'functionCount', (select count(*) from lease_functions),
  'securityDefinerCount', (select count(*) from lease_functions where prosecdef),
  'emptySearchPathCount', (
    select count(*) from lease_functions where coalesce(proconfig, array[]::text[]) @> array['search_path=""']::text[]
  ),
  'authenticatedExecuteCount', (
    select count(*) from lease_functions where has_function_privilege('authenticated', oid, 'EXECUTE')
  ),
  'anonExecuteCount', (
    select count(*) from lease_functions where has_function_privilege('anon', oid, 'EXECUTE')
  ),
  'publicExecuteCount', (
    select count(*) from lease_functions
    where exists (
      select 1
      from aclexplode(coalesce(proacl, acldefault('f', proowner))) acl
      where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    )
  ),
  'authenticatedCanInsertJobItems', has_table_privilege('authenticated', 'public.job_items', 'INSERT'),
  'authenticatedCanUpdateJobItems', has_table_privilege('authenticated', 'public.job_items', 'UPDATE'),
  'jobsCount', (select count(*) from public.jobs),
  'jobsFingerprint', coalesce((
    select md5(string_agg(
      id::text || chr(31) || status || chr(31) || updated_at::text,
      chr(30) order by id
    )) from public.jobs
  ), ''),
  'jobItemsCount', (select count(*) from public.job_items),
  'jobItemsFingerprint', coalesce((
    select md5(string_agg(
      id::text || chr(31) || job_id::text || chr(31) || ordinal::text || chr(31) || status || chr(31) ||
      attempt_count::text || chr(31) || coalesce(claimed_by, '') || chr(31) || coalesce(lease_expires_at::text, ''),
      chr(30) order by id
    )) from public.job_items
  ), ''),
  'bucketExists', exists (select 1 from bucket),
  'bucketPublic', (select public from bucket),
  'bucketFileSizeLimit', (select file_size_limit from bucket),
  'bucketAllowedMimeTypes', (select to_jsonb(allowed_mime_types) from bucket),
  'ocrPolicyCount', (
    select count(*) from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'ocr_documents_admin_select',
        'ocr_documents_admin_insert',
        'ocr_documents_admin_update',
        'ocr_documents_admin_delete'
      )
  ),
  'storageObjectsCount', (select count(*) from storage.objects),
  'storageObjectsFingerprint', coalesce((
    select md5(string_agg(
      id::text || chr(31) || bucket_id || chr(31) || name,
      chr(30) order by id
    )) from storage.objects
  ), '')
)::text;
rollback;
'@

$Verification0014Sql = @'
with lease_functions as (
  select proc.oid, proc.proowner, proc.proacl, proc.prosecdef, proc.proconfig
  from pg_proc proc
  join pg_namespace ns on ns.oid = proc.pronamespace
  where ns.nspname = 'public'
    and proc.proname in (
      'enqueue_job_item',
      'claim_next_job_item',
      'complete_job_item',
      'fail_job_item',
      'reset_failed_job_item'
    )
)
select jsonb_build_object(
  'functionCount', (select count(*) from lease_functions),
  'securityDefinerCount', (select count(*) from lease_functions where prosecdef),
  'emptySearchPathCount', (
    select count(*) from lease_functions where coalesce(proconfig, array[]::text[]) @> array['search_path=""']::text[]
  ),
  'authenticatedExecuteCount', (
    select count(*) from lease_functions where has_function_privilege('authenticated', oid, 'EXECUTE')
  ),
  'anonExecuteCount', (
    select count(*) from lease_functions where has_function_privilege('anon', oid, 'EXECUTE')
  ),
  'publicExecuteCount', (
    select count(*) from lease_functions
    where exists (
      select 1
      from aclexplode(coalesce(proacl, acldefault('f', proowner))) acl
      where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    )
  ),
  'authenticatedCanInsertJobItems', has_table_privilege('authenticated', 'public.job_items', 'INSERT'),
  'authenticatedCanUpdateJobItems', has_table_privilege('authenticated', 'public.job_items', 'UPDATE')
)::text;
'@

$Verification0007Sql = @'
select jsonb_build_object(
  'bucketExists', exists (
    select 1 from storage.buckets where id = 'ocr-documents' and name = 'ocr-documents'
  ),
  'bucketPublic', (
    select public from storage.buckets where id = 'ocr-documents' and name = 'ocr-documents'
  ),
  'bucketFileSizeLimit', (
    select file_size_limit from storage.buckets where id = 'ocr-documents' and name = 'ocr-documents'
  ),
  'bucketAllowedMimeTypes', (
    select to_jsonb(allowed_mime_types) from storage.buckets where id = 'ocr-documents' and name = 'ocr-documents'
  ),
  'ocrPolicyCount', (
    select count(*) from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'ocr_documents_admin_select',
        'ocr_documents_admin_insert',
        'ocr_documents_admin_update',
        'ocr_documents_admin_delete'
      )
  )
)::text;
'@

$Verification0020Sql = @'
select jsonb_build_object(
  'bucketExists', exists (
    select 1 from storage.buckets where id = 'ocr-documents' and name = 'ocr-documents'
  ),
  'bucketPublic', (
    select public from storage.buckets where id = 'ocr-documents' and name = 'ocr-documents'
  ),
  'bucketFileSizeLimit', (
    select file_size_limit from storage.buckets where id = 'ocr-documents' and name = 'ocr-documents'
  ),
  'bucketAllowedMimeTypes', (
    select to_jsonb(allowed_mime_types) from storage.buckets where id = 'ocr-documents' and name = 'ocr-documents'
  )
)::text;
'@

function Assert-Prerequisites([object]$Snapshot) {
  if (
    $Snapshot.identityOk -ne $true -or
    $Snapshot.jobsTable -ne $true -or
    $Snapshot.jobItemsTable -ne $true
  ) {
    throw "WP3 fixed Shadow 前置状态不满足：identityOk=$($Snapshot.identityOk) jobsTable=$($Snapshot.jobsTable) jobItemsTable=$($Snapshot.jobItemsTable)"
  }
}

function Assert-0014Ready([object]$Snapshot) {
  if (
    [int]$Snapshot.functionCount -ne 5 -or
    [int]$Snapshot.securityDefinerCount -ne 5 -or
    [int]$Snapshot.emptySearchPathCount -ne 5 -or
    [int]$Snapshot.authenticatedExecuteCount -ne 5 -or
    [int]$Snapshot.anonExecuteCount -ne 0 -or
    [int]$Snapshot.publicExecuteCount -ne 0 -or
    $Snapshot.authenticatedCanInsertJobItems -ne $false -or
    $Snapshot.authenticatedCanUpdateJobItems -ne $false
  ) {
    $Diagnostic = [ordered]@{
      functionCount = $Snapshot.functionCount
      securityDefinerCount = $Snapshot.securityDefinerCount
      emptySearchPathCount = $Snapshot.emptySearchPathCount
      authenticatedExecuteCount = $Snapshot.authenticatedExecuteCount
      anonExecuteCount = $Snapshot.anonExecuteCount
      publicExecuteCount = $Snapshot.publicExecuteCount
      authenticatedCanInsertJobItems = $Snapshot.authenticatedCanInsertJobItems
      authenticatedCanUpdateJobItems = $Snapshot.authenticatedCanUpdateJobItems
    } | ConvertTo-Json -Compress
    throw "0014 后验失败：五个 lease RPC 或 job_items 直写撤销不符合预期。actual=$Diagnostic"
  }
}

function Assert-0007Ready([object]$Snapshot) {
  $ActualMimeTypes = @($Snapshot.bucketAllowedMimeTypes) | ForEach-Object { [string]$_ }
  if (
    $Snapshot.bucketExists -ne $true -or
    $Snapshot.bucketPublic -ne $false -or
    [int64]$Snapshot.bucketFileSizeLimit -ne 52428800 -or
    ($ActualMimeTypes -join '|') -cne 'application/pdf' -or
    [int]$Snapshot.ocrPolicyCount -ne 4
  ) {
    throw '0007 后验失败：ocr-documents 私有 PDF bucket 或四条管理员 policy 不符合预期。'
  }
}

function Assert-0020Ready([object]$Snapshot) {
  $ExpectedMimeTypes = @('application/pdf', 'image/jpeg', 'image/png', 'image/webp') | Sort-Object
  $ActualMimeTypes = @($Snapshot.bucketAllowedMimeTypes) | ForEach-Object { [string]$_ } | Sort-Object
  if (
    $Snapshot.bucketExists -ne $true -or
    $Snapshot.bucketPublic -ne $false -or
    [int64]$Snapshot.bucketFileSizeLimit -ne 52428800 -or
    ($ActualMimeTypes -join '|') -cne ($ExpectedMimeTypes -join '|')
  ) {
    throw '0020 后验失败：ocr-documents 私有属性、大小或 MIME allowlist 不符合预期。'
  }
}

function Assert-StableData([object]$Before, [object]$After, [string]$Label) {
  foreach ($Property in @(
    'jobsCount',
    'jobsFingerprint',
    'jobItemsCount',
    'jobItemsFingerprint',
    'storageObjectsCount',
    'storageObjectsFingerprint'
  )) {
    if ([string]$Before.$Property -cne [string]$After.$Property) {
      throw "$Label 稳定数据指纹变化：$Property"
    }
  }
}

Assert-FileHash $Migration0007 $Expected0007Hash '0007'
Assert-FileHash $Migration0014 $Expected0014Hash '0014'
Assert-FileHash $Migration0020 $Expected0020Hash '0020'

$PreviousPgPassword = $env:PGPASSWORD
$PreviousPgOptions = $env:PGOPTIONS
$TunnelProcess = $null
try {
  $Node = (Get-Command node -ErrorAction Stop).Source
  $TunnelProcess = Start-Process -FilePath $Node `
    -ArgumentList @($TunnelScript, 'shadow') `
    -WorkingDirectory $RepositoryRoot -WindowStyle Hidden -PassThru

  $Ready = $false
  for ($Attempt = 0; $Attempt -lt 40; $Attempt += 1) {
    try {
      $Client = [System.Net.Sockets.TcpClient]::new()
      $Client.Connect('127.0.0.1', $LocalTunnelPort)
      $Client.Dispose()
      $Ready = $true
      break
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }
  if (-not $Ready) { throw '固定 Shadow 本地隧道未就绪。' }

  $env:PGPASSWORD = [string]$Credential.databasePassword
  if ($Stage -in @('preflight', 'postflight')) {
    $env:PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=60000 -c lock_timeout=5000'
  } else {
    $env:PGOPTIONS = '-c statement_timeout=120000 -c lock_timeout=10000'
  }

  $Prerequisites = Invoke-PsqlJson $PrerequisiteSql 'WP3 fixed Shadow 前置核验'
  Assert-Prerequisites $Prerequisites
  $Before = Invoke-PsqlJson $SnapshotSql 'WP3 fixed Shadow before snapshot'
  if ([int]$Before.functionCount -notin @(0, 5)) {
    throw "0014 处于部分应用状态：functionCount=$($Before.functionCount)"
  }

  if ($Stage -eq 'preflight') {
    [pscustomobject]@{
      ProjectRef = $ShadowProjectRef
      Stage = $Stage
      ReadOnly = $true
      FunctionCount = [int]$Before.functionCount
      Migration0014Ready = [int]$Before.functionCount -eq 5
      Migration0020Ready = $Before.bucketPublic -eq $false -and [int64]$Before.bucketFileSizeLimit -eq 52428800
      OcrDocumentsBucketExists = $Prerequisites.ocrDocumentsBucket -eq $true
      OcrDocumentPolicyCount = [int]$Before.ocrPolicyCount
      JobsCount = [int64]$Before.jobsCount
      JobItemsCount = [int64]$Before.jobItemsCount
      StorageObjectsCount = [int64]$Before.storageObjectsCount
      Migration0007Sha256 = $Expected0007Hash
      Migration0014Sha256 = $Expected0014Hash
      Migration0020Sha256 = $Expected0020Hash
    } | ConvertTo-Json -Compress
    return
  }

  if ($Stage -eq 'preview-0007') {
    if ($Before.bucketExists -eq $true) {
      throw 'preview-0007 只用于补齐缺失的 Shadow bucket；当前 bucket 已存在。'
    }
    $Preview = Invoke-RollbackPreview $Migration0007 $Verification0007Sql '0007'
    Assert-0007Ready $Preview
    $AfterRollback = Invoke-PsqlJson $SnapshotSql '0007 rollback snapshot'
    Assert-StableData $Before $AfterRollback '0007 rollback'
    if (
      $AfterRollback.bucketExists -ne $Before.bucketExists -or
      [int]$AfterRollback.ocrPolicyCount -ne [int]$Before.ocrPolicyCount
    ) {
      throw '0007 事务预演没有完整恢复 bucket/policy 前态。'
    }
    [pscustomobject]@{
      ProjectRef = $ShadowProjectRef
      Stage = $Stage
      TransactionRolledBack = $true
      BucketReadyInsideTransaction = $true
      PolicyCountInsideTransaction = [int]$Preview.ocrPolicyCount
      BucketExistsAfterRollback = $AfterRollback.bucketExists
      PolicyCountAfterRollback = [int]$AfterRollback.ocrPolicyCount
      StableData = $true
    } | ConvertTo-Json -Compress
    return
  }

  if ($Stage -eq 'commit-0007') {
    if ($Before.bucketExists -eq $true) {
      throw 'commit-0007 只用于补齐缺失的 Shadow bucket；拒绝覆盖已有 bucket。'
    }
    & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--quiet' `
      '--set' 'ON_ERROR_STOP=1' '--file' $Migration0007
    if ($LASTEXITCODE -ne 0) { throw '0007 fixed Shadow 前置对齐失败。' }
    $After = Invoke-PsqlJson $SnapshotSql '0007 commit snapshot'
    Assert-0007Ready $After
    Assert-StableData $Before $After '0007 commit'
    [pscustomobject]@{
      ProjectRef = $ShadowProjectRef
      Stage = $Stage
      BucketReady = $true
      PolicyCount = [int]$After.ocrPolicyCount
      StorageObjectsStable = $true
    } | ConvertTo-Json -Compress
    return
  }

  if ($Stage -eq 'preview-0014') {
    if ([int]$Before.functionCount -ne 0) {
      throw 'preview-0014 要求五个 lease RPC 尚未存在；当前状态不是唯一前置状态。'
    }
    $Preview = Invoke-RollbackPreview $Migration0014 $Verification0014Sql '0014'
    Assert-0014Ready $Preview
    $AfterRollback = Invoke-PsqlJson $SnapshotSql '0014 rollback snapshot'
    Assert-StableData $Before $AfterRollback '0014 rollback'
    if ([int]$AfterRollback.functionCount -ne 0) { throw '0014 事务预演没有完整回滚函数。' }
    [pscustomobject]@{
      ProjectRef = $ShadowProjectRef
      Stage = $Stage
      TransactionRolledBack = $true
      FunctionCountInsideTransaction = [int]$Preview.functionCount
      FunctionCountAfterRollback = [int]$AfterRollback.functionCount
      StableData = $true
    } | ConvertTo-Json -Compress
    return
  }

  if ($Stage -eq 'commit-0014') {
    if ([int]$Before.functionCount -ne 0) {
      throw 'commit-0014 要求五个 lease RPC 尚未存在；拒绝覆盖或重复执行。'
    }
    & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--quiet' `
      '--set' 'ON_ERROR_STOP=1' '--file' $Migration0014
    if ($LASTEXITCODE -ne 0) { throw '0014 fixed Shadow 提交失败。' }
    $After = Invoke-PsqlJson $SnapshotSql '0014 commit snapshot'
    Assert-0014Ready $After
    Assert-StableData $Before $After '0014 commit'
    [pscustomobject]@{
      ProjectRef = $ShadowProjectRef
      Stage = $Stage
      FunctionCount = [int]$After.functionCount
      RlsAndGrantsPassed = $true
      StableData = $true
    } | ConvertTo-Json -Compress
    return
  }

  if ([int]$Before.functionCount -ne 5) {
    throw "$Stage 要求 0014 已完成并通过后验。"
  }
  Assert-0014Ready $Before
  if ($Stage -in @('preview-0020', 'commit-0020', 'postflight') -and $Before.bucketExists -ne $true) {
    throw "$Stage 拒绝执行：fixed Shadow 缺少既有 ocr-documents bucket；0020 不负责创建前置资源。"
  }

  if ($Stage -eq 'preview-0020') {
    $Preview = Invoke-RollbackPreview $Migration0020 $Verification0020Sql '0020'
    Assert-0020Ready $Preview
    $AfterRollback = Invoke-PsqlJson $SnapshotSql '0020 rollback snapshot'
    Assert-StableData $Before $AfterRollback '0020 rollback'
    foreach ($Property in @('bucketPublic', 'bucketFileSizeLimit')) {
      if ([string]$Before.$Property -cne [string]$AfterRollback.$Property) {
        throw "0020 事务预演没有恢复 bucket 属性：$Property"
      }
    }
    if ((@($Before.bucketAllowedMimeTypes) -join '|') -cne (@($AfterRollback.bucketAllowedMimeTypes) -join '|')) {
      throw '0020 事务预演没有恢复 bucket MIME allowlist。'
    }
    [pscustomobject]@{
      ProjectRef = $ShadowProjectRef
      Stage = $Stage
      TransactionRolledBack = $true
      BucketReadyInsideTransaction = $true
      StorageObjectsStable = $true
    } | ConvertTo-Json -Compress
    return
  }

  if ($Stage -eq 'commit-0020') {
    $AlreadyReady = $true
    try { Assert-0020Ready $Before } catch { $AlreadyReady = $false }
    if (-not $AlreadyReady) {
      & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--quiet' `
        '--set' 'ON_ERROR_STOP=1' '--file' $Migration0020
      if ($LASTEXITCODE -ne 0) { throw '0020 fixed Shadow 提交失败。' }
    }
    $After = Invoke-PsqlJson $SnapshotSql '0020 commit snapshot'
    Assert-0014Ready $After
    Assert-0020Ready $After
    Assert-StableData $Before $After '0020 commit'
    [pscustomobject]@{
      ProjectRef = $ShadowProjectRef
      Stage = $Stage
      AlreadyReady = $AlreadyReady
      BucketReady = $true
      StorageObjectsStable = $true
    } | ConvertTo-Json -Compress
    return
  }

  if ($Stage -eq 'postflight') {
    Assert-0014Ready $Before
    Assert-0020Ready $Before
    [pscustomobject]@{
      ProjectRef = $ShadowProjectRef
      Stage = $Stage
      ReadOnly = $true
      FunctionCount = [int]$Before.functionCount
      SecurityDefinerCount = [int]$Before.securityDefinerCount
      AuthenticatedExecuteCount = [int]$Before.authenticatedExecuteCount
      AnonExecuteCount = [int]$Before.anonExecuteCount
      DirectJobItemWriteRevoked = $true
      BucketReady = $true
      JobsCount = [int64]$Before.jobsCount
      JobItemsCount = [int64]$Before.jobItemsCount
      StorageObjectsCount = [int64]$Before.storageObjectsCount
    } | ConvertTo-Json -Compress
    return
  }
} finally {
  if ($null -eq $PreviousPgPassword) {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  } else {
    $env:PGPASSWORD = $PreviousPgPassword
  }
  if ($null -eq $PreviousPgOptions) {
    Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue
  } else {
    $env:PGOPTIONS = $PreviousPgOptions
  }
  if ($null -ne $TunnelProcess -and -not $TunnelProcess.HasExited) {
    Stop-Process -Id $TunnelProcess.Id -Force -ErrorAction SilentlyContinue
    $TunnelProcess.WaitForExit(5000) | Out-Null
  }
  if (Test-Path -LiteralPath $PreviewRoot) {
    Get-ChildItem -LiteralPath $PreviewRoot -Force -ErrorAction SilentlyContinue | ForEach-Object {
      $Resolved = $_.FullName
      if (-not $Resolved.StartsWith($ExpectedCredentialPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "拒绝清理 .local-backups 之外的预演文件：$Resolved"
      }
      Remove-Item -LiteralPath $Resolved -Force -Recurse
    }
  }
}
