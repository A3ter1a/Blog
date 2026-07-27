import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeMarkdownRisks } from "../lib/content-contract.ts";
import { renderMarkdownToHtml } from "../lib/markdown.ts";

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageDir = resolve(
  workspace,
  ".local-backups/wp2-markdown-review/wp2-2026-07-12-8e6425fc",
);
const exactPath = resolve(packageDir, "ai-proposals-exact.json");
const verificationPath = resolve(packageDir, "ai-proposals-exact-verification.json");
const manifestPath = resolve(packageDir, "remaining-safe-shadow-batch-v1/manifest.json");
const closedReviewId = "review-70c08975b21e";

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertInside(parent, child, label) {
  const path = relative(parent, child);
  assert.notEqual(path, "", `${label} 不得等于父目录`);
  assert.notEqual(path, "..", `${label} 越界`);
  assert.equal(path.startsWith(`..${sep}`), false, `${label} 越界`);
  assert.equal(isAbsolute(path), false, `${label} 越界`);
}

function captureRender(markdown) {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  try {
    const html = renderMarkdownToHtml(markdown);
    return { html, warnings };
  } finally {
    console.warn = originalWarn;
  }
}

const exactText = readFileSync(exactPath, "utf8");
const verificationText = readFileSync(verificationPath, "utf8");
const exactPackage = JSON.parse(exactText);
const verification = JSON.parse(verificationText);
const { generatedAt: verificationGeneratedAt, ...stableVerification } = verification;
const manifest = readJson(manifestPath);
const exactByReviewId = new Map(exactPackage.items.map((item) => [item.reviewId, item]));
const diagnosticByReviewId = new Map(
  verification.diagnostics.map((diagnostic) => [diagnostic.reviewId, diagnostic]),
);
const expectedReviewIds = exactPackage.items
  .filter((item) => (
    diagnosticByReviewId.get(item.reviewId)?.deterministicClassification === "safe_candidate"
    && item.reviewId !== closedReviewId
  ))
  .map((item) => item.reviewId);

assert.equal(manifest.packageVersion, 1, "remaining batch 版本漂移");
assert.equal(manifest.status, "pending_shadow_authorization", "remaining batch 状态必须停在 Shadow 授权前");
assert.equal(manifest.shadowProjectRef, "qyjfcebqjtphlpsvizxo", "remaining batch Shadow ref 漂移");
assert.equal(manifest.forbiddenProductionProjectRef, "kysywitrsjhcdlcrfayl", "remaining batch 生产禁区漂移");
assert.equal(manifest.sourceExactPackageSha256, sha256(exactText), "exact package SHA-256 漂移");
assert.equal(typeof manifest.sourceVerificationGeneratedAt, "string", "verification 生成时间证据缺失");
assert.equal(typeof verificationGeneratedAt, "string", "当前 verification 生成时间缺失");
assert.equal(
  manifest.sourceVerificationCanonicalSha256,
  sha256(JSON.stringify(stableVerification)),
  "verification 稳定字段 SHA-256 漂移",
);
assert.deepEqual(manifest.closedReviewIds, [closedReviewId], "已闭环候选集合漂移");
assert.equal(manifest.itemCount, 6, "remaining batch 必须正好包含 6 条");
assert.deepEqual(manifest.items.map((item) => item.reviewId), expectedReviewIds, "remaining batch 候选集合或顺序漂移");
assert.equal(manifest.executionPolicy.concurrency, 1, "WP2 迁移批次禁止无序并发");
assert.equal(manifest.executionPolicy.freshPreflightPerItem, true, "每条候选必须单独 preflight");
assert.equal(manifest.executionPolicy.reverseRollbackRequiredForSharedNote, true, "共享 note 必须逆序 rollback");
assert.equal(manifest.executionPolicy.productionWriteAuthorized, false, "本地批次不得暗示生产写入已授权");
assert.deepEqual(manifest.executionPolicy.applyOrder, expectedReviewIds, "批次 apply 顺序漂移");
assert.deepEqual(manifest.executionPolicy.rollbackOrder, expectedReviewIds.toReversed(), "批次 rollback 必须严格逆序");

