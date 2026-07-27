[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupDir,
  [string]$PgBin = $env:ASTEROID_PG_BIN,
  [switch]$ConfirmShadowRestore
)

$ErrorActionPreference = 'Stop'
$ProductionProjectRef = 'kysywitrsjhcdlcrfayl'
$ExpectedShadowProjectRef = 'qyjfcebqjtphlpsvizxo'

if (-not $ConfirmShadowRestore) {
  throw '恢复会向目标数据库写入结构和数据。确认目标是可丢弃影子环境后使用 -ConfirmShadowRestore。'
}

$ShadowProjectRef = $env:ASTEROID_SHADOW_PROJECT_REF
$ShadowDatabaseUrl = $env:ASTEROID_SHADOW_DB_URL
if ([string]::IsNullOrWhiteSpace($ShadowProjectRef) -or [string]::IsNullOrWhiteSpace($ShadowDatabaseUrl)) {
  throw '缺少 ASTEROID_SHADOW_PROJECT_REF 或 ASTEROID_SHADOW_DB_URL。'
}
if ($ShadowProjectRef -eq $ProductionProjectRef -or $ShadowDatabaseUrl.Contains($ProductionProjectRef)) {
  throw '拒绝执行：影子目标指向生产项目。'
}
if ($ShadowProjectRef -ne $ExpectedShadowProjectRef -or -not $ShadowDatabaseUrl.Contains($ExpectedShadowProjectRef)) {
  throw "拒绝执行：恢复目标必须明确包含既定影子 project ref：$ExpectedShadowProjectRef。"
}

function Resolve-PgTool([string]$Name) {
  if (-not [string]::IsNullOrWhiteSpace($PgBin)) {
    $candidate = Join-Path $PgBin "$Name.exe"
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -ne $command) { return $command.Source }
  throw "未找到 $Name。请安装 PostgreSQL 17 客户端并设置 ASTEROID_PG_BIN。"
}

$ResolvedBackupDir = (Resolve-Path -LiteralPath $BackupDir).Path
$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ExpectedBackupRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups\wp1-b'))
$ExpectedBackupPrefix = $ExpectedBackupRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $ResolvedBackupDir.StartsWith($ExpectedBackupPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "拒绝恢复工作区外或非 WP1-B 目录的备份：$ResolvedBackupDir"
}
$DumpPath = Join-Path $ResolvedBackupDir 'full.dump'
$ManifestPath = Join-Path $ResolvedBackupDir 'backup-manifest.json'
$AuthManifestPath = Join-Path $ResolvedBackupDir 'auth-user-manifest.json'
$RestoreTocPath = Join-Path $ResolvedBackupDir 'restore-public-private.toc'
foreach ($required in @($DumpPath, $ManifestPath, $AuthManifestPath, $RestoreTocPath)) {
  if (-not (Test-Path -LiteralPath $required)) { throw "备份不完整：缺少 $required" }
}

$Verifier = Join-Path $RepositoryRoot 'scripts\verify-wp1b-backup.mjs'
$AuditSql = Join-Path $RepositoryRoot 'supabase\wp1b-restore-audit.sql'
$AuthPlaceholderSql = Join-Path $RepositoryRoot 'supabase\wp1b-shadow-auth-placeholders.sql'
$AuthCleanupSql = Join-Path $RepositoryRoot 'supabase\wp1b-shadow-auth-cleanup.sql'

& node $Verifier '--dir' $ResolvedBackupDir
if ($LASTEXITCODE -ne 0) { throw '备份 checksum 校验未通过，拒绝恢复。' }

$ShadowRestoreTocPath = Join-Path $ResolvedBackupDir 'restore-public-private-shadow.toc'
$PlatformDefaultAclPattern = '\sDEFAULT ACL\s+public\s+DEFAULT PRIVILEGES FOR (SEQUENCES|FUNCTIONS|TABLES)\s+supabase_admin\s*$'
$RestoreTocLines = Get-Content -Encoding UTF8 -LiteralPath $RestoreTocPath
$ExcludedPlatformDefaultAcl = @($RestoreTocLines | Where-Object { $_ -match $PlatformDefaultAclPattern })
if ($ExcludedPlatformDefaultAcl.Count -ne 3) {
  throw "影子恢复 TOC 预期排除 3 条 supabase_admin 默认权限，实际为 $($ExcludedPlatformDefaultAcl.Count) 条。"
}
$RestoreTocLines |
  Where-Object { $_ -notmatch $PlatformDefaultAclPattern } |
  Set-Content -Encoding UTF8 -LiteralPath $ShadowRestoreTocPath

