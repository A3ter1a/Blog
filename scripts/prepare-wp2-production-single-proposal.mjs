import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageDir = resolve(
  workspace,
  ".local-backups/wp2-markdown-review/wp2-2026-07-12-8e6425fc",
);
const shadowProposalPath = resolve(packageDir, "shadow-single-proposal.json");
const outputPath = resolve(packageDir, "production-single-proposal.json");
const productionProjectRef = "kysywitrsjhcdlcrfayl";
const shadowProjectRef = "qyjfcebqjtphlpsvizxo";

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const shadowProposalText = readFileSync(shadowProposalPath, "utf8");
const shadowProposal = JSON.parse(shadowProposalText);

assert(shadowProposal.packageVersion === 1, "Shadow 单字段提案版本不受支持");
assert(shadowProposal.shadowProjectRef === shadowProjectRef, "Shadow 单字段提案项目 ref 漂移");
assert(
  shadowProposal.forbiddenProductionProjectRef === productionProjectRef,
  "Shadow 单字段提案的生产禁区 ref 漂移",
);
assert(shadowProposal.selectedCandidateIndex === 11, "生产候选不再是已证明的候选 11");
assert(
  shadowProposal.noteId === "e8265c20-04dd-4003-a378-b50bd995299f",
  "生产候选 noteId 漂移",
);
assert(
  shadowProposal.fieldPath === "problems.95.options.2.content",
  "生产候选 fieldPath 漂移",
);
assert(
  sha256(shadowProposal.beforeText) === shadowProposal.beforeChecksum,
  "Shadow 候选 before checksum 与文本不一致",
);
assert(
  sha256(shadowProposal.afterText) === shadowProposal.afterChecksum,
  "Shadow 候选 after checksum 与文本不一致",
);
assert(
  shadowProposal.beforeChecksum !== shadowProposal.afterChecksum,
  "Shadow 候选前后 checksum 不得相同",
);
assert(
  shadowProposal.validationDetail?.semanticTokenSequenceEqual === true
    && shadowProposal.validationDetail?.renderWarningsWorsened === false
    && shadowProposal.validationDetail?.reviewedRiskCount === 0,
  "Shadow 候选没有维持既定语义与渲染风险门",
);

const productionSelectionKey = sha256([
  productionProjectRef,
  shadowProposal.reviewId,
  shadowProposal.afterChecksum,
  "production-single-v1",
].join(":" )).slice(0, 12);
const applyBatchId = `wp2-production-single-${productionSelectionKey}`;
const rollbackBatchId = `wp2-production-single-rollback-${productionSelectionKey}`;

assert(applyBatchId !== shadowProposal.applyBatchId, "生产 apply batch 不得复用 Shadow batch");
assert(rollbackBatchId !== shadowProposal.rollbackBatchId, "生产 rollback batch 不得复用 Shadow batch");
assert(applyBatchId !== rollbackBatchId, "生产 apply/rollback batch 必须彼此独立");

const payload = {
  packageVersion: 1,
  status: "pending_production_preflight",
  productionProjectRef,
  forbiddenShadowProjectRef: shadowProjectRef,
  sourceShadowProposalSha256: sha256(shadowProposalText),
  reviewBatchId: shadowProposal.reviewBatchId,
  selectedCandidateIndex: shadowProposal.selectedCandidateIndex,
  reviewId: shadowProposal.reviewId,
  noteId: shadowProposal.noteId,
  fieldPath: shadowProposal.fieldPath,
  beforeText: shadowProposal.beforeText,
  afterText: shadowProposal.afterText,
  beforeChecksum: shadowProposal.beforeChecksum,
  afterChecksum: shadowProposal.afterChecksum,
  ruleVersion: shadowProposal.ruleVersion,
  aiInvolved: shadowProposal.aiInvolved,
  aiProvider: shadowProposal.aiProvider,
  aiModel: shadowProposal.aiModel,
  aiRequestId: shadowProposal.aiRequestId,
  validationStatus: "human_approved",
  validationDetail: {
    ...shadowProposal.validationDetail,
    shadowCommitVerified: true,
    shadowCommitReport: "fable info/evidence/wp2/13-shadow-single-commit-postflight-report.md",
    productionSnapshotFoundationVerified: true,
    production0015Report: "fable info/evidence/wp2/16-production-0015-execution-postflight-report.md",
    productionContentVersionSource: "production-readonly-preflight",
  },
  applyBatchId,
  rollbackBatchId,
  requiresFreshBackupPerRemoteStage: true,
  requiresPageAcceptanceBeforeRollbackDecision: true,
};

writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

const written = readJson(outputPath);
assert(written.applyBatchId === applyBatchId, "生产提案写后读取失败");
assert(written.rollbackBatchId === rollbackBatchId, "生产回退 batch 写后读取失败");

console.log(JSON.stringify({
  prepared: true,
  projectRef: productionProjectRef,
  selectedCandidateIndex: payload.selectedCandidateIndex,
  noteId: payload.noteId,
  fieldPath: payload.fieldPath,
  applyBatchId,
  rollbackBatchId,
  contentVersionFrozen: false,
  outputFile: relative(workspace, outputPath).replaceAll("\\", "/"),
}));
