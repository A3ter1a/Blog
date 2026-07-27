[CmdletBinding()]
param(
  [string]$BackupDir = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b\20260713-103656-160'),
  [string]$CredentialPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-shadow-credential-v2.json'),
  [switch]$ConfirmShadowAuthRepair
)

$ErrorActionPreference = 'Stop'
$ShadowProjectRef = 'qyjfcebqjtphlpsvizxo'
$ProductionProjectRef = 'kysywitrsjhcdlcrfayl'
$LocalTunnelPort = 15433

if (-not $ConfirmShadowAuthRepair) {
  throw '必须显式传入 -ConfirmShadowAuthRepair 才能修改 fixed shadow 占位 Auth 记录。'
}
if ($ShadowProjectRef -eq $ProductionProjectRef) {
  throw '拒绝执行：shadow ref 与生产 ref 相同。'
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ResolvedBackupDir = (Resolve-Path -LiteralPath $BackupDir).Path
$ExpectedBackupRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups\wp1-b'))
if (-not $ResolvedBackupDir.StartsWith($ExpectedBackupRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw '拒绝读取 WP1-B 本地备份目录之外的 shadow 登录凭据。'
}

$ShadowLoginPath = Join-Path $ResolvedBackupDir 'shadow-login-local.txt'
$Credential = Get-Content -Raw -Encoding UTF8 -LiteralPath $CredentialPath | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace([string]$Credential.databasePassword)) {
  throw '固定 shadow 数据库密码缺失。'
}

$PublishableKey = [string]$env:ASTEROID_SHADOW_PUBLISHABLE_KEY
if ($PublishableKey -notmatch '^sb_publishable_[A-Za-z0-9_-]+$') {
  throw '必须通过 ASTEROID_SHADOW_PUBLISHABLE_KEY 提供 fixed shadow publishable key；禁止写入文件或命令参数。'
}

$Login = @{}
foreach ($Line in (Get-Content -Encoding UTF8 -LiteralPath $ShadowLoginPath)) {
  if ($Line -match '^\s*([^=:#]+)\s*[:=]\s*(.+?)\s*$') {
    $Login[$Matches[1].Trim().ToLowerInvariant()] = $Matches[2]
  }
}
if ([string]::IsNullOrWhiteSpace([string]$Login.email) -or [string]::IsNullOrWhiteSpace([string]$Login.password)) {
  throw '固定 shadow 登录凭据字段缺失。'
}

$EmailSql = ([string]$Login.email).Replace("'", "''")
$PgBin = (Resolve-Path (Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin')).Path
$Psql = Join-Path $PgBin 'psql.exe'
$Node = (Get-Command node -ErrorAction Stop).Source
$DatabaseUrl = @(
  'host=aws-0-ap-southeast-1.pooler.supabase.com',
  'hostaddr=127.0.0.1',
  "port=$LocalTunnelPort",
  'dbname=postgres',
  "user=postgres.$ShadowProjectRef",
  'sslmode=require',
  'connect_timeout=10'
) -join ' '

$RepairTemplate = @'
begin;
do $guard$
declare
  matched_users integer;
  matched_identities integer;
begin
  select count(*) into matched_users
  from auth.users
  where lower(email) = lower('__EMAIL__')
    and created_at is not null
    and updated_at is not null
    and confirmation_token is null
    and recovery_token is null
    and email_change is null
    and email_change_token_new is null;

  select count(*) into matched_identities
  from auth.identities i
  join auth.users u on u.id = i.user_id
  where lower(u.email) = lower('__EMAIL__')
    and i.provider = 'email'
    and i.created_at is null
    and i.updated_at is null
    and i.last_sign_in_at is null;

  if matched_users <> 1 or matched_identities <> 1 then
    raise exception 'shadow auth repair preflight expected one user and one identity, got users=% identities=%',
      matched_users, matched_identities;
  end if;
end
$guard$;

update auth.users
set confirmation_token = '',
    recovery_token = '',
    email_change = '',
    email_change_token_new = ''
where lower(email) = lower('__EMAIL__')
  and confirmation_token is null
  and recovery_token is null
  and email_change is null
  and email_change_token_new is null;

update auth.identities i
set created_at = u.created_at,
    updated_at = u.updated_at,
    last_sign_in_at = u.created_at
from auth.users u
where i.user_id = u.id
  and lower(u.email) = lower('__EMAIL__')
  and i.provider = 'email'
  and i.created_at is null
  and i.updated_at is null
  and i.last_sign_in_at is null;

do $guard$
declare
  matched_users integer;
  matched_identities integer;
begin
  select count(*) into matched_users
  from auth.users
  where lower(email) = lower('__EMAIL__')
    and confirmation_token = ''
    and recovery_token = ''
    and email_change = ''
    and email_change_token_new = '';

  select count(*) into matched_identities
  from auth.identities i
  join auth.users u on u.id = i.user_id
  where lower(u.email) = lower('__EMAIL__')
    and i.provider = 'email'
    and i.created_at = u.created_at
    and i.updated_at = u.updated_at
    and i.last_sign_in_at = u.created_at;

  if matched_users <> 1 or matched_identities <> 1 then
    raise exception 'shadow auth repair postcondition expected one user and one identity, got users=% identities=%',
      matched_users, matched_identities;
  end if;
end
$guard$;

select jsonb_build_object(
  'target', 'qyjfcebqjtphlpsvizxo',
  'userRows', 1,
  'identityRows', 1,
  'productionConnected', false
);
commit;
'@

$RevertTemplate = @'
begin;
do $guard$
declare
  matched_users integer;
  matched_identities integer;
begin
  select count(*) into matched_users
  from auth.users
  where lower(email) = lower('__EMAIL__')
    and confirmation_token = ''
    and recovery_token = ''
    and email_change = ''
    and email_change_token_new = '';

  select count(*) into matched_identities
  from auth.identities i
  join auth.users u on u.id = i.user_id
  where lower(u.email) = lower('__EMAIL__')
    and i.provider = 'email'
    and i.created_at = u.created_at
    and i.updated_at = u.updated_at
    and i.last_sign_in_at = u.created_at;

  if matched_users <> 1 or matched_identities <> 1 then
    raise exception 'shadow auth revert preflight expected one user and one identity, got users=% identities=%',
      matched_users, matched_identities;
  end if;
end
$guard$;

update auth.users
set confirmation_token = null,
    recovery_token = null,
    email_change = null,
    email_change_token_new = null
where lower(email) = lower('__EMAIL__')
  and confirmation_token = ''
  and recovery_token = ''
  and email_change = ''
  and email_change_token_new = '';

update auth.identities i
set created_at = null,
    updated_at = null,
    last_sign_in_at = null
from auth.users u
where i.user_id = u.id
  and lower(u.email) = lower('__EMAIL__')
  and i.provider = 'email'
  and i.created_at = u.created_at
  and i.updated_at = u.updated_at
  and i.last_sign_in_at = u.created_at;

do $guard$
declare
  matched_users integer;
  matched_identities integer;
begin
  select count(*) into matched_users
  from auth.users
  where lower(email) = lower('__EMAIL__')
    and confirmation_token is null
    and recovery_token is null
    and email_change is null
    and email_change_token_new is null;

  select count(*) into matched_identities
  from auth.identities i
  join auth.users u on u.id = i.user_id
  where lower(u.email) = lower('__EMAIL__')
    and i.provider = 'email'
    and i.created_at is null
    and i.updated_at is null
    and i.last_sign_in_at is null;

  if matched_users <> 1 or matched_identities <> 1 then
    raise exception 'shadow auth revert postcondition expected one user and one identity, got users=% identities=%',
      matched_users, matched_identities;
  end if;
end
$guard$;

select jsonb_build_object(
  'target', 'qyjfcebqjtphlpsvizxo',
  'originalNullStateRestored', true,
  'productionConnected', false
);
commit;
'@

function Invoke-ShadowSqlJson {
  param(
    [Parameter(Mandatory)]
    [string]$Sql,
    [Parameter(Mandatory)]
    [string]$FailureMessage
  )

  $Lines = & $Psql `
    '--dbname' $DatabaseUrl `
    '--no-password' `
    '--no-psqlrc' `
    '--tuples-only' `
    '--no-align' `
    '--quiet' `
    '--set' 'ON_ERROR_STOP=1' `
    '--command' $Sql

  if ($LASTEXITCODE -ne 0) {
    throw $FailureMessage
  }

  $Json = ($Lines | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Last 1).Trim()
  return $Json | ConvertFrom-Json
}

$TunnelProcess = $null
try {
  $TunnelProcess = Start-Process -FilePath $Node `
    -ArgumentList @((Join-Path $RepositoryRoot 'scripts\wp1b-pg-http-connect-tunnel.mjs'), 'shadow') `
    -WorkingDirectory $RepositoryRoot `
    -WindowStyle Hidden `
    -PassThru

  $Ready = $false
  for ($Index = 0; $Index -lt 40; $Index += 1) {
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
  if (-not $Ready) {
    throw '固定 shadow 数据库隧道未就绪。'
  }

  $env:PGPASSWORD = $Credential.databasePassword
  $RepairSql = $RepairTemplate.Replace('__EMAIL__', $EmailSql)
  $RepairResult = Invoke-ShadowSqlJson `
    -Sql $RepairSql `
    -FailureMessage '固定 shadow Auth 占位记录修复失败；数据库事务已回滚。'

  try {
    $AuthResult = Invoke-RestMethod `
      -Method Post `
      -Uri "https://$ShadowProjectRef.supabase.co/auth/v1/token?grant_type=password" `
      -Headers @{ apikey = $PublishableKey } `
      -ContentType 'application/json' `
      -Body (@{ email = $Login.email; password = $Login.password } | ConvertTo-Json -Compress) `
      -TimeoutSec 30

    if (-not $AuthResult.access_token -or -not $AuthResult.refresh_token -or -not $AuthResult.user.id) {
      throw '固定 shadow 登录响应不完整。'
    }

    [ordered]@{
      target = $ShadowProjectRef
      userRows = $RepairResult.userRows
      identityRows = $RepairResult.identityRows
      passwordLoginSucceeded = $true
      userResolved = $true
      productionConnected = $false
    } | ConvertTo-Json -Compress
  } catch {
    $RevertSql = $RevertTemplate.Replace('__EMAIL__', $EmailSql)
    $RevertResult = Invoke-ShadowSqlJson `
      -Sql $RevertSql `
      -FailureMessage '真实登录失败，且 fixed shadow Auth 原值恢复失败；必须停止并人工审计。'

    if (-not $RevertResult.originalNullStateRestored) {
      throw '真实登录失败，fixed shadow Auth 原值恢复后验未通过。'
    }

    throw '真实登录验证失败；两条 fixed shadow Auth 占位记录已恢复原 NULL 状态。'
  } finally {
    Remove-Variable AuthResult -ErrorAction SilentlyContinue
  }
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  $Login.Clear()
  Remove-Variable PublishableKey,EmailSql,RepairSql,RevertSql -ErrorAction SilentlyContinue
  if ($null -ne $TunnelProcess -and -not $TunnelProcess.HasExited) {
    Stop-Process -Id $TunnelProcess.Id -Force -ErrorAction SilentlyContinue
  }
}
