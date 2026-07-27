import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageDir = resolve(
  workspace,
  ".local-backups/wp2-markdown-review/wp2-2026-07-12-8e6425fc",
);
const shadowBatchDir = resolve(packageDir, "remaining-safe-shadow-batch-v1");
const shadowManifestPath = resolve(shadowBatchDir, "manifest.json");
const shadowEvidencePath = resolve(shadowBatchDir, "shadow-completion-evidence.json");
const outputDir = resolve(packageDir, "remaining-safe-production-batch-v1");
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

const shadowManifestText = readFileSync(shadowManifestPath, "utf8");
const shadowManifest = JSON.parse(shadowManifestText);
const shadowEvidenceText = readFileSync(shadowEvidencePath, "utf8");
const shadowEvidence = JSON.parse(shadowEvidenceText);

assert(shadowManifest.packageVersion === 1, "Shadow 批次版本不受支持");
assert(shadowManifest.itemCount === 6, "Shadow 批次不再是 6 条");
assert(shadowManifest.shadowProjectRef === shadowProjectRef, "Shadow project ref 漂移");
assert(
  shadowManifest.forbiddenProductionProjectRef === productionProjectRef,
  "Shadow 批次生产禁区漂移",
);
assert(shadowEvidence.projectRef === shadowProjectRef, "Shadow 完成证据项目漂移");
assert(shadowEvidence.candidateCount === 6, "Shadow 完成证据候选数漂移");
assert(shadowEvidence.preflight?.allPassed === true, "Shadow preflight 未完成");
assert(
  shadowEvidence.transactionPreview?.allPassed === true
    && shadowEvidence.transactionPreview?.persistedAuditRows === 0,
  "Shadow 事务预演证据不完整",
);
assert(
  shadowEvidence.committedApplyRollbackProof?.allPassed === true
    && shadowEvidence.committedApplyRollbackProof?.allFieldsRestored === true
    && shadowEvidence.committedApplyRollbackProof?.persistedAuditRows === 12
    && shadowEvidence.committedApplyRollbackProof?.productionConnected === false,
  "Shadow apply/rollback 提交证据不完整",
);
assert(
  shadowEvidence.postflight?.allPassed === true
    && shadowEvidence.postflight?.verifiedAuditRows === 12,
  "Shadow postflight 证据不完整",
);
assert(
  shadowEvidence.decision?.recommendation === "apply_to_production",
  "Shadow 完成证据没有形成生产应用建议",
);

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const manifestItems = [];
const seenApplyBatchIds = new Set();
const seenRollbackBatchIds = new Set();

