import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve("supabase/migrations/0015_content_migration_snapshots.sql"), "utf8");
const reviewGenerator = readFileSync(resolve("scripts/generate-wp2-markdown-review.mjs"), "utf8");
const shadowRunner = readFileSync(resolve("scripts/run-wp2-shadow-stage.ps1"), "utf8");
const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));

assert.match(migration, /^begin;/m, "0015 必须以事务开始");
assert.match(migration, /^commit;/m, "0015 必须提交事务");
assert.doesNotMatch(migration, /kysywitrsjhcdlcrfayl|qyjfcebqjtphlpsvizxo/i, "迁移不得绑定生产或 shadow ref");
assert.doesNotMatch(migration, /^\s*(drop\s+table|truncate\s|delete\s+from)\b/im, "0015 不得删除既有表或数据");

assert.match(migration, /create table public\.content_migration_snapshots/i);
for (const field of [
  "note_id", "batch_id", "field_path", "operation_kind", "reverts_snapshot_id",
  "rule_version", "before_text", "after_text", "before_checksum", "after_checksum",
  "note_content_version_before", "note_content_version_after", "ai_involved",
  "ai_provider", "ai_model", "ai_request_id", "validation_status", "validation_detail",
  "created_by", "created_at",
]) {
  assert.match(migration, new RegExp(`\\b${field}\\b`), `快照表缺少字段：${field}`);
}

assert.match(migration, /before_checksum ~ '\^\[0-9a-f\]\{64\}\$'/i, "before checksum 必须为小写 SHA-256");
assert.match(migration, /after_checksum ~ '\^\[0-9a-f\]\{64\}\$'/i, "after checksum 必须为小写 SHA-256");
assert.match(migration, /before_checksum <> after_checksum/i, "不得记录无变化快照");
assert.match(migration, /note_content_version_after = note_content_version_before \+ 1/i, "每个快照必须对应一次 content_version 递增");
assert.match(migration, /content_migration_snapshots_single_revert_key/i, "每个迁移快照最多回退一次");
assert.match(migration, /content_migration_snapshots_batch_field_key unique/i, "batch/note/field 必须幂等唯一");

assert.match(migration, /create or replace function private\.content_sha256\(p_text text\)/i);
assert.match(migration, /extension_row\.extname = 'pgcrypto'/i, "SHA-256 helper 必须解析真实 pgcrypto schema");
assert.match(migration, /security definer[\s\S]*set search_path = ''/i, "SHA-256 helper 必须固定 search_path");
assert.match(migration, /create or replace function private\.read_note_markdown_field/i);
for (const pathMarker of ["question|answer|explanation|tips", "options\\\\.\\(\\[0-9\\]\\+\\)\\\\.content"]) {
  assert.match(migration, new RegExp(pathMarker), `字段解析器缺少路径：${pathMarker}`);
}

const applyBody = migration.match(/create or replace function public\.apply_content_migration[\s\S]*?as \$\$([\s\S]*?)\$\$;/i)?.[1] ?? "";
assert.match(applyBody, /auth\.uid\(\)/i);
assert.match(applyBody, /private\.current_user_is_admin\(\)/i);
assert.match(applyBody, /from public\.notes note[\s\S]*for update/i, "apply 必须锁定 note");
assert.match(applyBody, /locked_version <> p_expected_note_version/i, "apply 必须执行乐观版本门");
assert.match(applyBody, /private\.content_sha256\(current_text\)/i, "apply 必须验证当前源 checksum");
assert.match(applyBody, /private\.content_sha256\(p_after_text\)/i, "apply 必须验证 after checksum");
assert.match(applyBody, /p_ai_involved[\s\S]*p_validation_status <> 'human_approved'/i, "AI 修复必须经过人工确认状态");
assert.match(applyBody, /set content = p_after_text/i);
assert.match(applyBody, /jsonb_set\([\s\S]*false/i, "JSONB 路径更新不得创建不存在的字段");
assert.match(applyBody, /insert into public\.content_migration_snapshots/i, "apply 必须在同一事务追加快照");

const rollbackBody = migration.match(/create or replace function public\.rollback_content_migration[\s\S]*?as \$\$([\s\S]*?)\$\$;/i)?.[1] ?? "";
assert.match(rollbackBody, /auth\.uid\(\)/i);
assert.match(rollbackBody, /private\.current_user_is_admin\(\)/i);
assert.match(rollbackBody, /snapshot\.reverts_snapshot_id = original_snapshot\.id/i, "rollback 必须具备幂等/单次回退门");
assert.match(rollbackBody, /rollback_snapshot\.note_content_version_before <> p_expected_note_version/i, "rollback 幂等重试必须拒绝版本漂移");
assert.match(rollbackBody, /rollback_snapshot\.validation_detail <>[\s\S]*normalized_validation_detail[\s\S]*revertsSnapshotId/i, "rollback 幂等重试必须拒绝验证说明漂移");
assert.match(rollbackBody, /private\.content_sha256\(current_text\) <> original_snapshot\.after_checksum/i, "rollback 必须拒绝已变化正文");
assert.match(rollbackBody, /set content = original_snapshot\.before_text/i);
assert.match(rollbackBody, /'rollback_verified'/i);
assert.match(rollbackBody, /insert into public\.content_migration_snapshots/i, "rollback 必须追加新事件而非改旧行");
assert.doesNotMatch(rollbackBody, /update\s+public\.content_migration_snapshots/i, "rollback 不得修改历史快照");

assert.match(migration, /reject_content_migration_snapshot_mutation/i);
assert.match(migration, /alter table public\.content_migration_snapshots force row level security/i);
assert.match(migration, /content_migration_snapshots_admin_select/i);
assert.match(migration, /revoke all on public\.content_migration_snapshots from anon, authenticated/i);
assert.match(migration, /grant select on public\.content_migration_snapshots to authenticated/i);
assert.doesNotMatch(migration, /grant\s+(?:insert|update|delete)[^;]*content_migration_snapshots/i, "客户端只能读取审计快照");
assert.doesNotMatch(migration, /grant execute[^;]*to\s+(?:public|anon)/i, "PUBLIC/anon 不得执行迁移 RPC");

assert.match(packageJson.scripts["verify:predeploy"] ?? "", /verify:wp2-snapshot-assets/, "predeploy 必须接入 WP2 快照检查");
assert.match(packageJson.scripts["review:markdown-migration"] ?? "", /generate-wp2-markdown-review/, "必须提供本地高风险复核生成器");
assert.match(reviewGenerator, /recommendedModel: "deepseek-v4-pro"/, "高风险请求包必须固定推荐模型");
assert.match(reviewGenerator, /Content-Security-Policy/, "离线复核页必须设置 CSP");
assert.match(reviewGenerator, /highRiskItemsPreserved: true/, "复核生成器必须拒绝已被自动改写的高风险项");
assert.match(shadowRunner, /qyjfcebqjtphlpsvizxo/i, "Shadow 执行器必须固定 shadow ref");
assert.match(shadowRunner, /kysywitrsjhcdlcrfayl/i, "Shadow 执行器必须拒绝生产 ref");
assert.match(shadowRunner, /WRITE \$ShadowProjectRef 0015/i, "Shadow DDL 必须使用精确确认短语");
assert.match(shadowRunner, /SnapshotTableAbsent/i, "Shadow preflight 必须确认 0015 对象不存在");
assert.match(shadowRunner, /NotesStable/i, "Shadow 后验必须确认 notes 稳定");

console.log("WP2 immutable content migration snapshot assets verified");
