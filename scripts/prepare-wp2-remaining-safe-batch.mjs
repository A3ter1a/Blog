import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageDir = resolve(
  workspace,
  ".local-backups/wp2-markdown-review/wp2-2026-07-12-8e6425fc",
);
const exactPath = resolve(packageDir, "ai-proposals-exact.json");
const verificationPath = resolve(packageDir, "ai-proposals-exact-verification.json");
const outputDir = resolve(packageDir, "remaining-safe-shadow-batch-v1");
const manifestPath = resolve(outputDir, "manifest.json");

const shadowProjectRef = "qyjfcebqjtphlpsvizxo";
const productionProjectRef = "kysywitrsjhcdlcrfayl";
const closedReviewIds = new Set(["review-70c08975b21e"]);
const supportedFieldPath = /^(content|problems\.\d+\.(?:question|answer|explanation|tips)|problems\.\d+\.options\.\d+\.content)$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function workspacePath(path) {
  return relative(workspace, path).replaceAll("\\", "/");
}

const exactText = readFileSync(exactPath, "utf8");
const verificationText = readFileSync(verificationPath, "utf8");
const exactPackage = JSON.parse(exactText);
const verification = JSON.parse(verificationText);
const { generatedAt: verificationGeneratedAt, ...stableVerification } = verification;
const stableVerificationSha256 = sha256(JSON.stringify(stableVerification));
const diagnosticsByReviewId = new Map(
  verification.diagnostics.map((diagnostic) => [diagnostic.reviewId, diagnostic]),
);

assert(exactPackage.packageVersion === 2, "WP2 exact proposal package 版本漂移");
assert(exactPackage.batchId === "wp2-2026-07-12-8e6425fc", "WP2 review batch 漂移");
assert(exactPackage.provider === "deepseek", "WP2 provider 漂移");
assert(exactPackage.model === "deepseek-v4-pro", "WP2 model 漂移");
assert(exactPackage.items.length === 11, "WP2 exact proposal 数量不再是 11");
assert(verification.safeCandidateCount === 7, "WP2 safe candidate 总数不再是 7");
assert(verification.noOpCount === 2, "WP2 no-op 总数不再是 2");
assert(verification.manualRejectCount === 2, "WP2 manual reject 总数不再是 2");

const candidates = exactPackage.items
  .map((item, index) => ({
    item,
    sourceIndex: index,
    diagnostic: diagnosticsByReviewId.get(item.reviewId),
  }))
  .filter(({ item, diagnostic }) => (
    diagnostic?.deterministicClassification === "safe_candidate"
    && !closedReviewIds.has(item.reviewId)
  ));

assert(candidates.length === 6, "WP2 剩余 safe candidate 不再是 6 条");

for (const { item, diagnostic } of candidates) {
  assert(diagnostic.changed === true, `${item.reviewId} 不再是有效改写`);
  assert(diagnostic.structuralPass === true, `${item.reviewId} 结构验证失败`);
  assert(diagnostic.semanticTokensEqual === true, `${item.reviewId} 语义 token 不一致`);
  assert(diagnostic.renderWarningsWorsened === false, `${item.reviewId} 渲染告警恶化`);
  assert(Array.isArray(diagnostic.reviewedRiskCodes) && diagnostic.reviewedRiskCodes.length === 0, `${item.reviewId} 含复核风险`);
  assert(supportedFieldPath.test(item.fieldPath), `${item.reviewId} fieldPath 不受迁移 RPC 支持`);
  assert(sha256(item.sourceText) === item.sourceChecksum, `${item.reviewId} source checksum 失配`);
  assert(sha256(item.reviewedMarkdown) === item.reviewedChecksum, `${item.reviewId} reviewed checksum 失配`);
  assert(item.sourceChecksum !== item.reviewedChecksum, `${item.reviewId} 不应生成 no-op 迁移`);
}

mkdirSync(outputDir, { recursive: true });