$ShadowTableAclTocPath = Join-Path $ResolvedBackupDir 'restore-public-table-acl-shadow.toc'
$TableAclLines = @($RestoreTocLines | Where-Object { $_ -match '\sACL\s+public\s+TABLE\s+' })
if ($TableAclLines.Count -ne 13) {
  throw "影子恢复 TOC 预期包含 13 条应用表 ACL，实际为 $($TableAclLines.Count) 条。"
}
$TableAclLines | Set-Content -Encoding UTF8 -LiteralPath $ShadowTableAclTocPath
$ResetAppTableAclSql = @'
revoke all privileges on table
  public.admin_users,
  public.chapters,
  public.english_attempt_answers,
  public.english_attempts,
  public.english_papers,
  public.english_passages,
  public.english_questions,
  public.english_vocabulary,
  public.flashcards,
  public.math3_self_tests,
  public.notes,
  public.problem_practice_statuses,
  public.site_profile
from public, anon, authenticated, service_role;
'@

$PgRestore = Resolve-PgTool 'pg_restore'
$Psql = Resolve-PgTool 'psql'
$PgRestoreVersion = (& $PgRestore '--version') -join ''
if ($LASTEXITCODE -ne 0 -or $PgRestoreVersion -notmatch ' 17\.') {
  throw "必须使用 PostgreSQL 17 pg_restore。当前：$PgRestoreVersion"
}

$ExistingAuthRows = (& $Psql '--dbname' $ShadowDatabaseUrl '--no-password' '--no-psqlrc' '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' 'select count(*) from auth.users;') -join ''
if ($LASTEXITCODE -ne 0) { throw '无法确认影子 Auth 状态。' }
if ($ExistingAuthRows.Trim() -ne '0') { throw '影子项目已有 Auth 用户。为避免覆盖或身份冲突，拒绝恢复。' }

$ExistingNotesTable = (& $Psql '--dbname' $ShadowDatabaseUrl '--no-password' '--no-psqlrc' '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' "select to_regclass('public.notes') is not null;") -join ''
if ($LASTEXITCODE -ne 0) { throw '无法确认影子 public schema 状态。' }
if ($ExistingNotesTable.Trim() -eq 't') { throw '影子项目已存在 public.notes。WP1-B 只允许恢复到空白影子项目。' }

$AuthUsers = Get-Content -Raw -Encoding UTF8 -LiteralPath $AuthManifestPath | ConvertFrom-Json
$ShadowCredentialLines = @()
$CreatedShadowUserIds = @()
$ShadowLoginPath = Join-Path $ResolvedBackupDir 'shadow-login-local.txt'
$RestoreCommitted = $false

