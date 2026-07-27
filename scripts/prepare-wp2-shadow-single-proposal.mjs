import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageDir = resolve(
  workspace,
  ".local-backups/wp2-markdown-review/wp2-2026-07-12-8e6425fc",
);
const exactPath = resolve(packageDir, "ai-proposals-exact.json");
const verificationPath = resolve(packageDir, "ai-proposals-exact-verification.json");
const outputPath = resolve(packageDir, "shadow-single-proposal.json");

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const exactPackage = readJson(exactPath);
const verification = readJson(verificationPath);
const diagnosticsByReviewId = new Map(
  verification.diagnostics.map((diagnostic) => [diagnostic.reviewId, diagnostic]),
);

const candidates = exactPackage.items
  .map((item, index) => ({
    item,
    index,
    diagnostic: diagnosticsByReviewId.get(item.reviewId),
  }))
  .filter(({ item, diagnostic }) => (
    diagnostic?.deterministicClassification === "safe_candidate"
    && diagnostic.changed === true
    && diagnostic.semanticTokensEqual === true
    && diagnostic.renderWarningsWorsened === false
    && Array.isArray(diagnostic.reviewedRiskCodes)
    && diagnostic.reviewedRiskCodes.length === 0
    && sha256(item.sourceText) === item.sourceChecksum
    && sha256(item.reviewedMarkdown) === item.reviewedChecksum
  ))
  .sort((left, right) => (
    left.item.reviewedMarkdown.length - right.item.reviewedMarkdown.length
    || left.index - right.index
  ));

if (candidates.length !== verification.safeCandidateCount || candidates.length !== 7) {
  throw new Error("WP2 safe candidate 集合与后验报告不一致");
}

const selected = candidates[0];
if (!selected) throw new Error("没有可用于 fixed Shadow 的安全候选");
if (!/^problems\.\d+\.(?:question|answer|explanation|tips|options\.\d+\.content)$/.test(selected.item.fieldPath)) {
  throw new Error("最低风险候选不是受支持的题目字段");
}

const selectionKey = sha256(`${selected.item.reviewId}:${selected.item.reviewedChecksum}`).slice(0, 12);
const payload = {
  packageVersion: 1,
  status: "pending_user_approval",
  shadowProjectRef: "qyjfcebqjtphlpsvizxo",
  forbiddenProductionProjectRef: "kysywitrsjhcdlcrfayl",
  reviewBatchId: exactPackage.batchId,
  selectedCandidateIndex: selected.index + 1,
  reviewId: selected.item.reviewId,
  noteId: selected.item.noteId,
  fieldPath: selected.item.fieldPath,
  beforeText: selected.item.sourceText,
  afterText: selected.item.reviewedMarkdown,
  beforeChecksum: selected.item.sourceChecksum,
  afterChecksum: selected.item.reviewedChecksum,
  ruleVersion: "asteroid-markdown-v1+ai-review-v1",
  aiInvolved: true,
  aiProvider: String(exactPackage.provider || "deepseek"),
  aiModel: String(exactPackage.model || "deepseek-v4-pro"),
  aiRequestId: selected.item.reviewId,
  validationStatus: "pending_user_approval",
  validationDetail: {
    exactCaptureVerified: true,
    semanticTokenSequenceEqual: true,
    renderWarningsWorsened: false,
    reviewedRiskCount: 0,
    proposalPostflightReport: "fable info/evidence/wp2/11-exact-proposal-postflight-report.md",
  },
  applyBatchId: `wp2-shadow-single-${selectionKey}`,
  rollbackBatchId: `wp2-shadow-single-rollback-${selectionKey}`,
};

writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  prepared: true,
  candidateCount: candidates.length,
  selectedCandidateIndex: payload.selectedCandidateIndex,
  fieldPath: payload.fieldPath,
  beforeLength: payload.beforeText.length,
  afterLength: payload.afterText.length,
  status: payload.status,
  outputFile: relative(workspace, outputPath).replaceAll("\\", "/"),
}));
