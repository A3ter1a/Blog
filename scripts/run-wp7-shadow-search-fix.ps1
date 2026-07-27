[CmdletBinding()]
param([string]$CredentialPath = (Join-Path $PSScriptRoot '..\.local-backups\wp1-b-shadow-credential-v2.json'))

$ErrorActionPreference = 'Stop'
$ShadowProjectRef = 'qyjfcebqjtphlpsvizxo'
$ProductionProjectRef = 'kysywitrsjhcdlcrfayl'
$ExpectedHash = 'b40918f65d9f4019da23293f1d0c60916aca59a5a9fb8874fff6a0b6350aa327'
$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Migration = Join-Path $RepositoryRoot 'supabase\migrations\0022_private_note_rag_operator_fix.sql'
$TempRoot = Join-Path $RepositoryRoot '.local-backups\wp7-search-fix-preview'
if ($ShadowProjectRef -eq $ProductionProjectRef) { throw '拒绝执行：Shadow 与生产 ref 相同。' }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $Migration).Hash.ToLowerInvariant() -cne $ExpectedHash) { throw '0022 SHA-256 漂移。' }
$Credential = Get-Content -Raw -Encoding UTF8 -LiteralPath (Resolve-Path $CredentialPath).Path | ConvertFrom-Json
if ([string]$Credential.projectName -cne 'Blog-shadow-wp1b' -or [string]$Credential.region -cne 'ap-southeast-1') { throw 'Shadow 凭据标记无效。' }
$Psql = (Resolve-Path (Join-Path $RepositoryRoot '.tools\postgresql\17.10\pgsql\bin\psql.exe')).Path
$Db = "host=aws-0-ap-southeast-1.pooler.supabase.com hostaddr=127.0.0.1 port=15433 dbname=postgres user=postgres.$ShadowProjectRef sslmode=require connect_timeout=10"
$Tunnel = $null
$PreviousPassword = $env:PGPASSWORD
try {
  $Node = (Get-Command node -ErrorAction Stop).Source
  $Tunnel = Start-Process -FilePath $Node -ArgumentList @((Join-Path $RepositoryRoot 'scripts\wp1b-pg-http-connect-tunnel.mjs'),'shadow') -WorkingDirectory $RepositoryRoot -WindowStyle Hidden -PassThru
  $Ready=$false
  for($Attempt=0;$Attempt -lt 40;$Attempt+=1){try{$Client=[System.Net.Sockets.TcpClient]::new();$Client.Connect('127.0.0.1',15433);$Client.Dispose();$Ready=$true;break}catch{Start-Sleep -Milliseconds 250}}
  if(-not $Ready){throw 'Shadow 隧道未就绪。'}
  $env:PGPASSWORD=[string]$Credential.databasePassword
  $CheckSql = "select (position('OPERATOR(extensions.<=>)' in pg_get_functiondef(to_regprocedure('public.search_private_note_rag(text,extensions.vector,uuid,integer)'))) > 0)::text;"
  $Existing=& $Psql '--dbname' $Db '--no-password' '--no-psqlrc' '--quiet' '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' $CheckSql
  if($LASTEXITCODE -ne 0){throw '0022 前验失败。'}
  if([string]($Existing|Select-Object -Last 1).Trim() -eq 'true'){
    [pscustomobject]@{ProjectRef=$ShadowProjectRef;Migration0022Ready=$true;AlreadyReady=$true}|ConvertTo-Json -Compress
    return
  }
  New-Item -ItemType Directory -Path $TempRoot -Force | Out-Null
  $Lines=[System.Collections.Generic.List[string]]::new(); Get-Content -Encoding UTF8 -LiteralPath $Migration|ForEach-Object{$Lines.Add($_)}
  $First=-1; for($Index=0;$Index -lt $Lines.Count;$Index+=1){if($Lines[$Index].Trim() -and -not $Lines[$Index].Trim().StartsWith('--')){$First=$Index;break}}
  $Last=-1; for($Index=$Lines.Count-1;$Index -ge 0;$Index-=1){if($Lines[$Index].Trim()){$Last=$Index;break}}
  if($Lines[$First].Trim().ToLowerInvariant() -cne 'begin;' -or $Lines[$Last].Trim().ToLowerInvariant() -cne 'commit;'){throw '0022 事务壳无效。'}
  $Lines[$First]='-- begin supplied by runner'; $Lines[$Last]='-- commit replaced by rollback'
  $Preview=Join-Path $TempRoot '0022-body.sql'; [System.IO.File]::WriteAllLines($Preview,$Lines,[System.Text.UTF8Encoding]::new($false))
  $PreviewRows=& $Psql '--dbname' $Db '--no-password' '--no-psqlrc' '--quiet' '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' 'begin;' '--file' $Preview '--command' $CheckSql '--command' 'rollback;'
  if($LASTEXITCODE -ne 0 -or [string]($PreviewRows|Where-Object{[string]$_ -match '^(true|false)$'}|Select-Object -Last 1).Trim() -ne 'true'){throw '0022 回滚预演失败。'}
  $AfterRollback=& $Psql '--dbname' $Db '--no-password' '--no-psqlrc' '--quiet' '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' $CheckSql
  if([string]($AfterRollback|Select-Object -Last 1).Trim() -ne 'false'){throw '0022 预演未回滚。'}
  & $Psql '--dbname' $Db '--no-password' '--no-psqlrc' '--quiet' '--set' 'ON_ERROR_STOP=1' '--file' $Migration
  if($LASTEXITCODE -ne 0){throw '0022 提交失败。'}
  $AfterCommit=& $Psql '--dbname' $Db '--no-password' '--no-psqlrc' '--quiet' '--tuples-only' '--no-align' '--set' 'ON_ERROR_STOP=1' '--command' $CheckSql
  if([string]($AfterCommit|Select-Object -Last 1).Trim() -ne 'true'){throw '0022 提交后验失败。'}
  [pscustomobject]@{ProjectRef=$ShadowProjectRef;Migration0022Ready=$true;TransactionPreviewRolledBack=$true;Committed=$true;ProductionTouched=$false}|ConvertTo-Json -Compress
} finally {
  if($null -eq $PreviousPassword){Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue}else{$env:PGPASSWORD=$PreviousPassword}
  if($null -ne $Tunnel -and -not $Tunnel.HasExited){Stop-Process -Id $Tunnel.Id -Force -ErrorAction SilentlyContinue;$Tunnel.WaitForExit(5000)|Out-Null}
  if(Test-Path -LiteralPath $TempRoot){Remove-Item -LiteralPath $TempRoot -Recurse -Force}
}
