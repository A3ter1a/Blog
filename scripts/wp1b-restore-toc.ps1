function New-Wp1bRestoreToc {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$PgRestore,
    [Parameter(Mandatory = $true)]
    [string]$DumpPath,
    [Parameter(Mandatory = $true)]
    [string]$OutputPath
  )

  $FullList = & $PgRestore '--list' $DumpPath
  if ($LASTEXITCODE -ne 0) { throw '无法读取完整 pg_restore TOC。' }
  $ScopedList = & $PgRestore '--list' '--schema' 'public' '--schema' 'private' $DumpPath
  if ($LASTEXITCODE -ne 0) { throw '无法生成 public/private pg_restore TOC。' }

  $PrivateSchemaEntries = @($FullList | Where-Object { $_ -match '^\d+;\s+\d+\s+\d+\s+SCHEMA\s+-\s+private\s+' })
  $SchemaAclEntries = @($FullList | Where-Object { $_ -match '^\d+;\s+\d+\s+\d+\s+ACL\s+-\s+SCHEMA\s+(public|private)\s+' })
  if ($PrivateSchemaEntries.Count -ne 1) {
    throw "备份 TOC 中 private schema 条目数量异常：$($PrivateSchemaEntries.Count)"
  }
  if ($SchemaAclEntries.Count -ne 2) {
    throw "备份 TOC 中 public/private schema ACL 条目数量异常：$($SchemaAclEntries.Count)"
  }

  $Header = @($ScopedList | Where-Object { [string]::IsNullOrWhiteSpace($_) -or $_.StartsWith(';') })
  $ScopedEntries = @($ScopedList | Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and -not $_.StartsWith(';') })
  if ($ScopedEntries.Count -eq 0) { throw 'public/private TOC 为空，拒绝生成恢复清单。' }

  @(
    $Header
    $PrivateSchemaEntries
    $SchemaAclEntries
    $ScopedEntries
  ) | Set-Content -LiteralPath $OutputPath -Encoding UTF8
}