const manifestItems = candidates.map(({ item, sourceIndex, diagnostic }, executionIndex) => {
  const selectionKey = sha256([
    exactPackage.batchId,
    item.reviewId,
    item.reviewedChecksum,
    "remaining-shadow-v1",
  ].join(":" )).slice(0, 12);
  const proposalPath = resolve(outputDir, `${String(executionIndex + 1).padStart(2, "0")}-${item.reviewId}.json`);
  const proposal = {
    packageVersion: 1,
    status: "pending_user_approval",
    shadowProjectRef,
    forbiddenProductionProjectRef: productionProjectRef,
    reviewBatchId: exactPackage.batchId,
    selectedCandidateIndex: sourceIndex + 1,
    reviewId: item.reviewId,
    noteId: item.noteId,
    fieldPath: item.fieldPath,
    beforeText: item.sourceText,
    afterText: item.reviewedMarkdown,
    beforeChecksum: item.sourceChecksum,
    afterChecksum: item.reviewedChecksum,
    ruleVersion: "asteroid-markdown-v1+ai-review-v1",
    aiInvolved: true,
    aiProvider: exactPackage.provider,
    aiModel: exactPackage.model,
    aiRequestId: item.reviewId,
    validationStatus: "pending_user_approval",
    validationDetail: {
      exactCaptureVerified: true,
      structuralPass: true,
      semanticTokenSequenceEqual: true,
      renderWarningsWorsened: false,
      reviewedRiskCount: 0,
      proposalPostflightReport: "fable info/evidence/wp2/11-exact-proposal-postflight-report.md",
      productionDriftReport: "fable info/evidence/wp2/26-remaining-candidate-production-drift-report.md",
      remainingSafeBatchVersion: 1,
      executionOrder: executionIndex + 1,
    },
    applyBatchId: `wp2-shadow-single-${selectionKey}`,
    rollbackBatchId: `wp2-shadow-single-rollback-${selectionKey}`,
  };

  const proposalText = `${JSON.stringify(proposal, null, 2)}\n`;
  writeFileSync(proposalPath, proposalText, "utf8");

  return {
    executionOrder: executionIndex + 1,
    selectedCandidateIndex: sourceIndex + 1,
    reviewId: item.reviewId,
    noteId: item.noteId,
    fieldPath: item.fieldPath,
    beforeChecksum: item.sourceChecksum,
    afterChecksum: item.reviewedChecksum,
    sourceLength: item.sourceText.length,
    afterLength: item.reviewedMarkdown.length,
    proposalPath: workspacePath(proposalPath),
    proposalSha256: sha256(proposalText),
    applyBatchId: proposal.applyBatchId,
    rollbackBatchId: proposal.rollbackBatchId,
    deterministicClassification: diagnostic.deterministicClassification,
  };
});

const noteGroups = Array.from(Map.groupBy(manifestItems, (item) => item.noteId))
  .map(([noteId, items]) => ({
    noteId,
    applyOrder: items.map((item) => item.reviewId),
    rollbackOrder: items.toReversed().map((item) => item.reviewId),
  }));

const manifest = {
  packageVersion: 1,
  status: "pending_shadow_authorization",
  generatedAt: new Date().toISOString(),
  reviewBatchId: exactPackage.batchId,
  shadowProjectRef,
  forbiddenProductionProjectRef: productionProjectRef,
  sourceExactPackage: workspacePath(exactPath),
  sourceExactPackageSha256: sha256(exactText),
  sourceVerification: workspacePath(verificationPath),
  sourceVerificationGeneratedAt: verificationGeneratedAt,
  sourceVerificationCanonicalSha256: stableVerificationSha256,
  closedReviewIds: [...closedReviewIds],
  itemCount: manifestItems.length,
  executionPolicy: {
    concurrency: 1,
    applyOrder: manifestItems.map((item) => item.reviewId),
    rollbackOrder: manifestItems.toReversed().map((item) => item.reviewId),
    freshPreflightPerItem: true,
    reverseRollbackRequiredForSharedNote: true,
    productionWriteAuthorized: false,
  },
  noteGroups,
  items: manifestItems,
};

writeJson(manifestPath, manifest);

console.log(JSON.stringify({
  prepared: true,
  itemCount: manifest.itemCount,
  noteCount: noteGroups.length,
  sharedNoteCandidateCount: noteGroups.filter((group) => group.applyOrder.length > 1).length,
  productionWriteAuthorized: false,
  outputFile: workspacePath(manifestPath),
}));