const seenProposalHashes = new Set();
const seenApplyBatchIds = new Set();
const seenRollbackBatchIds = new Set();
for (const [index, manifestItem] of manifest.items.entries()) {
  const exactItem = exactByReviewId.get(manifestItem.reviewId);
  const diagnostic = diagnosticByReviewId.get(manifestItem.reviewId);
  assert.ok(exactItem, `${manifestItem.reviewId} 缺少 exact proposal`);
  assert.equal(diagnostic?.deterministicClassification, "safe_candidate", `${manifestItem.reviewId} 不再是 safe candidate`);
  assert.equal(diagnostic?.structuralPass, true, `${manifestItem.reviewId} 结构验证失败`);
  assert.equal(diagnostic?.semanticTokensEqual, true, `${manifestItem.reviewId} 语义 token 验证失败`);
  assert.equal(diagnostic?.renderWarningsWorsened, false, `${manifestItem.reviewId} 渲染告警恶化`);
  assert.deepEqual(diagnostic?.reviewedRiskCodes, [], `${manifestItem.reviewId} 含 reviewed risk`);

  const proposalPath = resolve(workspace, manifestItem.proposalPath);
  assertInside(packageDir, proposalPath, `${manifestItem.reviewId}.proposalPath`);
  const proposalText = readFileSync(proposalPath, "utf8");
  const proposal = JSON.parse(proposalText);

  assert.equal(manifestItem.executionOrder, index + 1, `${manifestItem.reviewId} executionOrder 漂移`);
  assert.equal(manifestItem.proposalSha256, sha256(proposalText), `${manifestItem.reviewId} proposal SHA-256 漂移`);
  assert.equal(seenProposalHashes.has(manifestItem.proposalSha256), false, `${manifestItem.reviewId} proposal hash 重复`);
  seenProposalHashes.add(manifestItem.proposalSha256);

  for (const field of ["reviewId", "noteId", "fieldPath", "beforeChecksum", "afterChecksum"]) {
    assert.equal(proposal[field], exactItem[field === "beforeChecksum" ? "sourceChecksum" : field === "afterChecksum" ? "reviewedChecksum" : field], `${manifestItem.reviewId}.${field} 漂移`);
  }
  assert.equal(proposal.selectedCandidateIndex, exactPackage.items.indexOf(exactItem) + 1, `${manifestItem.reviewId} candidate index 漂移`);
  assert.equal(proposal.beforeText, exactItem.sourceText, `${manifestItem.reviewId} beforeText 漂移`);
  assert.equal(proposal.afterText, exactItem.reviewedMarkdown, `${manifestItem.reviewId} afterText 漂移`);
  assert.equal(sha256(proposal.beforeText), proposal.beforeChecksum, `${manifestItem.reviewId} before checksum 失配`);
  assert.equal(sha256(proposal.afterText), proposal.afterChecksum, `${manifestItem.reviewId} after checksum 失配`);
  assert.notEqual(proposal.beforeChecksum, proposal.afterChecksum, `${manifestItem.reviewId} 不得生成 no-op proposal`);
  assert.equal(proposal.status, "pending_user_approval", `${manifestItem.reviewId} 状态越过 Shadow 授权门`);
  assert.equal(proposal.validationStatus, "pending_user_approval", `${manifestItem.reviewId} validation 状态越过授权门`);
  assert.equal(proposal.shadowProjectRef, manifest.shadowProjectRef, `${manifestItem.reviewId} Shadow ref 漂移`);
  assert.equal(proposal.forbiddenProductionProjectRef, manifest.forbiddenProductionProjectRef, `${manifestItem.reviewId} 生产禁区漂移`);
  assert.equal(proposal.aiInvolved, true, `${manifestItem.reviewId} AI 标记缺失`);
  assert.equal(proposal.aiProvider, "deepseek", `${manifestItem.reviewId} provider 漂移`);
  assert.equal(proposal.aiModel, "deepseek-v4-pro", `${manifestItem.reviewId} model 漂移`);
  assert.equal(proposal.validationDetail.remainingSafeBatchVersion, 1, `${manifestItem.reviewId} 批次版本缺失`);
  assert.equal(proposal.validationDetail.executionOrder, index + 1, `${manifestItem.reviewId} proposal 顺序漂移`);
  assert.match(proposal.applyBatchId, /^wp2-shadow-single-[0-9a-f]{12}$/, `${manifestItem.reviewId} apply batch ID 无效`);
  assert.match(proposal.rollbackBatchId, /^wp2-shadow-single-rollback-[0-9a-f]{12}$/, `${manifestItem.reviewId} rollback batch ID 无效`);
  assert.equal(seenApplyBatchIds.has(proposal.applyBatchId), false, `${manifestItem.reviewId} apply batch ID 重复`);
  assert.equal(seenRollbackBatchIds.has(proposal.rollbackBatchId), false, `${manifestItem.reviewId} rollback batch ID 重复`);
  seenApplyBatchIds.add(proposal.applyBatchId);
  seenRollbackBatchIds.add(proposal.rollbackBatchId);

  const render = captureRender(proposal.afterText);
  assert.ok(render.html.length > 0, `${manifestItem.reviewId} 渲染结果为空`);
  assert.deepEqual(render.warnings, [], `${manifestItem.reviewId} 本地渲染产生告警`);
  assert.deepEqual(analyzeMarkdownRisks(proposal.afterText, proposal.afterText), [], `${manifestItem.reviewId} 本地风险检测未清零`);
}

const expectedNoteGroups = Array.from(Map.groupBy(manifest.items, (item) => item.noteId))
  .map(([noteId, items]) => ({
    noteId,
    applyOrder: items.map((item) => item.reviewId),
    rollbackOrder: items.toReversed().map((item) => item.reviewId),
  }));
assert.deepEqual(manifest.noteGroups, expectedNoteGroups, "共享 note 的正序 apply/逆序 rollback 约束漂移");

console.log(JSON.stringify({
  verified: true,
  itemCount: manifest.itemCount,
  noteCount: manifest.noteGroups.length,
  renderWarningCount: 0,
  reviewedRiskCount: 0,
  productionWriteAuthorized: false,
}));
