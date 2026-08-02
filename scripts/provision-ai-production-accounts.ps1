[CmdletBinding()]
param(
  [string]$CredentialOutputPath = (Join-Path $PSScriptRoot '..\.local-backups\ai-production-accounts.json'),
  [switch]$ConfirmProductionWrite,
  [string]$ConfirmationPhrase = ''
)

$ErrorActionPreference = 'Stop'
$ProductionProjectRef = 'kysywitrsjhcdlcrfayl'
$ExpectedPhrase = "WRITE $ProductionProjectRef AI-ACCOUNTS"
$LocalTunnelPort = 15432
$ExpectedPoolerHost = 'aws-1-ap-southeast-1.pooler.supabase.com'
$ExpectedPoolerPort = 5432
$ExpectedDatabase = 'postgres'
$ExpectedUsername = "postgres.$ProductionProjectRef"
$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$CredentialOutputPath = if ([System.IO.Path]::IsPathRooted($CredentialOutputPath)) {
  [System.IO.Path]::GetFullPath($CredentialOutputPath)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot $CredentialOutputPath))
}
$LocalBackupRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot '.local-backups'))
if (-not $CredentialOutputPath.StartsWith($LocalBackupRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Credential output must remain under .local-backups.'
}
if (-not $ConfirmProductionWrite -or $ConfirmationPhrase -cne $ExpectedPhrase) {
  throw "Production account provisioning requires -ConfirmProductionWrite and the exact phrase: $ExpectedPhrase"
}

$CredentialDirectory = Split-Path -Parent $CredentialOutputPath
New-Item -ItemType Directory -Force -Path $CredentialDirectory | Out-Null
$Existing = $null
if (Test-Path -LiteralPath $CredentialOutputPath -PathType Leaf) {
  $Existing = Get-Content -Raw -Encoding UTF8 -LiteralPath $CredentialOutputPath | ConvertFrom-Json
  if ([string]$Existing.status -eq 'active') { throw 'Active AI account credentials already exist; refusing to overwrite.' }
}

function New-Password {
  $Bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($Bytes)
  return [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
}

$Definitions = @(
  @{ accountKey = 'math'; subject = 'math'; email = 'math.ai@a3ter1a.cn'; displayName = '数学'; affiliation = '数学' },
  @{ accountKey = 'english'; subject = 'english'; email = 'english.ai@a3ter1a.cn'; displayName = '英语'; affiliation = '英语' },
  @{ accountKey = 'politics'; subject = 'politics'; email = 'politics.ai@a3ter1a.cn'; displayName = '政治'; affiliation = '政治' },
  @{ accountKey = 'economics'; subject = 'economics'; email = 'economics.ai@a3ter1a.cn'; displayName = '经济学'; affiliation = '经济学' }
)

if ($null -ne $Existing) {
  $Accounts = @($Existing.accounts | ForEach-Object { [pscustomobject][ordered]@{
    accountKey = [string]$_.accountKey; subject = [string]$_.subject; email = [string]$_.email
    displayName = [string]$_.displayName; affiliation = [string]$_.affiliation
    id = [string]$_.id; password = [string]$_.password
  } })
} else {
  $Accounts = @($Definitions | ForEach-Object { [pscustomobject][ordered]@{
    accountKey = $_.accountKey; subject = $_.subject; email = $_.email
    displayName = $_.displayName; affiliation = $_.affiliation
    id = ([guid]::NewGuid().ToString()); password = New-Password
  } })
}
if ($Accounts.Count -ne 4 -or @($Accounts | Select-Object -ExpandProperty email -Unique).Count -ne 4) {
  throw 'AI account definitions must contain exactly four unique accounts.'
}

function Save-CredentialFile([string]$Status, [object]$AccountsToSave, [object]$Extra = $null) {
  $Payload = [ordered]@{
    version = 1
    projectRef = $ProductionProjectRef
    status = $Status
    generatedAt = if ($null -ne $Existing.generatedAt) { $Existing.generatedAt } else { [DateTimeOffset]::UtcNow.ToString('o') }
    accounts = @($AccountsToSave)
  }
  if ($null -ne $Extra) { foreach ($Property in $Extra.PSObject.Properties) { $Payload[$Property.Name] = $Property.Value } }
  $Payload | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $CredentialOutputPath -Encoding UTF8
  $RepositoryOwner = (Get-Acl -LiteralPath $RepositoryRoot).Owner
  $CurrentIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  & icacls.exe $CredentialOutputPath '/inheritance:r' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to disable credential file ACL inheritance.' }
  foreach ($Identity in @($RepositoryOwner, $CurrentIdentity) | Select-Object -Unique) {
    & icacls.exe $CredentialOutputPath '/grant:r' "${Identity}:M" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to grant credential file read access to $Identity." }
  }
}

Save-CredentialFile 'pending' $Accounts

$CredentialPath = Join-Path $RepositoryRoot '.local-backups\wp1-b-production-db-credential.json'
$Credential = Get-Content -Raw -Encoding UTF8 -LiteralPath $CredentialPath | ConvertFrom-Json
if (
  [string]$Credential.projectRef -cne $ProductionProjectRef -or
  [string]$Credential.poolerHost -cne $ExpectedPoolerHost -or
  [int]$Credential.poolerPort -ne $ExpectedPoolerPort -or
  [string]$Credential.database -cne $ExpectedDatabase -or
  [string]$Credential.username -cne $ExpectedUsername -or
  [string]::IsNullOrWhiteSpace([string]$Credential.databasePassword)
) { throw 'Production credential target does not match the fixed project.' }

$Node = (Get-Command node -ErrorAction Stop).Source
$PgBin = (Resolve-Path (Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin')).Path
$Psql = Join-Path $PgBin 'psql.exe'
$TunnelScript = Join-Path $RepositoryRoot 'scripts\wp1b-pg-http-connect-tunnel.mjs'
$DatabaseParameters = @(
  "host=$ExpectedPoolerHost", 'hostaddr=127.0.0.1', "port=$LocalTunnelPort",
  "dbname=$ExpectedDatabase", "user=$ExpectedUsername", 'sslmode=require', 'connect_timeout=10'
) -join ' '

function Test-LoopbackPortListening([int]$Port) {
  $Client = [System.Net.Sockets.TcpClient]::new()
  try { $Task = $Client.ConnectAsync('127.0.0.1', $Port); return $Task.Wait(250) -and $Client.Connected }
  catch { return $false }
  finally { $Client.Dispose() }
}

foreach ($Account in $Accounts) {
  $envName = $Account.accountKey.ToUpperInvariant()
  Set-Item -Path ("Env:ASTEROID_AI_{0}_ID" -f $envName) -Value ([string]$Account.id)
  Set-Item -Path ("Env:ASTEROID_AI_{0}_EMAIL" -f $envName) -Value ([string]$Account.email)
  Set-Item -Path ("Env:ASTEROID_AI_{0}_PASSWORD" -f $envName) -Value ([string]$Account.password)
}

$ProvisionSql = @'
\getenv math_id ASTEROID_AI_MATH_ID
\getenv math_email ASTEROID_AI_MATH_EMAIL
\getenv math_password ASTEROID_AI_MATH_PASSWORD
\getenv english_id ASTEROID_AI_ENGLISH_ID
\getenv english_email ASTEROID_AI_ENGLISH_EMAIL
\getenv english_password ASTEROID_AI_ENGLISH_PASSWORD
\getenv politics_id ASTEROID_AI_POLITICS_ID
\getenv politics_email ASTEROID_AI_POLITICS_EMAIL
\getenv politics_password ASTEROID_AI_POLITICS_PASSWORD
\getenv economics_id ASTEROID_AI_ECONOMICS_ID
\getenv economics_email ASTEROID_AI_ECONOMICS_EMAIL
\getenv economics_password ASTEROID_AI_ECONOMICS_PASSWORD
begin;
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change,email_change_token_new,is_sso_user,is_anonymous)
select instance_id, :'math_id'::uuid, 'authenticated', 'authenticated', :'math_email', extensions.crypt(:'math_password', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name','数学'), '', '', '', '', false, false from auth.users order by created_at limit 1;
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change,email_change_token_new,is_sso_user,is_anonymous)
select instance_id, :'english_id'::uuid, 'authenticated', 'authenticated', :'english_email', extensions.crypt(:'english_password', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name','英语'), '', '', '', '', false, false from auth.users order by created_at limit 1;
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change,email_change_token_new,is_sso_user,is_anonymous)
select instance_id, :'politics_id'::uuid, 'authenticated', 'authenticated', :'politics_email', extensions.crypt(:'politics_password', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name','政治'), '', '', '', '', false, false from auth.users order by created_at limit 1;
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change,email_change_token_new,is_sso_user,is_anonymous)
select instance_id, :'economics_id'::uuid, 'authenticated', 'authenticated', :'economics_email', extensions.crypt(:'economics_password', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name','经济学'), '', '', '', '', false, false from auth.users order by created_at limit 1;
insert into auth.identities (provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
select email,id,jsonb_build_object('sub',id::text,'email',email,'email_verified',true,'phone_verified',false),'email',now(),now(),now() from auth.users where id in (:'math_id'::uuid,:'english_id'::uuid,:'politics_id'::uuid,:'economics_id'::uuid);
insert into public.ai_profiles (id,account_key,subject,display_name,avatar_url,bio,academic_affiliation,focus_tags,is_active)
values
  (:'math_id'::uuid,'math','math','数学',null,'','数学','{}'::text[],true),
  (:'english_id'::uuid,'english','english','英语',null,'','英语','{}'::text[],true),
  (:'politics_id'::uuid,'politics','politics','政治',null,'','政治','{}'::text[],true),
  (:'economics_id'::uuid,'economics','economics','经济学',null,'','经济学','{}'::text[],true);
commit;
'@

$PreflightSql = @'
begin read only;
select jsonb_build_object(
  'authIds', coalesce((select jsonb_agg(id order by id) from auth.users where lower(email) in ('math.ai@a3ter1a.cn','english.ai@a3ter1a.cn','politics.ai@a3ter1a.cn','economics.ai@a3ter1a.cn')), '[]'::jsonb),
  'profileIds', coalesce((select jsonb_agg(id order by id) from public.ai_profiles), '[]'::jsonb),
  'profileSubjects', coalesce((select jsonb_agg(subject order by subject) from public.ai_profiles), '[]'::jsonb)
)::text;
rollback;
'@

$TunnelProcess = $null
$PreviousPgPassword = $env:PGPASSWORD
try {
  if (Test-LoopbackPortListening $LocalTunnelPort) { throw "Loopback port $LocalTunnelPort is already in use." }
  $TunnelProcess = Start-Process -FilePath $Node -ArgumentList @($TunnelScript, 'production') -WorkingDirectory $RepositoryRoot -WindowStyle Hidden -PassThru
  $Ready = $false
  for ($Attempt = 0; $Attempt -lt 40; $Attempt += 1) { if (Test-LoopbackPortListening $LocalTunnelPort) { $Ready = $true; break }; Start-Sleep -Milliseconds 250 }
  if (-not $Ready) { throw 'Production loopback tunnel did not become ready.' }
  $env:PGPASSWORD = [string]$Credential.databasePassword
  $PreflightRows = $PreflightSql | & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--quiet' '--tuples-only' '--no-align' '--set=ON_ERROR_STOP=1'
  if ($LASTEXITCODE -ne 0) { throw 'AI account preflight failed.' }
  $PreflightLine = $PreflightRows | Where-Object { $_.TrimStart().StartsWith('{') } | Select-Object -Last 1
  $Preflight = [string]$PreflightLine | ConvertFrom-Json
  $ExpectedIds = @($Accounts | Select-Object -ExpandProperty id | Sort-Object)
  $ExistingAuthIds = @($Preflight.authIds | ForEach-Object { [string]$_ } | Sort-Object)
  $ExistingProfileIds = @($Preflight.profileIds | ForEach-Object { [string]$_ } | Sort-Object)
  $IdsMatch = (($ExpectedIds -join ',') -ceq ($ExistingAuthIds -join ',')) -and (($ExpectedIds -join ',') -ceq ($ExistingProfileIds -join ','))
  if ($ExistingAuthIds.Count -eq 0 -and $ExistingProfileIds.Count -eq 0) {
    $Rows = $ProvisionSql | & $Psql '--dbname' $DatabaseParameters '--no-password' '--no-psqlrc' '--set=ON_ERROR_STOP=1'
    if ($LASTEXITCODE -ne 0) { throw 'AI account transaction failed.' }
  } elseif ($ExistingAuthIds.Count -eq 4 -and $ExistingProfileIds.Count -eq 4 -and $IdsMatch) {
    Write-Output 'Matching pending AI accounts already exist; skipping duplicate insert and continuing with sign-in verification.'
  } else {
    throw 'Existing Auth/profile state does not match the pending four-account credential set.'
  }
} finally {
  if ($null -eq $PreviousPgPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD = $PreviousPgPassword }
  foreach ($Account in $Accounts) { $envName = $Account.accountKey.ToUpperInvariant(); foreach ($Suffix in @('ID','EMAIL','PASSWORD')) { Remove-Item ("Env:ASTEROID_AI_{0}_{1}" -f $envName,$Suffix) -ErrorAction SilentlyContinue } }
  if ($null -ne $TunnelProcess -and -not $TunnelProcess.HasExited) { Stop-Process -Id $TunnelProcess.Id -Force -ErrorAction SilentlyContinue; $TunnelProcess.WaitForExit(5000) | Out-Null }
  if (Test-LoopbackPortListening $LocalTunnelPort) { throw "Production tunnel port $LocalTunnelPort was not cleaned up." }
}

$SupabaseUrl = ((Get-Content -Encoding UTF8 -LiteralPath (Join-Path $RepositoryRoot '.env.local') | Where-Object { $_ -match '^NEXT_PUBLIC_SUPABASE_URL=' } | Select-Object -First 1) -replace '^NEXT_PUBLIC_SUPABASE_URL=','').Trim()
$AnonKey = ((Get-Content -Encoding UTF8 -LiteralPath (Join-Path $RepositoryRoot '.env.local') | Where-Object { $_ -match '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' } | Select-Object -First 1) -replace '^NEXT_PUBLIC_SUPABASE_ANON_KEY=','').Trim()
if ([string]::IsNullOrWhiteSpace($SupabaseUrl) -or [string]::IsNullOrWhiteSpace($AnonKey)) { throw 'Missing local Supabase URL or anon key for sign-in verification.' }
$Verified = @()
foreach ($Account in $Accounts) {
  $Body = @{ email = [string]$Account.email; password = [string]$Account.password } | ConvertTo-Json -Compress
  $Token = Invoke-RestMethod -Uri "$SupabaseUrl/auth/v1/token?grant_type=password" -Method Post -Headers @{ apikey = $AnonKey } -ContentType 'application/json' -Body $Body
  if ([string]::IsNullOrWhiteSpace([string]$Token.access_token) -or [string]$Token.user.id -cne [string]$Account.id) { throw "Auth sign-in verification failed for $($Account.accountKey)." }
  $Verified += $Account.accountKey
}

Save-CredentialFile 'active' $Accounts ([pscustomobject]@{ verifiedAt = [DateTimeOffset]::UtcNow.ToString('o'); signInVerifiedAccounts = $Verified })
$EvidencePath = Join-Path (Split-Path -Parent $CredentialOutputPath) ("ai-account-provisioning-" + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.json')
[ordered]@{
  evidenceVersion = 1
  projectRef = $ProductionProjectRef
  completedAt = [DateTimeOffset]::UtcNow.ToString('o')
  accounts = @($Accounts | ForEach-Object { [ordered]@{ accountKey=$_.accountKey; subject=$_.subject; email=$_.email; id=$_.id; displayName=$_.displayName } })
  signInVerifiedAccounts = $Verified
  productionWritePerformed = $true
} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
Write-Output "ProvisionedAccounts=4"
Write-Output "SignInVerified=$($Verified.Count)"
Write-Output "CredentialFile=$CredentialOutputPath"
Write-Output "EvidencePath=$EvidencePath"
