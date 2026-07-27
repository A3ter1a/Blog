import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readFlag(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`缺少 ${name}`);
  return resolve(process.argv[index + 1]);
}

const baseline = JSON.parse(readFileSync(readFlag("--baseline"), "utf8"));
const audit = JSON.parse(readFileSync(readFlag("--audit"), "utf8"));
const authManifestPayload = JSON.parse(readFileSync(readFlag("--auth-manifest"), "utf8"));
const expectedAuthUsers = (Array.isArray(authManifestPayload) ? authManifestPayload : [authManifestPayload])
  .map(({ id, email }) => ({ id, email }))
  .sort((left, right) => left.id.localeCompare(right.id));
const actualAuthUsers = [...(audit.auth.stableUsers ?? [])]
  .sort((left, right) => left.id.localeCompare(right.id));

assert.deepEqual(audit.originalTables, baseline.tables, "原 13 表行数或内容 checksum 发生变化");
assert.deepEqual(audit.contentIntegrity, baseline.contentIntegrity, "原内容完整性指标发生变化");
assert.deepEqual(actualAuthUsers, expectedAuthUsers, "Auth 用户 ID 或邮箱发生变化");
assert.equal(audit.auth.userCount, expectedAuthUsers.length, "Auth 用户数量发生变化");
assert.equal(audit.auth.adminMatchedUsers, baseline.auth.adminMatchedUsers, "Auth/admin 匹配关系发生变化");
assert.equal(audit.auth.emptyTokenUsers, expectedAuthUsers.length, "Auth 占位用户 token 兼容字段未全部补齐");
assert.equal(audit.auth.emailIdentityCount, expectedAuthUsers.length, "email identity 数量异常");
assert.equal(audit.auth.validEmailIdentityTimeCount, expectedAuthUsers.length, "email identity 时间字段未全部补齐");
assert.equal(audit.auth.unlinkedEmailIdentityCount, 0, "存在未关联 Auth 用户的 email identity");
assert.equal(audit.auth.duplicateEmailIdentityUserCount, 0, "存在重复 email identity");
assert.match(audit.auth.checksum ?? "", /^[a-f0-9]{32}$/, "Auth 活动指纹格式异常");
assert.deepEqual(audit.storage, baseline.storage, "shadow Storage 元数据指纹发生变化");

assert.equal(Object.keys(audit.newTableRows).length, 8, "新基础表数量不是 8");
assert.equal(Object.values(audit.newTableRows).every((count) => count === 0), true, "事务验证后仍残留测试行");
assert.equal(audit.newSchema.forcedRlsTableCount, 8, "8 张新表未全部 FORCE RLS");
assert.equal(audit.newSchema.policyCount, 21, "新表 policy 数量异常");
assert.deepEqual(audit.newSchema.missingPolicies, [], "缺少预期 policy");
assert.deepEqual(audit.newSchema.missingTriggers, [], "缺少预期 trigger");
assert.deepEqual(audit.newSchema.missingFunctions, [], "缺少预期 private function");
assert.equal(audit.newSchema.anonOrPublicGrantCount, 0, "新私人表存在 anon/PUBLIC grant");
assert.equal(audit.newSchema.authenticatedGrantCount, 21, "authenticated grant 数量异常");
assert.equal(audit.newSchema.clientImmutableWriteGrantCount, 0, "不可变表向客户端角色开放了 UPDATE/DELETE grant");
assert.equal(audit.newSchema.privateFunctionPublicExecuteCount, 0, "private trigger function 仍允许 PUBLIC execute");
assert.match(audit.newSchema.noteDefault ?? "", /false/i, "notes.is_published 默认值不是 false");
assert.equal(audit.newSchema.notesAtVersionOne, baseline.tables.notes.rowCount, "存量 note 未全部初始化为 version 1");
assert.equal(audit.newSchema.notesOutsideVersionOne, 0, "存在异常 content_version");

console.log(JSON.stringify({
  status: "passed",
  originalTablesMatched: Object.keys(audit.originalTables).length,
  newTablesVerified: Object.keys(audit.newTableRows).length,
  authVerified: {
    userCount: audit.auth.userCount,
    adminMatchedUsers: audit.auth.adminMatchedUsers,
    emptyTokenUsers: audit.auth.emptyTokenUsers,
    validEmailIdentityTimeCount: audit.auth.validEmailIdentityTimeCount,
  },
  newSchema: audit.newSchema,
}, null, 2));
