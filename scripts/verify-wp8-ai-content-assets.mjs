import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve("supabase/migrations/0023_ai_content_accounts_and_collections.sql");
const rehearsalPath = resolve("scripts/test-wp8-local-ai-content.ps1");
const typegenPath = resolve("scripts/generate-wp8-local-types.ps1");
const docsPath = resolve("docs/ai-content-workflow.md");
const typesPath = resolve("lib/database.types.ts");

for (const path of [migrationPath, rehearsalPath, typegenPath, docsPath, typesPath]) {
  if (!existsSync(path)) throw new Error(`缺少阶段 2 资产：${path}`);
}

const migration = readFileSync(migrationPath, "utf8");
const rehearsal = readFileSync(rehearsalPath, "utf8");
const typegen = readFileSync(typegenPath, "utf8");
const docs = readFileSync(docsPath, "utf8");
const types = readFileSync(typesPath, "utf8");
const normalized = migration.toLowerCase();

const requiredTables = [
  "public.ai_profiles",
  "public.ai_content_proposals",
  "public.note_collections",
  "public.note_collection_items",
];
for (const table of requiredTables) {
  const tablePattern = table.replaceAll(".", "\\.");
  if (!new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+${tablePattern}`, "i").test(migration)) {
    throw new Error(`缺少表定义：${table}`);
  }
  if (!new RegExp(`alter\\s+table\\s+${tablePattern}\\s+force\\s+row\\s+level\\s+security`, "i").test(migration)) {
    throw new Error(`缺少 FORCE RLS：${table}`);
  }
}

for (const marker of [
  "alter table public.notes\n  add column if not exists author_kind",
  "alter table public.notes\n  add column if not exists author_profile_id",
  "alter table public.notes\n  add column if not exists owner_user_id",
  "alter table public.notes enable row level security",
  "create or replace function private.current_user_is_ai()",
  "create or replace function private.current_ai_profile_id()",
  "create trigger enforce_ai_admin_separation_on_ai_profiles",
  "create trigger enforce_ai_admin_separation_on_admin_users",
  "create policy notes_ai_insert",
  "create policy notes_ai_update",
  "create policy ai_content_proposals_owner_insert",
  "create policy ai_content_proposals_owner_update",
  "create policy note_collections_owner_insert",
  "create policy note_collection_items_owner_insert",
  "grant select on public.ai_profiles to anon, authenticated",
]) {
  if (!normalized.includes(marker.toLowerCase())) throw new Error(`迁移缺少关键权限标记：${marker}`);
}

for (const marker of [
  "ai_content_proposals:",
  "ai_profiles:",
  "note_collections:",
  "note_collection_items:",
  "author_kind:",
  "author_profile_id:",
  "owner_user_id:",
]) {
  if (!types.includes(marker)) throw new Error(`database.types.ts 缺少阶段 2 类型：${marker}`);
}
for (const marker of [
  "postgres-meta",
  "deterministicTypeGeneration",
  "externalConnections = 0",
  "schema-only dump",
]) {
  if (!typegen.includes(marker)) throw new Error(`本地类型生成脚本缺少安全标记：${marker}`);
}

if (!/is_published\s*=\s*false[\s\S]{0,500}private\.current_user_is_ai\(\)/i.test(migration)) {
  throw new Error("AI notes 写入策略未限制为私有草稿。");
}
if (!/review_status\s*=\s*'draft'[\s\S]{0,260}private\.current_user_is_ai\(\)/i.test(migration)) {
  throw new Error("AI proposal 写入策略未限制为 draft。");
}
if (/insert\s+into\s+auth\.users/i.test(migration) || /insert\s+into\s+public\.ai_profiles/i.test(migration)) {
  throw new Error("迁移不应自动创建 Auth 用户或四个 AI profile。");
}
if (!/security\s+definer[\s\S]{0,120}set\s+search_path\s*=\s*public,\s*pg_temp/i.test(migration)) {
  throw new Error("阶段 2 SECURITY DEFINER 函数缺少固定 search_path。");
}
if (/grant\s+(?:all|insert|update|delete)[^;]*public\.ai_profiles\s+to\s+anon/i.test(migration)) {
  throw new Error("匿名角色不应获得 AI profile 写权限。");
}

for (const marker of [
  "Invoke-AuthenticatedSql",
  "AI 直接批准 proposal",
  "AI 修改人工文章",
  "AI 隔离其他学科私有 note",
  "AI 把其他学科 note 加入合集",
  "externalConnections = 0",
]) {
  if (!rehearsal.includes(marker)) throw new Error(`本地 RLS 演练缺少断言：${marker}`);
}

for (const marker of [
  "ai_profiles",
  "ai_content_proposals",
  "note_collections",
  "note_collection_items",
  "不创建真实 Auth 用户",
  "不写入生产数据库",
  "逐篇追加、排序、移除和重命名",
]) {
  if (!docs.includes(marker)) throw new Error(`阶段 2 文档缺少说明：${marker}`);
}

console.log(JSON.stringify({
  status: "passed",
  migration: "0023_ai_content_accounts_and_collections.sql",
  tables: requiredTables,
  rehearsal: "scripts/test-wp8-local-ai-content.ps1",
  productionWrites: false,
  authProvisioningInMigration: false,
}, null, 2));
