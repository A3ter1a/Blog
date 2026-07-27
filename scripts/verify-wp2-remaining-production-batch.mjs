import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageDir = resolve(
  workspace,
  ".local-backups/wp2-markdown-review/wp2-2026-07-12-8e6425fc",
);
const productionManifestPath = resolve(
  packageDir,
  "remaining-safe-production-batch-v1/manifest.json",
);
const shadowManifestPath = resolve(packageDir, "remaining-safe-shadow-batch-v1/manifest.json");
const shadowEvidencePath = resolve(
  packageDir,
  "remaining-safe-shadow-batch-v1/shadow-completion-evidence.json",
);

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const productionManifest = JSON.parse(readFileSync(productionManifestPath, "utf8"));
const shadowManifestText = readFileSync(shadowManifestPath, "utf8");
const shadowManifest = JSON.parse(shadowManifestText);
const shadowEvidenceText = readFileSync(shadowEvidencePath, "utf8");

assert.equal(productionManifest.packageVersion, 1);
assert.equal(productionManifest.status, "authorized_pending_fresh_backup");
assert.equal(productionManifest.productionProjectRef, "kysywitrsjhcdlcrfayl");
assert.equal(productionManifest.forbiddenShadowProjectRef, "qyjfcebqjtphlpsvizxo");
assert.equal(productionManifest.itemCount, 6);
assert.equal(productionManifest.noteCount, 3);
assert.equal(productionManifest.executionPolicy.concurrency, 1);
assert.equal(productionManifest.executionPolicy.freshBackupCount, 1);
assert.equal(productionManifest.executionPolicy.freshPreflightPerItem, true);
assert.equal(productionManifest.executionPolicy.chainPreviousPostflightBaseline, true);
assert.equal(productionManifest.executionPolicy.productionWriteAuthorized, true);
assert.equal(productionManifest.executionPolicy.excludedDeterministicDryRunCount, 412);
assert.equal(productionManifest.sourceShadowManifestSha256, sha256(shadowManifestText));
assert.equal(
  productionManifest.sourceShadowCompletionEvidenceSha256,
  sha256(shadowEvidenceText),
);
assert.deepEqual(
  productionManifest.executionPolicy.applyOrder,
  shadowManifest.executionPolicy.applyOrder,
);

const seenApplyBatchIds = new Set();
const seenRollbackBatchIds = new Set();
for (const [index, item] of productionManifest.items.entries()) {
  const shadowItem = shadowManifest.items[index];
  assert.equal(item.executionOrder, index + 1);
  assert.equal(item.reviewId, shadowItem.reviewId);
  assert.equal(item.noteId, shadowItem.noteId);
  assert.equal(item.fieldPath, shadowItem.fieldPath);
  assert.equal(item.beforeChecksum, shadowItem.beforeChecksum);
  assert.equal(item.afterChecksum, shadowItem.afterChecksum);
  assert.equal(item.sourceShadowProposalSha256, shadowItem.proposalSha256);
  assert.match(item.applyBatchId, /^wp2-production-single-[0-9a-f]{12}$/);
  assert.match(item.rollbackBatchId, /^wp2-production-single-rollback-[0-9a-f]{12}$/);
  assert.equal(seenApplyBatchIds.has(item.applyBatchId), false);
  assert.equal(seenRollbackBatchIds.has(item.rollbackBatchId), false);
  seenApplyBatchIds.add(item.applyBatchId);
  seenRollbackBatchIds.add(item.rollbackBatchId);

  const proposalText = readFileSync(resolve(workspace, item.proposalPath), "utf8");
  const proposal = JSON.parse(proposalText);
  assert.equal(sha256(proposalText), item.proposalSha256);
  assert.equal(proposal.status, "pending_production_preflight");
  assert.equal(proposal.productionProjectRef, productionManifest.productionProjectRef);
  assert.equal(proposal.forbiddenShadowProjectRef, productionManifest.forbiddenShadowProjectRef);
  assert.equal(proposal.reviewId, item.reviewId);
  assert.equal(proposal.noteId, item.noteId);
  assert.equal(proposal.fieldPath, item.fieldPath);
  assert.equal(sha256(proposal.beforeText), item.beforeChecksum);
  assert.equal(sha256(proposal.afterText), item.afterChecksum);
  assert.equal(proposal.applyBatchId, item.applyBatchId);
  assert.equal(proposal.rollbackBatchId, item.rollbackBatchId);
  assert.equal(proposal.aiInvolved, true);
  assert.equal(proposal.aiProvider, "deepseek");
  assert.equal(proposal.aiModel, "deepseek-v4-pro");
  assert.equal(proposal.validationStatus, "human_approved");
  assert.equal(proposal.validationDetail.shadowCommitVerified, true);
  assert.equal(proposal.validationDetail.productionSnapshotFoundationVerified, true);
  assert.equal(proposal.validationDetail.semanticTokenSequenceEqual, true);
  assert.equal(proposal.validationDetail.renderWarningsWorsened, false);
  assert.equal(proposal.validationDetail.reviewedRiskCount, 0);
}

console.log(JSON.stringify({
  verified: true,
  itemCount: productionManifest.itemCount,
  noteCount: productionManifest.noteCount,
  productionWriteAuthorized:
    productionManifest.executionPolicy.productionWriteAuthorized,
  freshBackupCount: productionManifest.executionPolicy.freshBackupCount,
  chainedBaseline: productionManifest.executionPolicy.chainPreviousPostflightBaseline,
}));