for (const item of shadowManifest.items) {
  const shadowProposalPath = resolve(workspace, item.proposalPath);
  const shadowProposalText = readFileSync(shadowProposalPath, "utf8");
  const shadowProposal = JSON.parse(shadowProposalText);

  assert(sha256(shadowProposalText) === item.proposalSha256, `${item.reviewId} Shadow 提案哈希漂移`);
  assert(shadowProposal.reviewId === item.reviewId, `${item.reviewId} reviewId 漂移`);
  assert(shadowProposal.noteId === item.noteId, `${item.reviewId} noteId 漂移`);
  assert(shadowProposal.fieldPath === item.fieldPath, `${item.reviewId} fieldPath 漂移`);
  assert(shadowProposal.beforeChecksum === item.beforeChecksum, `${item.reviewId} before checksum 漂移`);
  assert(shadowProposal.afterChecksum === item.afterChecksum, `${item.reviewId} after checksum 漂移`);
  assert(sha256(shadowProposal.beforeText) === item.beforeChecksum, `${item.reviewId} before 文本漂移`);
  assert(sha256(shadowProposal.afterText) === item.afterChecksum, `${item.reviewId} after 文本漂移`);
  assert(
    shadowProposal.validationDetail?.semanticTokenSequenceEqual === true
      && shadowProposal.validationDetail?.renderWarningsWorsened === false
      && shadowProposal.validationDetail?.reviewedRiskCount === 0,
    `${item.reviewId} 语义或渲染风险门漂移`,
  );

  const selectionKey = sha256([
    productionProjectRef,
    item.reviewId,
    item.afterChecksum,
    "production-remaining-safe-v1",
  ].join(":")).slice(0, 12);
  const applyBatchId = `wp2-production-single-${selectionKey}`;
  const rollbackBatchId = `wp2-production-single-rollback-${selectionKey}`;
  assert(!seenApplyBatchIds.has(applyBatchId), `${item.reviewId} apply batch ID 重复`);
  assert(!seenRollbackBatchIds.has(rollbackBatchId), `${item.reviewId} rollback batch ID 重复`);
  seenApplyBatchIds.add(applyBatchId);
  seenRollbackBatchIds.add(rollbackBatchId);

  const proposal = {
    packageVersion: 1,
    status: "pending_production_preflight",
    productionProjectRef,
    forbiddenShadowProjectRef: shadowProjectRef,
    sourceShadowProposalSha256: item.proposalSha256,
    sourceShadowCompletionEvidenceSha256: sha256(shadowEvidenceText),
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
      shadowCompletionEvidence:
        ".local-backups/wp2-markdown-review/wp2-2026-07-12-8e6425fc/remaining-safe-shadow-batch-v1/shadow-completion-evidence.json",
      productionSnapshotFoundationVerified: true,
      production0015Report:
        "fable info/evidence/wp2/16-production-0015-execution-postflight-report.md",
      productionContentVersionSource: "production-readonly-preflight",
      remainingSafeProductionBatchVersion: 1,
      executionOrder: item.executionOrder,
    },
    applyBatchId,
    rollbackBatchId,
    requiresFreshBackupPerRemoteStage: true,
    requiresPageAcceptanceBeforeRollbackDecision: true,
  };

  const outputName = `${String(item.executionOrder).padStart(2, "0")}-${item.reviewId}.json`;
  const outputPath = resolve(outputDir, outputName);
  const proposalText = `${JSON.stringify(proposal, null, 2)}\n`;
  writeFileSync(outputPath, proposalText, "utf8");

  manifestItems.push({
    executionOrder: item.executionOrder,
    selectedCandidateIndex: item.selectedCandidateIndex,
    reviewId: item.reviewId,
    noteId: item.noteId,
    fieldPath: item.fieldPath,
    beforeChecksum: item.beforeChecksum,
    afterChecksum: item.afterChecksum,
    proposalPath: relative(workspace, outputPath).replaceAll("\\", "/"),
    proposalSha256: sha256(proposalText),
    sourceShadowProposalSha256: item.proposalSha256,
    applyBatchId,
    rollbackBatchId,
  });
}

const manifest = {
  packageVersion: 1,
  status: "authorized_pending_fresh_backup",
  generatedAt: new Date().toISOString(),
  productionProjectRef,
  forbiddenShadowProjectRef: shadowProjectRef,
  reviewBatchId: shadowManifest.reviewBatchId,
  sourceShadowManifestSha256: sha256(shadowManifestText),
  sourceShadowCompletionEvidenceSha256: sha256(shadowEvidenceText),
  itemCount: manifestItems.length,
  noteCount: new Set(manifestItems.map((item) => item.noteId)).size,
  executionPolicy: {
    concurrency: 1,
    freshBackupCount: 1,
    freshPreflightPerItem: true,
    chainPreviousPostflightBaseline: true,
    applyOrder: manifestItems.map((item) => item.reviewId),
    productionWriteAuthorized: true,
    excludedDeterministicDryRunCount: 412,
  },
  items: manifestItems,
};

const manifestPath = resolve(outputDir, "manifest.json");
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  prepared: true,
  projectRef: productionProjectRef,
  itemCount: manifest.itemCount,
  noteCount: manifest.noteCount,
  freshBackupCount: manifest.executionPolicy.freshBackupCount,
  productionWriteAuthorized: manifest.executionPolicy.productionWriteAuthorized,
  outputFile: relative(workspace, manifestPath).replaceAll("\\", "/"),
}));
