#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

let failed = 0;
function check(message, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} ${message}`);
  if (!condition) failed += 1;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function normalizeAudit(audit) {
  return Object.fromEntries(Object.entries(audit).filter(([key]) => key !== "capturedAt"));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function verifyAssets() {
  const packageJson = readJson(join(rootDir, "package.json"));
  const gitignore = readFileSync(join(rootDir, ".gitignore"), "utf8");
  const backupScript = readFileSync(join(rootDir, "scripts", "backup-wp1b.ps1"), "utf8");
  const restoreScript = readFileSync(join(rootDir, "scripts", "restore-wp1b-shadow.ps1"), "utf8");
  const backupRunner = readFileSync(join(rootDir, "scripts", "run-wp1b-production-backup.ps1"), "utf8");
  const proxyTunnel = readFileSync(join(rootDir, "scripts", "wp1b-pg-http-connect-tunnel.mjs"), "utf8");
  const restoreRunner = readFileSync(join(rootDir, "scripts", "run-wp1b-shadow-restore.ps1"), "utf8");
  const shadowAuthRepair = readFileSync(join(rootDir, "scripts", "repair-wp1b-shadow-auth-placeholder.ps1"), "utf8");
  const shadowAuthRepairParamBlock = shadowAuthRepair.slice(0, shadowAuthRepair.indexOf("$ErrorActionPreference"));
  const productionCredentialScript = readFileSync(join(rootDir, "scripts", "create-wp1b-production-db-credential.ps1"), "utf8");
  const restoreTocHelper = readFileSync(join(rootDir, "scripts", "wp1b-restore-toc.ps1"), "utf8");
  const installScript = readFileSync(join(rootDir, "scripts", "install-wp1b-postgres-tools.ps1"), "utf8");
  const auditSql = readFileSync(join(rootDir, "supabase", "wp1b-restore-audit.sql"), "utf8");
  const authManifestSql = readFileSync(join(rootDir, "supabase", "wp1b-auth-manifest.sql"), "utf8");
  const authPlaceholderSql = readFileSync(join(rootDir, "supabase", "wp1b-shadow-auth-placeholders.sql"), "utf8");
  const authCleanupSql = readFileSync(join(rootDir, "supabase", "wp1b-shadow-auth-cleanup.sql"), "utf8");
  const baseline = readJson(join(rootDir, "fable info", "evidence", "wp1-a", "03-production-baseline.json"));
  const storage = readJson(join(rootDir, "fable info", "evidence", "wp1-a", "04-storage-manifest.json"));
  const storageSize = storage.objects.reduce((sum, item) => sum + item.size, 0);
  const uniquePaths = new Set(storage.objects.map((item) => `${item.bucket}/${item.path}`));

  check("本地备份目录不会进入 Git", gitignore.includes("/.local-backups/"));
  check("临时 PostgreSQL 工具目录不会进入 Git", gitignore.includes("/.tools/postgresql/"));
  check("predeploy 已接入 WP1-B 资产检查", packageJson.scripts["verify:predeploy"].includes("verify:wp1b-assets"));
  check("生产备份需要显式敏感数据确认", backupScript.includes("AcknowledgeSensitiveBackup"));
  check("PostgreSQL 工具下载需要显式确认", installScript.includes("AllowDownload"));
  check("PostgreSQL 工具固定使用官方页面指向的 EDB 17.10 x64 archive", installScript.includes("https://www.postgresql.org/download/windows/") && installScript.includes("fileid=1260307") && installScript.includes("17.10"));
  check("PostgreSQL 工具安装不修改系统 PATH", !installScript.includes("[Environment]::SetEnvironmentVariable") && !installScript.includes("setx"));
  check("PostgreSQL archive 固定并核验可信 SHA-256", installScript.includes("ef9b1e5e23d2e8a83914ba13d9dc536a72210fba53fd1808ff1f7e06bb22b106") && installScript.includes("ArchiveHash -ne $ExpectedArchiveSha256"));
  check("生产凭据文件仅授权项目用户与当前执行账户", productionCredentialScript.includes("$RepositoryOwner") && productionCredentialScript.includes("icacls.exe") && productionCredentialScript.includes("/inheritance:r"));
  check("生产备份固定核验 project ref", backupScript.includes("ASTEROID_PRODUCTION_PROJECT_REF") && backupScript.includes("kysywitrsjhcdlcrfayl"));
  check("生产备份使用单一 custom-format dump", backupScript.includes("--format=custom") && backupScript.includes("full.dump"));
  check("生产备份只写入固定本地目录且拒绝目录复用", backupScript.includes("$ExpectedOutputRoot") && backupScript.includes("备份目录已存在，拒绝混入旧文件"));
  check("生产备份保留 public/private ACL 供 RLS 恢复验证", !backupScript.includes("--no-privileges") && !restoreScript.includes("--no-privileges"));
  check("恢复使用受控 TOC 并显式包含 private schema 与 schema ACL", backupScript.includes("New-Wp1bRestoreToc") && restoreScript.includes("--use-list") && restoreTocHelper.includes("SCHEMA\\s+-\\s+private") && restoreTocHelper.includes("ACL\\s+-\\s+SCHEMA"));
  check("影子派生 TOC 仅排除 3 条平台角色默认权限", restoreScript.includes("restore-public-private-shadow.toc") && restoreScript.includes("DEFAULT PRIVILEGES FOR (SEQUENCES|FUNCTIONS|TABLES)") && restoreScript.includes("supabase_admin") && restoreScript.includes("$ExcludedPlatformDefaultAcl.Count -ne 3"));
  check("影子表 ACL 先撤销平台默认授权再精确重放 13 条生产 ACL", restoreScript.includes("restore-public-table-acl-shadow.toc") && restoreScript.includes("$TableAclLines.Count -ne 13") && restoreScript.includes("revoke all privileges on table") && restoreScript.includes("from public, anon, authenticated, service_role") && restoreScript.includes("$ShadowTableAclTocPath"));
  check("生产备份目录仅授权项目用户与当前执行账户", backupScript.includes("$RepositoryOwner") && backupScript.includes("icacls.exe") && backupScript.includes("(OI)(CI)(F)"));
  check("生产数据库工具禁止交互式密码提示", backupScript.includes("--no-password"));
  check("生产备份执行前后指纹对比", backupScript.includes("production-audit-before.json") && backupScript.includes("production-audit-after.json"));
  check("notes 备份稳定指纹排除 WP1 content_version", auditSql.includes("to_jsonb(t) - 'content_version'"));
  check("生产读取步骤使用有界重试且本地恢复不扩大重试", backupScript.includes("[int]$MaxAttempts = 1") && backupScript.includes("$Attempt -le 4") && backupScript.includes(") -MaxAttempts 4"));
  check("生产备份 runner 从忽略文件读取密码且不拼入命令文本", backupRunner.includes("wp1-b-production-db-credential.json") && backupRunner.includes("$env:PGPASSWORD") && !backupRunner.includes("databasePassword="));
  check("生产备份 runner 固定并核验 pooler 目标", backupRunner.includes("$ExpectedPoolerHost = 'aws-1-ap-southeast-1.pooler.supabase.com'") && backupRunner.includes("$CredentialShapeMatches") && backupRunner.includes('"host=$ExpectedPoolerHost"'));
  check("生产备份 runner 动态选择已通过验密的官方 IPv4 节点", backupRunner.includes("[System.Net.Dns]::GetHostAddresses($ExpectedPoolerHost)") && backupRunner.includes('"hostaddr=$HostAddress"') && backupRunner.includes("foreach ($PoolerAddress in $PoolerAddresses)") && backupRunner.includes("$ProbeRound -le 4"));
  check("本地代理隧道只监听 loopback 且目标限于两个官方 Pooler", proxyTunnel.includes('LOCAL_HOST = "127.0.0.1"') && proxyTunnel.includes('PROXY_HOST = "127.0.0.1"') && proxyTunnel.includes('targetHost: "aws-1-ap-southeast-1.pooler.supabase.com"') && proxyTunnel.includes('targetHost: "aws-0-ap-southeast-1.pooler.supabase.com"') && proxyTunnel.includes('targetName = process.argv[2] ?? "production"') && backupRunner.includes("$LocalProxyTunnelPort"));
  check("生产备份 runner 请求数据库会话默认只读", backupRunner.includes("default_transaction_read_only=on") && backupRunner.includes("Remove-Item Env:PGOPTIONS"));
  check("生产备份 runner 先验密和核对目标身份", backupRunner.includes("current_database() = 'postgres'") && backupRunner.includes("current_user = 'postgres'"));
  check("影子恢复需要显式确认", restoreScript.includes("ConfirmShadowRestore"));
  check("影子恢复拒绝生产 project ref", restoreScript.includes("拒绝执行：影子目标指向生产项目"));
  check("影子恢复只允许既定 shadow ref", restoreScript.includes("$ExpectedShadowProjectRef = 'qyjfcebqjtphlpsvizxo'") && restoreScript.includes("ShadowDatabaseUrl.Contains($ExpectedShadowProjectRef)"));
  check("影子恢复只接受本地 WP1-B 备份目录", restoreScript.includes(".local-backups\\wp1-b") && restoreScript.includes("StartsWith($ExpectedBackupPrefix"));
  check("影子恢复要求空白 Auth 和 public schema", restoreScript.includes("影子项目已有 Auth 用户") && restoreScript.includes("影子项目已存在 public.notes"));
  check("影子恢复遇错立即停止、不自动 clean 且禁止密码提示", restoreScript.includes("--exit-on-error") && !restoreScript.includes("--clean") && restoreScript.includes("--no-password"));
  check("影子恢复 runner 固定影子 ref 并从本地凭据读取密码", restoreRunner.includes("qyjfcebqjtphlpsvizxo") && restoreRunner.includes("wp1-b-shadow-credential-v2.json") && restoreRunner.includes("$env:PGPASSWORD"));
  check("影子恢复 runner 的代理模式仅连接 loopback", restoreRunner.includes("$LocalProxyTunnelPort") && restoreRunner.includes("{ '127.0.0.1' }") && restoreRunner.includes("$ShadowPort"));
  check(
    "shadow Auth 修复器固定目标、显式确认且拒绝生产",
    shadowAuthRepair.includes("$ShadowProjectRef = 'qyjfcebqjtphlpsvizxo'")
      && shadowAuthRepair.includes("$ProductionProjectRef = 'kysywitrsjhcdlcrfayl'")
      && shadowAuthRepair.includes("ConfirmShadowAuthRepair")
      && shadowAuthRepair.includes("shadow ref 与生产 ref 相同"),
  );
  check(
    "shadow Auth 修复器仅从进程环境读取 publishable key",
    shadowAuthRepair.includes("ASTEROID_SHADOW_PUBLISHABLE_KEY")
      && !shadowAuthRepairParamBlock.includes("PublishableKey"),
  );
  check(
    "shadow Auth 修复器同时覆盖用户 token、identity 时间字段和失败恢复",
    ["confirmation_token", "recovery_token", "email_change", "email_change_token_new", "last_sign_in_at", "created_at", "updated_at"]
      .every((field) => shadowAuthRepair.includes(field))
      && shadowAuthRepair.includes("originalNullStateRestored")
      && shadowAuthRepair.includes("/auth/v1/token?grant_type=password"),
  );
  check("恢复指纹 SQL 只有 SELECT/WITH", /^\s*(?:--[^\n]*\n\s*)*with\b/i.test(auditSql) && !/\b(insert|update|delete|alter|create|drop|truncate|grant|revoke|copy|call|execute|do)\b/i.test(auditSql.replace(/--[^\n]*/g, "")));
  check("恢复指纹覆盖 schema、RLS、policy 与 ACL", auditSql.includes("'schemaIntegrity'") && auditSql.includes("pg_get_constraintdef") && auditSql.includes("pg_get_triggerdef") && auditSql.includes("pg_policies") && auditSql.includes("aclexplode"));
  check("Auth manifest 不读取密码或 token", /^\s*(?:--[^\n]*\n\s*)*select\b/i.test(authManifestSql) && !/encrypted_password|token|identit/i.test(authManifestSql.replace(/--[^\n]*/g, "")));
  check("影子 Auth 使用随机密码而非生产密码", authPlaceholderSql.includes("extensions.crypt(:'shadow_password'") && !authPlaceholderSql.includes("encrypted_password) select"));
  check(
    "影子 Auth 占位用户补齐 GoTrue 必需的非 NULL token 字段",
    ["confirmation_token", "recovery_token", "email_change", "email_change_token_new"]
      .every((column) => authPlaceholderSql.includes(column))
      && (authPlaceholderSql.match(/^\s*'',?\s*$/gm)?.length ?? 0) >= 4,
  );
  check(
    "影子 Auth identity 补齐 GoTrue 必需时间字段",
    /insert\s+into\s+auth\.identities\s*\([\s\S]*last_sign_in_at,\s*created_at,\s*updated_at[\s\S]*\)\s*values/i
      .test(authPlaceholderSql),
  );
  check("失败恢复仅在 public.notes 不存在时清理影子占位 Auth", restoreScript.includes("-not $RestoreCommitted") && restoreScript.includes("NotesAfterFailure.Trim() -eq 'f'") && authCleanupSql.includes("where id = :'user_id'::uuid"));
  check("Storage manifest 对象数为 49", storage.objectCount === 49 && storage.objects.length === 49);
  check("Storage manifest 路径唯一", uniquePaths.size === storage.objects.length);
  check("Storage manifest 总大小与对象求和一致", storage.totalSizeBytes === storageSize);
  check("Storage manifest 与 WP1-A 基线一致", storage.objectCount === baseline.storage["note-images"].objectCount && storageSize === baseline.storage["note-images"].totalSizeBytes);
}

function verifyBackup(directory, restoreAuditPath) {
  const backupDir = isAbsolute(directory) ? directory : resolve(process.cwd(), directory);
  const manifestPath = join(backupDir, "backup-manifest.json");
  const manifest = readJson(manifestPath);
  const manifestFiles = Array.isArray(manifest.files) ? manifest.files : [];
  const manifestNames = manifestFiles.map((file) => file?.name);
  const requiredFiles = [
    "app-data.sql",
    "app-schema.sql",
    "auth-user-manifest.json",
    "full.dump",
    "production-audit-after.json",
    "production-audit-before.json",
    "restore-public-private.toc",
    "storage-manifest.json",
    "wp1a-production-baseline.json",
  ];
  check("备份 manifest 版本可识别", manifest.manifestVersion === 1);
  check("备份来自正确生产 project ref", manifest.projectRef === "kysywitrsjhcdlcrfayl");
  check("备份过程记录为无写入漂移", manifest.productionStableDuringBackup === true);
  check("备份明确标记包含敏感数据", manifest.containsSensitiveData === true);
  check("备份时间戳有效", Number.isFinite(Date.parse(manifest.capturedAt)));
  check("备份 manifest 文件名唯一", new Set(manifestNames).size === manifestNames.length);
  check("备份 manifest 不含路径穿越", manifestNames.every((name) => typeof name === "string" && basename(name) === name && name !== "." && name !== ".."));
  for (const requiredFile of requiredFiles) {
    check(`备份 manifest 包含 ${requiredFile}`, manifestNames.includes(requiredFile));
  }

  const restoreToc = readFileSync(join(backupDir, "restore-public-private.toc"), "utf8");
  const restoreEntries = restoreToc.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith(";"));
  check("恢复 TOC 包含 private schema", restoreEntries.some((line) => /\sSCHEMA\s+-\s+private\s/.test(line)));
  check("恢复 TOC 包含 public/private schema ACL", restoreEntries.filter((line) => /\sACL\s+-\s+SCHEMA\s+(public|private)\s/.test(line)).length === 2);
  check("恢复 TOC 排除 auth/storage/extensions 对象", !restoreEntries.some((line) => /\s(auth|storage|extensions)\s/.test(line)));

  for (const file of manifestFiles) {
    const safeName = typeof file?.name === "string" && basename(file.name) === file.name && file.name !== "." && file.name !== "..";
    if (!safeName) continue;
    const path = join(backupDir, file.name);
    let sizeMatches = false;
    let hashMatches = false;
    try {
      sizeMatches = statSync(path).size === file.sizeBytes;
      hashMatches = sha256(path) === file.sha256;
    } catch {
      sizeMatches = false;
      hashMatches = false;
    }
    check(`${file.name} 文件大小匹配`, sizeMatches);
    check(`${file.name} SHA-256 匹配`, hashMatches);
  }

  const before = readJson(join(backupDir, "production-audit-before.json"));
  const after = readJson(join(backupDir, "production-audit-after.json"));
  check("生产审计版本一致且可识别", before.auditVersion === 2 && after.auditVersion === 2);
  check("生产审计覆盖 13 张 public 表", Object.keys(before.tables ?? {}).length === 13 && Object.keys(after.tables ?? {}).length === 13);
  check("备份前后生产表、checksum 与完整性一致", stableJson(normalizeAudit(before)) === stableJson(normalizeAudit(after)));

  if (restoreAuditPath) {
    const resolvedRestoreAuditPath = isAbsolute(restoreAuditPath) ? restoreAuditPath : resolve(process.cwd(), restoreAuditPath);
    check("影子恢复审计位于同一备份目录", dirname(resolvedRestoreAuditPath) === backupDir);
    const restore = readJson(resolvedRestoreAuditPath);
    check("影子恢复审计版本可识别", restore.auditVersion === 2);
    check("影子恢复表行数与 checksum 一致", stableJson(after.tables) === stableJson(restore.tables));
    check("影子恢复 schema、RLS、policy 与 ACL 一致", stableJson(after.schemaIntegrity) === stableJson(restore.schemaIntegrity));
    check("影子恢复内容完整性一致", stableJson(after.contentIntegrity) === stableJson(restore.contentIntegrity));
    check("影子 Auth 用户数量与管理员匹配数一致", after.auth.userCount === restore.auth.userCount && after.auth.adminMatchedUsers === restore.auth.adminMatchedUsers);
  }
}

if (args.includes("--assets")) {
  verifyAssets();
} else {
  const directory = valueAfter("--dir");
  if (!directory) {
    console.error("用法: node scripts/verify-wp1b-backup.mjs --assets | --dir <backup-dir> [--restore-audit <json>]");
    process.exit(2);
  }
  verifyBackup(directory, valueAfter("--restore-audit"));
}

if (failed > 0) {
  console.log(`\n结果: ${failed} 个 WP1-B 检查未通过。`);
  process.exitCode = 1;
} else {
  console.log("\n结果: WP1-B 检查通过。");
}
