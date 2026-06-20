#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

function readRequired(relativePath) {
  const fullPath = join(rootDir, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`缺少文件: ${relativePath}`);
  }
  return readFileSync(fullPath, "utf8");
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function fail(message, risk) {
  console.log(`FAIL ${message}`);
  if (risk) console.log(`     风险: ${risk}`);
  failed += 1;
}

function check(message, condition, risk) {
  if (condition) {
    pass(message);
  } else {
    fail(message, risk);
  }
}

let failed = 0;

const schemaSql = readRequired("supabase/migrations/0001_base_schema.sql");
const rlsSql = readRequired("supabase/migrations/0002_rls_policies.sql");
const legacySql = readRequired("supabase-init.sql");
const combinedSql = `${schemaSql}\n${rlsSql}\n${legacySql}`;

const requiredTables = [
  "notes",
  "chapters",
  "site_profile",
  "admin_users",
  "problem_practice_statuses",
  "math3_self_tests",
];

for (const table of requiredTables) {
  check(
    `${table} 表在基础迁移中有定义`,
    new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}\\b`, "i").test(schemaSql),
    `代码会访问 ${table}，缺少表定义会导致线上功能运行时失败。`,
  );

  check(
    `${table} 已启用 RLS`,
    new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i").test(rlsSql),
    `没有启用 RLS 时，策略不会成为数据库最后一道安全门。`,
  );
}

const requiredPolicyMarkers = [
  "notes_public_select",
  "notes_admin_insert",
  "notes_admin_update",
  "notes_admin_delete",
  "chapters_public_select",
  "chapters_admin_insert",
  "chapters_admin_update",
  "chapters_admin_delete",
  "site_profile_public_select",
  "site_profile_admin_insert",
  "admin_users_admin_select",
  "problem_practice_statuses_owner_select",
  "problem_practice_statuses_owner_insert",
  "problem_practice_statuses_owner_update",
  "problem_practice_statuses_owner_delete",
  "math3_self_tests_owner_select",
  "math3_self_tests_owner_insert",
  "math3_self_tests_owner_update",
  "math3_self_tests_owner_delete",
  "note_images_public_read",
  "note_images_admin_insert",
  "note_images_admin_update",
  "note_images_admin_delete",
];

for (const marker of requiredPolicyMarkers) {
  check(
    `策略 ${marker} 存在`,
    rlsSql.includes(marker),
    `策略缺失时，对应读写路径可能没有明确的数据库权限边界。`,
  );
}

check(
  "管理员判断函数位于 private schema",
  /create\s+or\s+replace\s+function\s+private\.current_user_is_admin\(\)/i.test(rlsSql),
  "管理员判断函数不应放在公开暴露的 public schema 中。",
);

check(
  "Storage bucket note-images 在基础迁移中创建或修正",
  /insert\s+into\s+storage\.buckets/i.test(schemaSql) && schemaSql.includes("'note-images'"),
  "缺少 bucket 定义会导致封面或编辑器图片上传失败。",
);

check(
  "Storage objects 已启用 RLS",
  /alter\s+table\s+storage\.objects\s+enable\s+row\s+level\s+security/i.test(rlsSql),
  "Storage 写入和删除也需要通过 RLS 限制管理员权限。",
);

const dangerousPatterns = [
  {
    pattern: /create\s+policy[\s\S]*?\bfor\s+all\b/i,
    message: "SQL 中不应出现 FOR ALL 策略",
    risk: "FOR ALL 容易把读、写、删混在一起，误放开生产数据。",
  },
  {
    pattern: /using\s*\(\s*true\s*\)/i,
    message: "SQL 中不应出现 USING (true)",
    risk: "这通常代表所有行直接放行，容易绕过预期权限边界。",
  },
  {
    pattern: /with\s+check\s*\(\s*true\s*\)/i,
    message: "SQL 中不应出现 WITH CHECK (true)",
    risk: "这通常代表插入或更新不受业务权限限制。",
  },
  {
    pattern: /create\s+policy\s+"允许所有操作"/i,
    message: "旧的“允许所有操作”策略已移除",
    risk: "这个旧策略会让访客拥有不该有的数据库写入能力。",
  },
];

for (const item of dangerousPatterns) {
  check(item.message, !item.pattern.test(combinedSql), item.risk);
}

if (failed > 0) {
  console.log("");
  console.log(`结果: ${failed} 个 RLS 资产检查未通过。`);
  process.exitCode = 1;
} else {
  console.log("");
  console.log("结果: RLS 迁移资产检查通过。注意：这不代表生产数据库已经执行了这些 SQL。");
}