try {
  foreach ($AuthUser in $AuthUsers) {
    $ParsedUserId = [guid]::Empty
    if (-not [guid]::TryParse([string]$AuthUser.id, [ref]$ParsedUserId)) {
      throw "Auth manifest 包含无效 UUID，拒绝创建影子用户：$($AuthUser.id)"
    }
    if ([string]::IsNullOrWhiteSpace([string]$AuthUser.email)) {
      throw "Auth manifest 中用户 $ParsedUserId 缺少邮箱，拒绝继续。"
    }

    $ShadowPassword = ([guid]::NewGuid().ToString('N') + 'Aa1!')
    & $Psql `
      '--dbname' $ShadowDatabaseUrl `
      '--no-password' `
      '--no-psqlrc' `
      '--set' 'ON_ERROR_STOP=1' `
      '--set' "user_id=$ParsedUserId" `
      '--set' "user_email=$($AuthUser.email)" `
      '--set' "shadow_password=$ShadowPassword" `
      '--file' $AuthPlaceholderSql
    if ($LASTEXITCODE -ne 0) { throw "创建影子 Auth 占位用户失败：$($AuthUser.email)" }
    $CreatedShadowUserIds += $ParsedUserId.ToString()
    $ShadowCredentialLines += "email=$($AuthUser.email)`npassword=$ShadowPassword`n"
  }

  Set-Content -LiteralPath $ShadowLoginPath -Value ($ShadowCredentialLines -join "`n") -Encoding UTF8

  Write-Host "即将恢复到影子项目：$ShadowProjectRef"
  & $PgRestore `
    '--dbname' $ShadowDatabaseUrl `
    '--no-password' `
    '--no-owner' `
    '--exit-on-error' `
    '--single-transaction' `
    '--use-list' $ShadowRestoreTocPath `
    $DumpPath
  if ($LASTEXITCODE -ne 0) { throw "影子恢复失败，退出码 $LASTEXITCODE。" }

  & $Psql '--dbname' $ShadowDatabaseUrl '--no-password' '--no-psqlrc' '--set' 'ON_ERROR_STOP=1' '--command' $ResetAppTableAclSql
  if ($LASTEXITCODE -ne 0) { throw '影子应用表默认 ACL 清理失败。' }
  & $PgRestore `
    '--dbname' $ShadowDatabaseUrl `
    '--no-password' `
    '--no-owner' `
    '--exit-on-error' `
    '--single-transaction' `
    '--use-list' $ShadowTableAclTocPath `
    $DumpPath
  if ($LASTEXITCODE -ne 0) { throw '影子应用表生产 ACL 重放失败。' }
  $RestoreCommitted = $true

  $AuditRows = & $Psql '--dbname' $ShadowDatabaseUrl '--no-password' '--no-psqlrc' '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--file' $AuditSql
  if ($LASTEXITCODE -ne 0) { throw "影子恢复审计失败，退出码 $LASTEXITCODE。" }
  $AuditJson = ($AuditRows -join "`n").Trim()
  $null = $AuditJson | ConvertFrom-Json
  $RestoreAuditPath = Join-Path $ResolvedBackupDir 'shadow-restore-audit.json'
  Set-Content -LiteralPath $RestoreAuditPath -Value $AuditJson -Encoding UTF8

  & node $Verifier '--dir' $ResolvedBackupDir '--restore-audit' $RestoreAuditPath
  if ($LASTEXITCODE -ne 0) { throw '影子恢复后的行数/checksum/完整性对账失败。' }
} finally {
  if (-not $RestoreCommitted -and $CreatedShadowUserIds.Count -gt 0) {
    $NotesAfterFailure = (& $Psql '--dbname' $ShadowDatabaseUrl '--no-password' '--no-psqlrc' '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' "select to_regclass('public.notes') is not null;") -join ''
    if ($LASTEXITCODE -eq 0 -and $NotesAfterFailure.Trim() -eq 'f') {
      foreach ($CreatedUserId in $CreatedShadowUserIds) {
        & $Psql `
          '--dbname' $ShadowDatabaseUrl `
          '--no-password' `
          '--no-psqlrc' `
          '--set' 'ON_ERROR_STOP=1' `
          '--set' "user_id=$CreatedUserId" `
          '--file' $AuthCleanupSql
        if ($LASTEXITCODE -ne 0) {
          Write-Warning "影子恢复失败后未能清理占位 Auth 用户：$CreatedUserId"
        }
      }
      Remove-Item -LiteralPath $ShadowLoginPath -Force -ErrorAction SilentlyContinue
    } else {
      Write-Warning '影子恢复失败后检测到应用表或无法确认空白状态，已保留现场且未自动删除 Auth 用户。'
    }
  }
}

Write-Host 'WP1-B 应用数据影子恢复与对账通过。'
Write-Host '影子登录凭据仅保存在备份目录的 shadow-login-local.txt；它不是生产密码。'
Write-Host 'Storage 对象按 manifest 独立核验，不下载或覆盖生产对象。'
