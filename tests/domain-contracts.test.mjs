import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";

import {
  canAppendRevision,
  getNextRevisionNo,
  planStartNextRound,
  selectLatestEffectivePaperResult,
} from "../lib/training-contract.ts";
import {
  AI_ACCOUNT_SLOTS,
  AI_ACCOUNT_SLOT_CONFIG,
  clearActiveAiAccountSlot,
  doesAiProfileMatchSlot,
  getActiveAiAccountSlot,
  getAiAccountAuthStorageKey,
  getAiAccountSlotForEmail,
  getAiAccountSlotPath,
  isExpectedAiAccountEmail,
  normalizeAiAccountSlot,
} from "../lib/auth-session-slot.ts";
import {
  assertUniqueJobItemKeys,
  canClaimJobResult,
  claimJobItem,
  completeJobItem,
  planExternalJobStatusTransition,
  resetFailedJobItem,
  shouldRetainJobSource,
} from "../lib/job-contract.ts";
import {
  getNextSourceVersionNo,
  isChunkEligibleForCurrentSearch,
  selectCurrentSourceVersion,
  shouldCreateSourceVersion,
} from "../lib/source-version-contract.ts";
import { validatePendingAction } from "../lib/ai-action-contract.ts";
import {
  getBeijingMonth,
  getMissingTimelineTaskStatuses,
  getNextTimelineTaskStatus,
  mergeTimelineTaskStatuses,
  migrateLegacyTimelineCompletion,
  normalizeTimelineTaskStatusMap,
  resolveCurrentTimelineMonthId,
} from "../lib/study-timeline.ts";
import {
  isEnglishObjectiveSection,
  normalizeEnglishObjectiveAnswer,
  normalizeEnglishQuestionOptions,
} from "../lib/english-training.ts";
import {
  BOOKLET_REFLECTION_START,
  BOOKLET_SNAPSHOT_END,
  BOOKLET_SNAPSHOT_START,
  buildBookletNoteMarkdown,
  buildBookletSourceManifest,
  calculateBookletMarkdownSnapshotSha256,
  calculateBookletProblemSha256,
  detectBookletSourceDrift,
  extractBookletSourceManifest,
  extractBookletSnapshot,
  validateBookletProblemSnapshot,
} from "../lib/booklet-contract.ts";
import {
  formatEconomicsCitation,
  validateEconomicsConcept,
} from "../lib/economics-concept-contract.ts";
import { normalizeMarkdownSyntax } from "../lib/markdown-normalizer.ts";
import {
  AI_CONTENT_MAX_CHARS,
  runAiContentSelfCheck,
  validateAiContentInput,
} from "../lib/ai-content-contract.ts";
import {
  answersEqual,
  runAiKnowledgeQuizSelfCheck,
  toPublicAiKnowledgeQuizItem,
} from "../lib/ai-knowledge-quiz-contract.ts";
import { validateReviewSelection } from "../lib/ai-review-contract.ts";
import { normalizeLatexForKatex } from "../lib/utils.ts";
import { repairAIJsonText } from "../lib/ai-json-repair.ts";
import {
  buildMarkdownReviewProposal,
  canApplyMarkdownReviewProposal,
  extractMarkdownReviewProposal,
  validateMarkdownReviewProposal,
  verifyMarkdownReviewProposalChecksums,
} from "../lib/markdown-review-proposal.ts";
import {
  isInternalJobLeaseEnabled,
  planInternalJobProjection,
} from "../lib/internal-job-contract.ts";
import {
  DOCUMENT_MARKDOWN_REVIEW_MAX_CHARS,
  DocumentMarkdownReviewError,
  prepareDocumentMarkdownReviewSource,
  reviewDocumentMarkdown,
} from "../lib/document-markdown-review-service.ts";
import {
  getNoteReadHref,
  getNoteReadPath,
  getPrivateNoteReadPath,
} from "../lib/note-routes.ts";
import { analyzeMarkdownRisks, normalizeMarkdownSource } from "../lib/content-contract.ts";
import {
  assertMigrationBatchRollbackSafe,
  canApplyContentMigration,
  rollbackContentMigration,
} from "../lib/content-migration-contract.ts";
import {
  canRetryClientJob,
  getClientJobProgressLabel,
  mergeClientJobLedgers,
  normalizeRemoteJobResult,
  normalizeRemoteJobRows,
  normalizeStoredJobs,
  prepareClientJobsForStorage,
  removeExpiredClientJobs,
} from "../lib/job-client.ts";
import {
  getBeijingSolarHours,
  resolveTheme,
} from "../lib/theme-contract.ts";
import {
  createEmptyEnglishLedger,
  getEnglishRound,
  getLatestEnglishRoundRevision,
  saveEnglishRoundDraft,
  startNextEnglishRound,
  submitEnglishRoundRevision,
} from "../lib/english-round-history.ts";
import { planEnglishTrainingBackfill } from "../lib/english-backfill-contract.ts";
import {
  findUnreconciledEnglishLocalHistory,
  mapEnglishTrainingCoreRows,
} from "../lib/english-training-core.ts";
import {
  appendMathPaperGradeRevision,
  appendMathPaperOcrRevision,
  canGradeMathPaperOcrPage,
  confirmMathPaperOcrRevision,
  getEffectiveMathPaperGrade,
} from "../lib/math-paper-ocr-contract.ts";
import {
  buildMathOcrConfirmationPayload,
  normalizeMathGradeSuggestion,
} from "../lib/math-training-core.ts";
import {
  buildAcceptedMemoryContext,
  createAssistantMemoryCandidate,
  decideAssistantMemory,
} from "../lib/assistant-memory.ts";
import { resolveAIProviderRoute } from "../lib/ai-provider-routing.ts";
import {
  buildMonthlyPlanningSnapshot,
  computePlanningEtag,
  DEFAULT_PLANNING_CYCLE_ID,
  getPlanningCycle,
  isPlanningMonthKey,
} from "../lib/planning-monthly.ts";
import {
  buildTokenHashVector,
  planRagSourceSync,
  splitRagSourceText,
  toPgVectorLiteral,
} from "../lib/rag-source-adapter.ts";
import { encodeEnglishManualScore, scoreEnglishObjectiveAnswers } from "../lib/english-scoring.ts";
import { normalizeEnglishSubjectiveGradeSuggestion } from "../lib/english-subjective-grade.ts";
import {
  buildProblemOcrJobResult,
  extractProblemOcrJobResult,
  isOwnedProblemOcrAssetPath,
  materializeProblemOcrProblem,
} from "../lib/problem-ocr-contract.ts";
import {
  analyzeProblemOcrText,
  recognizeProblemImage,
} from "../lib/problem-ocr-service.ts";

test("北京时间月份在 UTC 跨日时仍然正确", () => {
  assert.equal(getBeijingMonth(new Date("2026-06-30T16:30:00.000Z")), 7);
  assert.equal(resolveCurrentTimelineMonthId([
    { id: "07", label: "7月" },
    { id: "08", label: "8月" },
  ], new Date("2026-07-12T08:00:00.000Z")), "07");
});

test("规划旧完成记录无损迁移并按三态手动循环", () => {
  assert.deepEqual(migrateLegacyTimelineCompletion({ a: true, b: false, c: "true" }), { a: "completed" });
  assert.deepEqual(normalizeTimelineTaskStatusMap({ a: "in_progress", b: "bad", c: "completed" }), {
    a: "in_progress",
    c: "completed",
  });
  assert.equal(getNextTimelineTaskStatus("not_started"), "in_progress");
  assert.equal(getNextTimelineTaskStatus("in_progress"), "completed");
  assert.equal(getNextTimelineTaskStatus("completed"), "not_started");
});

test("规划跨设备合并以远端为准，但明确失败的待同步修改可重试覆盖", () => {
  const local = { shared: "completed", localOnly: "in_progress" };
  const remote = { shared: "not_started", remoteOnly: "completed" };
  assert.deepEqual(getMissingTimelineTaskStatuses(local, remote), { localOnly: "in_progress" });
  assert.deepEqual(mergeTimelineTaskStatuses(local, remote), {
    shared: "not_started",
    localOnly: "in_progress",
    remoteOnly: "completed",
  });
  assert.equal(mergeTimelineTaskStatuses(local, remote, { shared: "in_progress" }).shared, "in_progress");
});

test("下一轮原子规则封存 submitted，abandoned 保持放弃，第三轮拒绝继续", () => {
  assert.deepEqual(planStartNextRound({ id: "a1", round: 1, status: "submitted" }), {
    previousStatus: "sealed",
    nextRound: 2,
  });
  assert.deepEqual(planStartNextRound({ id: "a2", round: 2, status: "abandoned" }), {
    previousStatus: "abandoned",
    nextRound: 3,
  });
  assert.throws(() => planStartNextRound({ id: "a3", round: 3, status: "submitted" }));
  assert.throws(() => planStartNextRound({ id: "a4", round: 1, status: "in_progress" }));
});

test("sealed 轮次允许显式纠正，但不允许普通 submission", () => {
  const sealed = { id: "a1", round: 1, status: "sealed" };
  assert.equal(canAppendRevision(sealed, "correction"), true);
  assert.equal(canAppendRevision(sealed, "submission"), false);
});

test("revision_no 单调递增且重复编号失败", () => {
  assert.equal(getNextRevisionNo([
    { id: "r1", attemptId: "a1", revisionNo: 1, kind: "submission" },
    { id: "r2", attemptId: "a1", revisionNo: 2, kind: "correction" },
  ], "a1"), 3);
  assert.throws(() => getNextRevisionNo([
    { id: "r1", attemptId: "a1", revisionNo: 1, kind: "submission" },
    { id: "r2", attemptId: "a1", revisionNo: 1, kind: "correction" },
  ], "a1"));
});

test("套卷结果严格按最高完成轮次、最新有正式分 revision 选择", () => {
  const result = selectLatestEffectivePaperResult(
    [
      { id: "round-1", round: 1, status: "sealed" },
      { id: "round-2", round: 2, status: "submitted" },
      { id: "round-3", round: 3, status: "in_progress" },
    ],
    [
      { id: "r1", attemptId: "round-1", revisionNo: 1, kind: "submission" },
      { id: "r2", attemptId: "round-2", revisionNo: 1, kind: "submission" },
      { id: "r3", attemptId: "round-2", revisionNo: 2, kind: "correction" },
    ],
    [
      { id: "g1", revisionId: "r1", origin: "system_scored", gradeSeq: 1, score: 8 },
      { id: "g2", revisionId: "r2", origin: "system_scored", gradeSeq: 1, score: 9 },
      { id: "g3", revisionId: "r3", origin: "ai_suggested", gradeSeq: 1, score: 10 },
    ],
    "objective",
  );

  assert.equal(result?.attempt.round, 2);
  assert.equal(result?.revision.id, "r2");
  assert.equal(result?.grade.score, 9);
});

test("主观统计只接受 user_final，AI 建议和 legacy 不穿透", () => {
  const result = selectLatestEffectivePaperResult(
    [{ id: "a1", round: 1, status: "submitted" }],
    [{ id: "r1", attemptId: "a1", revisionNo: 1, kind: "submission" }],
    [
      { id: "legacy", revisionId: "r1", origin: "legacy_imported", gradeSeq: 1, score: 12 },
      { id: "ai", revisionId: "r1", origin: "ai_suggested", gradeSeq: 1, score: 18 },
      { id: "final-1", revisionId: "r1", origin: "user_final", gradeSeq: 1, score: 16 },
      { id: "final-2", revisionId: "r1", origin: "user_final", gradeSeq: 2, score: 17 },
    ],
    "subjective",
  );

  assert.equal(result?.grade.id, "final-2");
  assert.equal(result?.grade.score, 17);
});

test("job item lease 防重复领取、过期后可重领且完成者必须匹配", () => {
  const pending = {
    id: "i1",
    jobId: "j1",
    idempotencyKey: "chunk-1",
    status: "pending",
    attemptCount: 0,
  };
  const now = new Date("2026-07-12T12:00:00.000Z");
  const leased = claimJobItem(pending, "worker-a", now, 30_000);
  assert.equal(leased?.status, "leased");
  assert.equal(claimJobItem(leased, "worker-b", new Date(now.getTime() + 5_000), 30_000), null);
  const reclaimed = claimJobItem(leased, "worker-b", new Date(now.getTime() + 31_000), 30_000);
  assert.equal(reclaimed?.claimedBy, "worker-b");
  assert.throws(() => completeJobItem(reclaimed, "worker-a", new Date(now.getTime() + 32_000)));
  assert.equal(completeJobItem(reclaimed, "worker-b", new Date(now.getTime() + 32_000)).status, "succeeded");
});

test("failed job item 必须显式 reset，幂等键在 job 内唯一", () => {
  const failed = {
    id: "i1",
    jobId: "j1",
    idempotencyKey: "page-1",
    status: "failed",
    attemptCount: 1,
    error: "OCR timeout",
  };
  assert.equal(claimJobItem(failed, "worker", new Date(), 1_000), null);
  assert.equal(resetFailedJobItem(failed).status, "pending");
  assert.throws(() => assertUniqueJobItemKeys([failed, { ...failed, id: "i2" }]));
  assert.equal(canClaimJobResult("succeeded"), true);
  assert.equal(canClaimJobResult("running"), false);
  assert.equal(shouldRetainJobSource("failed"), true);
  assert.equal(shouldRetainJobSource("succeeded"), false);
});

test("站内分块任务只按 item 真相投影进度、等待、失败与成功状态", () => {
  const pending = planInternalJobProjection([
    { ordinal: 0, status: "succeeded" },
    { ordinal: 1, status: "pending" },
  ]);
  assert.equal(pending.status, "waiting_for_trigger");
  assert.equal(pending.progressCurrent, 1);
  assert.equal(pending.progressTotal, 2);

  const running = planInternalJobProjection([
    { ordinal: 0, status: "succeeded" },
    { ordinal: 1, status: "leased" },
  ]);
  assert.equal(running.status, "running");

  const failed = planInternalJobProjection([
    { ordinal: 0, status: "failed", error: "first failure" },
    { ordinal: 1, status: "failed", error: "second failure" },
  ]);
  assert.equal(failed.status, "failed");
  assert.equal(failed.error, "first failure");

  const succeeded = planInternalJobProjection([
    { ordinal: 0, status: "succeeded" },
    { ordinal: 1, status: "succeeded" },
  ]);
  assert.equal(succeeded.status, "succeeded");
  assert.equal(succeeded.progressCurrent, 2);
  assert.throws(() => planInternalJobProjection([]), /至少需要一个 job item/);

  assert.equal(isInternalJobLeaseEnabled("true"), true);
  assert.equal(isInternalJobLeaseEnabled(" TRUE "), true);
  assert.equal(isInternalJobLeaseEnabled("1"), false);
  assert.equal(isInternalJobLeaseEnabled(undefined), false);
});

test("外部任务状态单调推进且领取后不会被迟到查询复活", () => {
  assert.deepEqual(planExternalJobStatusTransition("dispatched", "running", false), {
    shouldPersist: true,
    nextStatus: "running",
  });
  assert.deepEqual(planExternalJobStatusTransition("running", "success", false), {
    shouldPersist: true,
    nextStatus: "stalled",
  });
  assert.deepEqual(planExternalJobStatusTransition("stalled", "success", true), {
    shouldPersist: true,
    nextStatus: "succeeded",
  });
  assert.deepEqual(planExternalJobStatusTransition("failed", "running", false), {
    shouldPersist: false,
    nextStatus: "failed",
  });
  assert.deepEqual(planExternalJobStatusTransition("claimed", "success", true), {
    shouldPersist: false,
    nextStatus: "claimed",
  });
});

test("RAG 只检索 current source version，不回退旧 chunk", () => {
  const document = { id: "d1", currentVersionId: "v2" };
  const versions = [
    { id: "v1", sourceDocumentId: "d1", versionNo: 1, checksum: "old" },
    { id: "v2", sourceDocumentId: "d1", versionNo: 2, checksum: "current" },
  ];
  assert.equal(selectCurrentSourceVersion(document, versions)?.id, "v2");
  assert.equal(isChunkEligibleForCurrentSearch({ id: "c1", sourceVersionId: "v1" }, document), false);
  assert.equal(isChunkEligibleForCurrentSearch({ id: "c2", sourceVersionId: "v2" }, document), true);
  assert.equal(shouldCreateSourceVersion(versions[1], "current"), false);
  assert.equal(shouldCreateSourceVersion(versions[1], "next"), true);
  assert.equal(getNextSourceVersionNo("d1", versions), 3);
});

test("AI pending action 对过期、重复、版本变化和 checksum 变化全部拒绝", () => {
  const action = {
    id: "p1",
    status: "proposed",
    expiresAt: "2026-07-12T12:10:00.000Z",
    expectedTargetVersion: 3,
    expectedTargetChecksum: "abc",
  };
  assert.deepEqual(validatePendingAction(action, new Date("2026-07-12T12:00:00.000Z"), 3, "abc"), { ok: true });
  assert.equal(validatePendingAction(action, new Date("2026-07-12T12:11:00.000Z"), 3, "abc").reason, "expired");
  assert.equal(validatePendingAction(action, new Date("2026-07-12T12:00:00.000Z"), 4, "abc").reason, "version_changed");
  assert.equal(validatePendingAction(action, new Date("2026-07-12T12:00:00.000Z"), 3, "def").reason, "checksum_changed");
  assert.equal(validatePendingAction({ ...action, status: "consumed" }, new Date("2026-07-12T12:00:00.000Z"), 3, "abc").reason, "already_consumed");
});

test("AI JSON 修复保留 LaTeX 反斜杠并转义原始控制字符", () => {
  const malformed = String.raw`{"markdown":"$\\frac{x}{2}$ \\begin{cases}x\\\\y\\end{cases}\n下一行","summary":"修复 \\xi"}`;
  const parsed = JSON.parse(repairAIJsonText(malformed));
  assert.equal(parsed.markdown, "$\\frac{x}{2}$ \\begin{cases}x\\\\y\\end{cases}\n下一行");
  assert.equal(parsed.summary, "修复 \\xi");

  const rawControl = `{"markdown":"第一行\n第二行\t制表","summary":"ok"}`;
  const controlParsed = JSON.parse(repairAIJsonText(rawControl));
  assert.equal(controlParsed.markdown, "第一行\n第二行\t制表");

  const quoted = JSON.parse(repairAIJsonText(String.raw`{"markdown":"包含 \"引号\" 和 \\frac{x}{2}"}`));
  assert.equal(quoted.markdown, '包含 "引号" 和 \\frac{x}{2}');
});

test("Markdown AI 审阅只生成精确提案，正文未变化时才允许人工应用", async () => {
  const sourceMarkdown = "# 原文\n\n公式 $x^2$";
  const reviewedMarkdown = "# 原文\n\n公式 $x^{2}$";
  const proposal = await buildMarkdownReviewProposal({
    proposalId: "markdown-review-test",
    createdAt: "2026-07-21T00:00:00.000Z",
    sourceMarkdown,
    reviewedMarkdown,
    model: "deepseek-v4-pro",
    summary: "规范公式",
    chunks: [{
      chunkIndex: 1,
      chunkCount: 1,
      sourceMarkdown,
      reviewedMarkdown,
      summary: "规范公式",
      tokensUsed: 42,
    }],
  });

  assert.equal(proposal.captureKind, "api_json_response");
  assert.equal(proposal.status, "pending_review");
  assert.match(proposal.sourceChecksum, /^[a-f0-9]{64}$/);
  assert.match(proposal.reviewedChecksum, /^[a-f0-9]{64}$/);
  assert.notEqual(proposal.sourceChecksum, proposal.reviewedChecksum);
  assert.equal(proposal.tokensUsed, 42);
  assert.deepEqual(validateMarkdownReviewProposal(proposal), { valid: true, reasons: [] });
  assert.equal(await verifyMarkdownReviewProposalChecksums(proposal), true);
  assert.equal(canApplyMarkdownReviewProposal(proposal, sourceMarkdown), true);
  assert.equal(canApplyMarkdownReviewProposal(proposal, `${sourceMarkdown}\n新内容`), false);
  assert.deepEqual(extractMarkdownReviewProposal(proposal), proposal);
  assert.equal(extractMarkdownReviewProposal({ ...proposal, chunks: [{ broken: true }] }), null);
  assert.equal(validateMarkdownReviewProposal({ ...proposal, reviewedLength: 1 }).valid, false);
  assert.equal(await verifyMarkdownReviewProposalChecksums({ ...proposal, reviewedMarkdown: "已篡改" }), false);
});

test("Markdown AI 审阅服务让网页与批处理共享同一响应和保护规则", async () => {
  const sourceMarkdown = "2. 1.1 标题\n\n公式 $x^2$\n\n![图](https://example.com/a.png)";
  const reviewedMarkdown = "### 2.1.1 标题\n\n公式 $x^{2}$\n\n![图](https://example.com/a.png)";
  const calls = [];
  const response = await reviewDocumentMarkdown({
    apiKey: "test-key",
    model: "deepseek-v4-pro",
    markdown: sourceMarkdown,
    chunkIndex: 1,
    chunkCount: 1,
  }, async (...args) => {
    calls.push(args);
    return {
      content: JSON.stringify({ markdown: reviewedMarkdown, summary: "修复标题和公式" }),
      tokensUsed: 42,
    };
  });

  assert.equal(response.success, true);
  assert.equal(response.markdown, prepareDocumentMarkdownReviewSource(reviewedMarkdown));
  assert.equal(response.summary, "修复标题和公式");
  assert.equal(response.tokensUsed, 42);
  assert.equal(response.model, "deepseek-v4-pro");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "test-key");
  assert.equal(calls[0][3].temperature, 0);
  assert.equal(calls[0][3].responseFormat, "json_object");
  assert.match(calls[0][2][1].content, /---BEGIN MARKDOWN---/);

  await assert.rejects(
    reviewDocumentMarkdown({
      apiKey: "test-key",
      model: "deepseek-v4-pro",
      markdown: sourceMarkdown,
    }, async () => ({
      content: JSON.stringify({ markdown: "公式 $x^{2}$", summary: "误删图片" }),
      tokensUsed: 1,
    })),
    /丢失了图片链接/,
  );
});

test("Markdown AI 审阅服务在模型调用前拒绝空正文和超长单段", () => {
  assert.throws(
    () => prepareDocumentMarkdownReviewSource("   "),
    (error) => error instanceof DocumentMarkdownReviewError && error.status === 400,
  );
  assert.throws(
    () => prepareDocumentMarkdownReviewSource("x".repeat(DOCUMENT_MARKDOWN_REVIEW_MAX_CHARS + 1)),
    (error) => error instanceof DocumentMarkdownReviewError && error.status === 413,
  );
});

test("现有英语题型与客观答案规范化保持稳定", () => {
  assert.equal(isEnglishObjectiveSection("reading"), true);
  assert.equal(isEnglishObjectiveSection("translation"), false);
  assert.equal(normalizeEnglishObjectiveAnswer(" Ａ， b. C "), "ABC");
  assert.deepEqual(normalizeEnglishQuestionOptions([
    { label: "A", content: "正确选项" },
    { label: "B" },
    "invalid",
  ]), [{ label: "A", content: "正确选项" }]);
});

test("三刷做题本必须同时具备题目、答案、详细解析和方法总结", () => {
  assert.deepEqual(validateBookletProblemSnapshot({
    sourceLabel: "题集 A",
    question: "题目",
    standardAnswer: "答案",
    explanation: "",
    methodSummary: "方法",
  }), {
    valid: false,
    missingFields: ["explanation"],
  });

  const markdown = buildBookletNoteMarkdown([{
    sourceLabel: "题集 A · 第 1 题",
    question: "求 $x$。",
    standardAnswer: "$x=1$。",
    explanation: "由定义计算。",
    methodSummary: "先识别定义，再代入。",
  }]);
  assert.equal(markdown.includes(BOOKLET_SNAPSHOT_START), true);
  assert.equal(markdown.includes(BOOKLET_SNAPSHOT_END), true);
  assert.equal(markdown.includes(BOOKLET_REFLECTION_START), true);
  assert.equal(extractBookletSnapshot(markdown)?.includes("### 方法总结"), true);
});

test("三刷做题本源题变化只产生漂移提示且快照正文不变", () => {
  const source = {
    sourceNoteId: "n1", sourceProblemId: "p1", sourceLabel: "题集 A · 第 1 题",
    question: "求 x", standardAnswer: "x=1", explanation: "由定义", methodSummary: "先识别定义",
  };
  const markdown = buildBookletNoteMarkdown([source]);
  const manifest = extractBookletSourceManifest(markdown);
  assert.equal(manifest.length, 1);
  assert.deepEqual(detectBookletSourceDrift(manifest, [source]), []);
  assert.equal(detectBookletSourceDrift(manifest, [{ ...source, explanation: "新的解析" }])[0].reason, "changed");
  assert.equal(extractBookletSnapshot(markdown)?.includes("由定义"), true);
});

test("经济学概念同时要求严谨定义、通俗解释与可回溯页码", () => {
  const valid = validateEconomicsConcept({
    term: "需求价格弹性",
    rigorousDefinition: "需求量变动百分比与价格变动百分比之比。",
    plainExplanation: "价格变一点，购买量会跟着变多少。",
    formulaOrGraph: "$E_d=(\\Delta Q/Q)/(\\Delta P/P)$",
    commonConfusions: ["斜率不等于弹性"],
    examExpression: "先定义，再说明绝对值大小对应的弹性类型。",
    citation: {
      documentTitle: "平狄克《微观经济学》",
      chapter: "需求与供给的基本原理",
      pageStart: 33,
      pageEnd: 35,
    },
  });
  assert.deepEqual(valid, { valid: true, missing: [] });
  assert.equal(formatEconomicsCitation({
    documentTitle: "平狄克《微观经济学》",
    chapter: "需求与供给的基本原理",
    pageStart: 33,
    pageEnd: 35,
  }), "平狄克《微观经济学》 · 需求与供给的基本原理 · 第 33–35 页");

  const invalid = validateEconomicsConcept({
    term: "弹性",
    rigorousDefinition: "",
    plainExplanation: "",
    formulaOrGraph: "",
    commonConfusions: [],
    examExpression: "",
    citation: { documentTitle: "", chapter: "", pageStart: 0 },
  });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.missing.includes("rigorousDefinition"), true);
  assert.equal(invalid.missing.includes("plainExplanation"), true);
});

test("Markdown 写入规范化幂等且保护代码块、公式与负数题目", () => {
  const source = "#标题\n正文 $ x + 1 $\n\n```md\n#不要修改\n```\n\n-9";
  const once = normalizeMarkdownSyntax(source);
  const twice = normalizeMarkdownSyntax(once);

  assert.equal(once, twice);
  assert.equal(once.includes("# 标题"), true);
  assert.equal(once.includes("$ x + 1 $"), true);
  assert.equal(once.includes("```md\n#不要修改\n```"), true);
  assert.equal(once.endsWith("-9"), true);
});

test("Markdown 风险检测拒绝把公式语义变化当作安全修复", () => {
  const unbalanced = analyzeMarkdownRisks("正文 $x + 1");
  assert.equal(unbalanced.some((risk) => risk.code === "unbalanced_inline_math"), true);

  const changedMath = analyzeMarkdownRisks("$\\alpha$", "$\\beta$");
  assert.equal(changedMath.some((risk) => risk.code === "normalization_changed_math"), true);
});

test("AI 内容自检覆盖 Markdown、排版和标题层级，并允许安全规范化", () => {
  const valid = runAiContentSelfCheck("# 微观经济学\n\n## 需求\n\n价格变化沿曲线移动。\n\n### 重点\n\n- 其他条件不变");
  assert.equal(valid.selfCheck.passed, true);
  assert.equal(valid.selfCheck.checks.markdown, true);
  assert.equal(valid.selfCheck.checks.layout, true);
  assert.equal(valid.selfCheck.checks.headings, true);

  const malformedHeading = runAiContentSelfCheck("# 总标题\n\n### 跳级标题\n\n正文");
  assert.equal(malformedHeading.selfCheck.passed, false);
  assert.equal(malformedHeading.selfCheck.issues.some((issue) => issue.code === "heading_level_jump"), true);

  const malformedMath = runAiContentSelfCheck("# 标题\n\n公式 $x+1");
  assert.equal(malformedMath.selfCheck.passed, false);
  assert.equal(malformedMath.selfCheck.issues.some((issue) => issue.code === "unbalanced_inline_math"), true);

  const longWithoutHeadings = runAiContentSelfCheck("正文 ".repeat(700));
  assert.equal(longWithoutHeadings.selfCheck.passed, false);
  assert.equal(longWithoutHeadings.selfCheck.issues.some((issue) => issue.code === "missing_heading"), true);

  const normalized = runAiContentSelfCheck("#标题\n\n正文");
  assert.equal(normalized.content.startsWith("# 标题"), true);
  assert.equal(normalized.selfCheck.passed, true);
});

test("AI 内容输入边界要求标题、正文和章节拆分", () => {
  assert.equal(validateAiContentInput("", "# 内容"), "请输入文章标题。");
  assert.equal(validateAiContentInput("标题", ""), "Markdown 正文不能为空。");
  assert.equal(validateAiContentInput("标题", "x".repeat(AI_CONTENT_MAX_CHARS + 1))?.includes("不能超过"), true);
  assert.equal(validateAiContentInput("标题", "# 内容"), null);
});

test("AI 讲义知识点快测先自检，公开投影不泄露答案，判分支持四种题型", () => {
  const checked = runAiKnowledgeQuizSelfCheck([
    {
      itemType: "single_choice",
      question: "需求定律通常表示什么关系？",
      options: [{ label: "A", text: "价格越高，需求量越低" }, { label: "B", text: "价格越高，需求量越高" }],
      answer: "A",
      explanation: "在其他条件不变时，价格与需求量通常反向变动。",
      knowledgePoints: ["需求定律"],
    },
    {
      itemType: "true_false",
      question: "供给曲线移动一定由自身价格变化引起。",
      answer: false,
      explanation: "自身价格变化通常表现为沿供给曲线移动，非价格因素才使曲线移动。",
      knowledgePoints: ["供给曲线"],
    },
  ]);
  assert.equal(checked.selfCheck.passed, true);
  assert.equal(checked.items.length, 2);
  assert.equal(answersEqual(checked.items[0].answer, "A"), true);
  assert.equal(answersEqual(checked.items[1].answer, "false"), true);

  const publicItem = toPublicAiKnowledgeQuizItem(checked.items[0]);
  assert.equal("answer" in publicItem, false);
  assert.equal("explanation" in publicItem, false);

  const invalid = runAiKnowledgeQuizSelfCheck([{
    itemType: "single_choice",
    question: "缺少答案对应选项",
    options: [{ label: "A", text: "选项" }, { label: "B", text: "另一个选项" }],
    answer: "C",
    explanation: "解析",
  }]);
  assert.equal(invalid.selfCheck.passed, false);
  assert.equal(invalid.selfCheck.issues.some((issue) => issue.code === "answer_option_missing"), true);
});

test("AI 审核批注绑定内容版本并按 UTF-16 选区校验引用文本", () => {
  const content = "# 价格\n\n需求曲线";
  const valid = validateReviewSelection({
    content,
    proposalContentVersion: 3,
    currentContentVersion: 3,
    selectionStart: 0,
    selectionEnd: 4,
    quotedText: "# 价格",
  });
  assert.equal(valid.ok, true);

  const stale = validateReviewSelection({
    content,
    proposalContentVersion: 2,
    currentContentVersion: 3,
    selectionStart: 0,
    selectionEnd: 2,
    quotedText: "# ",
  });
  assert.deepEqual(stale, { ok: false, status: 409, message: "内容已更新，请重新选择文字后再添加批注。" });

  const mismatchedQuote = validateReviewSelection({
    content,
    proposalContentVersion: 3,
    currentContentVersion: 3,
    selectionStart: 0,
    selectionEnd: 2,
    quotedText: "错误",
  });
  assert.equal(mismatchedQuote.ok, false);
  assert.equal(mismatchedQuote.status, 409);
});

test("LaTeX 规范化先收敛过度转义命令，再识别真正的矩阵换行", () => {
  assert.equal(normalizeLatexForKatex(String.raw`\\\\\\\\implies`), String.raw`\implies`);
  assert.equal(normalizeLatexForKatex(String.raw`\\\\Rightarrow`), String.raw`\Rightarrow`);
  assert.equal(normalizeLatexForKatex(String.raw`a \\\\ b`), String.raw`a \\ b`);
});

test("30 条生产历史 Markdown 难例保持哈希证据、幂等且高风险不自动改写", (context) => {
  const corpusPath = resolve(".local-backups/wp2-markdown-corpus/historical-cases.json");
  if (!existsSync(corpusPath)) {
    context.skip("本机未提供生产历史语料正文，仅运行仓库内契约样本");
    return;
  }

  const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
  assert.equal(corpus.cases.length, 30);

  for (const historicalCase of corpus.cases) {
    const actualHash = createHash("sha256").update(historicalCase.input).digest("hex");
    assert.equal(actualHash, historicalCase.inputSha256, historicalCase.caseId);

    const first = normalizeMarkdownSource(historicalCase.input, "migration");
    const second = normalizeMarkdownSource(first.normalized, "migration");
    assert.equal(first.normalized, second.normalized, `${historicalCase.caseId} 不幂等`);
    assert.notEqual(first.normalized.length, 0, `${historicalCase.caseId} 被清空`);
    if (first.requiresReview) {
      assert.equal(first.normalized, historicalCase.input, `${historicalCase.caseId} 高风险内容被自动改写`);
    }
  }
});

test("旧文章迁移支持单篇与整批 checksum 防误覆盖回退", () => {
  const snapshot = {
    noteId: "n1",
    fieldPath: "content",
    batchId: "b1",
    ruleVersion: "v1",
    beforeText: "#旧标题",
    afterText: "# 旧标题",
    beforeChecksum: "before",
    afterChecksum: "after",
    aiInvolved: false,
    requiresReview: false,
    status: "planned",
  };
  assert.deepEqual(canApplyContentMigration(snapshot, "before"), { ok: true });
  assert.equal(canApplyContentMigration(snapshot, "changed").reason, "source_changed");
  assert.equal(canApplyContentMigration({ ...snapshot, requiresReview: true }, "before").reason, "requires_review");

  const applied = { ...snapshot, status: "applied" };
  assert.deepEqual(rollbackContentMigration(applied, "after"), {
    restoredText: "#旧标题",
    nextStatus: "rolled_back",
  });
  assert.doesNotThrow(() => assertMigrationBatchRollbackSafe(
    [applied],
    new Map([["n1:content", "after"]]),
  ));
  assert.throws(() => rollbackContentMigration(applied, "new-edit"));
});

test("客户端任务账本可从刷新缓存恢复，并区分重试与结果领取状态", () => {
  const jobs = normalizeStoredJobs([{
    id: "j1",
    type: "document_ocr",
    class: "external",
    externalTaskId: "external-1",
    title: "讲义.pdf",
    status: "failed",
    phase: "查询中断",
    statusText: "可重试",
    createdAt: "2026-07-12T12:00:00.000Z",
    updatedAt: "2026-07-12T12:01:00.000Z",
    pollCount: 2,
  }, { broken: true }]);
  assert.equal(jobs.length, 1);
  assert.equal(canRetryClientJob(jobs[0]), true);
  assert.equal(getClientJobProgressLabel(jobs[0]), "处理失败");
  assert.equal(getClientJobProgressLabel({ ...jobs[0], status: "succeeded" }), "等待领取结果");
});

test("消息中心保留失败/取消终态三天，并持续保留进行中任务", () => {
  const now = Date.parse("2026-07-31T00:00:00.000Z");
  const jobs = normalizeStoredJobs([
    {
      id: "terminal-fresh",
      title: "新失败任务",
      status: "failed",
      updatedAt: "2026-07-29T00:00:00.000Z",
      createdAt: "2026-07-29T00:00:00.000Z",
    },
    {
      id: "terminal-expired",
      title: "旧取消任务",
      status: "cancelled",
      updatedAt: "2026-07-27T23:59:59.000Z",
      createdAt: "2026-07-27T23:59:59.000Z",
    },
    {
      id: "active",
      title: "进行中任务",
      status: "running",
      updatedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ]);
  const retained = removeExpiredClientJobs(jobs, now);
  assert.deepEqual(new Set(retained.map((job) => job.id)), new Set(["active", "terminal-fresh"]));
  assert.equal(getClientJobProgressLabel({ ...jobs[1], status: "cancelled" }), "任务已取消");
});

test("消息中心接入真实 AI 待审核提案并提供精确审核入口", () => {
  const center = readFileSync(resolve("components/jobs/JobCenter.tsx"), "utf8");
  const reviewEntry = readFileSync(resolve("components/tools/AdminReviewToolCard.tsx"), "utf8");
  assert.match(center, /content-review\?status=pending_review/);
  assert.match(center, /\/tools\/ai-review\?proposal=/);
  assert.match(center, /AI_REVIEW_QUEUE_CHANGED_EVENT/);
  assert.match(reviewEntry, /useAdminAuth/);
  assert.match(reviewEntry, /AI 内容审核/);
});

test("数据库任务账本恢复时按外部任务身份合并且远端状态优先", () => {
  const local = normalizeStoredJobs([{
    id: "local-1",
    type: "document_ocr",
    class: "external",
    provider: "baidu-unlimited-ocr",
    externalTaskId: "task-12345678",
    title: "本地讲义.pdf",
    status: "running",
    phase: "正在查询",
    statusText: "本机状态",
    createdAt: "2026-07-13T01:00:00.000Z",
    updatedAt: "2026-07-13T01:01:00.000Z",
    pollCount: 3,
  }]);
  const remote = normalizeRemoteJobRows([{
    id: "11111111-1111-4111-8111-111111111111",
    job_class: "external",
    job_kind: "document_ocr",
    status: "succeeded",
    title: "远端讲义.pdf",
    provider: "baidu-unlimited-ocr",
    external_task_id: "task-12345678",
    progress_current: 0,
    progress_total: 0,
    payload: { phase: "结果待领取" },
    result: { markdown: "# OCR 结果" },
    error: null,
    source_storage_path: "ocr-temp/source.pdf",
    heartbeat_at: "2026-07-13T01:02:00.000Z",
    claimed_at: null,
    created_at: "2026-07-13T01:00:00.000Z",
    updated_at: "2026-07-13T01:02:00.000Z",
  }]);

  const merged = mergeClientJobLedgers(local, remote);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "local-1");
  assert.equal(merged[0].remoteJobId, "11111111-1111-4111-8111-111111111111");
  assert.equal(merged[0].status, "succeeded");
  assert.equal(merged[0].resultMarkdown, "# OCR 结果");
  assert.equal(merged[0].pollCount, 3);
  assert.equal(merged[0].ledgerState, "synced");

  const hydratedResult = normalizeRemoteJobResult({ result: { markdown: "# OCR 结果", pageCount: 3 } });
  assert.equal(hydratedResult.resultMarkdown, "# OCR 结果");
  const storageCopy = prepareClientJobsForStorage(merged);
  assert.equal(storageCopy[0].resultMarkdown, undefined);
  assert.equal(storageCopy[0].resultPayload, undefined);
});

test("外部 OCR 任务账本不在列表批量下载正文且只在终态清理源引用", () => {
  const ledger = readFileSync(resolve("lib/server-job-ledger.ts"), "utf8");
  assert.equal(ledger.includes('.select("id, user_id, job_class, job_kind, status, title'), true);
  assert.equal(ledger.includes('job_kind, status, title, provider, external_task_id, progress_current'), true);
  assert.equal(ledger.includes('.eq("status", currentJob.status)'), true);
  assert.equal(ledger.includes('.in("status", ["succeeded", "failed", "stalled", "claimed", "cancelled"])'), true);
  assert.equal(ledger.includes("export async function cancelUserJob"), true);
  assert.equal(ledger.includes("export async function cleanupExpiredUserJobs"), true);
  assert.equal(ledger.includes('export async function getUserJobResult'), true);
});

test("题库 OCR 结果只接受连续分块、稳定聚合和当前用户私有源图路径", () => {
  const userId = "11111111-1111-1111-1111-111111111111";
  assert.equal(
    isOwnedProblemOcrAssetPath(
      `problem-ocr/${userId}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/01.jpg`,
      userId,
    ),
    true,
  );
  assert.equal(
    isOwnedProblemOcrAssetPath(
      "problem-ocr/22222222-2222-2222-2222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/01.jpg",
      userId,
    ),
    false,
  );
  assert.equal(isOwnedProblemOcrAssetPath(`problem-ocr/${userId}/../01.jpg`, userId), false);

  const firstProblem = materializeProblemOcrProblem({
    question: "若 $x=1$，求 $x+1$",
    answer: "2",
    type: "calculation",
    difficulty: "easy",
    suggestedChapter: "函数",
    confidence: 0.9,
  }, "若 x=1，求 x+1", [{ id: "chapter-1", name: "函数" }]);
  assert.equal(firstProblem?.chapterId, "chapter-1");

  const result = buildProblemOcrJobResult([
    {
      imageIndex: 1,
      imageCount: 2,
      imageName: "one.jpg",
      ocrText: "第一题",
      problems: firstProblem ? [firstProblem] : [],
      qwenModel: "qwen3.7-plus",
      deepseekModel: "deepseek-v4-flash",
      tokensUsed: 10,
    },
    {
      imageIndex: 2,
      imageCount: 2,
      imageName: "two.png",
      ocrText: "第二题",
      problems: [],
      warning: "答案不可见",
      qwenModel: "qwen-vl-ocr",
      deepseekModel: "deepseek-v4-flash",
      tokensUsed: 12,
    },
  ]);
  assert.equal(result.extractedProblems.length, 1);
  assert.equal(result.warnings.length, 1);
  assert.deepEqual(extractProblemOcrJobResult(result), result);
  assert.equal(extractProblemOcrJobResult({ ...result, completedImages: 1 }), null);
  assert.throws(() => buildProblemOcrJobResult([{ ...result.captures[0], imageIndex: 2, imageCount: 1 }]));
});

test("Qwen 题库 OCR 只对模型或配额类错误切换候选模型", async () => {
  const attemptedModels = [];
  const result = await recognizeProblemImage({
    apiKey: "test-key",
    model: "qwen3.7-plus",
    imageBase64: "ZmFrZQ==",
    mimeType: "image/jpeg",
  }, async (_apiKey, model) => {
    attemptedModels.push(model);
    if (attemptedModels.length === 1) throw new Error("quota exceeded");
    return { text: "已知 $x=1$，求 $x+1$" };
  });
  assert.equal(attemptedModels.length, 2);
  assert.equal(result.model, attemptedModels[1]);

  const networkAttempts = [];
  await assert.rejects(() => recognizeProblemImage({
    apiKey: "test-key",
    model: "qwen3.7-plus",
    imageBase64: "ZmFrZQ==",
    mimeType: "image/jpeg",
  }, async (_apiKey, model) => {
    networkAttempts.push(model);
    throw new Error("network timeout");
  }));
  assert.equal(networkAttempts.length, 1);
});

test("DeepSeek 题目分析覆盖多题、JSON 修复、空结果补救与 OCR 低置信度兜底", async () => {
  const multi = await analyzeProblemOcrText({
    apiKey: "test-key",
    model: "deepseek-v4-flash",
    ocrText: "1. 选择题 A.1 B.2\n2. 求积分",
    chapterContext: ["函数", "积分"],
  }, async () => ({
    content: JSON.stringify({ problems: [
      { question: "选择 $1+1$", answer: "B", type: "choice", options: [{ label: "A", content: "1" }, { label: "B", content: "2" }], confidence: 0.9 },
      { question: "求 $\\int_0^1 x dx$", answer: "$1/2$", type: "calculation", confidence: 0.8 },
    ] }),
    tokensUsed: 20,
  }));
  assert.equal(multi.problems.length, 2);
  assert.equal(multi.problems[0].options?.length, 2);
  assert.equal(multi.extractionMode, "primary");

  let repairCall = 0;
  const repaired = await analyzeProblemOcrText({
    apiKey: "test-key",
    model: "deepseek-v4-flash",
    ocrText: "已知 $x=1$，求 $x+1$",
  }, async () => {
    repairCall += 1;
    return repairCall === 1
      ? { content: "{broken", tokensUsed: 3 }
      : { content: JSON.stringify({ problems: [{ question: "求 $x+1$", answer: "2", type: "calculation", confidence: 0.7 }] }), tokensUsed: 4 };
  });
  assert.equal(repaired.problems.length, 1);
  assert.equal(repaired.tokensUsed, 7);

  let rescueCall = 0;
  const rescued = await analyzeProblemOcrText({
    apiKey: "test-key",
    model: "deepseek-v4-flash",
    ocrText: "已知函数 $f(x)=x^2$，求导数",
  }, async () => {
    rescueCall += 1;
    return rescueCall === 1
      ? { content: '{"problems":[]}', tokensUsed: 2 }
      : { content: JSON.stringify({ problems: [{ question: "已知 $f(x)=x^2$，求导数", answer: "$2x$", type: "calculation", confidence: 0.4 }] }), tokensUsed: 5 };
  });
  assert.equal(rescued.extractionMode, "rescue");
  assert.equal(rescued.tokensUsed, 7);

  const fallback = await analyzeProblemOcrText({
    apiKey: "test-key",
    model: "deepseek-v4-flash",
    ocrText: "计算 $\\int_0^1 x^2 dx$",
  }, async () => ({ content: '{"problems":[]}', tokensUsed: 1 }));
  assert.equal(fallback.extractionMode, "ocrFallback");
  assert.equal(fallback.problems.length, 1);
  assert.equal(fallback.problems[0].confidence, 0.25);
});

test("主题跟随北京日出日落，并允许恒亮与恒暗覆盖", () => {
  const summer = getBeijingSolarHours(new Date("2026-06-21T04:00:00.000Z"));
  const winter = getBeijingSolarHours(new Date("2026-12-21T04:00:00.000Z"));
  assert.equal(summer.sunriseHour > 4 && summer.sunriseHour < 6, true);
  assert.equal(summer.sunsetHour > 18.5 && summer.sunsetHour < 20.5, true);
  assert.equal(winter.sunriseHour > 6.5 && winter.sunriseHour < 8.5, true);
  assert.equal(winter.sunsetHour > 15.5 && winter.sunsetHour < 18, true);
  assert.equal(resolveTheme("follow", new Date("2026-06-21T04:00:00.000Z")), "light");
  assert.equal(resolveTheme("follow", new Date("2026-06-21T16:00:00.000Z")), "dark");
  assert.equal(resolveTheme("light", new Date("2026-06-21T16:00:00.000Z")), "light");
  assert.equal(resolveTheme("dark", new Date("2026-06-21T04:00:00.000Z")), "dark");
});

test("英语三轮历史：草稿不造 revision、开启下一轮封存、第三轮仍可纠正", () => {
  let ledger = createEmptyEnglishLedger("p1", "2026-07-13T01:00:00.000Z");
  ledger = saveEnglishRoundDraft(ledger, 1, { q1: "A" }, "2026-07-13T01:01:00.000Z");
  assert.equal(getEnglishRound(ledger, 1)?.revisions.length, 0);
  ledger = submitEnglishRoundRevision(ledger, 1, {
    answers: { q1: "A" }, score: 2, maxScore: 2, gradeOrigin: "system_scored", now: "2026-07-13T01:02:00.000Z",
  });
  ledger = startNextEnglishRound(ledger, "2026-07-13T01:03:00.000Z");
  assert.equal(getEnglishRound(ledger, 1)?.status, "sealed");
  ledger = submitEnglishRoundRevision(ledger, 2, {
    answers: { q1: "B" }, score: 0, maxScore: 2, gradeOrigin: "system_scored", now: "2026-07-13T01:04:00.000Z",
  });
  ledger = startNextEnglishRound(ledger, "2026-07-13T01:05:00.000Z");
  ledger = submitEnglishRoundRevision(ledger, 3, {
    answers: { q1: "A" }, score: 2, maxScore: 2, gradeOrigin: "system_scored", now: "2026-07-13T01:06:00.000Z",
  });
  ledger = submitEnglishRoundRevision(ledger, 3, {
    answers: { q1: "B" }, score: 0, maxScore: 2, gradeOrigin: "system_scored", now: "2026-07-13T01:07:00.000Z",
  });
  const latest = getLatestEnglishRoundRevision(getEnglishRound(ledger, 3));
  assert.equal(latest?.revisionNo, 2);
  assert.equal(latest?.kind, "correction");
  assert.equal(getEnglishRound(ledger, 3)?.revisions[0].score, 2);
});

test("英语旧数据 dry-run 保留 legacy 分并只为客观题追加 system score", () => {
  const plan = planEnglishTrainingBackfill({
    passages: [
      { id: "p1", section: "reading" },
      { id: "p2", section: "writing" },
    ],
    questions: [
      { id: "q1", passageId: "p1", standardAnswer: "A", score: 2 },
      { id: "q2", passageId: "p1", standardAnswer: "B", score: 2 },
      { id: "q3", passageId: "p2", standardAnswer: "", score: 10 },
    ],
    attempts: [
      { id: "a1", userId: "u1", passageId: "p1", status: "submitted", score: 2, maxScore: 4, createdAt: "2026-01-01", updatedAt: "2026-01-02" },
      { id: "a2", userId: "u1", passageId: "p2", status: "in_progress", score: 0, maxScore: 10, createdAt: "2026-01-01", updatedAt: "2026-01-02" },
      { id: "a3", userId: "u2", passageId: "p2", status: "submitted", score: 7, maxScore: 10, createdAt: "2026-01-01", updatedAt: "2026-01-02" },
      { id: "a4", userId: "u2", passageId: "missing", status: "submitted", score: 0, maxScore: 1, createdAt: "2026-01-01", updatedAt: "2026-01-02" },
    ],
    answers: [
      { id: "r1", attemptId: "a1", questionId: "q1", answer: "A", score: 2, createdAt: "2026-01-01", updatedAt: "2026-01-02" },
      { id: "r2", attemptId: "a1", questionId: "q2", answer: "C", score: 0, createdAt: "2026-01-01", updatedAt: "2026-01-02" },
      { id: "r3", attemptId: "a2", questionId: "q3", answer: "draft", score: 0, createdAt: "2026-01-01", updatedAt: "2026-01-02" },
      { id: "r4", attemptId: "a3", questionId: "q3", answer: "essay", score: 7, createdAt: "2026-01-01", updatedAt: "2026-01-02" },
      { id: "orphan", attemptId: "missing", questionId: "q1", answer: "A", score: 0, createdAt: "2026-01-01", updatedAt: "2026-01-02" },
    ],
  });

  assert.deepEqual(plan.insertCounts, {
    attempts: 3,
    revisions: 2,
    legacyGrades: 2,
    systemGrades: 1,
  });
  assert.equal(plan.attempts.find((attempt) => attempt.sourceAttemptId === "a2")?.draftPayload.answers.q3, "draft");
  assert.equal(plan.attempts.find((attempt) => attempt.sourceAttemptId === "a3")?.grades.some((grade) => grade.origin === "system_scored"), false);
  assert.deepEqual(plan.conflicts.map((conflict) => conflict.kind).sort(), ["orphan_answer_attempt", "orphan_attempt_passage"]);
  assert.equal(plan.recomputedScoreDifferences.length, 0);
});

test("数学 OCR 必须先确认再评分，重识别后旧评分不冒充当前结果", () => {
  let page = { id: "p1", fileName: "answer-1.jpg", ocrRevisions: [], gradeRevisions: [] };
  page = appendMathPaperOcrRevision(page, { sourceFingerprint: "sha256-a", rawText: "解：x=1", now: "2026-07-13T02:00:00.000Z" });
  assert.equal(canGradeMathPaperOcrPage(page), false);
  assert.throws(() => appendMathPaperGradeRevision(page, {
    origin: "ai_suggested", score: 8, maxScore: 10, feedback: "建议", createdAt: "2026-07-13T02:01:00.000Z",
  }));
  page = confirmMathPaperOcrRevision(page, page.ocrRevisions[0].id, "解：x=1", "2026-07-13T02:02:00.000Z");
  page = appendMathPaperGradeRevision(page, {
    origin: "ai_suggested", score: 8, maxScore: 10, feedback: "建议", createdAt: "2026-07-13T02:03:00.000Z",
  });
  page = appendMathPaperGradeRevision(page, {
    origin: "user_final", score: 9, maxScore: 10, feedback: "人工确认", createdAt: "2026-07-13T02:04:00.000Z",
  });
  assert.equal(getEffectiveMathPaperGrade(page)?.score, 9);
  page = appendMathPaperOcrRevision(page, { sourceFingerprint: "sha256-b", rawText: "解：x=2", now: "2026-07-13T02:05:00.000Z" });
  assert.equal(canGradeMathPaperOcrPage(page), false);
  assert.equal(getEffectiveMathPaperGrade(page), undefined);
  assert.equal(page.gradeRevisions.length, 2);
});

test("数学整套确认载荷按页排序且拒绝缺失人工确认文本", () => {
  const payload = buildMathOcrConfirmationPayload([
    { pageNo: 2, fileName: "b.jpg", sourceFingerprint: "b", rawText: "raw-b", confirmedText: "confirmed-b" },
    { pageNo: 1, fileName: "a.jpg", sourceFingerprint: "a", rawText: "raw-a", confirmedText: "confirmed-a" },
  ]);
  assert.deepEqual(payload.rawPayload.pages.map((page) => page.pageNo), [1, 2]);
  assert.deepEqual(payload.confirmedPayload.pages.map((page) => page.text), ["confirmed-a", "confirmed-b"]);
  assert.throws(() => buildMathOcrConfirmationPayload([
    { pageNo: 1, fileName: "a.jpg", sourceFingerprint: "a", rawText: "raw-a", confirmedText: "" },
  ]));
});

test("数学 AI 建议分必须逐题覆盖固定满分并由步骤合计派生", () => {
  const problems = [
    { problemId: "p1", problemNo: 1, prompt: "Q1", standardAnswer: "A1", scoringRubric: [], maxScore: 5 },
    { problemId: "p2", problemNo: 2, prompt: "Q2", standardAnswer: "A2", scoringRubric: [], maxScore: 5 },
  ];
  const suggestion = normalizeMathGradeSuggestion({
    feedback: "需要人工核对",
    confidence: 0.8,
    steps: [
      { problemId: "p1", criterion: "列式", earnedScore: 4, maxScore: 5, deductionReason: "符号" },
      { problemId: "p2", criterion: "论证", earnedScore: 3.5, maxScore: 5, deductionReason: "略写" },
    ],
  }, problems);
  assert.equal(suggestion.score, 7.5);
  assert.equal(suggestion.maxScore, 10);
  assert.throws(() => normalizeMathGradeSuggestion({
    feedback: "缺题",
    steps: [{ problemId: "p1", criterion: "列式", earnedScore: 4, maxScore: 5 }],
  }, problems));
});

test("做题本共享清单记录源版本与 SHA-256，快照 checksum 只覆盖不可变区", async () => {
  const snapshot = {
    sourceNoteId: "n1",
    sourceProblemId: "p1",
    sourceContentVersion: 3,
    sourceLabel: "A",
    question: "Q",
    standardAnswer: "A",
    explanation: "E",
    methodSummary: "M",
  };
  const sourceChecksum = await calculateBookletProblemSha256(snapshot);
  const markdown = buildBookletNoteMarkdown([{ ...snapshot, sourceChecksum }]);
  assert.deepEqual(buildBookletSourceManifest([{ ...snapshot, sourceChecksum }]), [{
    sourceNoteId: "n1",
    sourceProblemId: "p1",
    sourceContentVersion: 3,
    checksum: sourceChecksum,
  }]);
  const snapshotRegion = extractBookletSnapshot(markdown);
  assert.equal(await calculateBookletMarkdownSnapshotSha256(markdown), createHash("sha256").update(snapshotRegion).digest("hex"));
});

test("WP6 数据迁移同时约束 confirmation、逐步评分、三轮门和做题本单一正文", () => {
  const migration = readFileSync(resolve("supabase/migrations/0019_math_training_and_booklet_core.sql"), "utf8");
  assert.match(migration, /source_kind in \('english_passage', 'note_problem', 'math_paper'\)/i);
  assert.match(migration, /create table public\.ocr_confirmations/i);
  assert.match(migration, /scoring_mode = 'math' and confirmation_id is not null/i);
  assert.match(migration, /Math grade must bind the latest OCR confirmation/i);
  assert.match(migration, /grade\.origin = 'user_final'[\s\S]*confirmation\.confirmation_version/i);
  assert.match(migration, /create table public\.math_grade_steps/i);
  assert.match(migration, /create table public\.booklets/i);
  assert.match(migration, /Metadata only; the private note remains the single booklet body source of truth/i);
  assert.doesNotMatch(migration, /\b(?:delete\s+from|truncate\s+table|drop\s+table)\b/i);
});

test("AI 记忆必须先成为候选并由用户明确接受", () => {
  const candidate = createAssistantMemoryCandidate("我只刷三轮。", "训练偏好", "/tools/english-training", "2026-07-13T03:00:00.000Z");
  assert.equal(buildAcceptedMemoryContext([candidate]), "");
  const accepted = decideAssistantMemory(candidate, "accepted", "2026-07-13T03:01:00.000Z");
  assert.equal(buildAcceptedMemoryContext([accepted]), "M1. 我只刷三轮。");
  assert.throws(() => decideAssistantMemory(accepted, "rejected", "2026-07-13T03:02:00.000Z"));
});

test("模型路由按任务分层且不虚构未接入供应商", () => {
  assert.deepEqual(resolveAIProviderRoute("deep_reasoning"), {
    provider: "deepseek", model: "deepseek-v4-pro", reason: "复杂推理与经济学串联优先质量",
  });
  assert.equal(resolveAIProviderRoute("vision_ocr").provider, "qwen");
  assert.equal(resolveAIProviderRoute("fast_retrieval").model, "deepseek-v4-flash");
});

test("RAG 同 checksum 不重建，变更时只创建下一 source version", () => {
  const versions = [{ id: "v1", sourceDocumentId: "n1", versionNo: 1, checksum: "old" }];
  assert.equal(planRagSourceSync("n1", versions, versions[0], "old", "正文").action, "unchanged");
  assert.deepEqual(planRagSourceSync("n1", versions, versions[0], "new", "a".repeat(1200)), {
    sourceDocumentId: "n1",
    action: "create_version",
    nextVersionNo: 2,
    checksum: "new",
    chunkCount: 2,
  });
  assert.throws(() => splitRagSourceText("正文", 100, 20));
});

test("RAG token-hash 向量本地确定、归一且固定 256 维", () => {
  const first = buildTokenHashVector("需求曲线 demand curve 向右移动");
  const repeated = buildTokenHashVector("需求曲线 demand curve 向右移动");
  const different = buildTokenHashVector("供给弹性 supply elasticity");
  assert.equal(first.length, 256);
  assert.deepEqual(first, repeated);
  assert.notDeepEqual(first, different);
  const norm = Math.sqrt(first.reduce((sum, value) => sum + value * value, 0));
  assert.ok(Math.abs(norm - 1) < 1e-6);
  assert.match(toPgVectorLiteral(first), /^\[[\d,.-]+\]$/);
  assert.throws(() => toPgVectorLiteral([1, 2, 3]));
});

test("WP7 迁移只检索当前来源版本并持久化待确认记忆", () => {
  const migration = readFileSync(resolve("supabase/migrations/0021_private_note_rag_and_memory.sql"), "utf8");
  const operatorFix = readFileSync(resolve("supabase/migrations/0022_private_note_rag_operator_fix.sql"), "utf8");
  assert.match(migration, /create extension if not exists vector with schema extensions/i);
  assert.match(migration, /create table public\.rag_chunks/i);
  assert.match(migration, /using hnsw \(embedding extensions\.vector_cosine_ops\)/i);
  assert.match(migration, /using gin \(search_vector\)/i);
  assert.match(migration, /document\.current_version_id = version\.id/i);
  assert.match(migration, /create trigger reject_rag_chunk_mutation/i);
  assert.match(migration, /create table public\.memory_candidates/i);
  assert.match(migration, /status in \('proposed', 'accepted', 'rejected'\)/i);
  assert.match(migration, /create or replace function public\.sync_private_note_rag/i);
  assert.match(migration, /create or replace function public\.search_private_note_rag/i);
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /force row level security/i);
  assert.doesNotMatch(migration, /\b(?:delete\s+from|truncate\s+table|drop\s+table)\b/i);
  assert.match(operatorFix, /OPERATOR\(extensions\.<=>\)/i);
  assert.match(operatorFix, /security definer\s+set search_path = ''/i);
  assert.doesNotMatch(operatorFix, /\b(?:delete\s+from|truncate\s+table|drop\s+table)\b/i);
});

test("私人笔记问答查询必须携带用户 JWT 通过 RLS", () => {
  const route = readFileSync(resolve("app/api/ai/note-qa/route.ts"), "utf8");
  const auth = readFileSync(resolve("lib/server-admin-auth.ts"), "utf8");
  assert.equal(route.includes("getAdminRequestContext(req)"), true);
  assert.equal(route.includes("syncPrivateNotesRag"), true);
  assert.equal(route.includes("searchPrivateNoteRag"), true);
  assert.equal(route.includes("listAssistantMemories"), true);
  assert.equal(route.includes("record.memoryContext"), false);
  assert.equal(route.includes("notesApi.getQuestionAnswerSources"), false);
  assert.equal(auth.includes("global: { headers: { Authorization: `Bearer ${token}` } }"), true);
});

test("助手记忆只经服务端持久化并由用户决定", () => {
  const dock = readFileSync(resolve("components/ai-assistant/AssistantDock.tsx"), "utf8");
  const route = readFileSync(resolve("app/api/assistant/memories/route.ts"), "utf8");
  assert.equal(dock.includes('fetch("/api/assistant/memories"'), true);
  assert.equal(dock.includes("ASSISTANT_CONVERSATION_STORAGE_PREFIX"), true);
  assert.equal(dock.includes("memoryStorage"), false);
  assert.equal(route.includes("getAdminRequestContext(req)"), true);
  assert.equal(route.includes("proposeAssistantMemory"), true);
  assert.equal(route.includes("decideAssistantMemoryServer"), true);
});

test("连续对话只保留有限上下文并拒绝无效角色", () => {
  const contract = readFileSync(resolve("lib/note-qa.ts"), "utf8");
  const route = readFileSync(resolve("app/api/ai/note-qa/route.ts"), "utf8");
  assert.match(contract, /MAX_CONVERSATION_TURNS = 10/);
  assert.match(contract, /candidate\.role !== "user" && candidate\.role !== "assistant"/);
  assert.match(contract, /MAX_CONVERSATION_CHARS = 6_000/);
  assert.match(route, /normalizeNoteQAConversation\(record\.conversation\)/);
  assert.match(route, /仅用于理解追问指代，不能替代笔记证据/);
});

test("管理员运行时真源是 admin_users 而不是环境邮箱名单", () => {
  const auth = readFileSync(resolve("lib/server-admin-auth.ts"), "utf8");
  assert.equal(auth.includes('.from("admin_users")'), true);
  assert.equal(auth.includes("createAuthenticatedServerClient(req)"), true);
  assert.equal(auth.includes("ADMIN_EMAILS"), false);
  assert.equal(auth.includes("isServerAdminEmail"), false);
});

test("WP1-C 迁移保持存量 notes 且延期数学来源", () => {
  const privateDefault = readFileSync(resolve("supabase/migrations/0012_private_note_default.sql"), "utf8");
  const training = readFileSync(resolve("supabase/migrations/0010_training_event_core.sql"), "utf8");
  assert.match(privateDefault, /alter column is_published set default false/i);
  assert.doesNotMatch(privateDefault, /update\s+public\.notes/i);
  assert.match(training, /source_kind in \('english_passage', 'note_problem'\)/);
  assert.equal(training.includes("math_paper_id"), false);
});

test("英语客观题由可信共享逻辑评分且主观题拒绝 system score", () => {
  const result = scoreEnglishObjectiveAnswers("reading", [
    { id: "q1", standardAnswer: "A", score: 2 },
    { id: "q2", standardAnswer: "Ｂ", score: 2 },
  ], { q1: "a", q2: "C" });
  assert.deepEqual(result, {
    grades: [
      { questionId: "q1", isCorrect: true, score: 2 },
      { questionId: "q2", isCorrect: false, score: 0 },
    ],
    score: 2,
    maxScore: 4,
  });
  const manuallyRecorded = scoreEnglishObjectiveAnswers("reading", [
    { id: "q1", standardAnswer: "A", score: 2 },
    { id: "q2", standardAnswer: "B", score: 2 },
  ], { q1: encodeEnglishManualScore(1.5), q2: encodeEnglishManualScore(0) });
  assert.deepEqual(manuallyRecorded, {
    grades: [
      { questionId: "q1", isManual: true, score: 1.5 },
      { questionId: "q2", isManual: true, score: 0 },
    ],
    score: 1.5,
    maxScore: 4,
  });
  assert.throws(() => scoreEnglishObjectiveAnswers("translation", [], {}));
  const client = readFileSync(resolve("lib/english-training-api.ts"), "utf8");
  assert.equal(client.includes('fetch("/api/english/attempt"'), true);
  assert.equal(client.includes("getQuestionScore("), false);
});

test("英语共享训练核优先正式重评分并完整恢复跨设备三轮账本", () => {
  const ledgers = mapEnglishTrainingCoreRows([
    {
      id: "attempt-r1",
      english_passage_id: "passage-1",
      round: 1,
      status: "sealed",
      draft_payload: {},
      started_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-02T00:00:00.000Z",
      attempt_revisions: [{
        id: "revision-r1",
        revision_no: 1,
        kind: "submission",
        response_payload: { answers: { q1: "A" } },
        created_at: "2026-07-01T01:00:00.000Z",
        grades: [
          { id: "grade-legacy", origin: "legacy_imported", grade_seq: 1, score: 0, max_score: 2, created_at: "2026-07-01T01:00:00.000Z" },
          { id: "grade-system", origin: "system_scored", grade_seq: 1, score: 2, max_score: 2, created_at: "2026-07-01T01:00:01.000Z" },
        ],
      }],
    },
    {
      id: "attempt-r2",
      english_passage_id: "passage-1",
      round: 2,
      status: "in_progress",
      draft_payload: { answers: { q1: "B" } },
      started_at: "2026-07-02T00:00:00.000Z",
      updated_at: "2026-07-03T00:00:00.000Z",
      attempt_revisions: [],
    },
  ]);

  assert.equal(ledgers.length, 1);
  assert.equal(ledgers[0].rounds.length, 2);
  assert.equal(ledgers[0].rounds[0].revisions[0].gradeOrigin, "system_scored");
  assert.equal(ledgers[0].rounds[0].revisions[0].score, 2);
  assert.deepEqual(ledgers[0].rounds[1].draftAnswers, { q1: "B" });
});

test("英语共享模式切换会阻止静默丢失仅存在于本机的轮次", () => {
  const baseRound = {
    round: 1,
    status: "submitted",
    startedAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T01:00:00.000Z",
    draftAnswers: {},
    revisions: [{
      id: "local-r1",
      revisionNo: 1,
      kind: "submission",
      answers: { q1: "A" },
      score: 0,
      maxScore: 2,
      gradeOrigin: "legacy_imported",
      createdAt: "2026-07-01T01:00:00.000Z",
    }],
  };
  const local = [{
    passageId: "p1",
    updatedAt: "2026-07-02T00:00:00.000Z",
    rounds: [baseRound, {
      ...baseRound,
      round: 2,
      status: "in_progress",
      draftAnswers: { q1: "B" },
      revisions: [],
    }],
  }];
  const shared = [{
    passageId: "p1",
    updatedAt: "2026-07-01T01:00:00.000Z",
    rounds: [{
      ...baseRound,
      revisions: [{ ...baseRound.revisions[0], id: "shared-r1", score: 2, gradeOrigin: "system_scored" }],
    }],
  }];

  assert.deepEqual(findUnreconciledEnglishLocalHistory(local, shared), [{
    passageId: "p1",
    round: 2,
    reason: "missing_round",
  }]);
});

test("英语原子命令具有固定所有者边界、幂等键和显式兼容投影开关", () => {
  const migration = readFileSync(resolve("supabase/migrations/0017_english_training_command_rpc.sql"), "utf8");
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /where revision\.id = p_command_id/i);
  assert.match(migration, /p_write_legacy boolean/i);
  assert.match(migration, /p_round not between 1 and 3/i);
  assert.doesNotMatch(migration, /\b(?:delete|truncate|drop table)\b/i);
});

test("英语主观题 AI 建议会被限幅且必须经 user_final 才能进入下一轮", () => {
  const suggestion = normalizeEnglishSubjectiveGradeSuggestion({
    score: 99,
    feedback: "需要人工确认",
    strengths: ["结构清楚"],
    issues: ["语法错误"],
    suggestions: ["重写第二句"],
    confidence: 2,
  }, 10);
  assert.equal(suggestion.score, 10);
  assert.equal(suggestion.confidence, 1);

  const migration = readFileSync(resolve("supabase/migrations/0018_english_subjective_grade_rpc.sql"), "utf8");
  assert.match(migration, /record_english_subjective_submission/i);
  assert.match(migration, /confirm_english_subjective_grade/i);
  assert.match(migration, /grade\.origin in \('system_scored', 'user_final', 'legacy_imported'\)/i);
  assert.match(migration, /Previous round requires a formal grade/i);
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.doesNotMatch(migration, /\b(?:delete|truncate|drop table)\b/i);
});

test("学习助手入口只对已确认管理员渲染", () => {
  const dock = readFileSync(resolve("components/ai-assistant/AssistantDock.tsx"), "utf8");
  assert.equal(dock.includes("useAdminAuth()"), true);
  assert.equal(dock.includes("if (authLoading || !isAdmin || !noteId || !open) return null"), true);
});

test("管理员缓存不参与首帧渲染，避免登录导航产生水合分叉", () => {
  const authHook = readFileSync(resolve("hooks/useAdminAuth.ts"), "utf8");
  assert.equal(
    authHook.includes("useState<AdminAuthState>(() =>"),
    false,
  );
  assert.match(
    authHook,
    /useState<AdminAuthState>\(\{\s*loading: true,\s*user: null,\s*isAdmin: false,/,
  );
  assert.match(authHook, /function resolveAdminState[\s\S]*readCachedAdminAuthForUser\(user\)/);
  assert.match(authHook, /if \(!cached\.isAdmin\) \{[\s\S]*removeStorage\(cacheKey\)/);
  assert.match(authHook, /function writeCachedAdminAuth[\s\S]*if \(!isAdmin\) \{[\s\S]*removeStorage\(cacheKey\)/);
});

test("四个 AI 学科账号使用稳定且互不相同的持久会话槽", () => {
  assert.deepEqual(AI_ACCOUNT_SLOTS, ["math", "english", "politics", "economics"]);
  const keys = AI_ACCOUNT_SLOTS.map((slot) => (
    getAiAccountAuthStorageKey("https://example-ref.supabase.co", slot)
  ));
  assert.equal(new Set(keys).size, AI_ACCOUNT_SLOTS.length);
  assert.equal(keys.every((key) => key.startsWith("asteroid-example-ref-auth-")), true);

  for (const slot of AI_ACCOUNT_SLOTS) {
    const config = AI_ACCOUNT_SLOT_CONFIG[slot];
    assert.equal(normalizeAiAccountSlot(slot), slot);
    assert.equal(getAiAccountSlotForEmail(config.email.toUpperCase()), slot);
    assert.equal(isExpectedAiAccountEmail(slot, ` ${config.email} `), true);
    assert.equal(getAiAccountSlotPath("/tools/ai-content", slot), `/tools/ai-content?account=${slot}`);
    assert.equal(doesAiProfileMatchSlot(slot, { subject: slot, account_key: slot }), true);
    assert.equal(doesAiProfileMatchSlot(slot, { subject: slot, account_key: "other" }), false);
  }
  assert.equal(normalizeAiAccountSlot("admin"), null);
  assert.equal(getAiAccountSlotForEmail("owner@example.com"), null);
  assert.equal(getAiAccountSlotPath("/login", null), "/login");
});

test("当前标签页槽位从 URL 初始化、跨站内导航保留并可独立清理", () => {
  const previousWindow = globalThis.window;
  const values = new Map();
  const fakeWindow = {
    location: { search: "?account=math" },
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: fakeWindow,
  });

  try {
    assert.equal(getActiveAiAccountSlot(), "math");
    fakeWindow.location.search = "";
    assert.equal(getActiveAiAccountSlot(), "math");
    clearActiveAiAccountSlot();
    assert.equal(getActiveAiAccountSlot(), null);
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        writable: true,
        value: previousWindow,
      });
    }
  }
});

test("登录页和 Supabase client 强制执行管理员与学科会话隔离", () => {
  const slotContract = readFileSync(resolve("lib/auth-session-slot.ts"), "utf8");
  const supabaseClient = readFileSync(resolve("lib/supabase.ts"), "utf8");
  const authHook = readFileSync(resolve("hooks/useAdminAuth.ts"), "utf8");
  const workspaceHook = readFileSync(resolve("hooks/useAiContentWorkspace.ts"), "utf8");
  const login = readFileSync(resolve("app/login/page.tsx"), "utf8");

  assert.match(slotContract, /window\.sessionStorage\.setItem\(ACTIVE_AI_ACCOUNT_SLOT_SESSION_KEY, querySlot\)/);
  assert.match(supabaseClient, /storageKey: getAiAccountAuthStorageKey\(supabaseUrl, activeSlot\)/);
  assert.match(supabaseClient, /persistSession: true/);
  assert.match(supabaseClient, /autoRefreshToken: true/);
  assert.match(authHook, /if \(aiAccountSlot\) \{[\s\S]*isAdmin: false/);
  assert.match(workspaceHook, /if \(!activeSlot\)[\s\S]*doesAiProfileMatchSlot\(activeSlot, record\.profile\)/);
  assert.match(login, /getAiAccountSlotForEmail\(normalizedEmail\)/);
  assert.match(login, /doesAiProfileMatchSlot\(accountSlot, profile\)/);
  assert.match(login, /router\.push\(getAiAccountSlotPath\("\/tools\/ai-content", accountSlot\)\)/);
});

test("设置页为管理员和 AI 学科账号提供本地退出并清空客户端状态", () => {
  const settings = readFileSync(resolve("components/layout/SettingsPanel.tsx"), "utf8");
  const login = readFileSync(resolve("app/login/page.tsx"), "utf8");
  assert.match(settings, /const \{ loading: authLoading, user, isAdmin \} = useAdminAuth\(\)/);
  assert.match(settings, /auth\.signOut\(\{ scope: "local" \}\)/);
  assert.match(settings, /clearActiveAiAccountSlot\(\)/);
  assert.match(settings, /window\.location\.href = "\/"/);
  assert.match(settings, /退出登录/);
  assert.match(login, /auth\.signOut\(\{ scope: "local" \}\)/);
  assert.match(login, /clearActiveAiAccountSlot\(\)/);
});

test("首页核心规划不再依赖 IntersectionObserver 才挂载", () => {
  const deferred = readFileSync(resolve("components/home/StudyTimelineDeferred.tsx"), "utf8");
  assert.equal(deferred.includes("IntersectionObserver"), false);
  assert.equal(deferred.includes("return <StudyTimeline />"), true);
});

test("首页规划首帧不读取 localStorage，避免服务端与客户端水合状态分叉", () => {
  const timeline = readFileSync(resolve("components/home/StudyTimeline.tsx"), "utf8");
  assert.equal(
    timeline.includes("useState<TimelineTaskStatusMap>(() => readStoredTaskStatuses())"),
    false,
  );
  assert.equal(
    timeline.includes("useState<TimelineTaskStatusMap>({})"),
    true,
  );
  assert.match(timeline, /useEffect\(\(\) => \{[\s\S]*const localStatuses = readStoredTaskStatuses\(\)/);
});

test("旧助手工具 URL 只保留笔记库兼容跳转且不再维护重复页面", () => {
  const noteQaCompatibilityPage = readFileSync(resolve("app/tools/note-qa/page.tsx"), "utf8");
  const resourceSearchCompatibilityPage = readFileSync(resolve("app/tools/resource-search/page.tsx"), "utf8");
  assert.equal(noteQaCompatibilityPage.includes('redirect("/notes")'), true);
  assert.equal(resourceSearchCompatibilityPage.includes('redirect("/notes")'), true);
  assert.equal(existsSync(resolve("components/tools/NoteQA.tsx")), false);
});

test("数学答题纸 OCR 页面要求管理员身份", () => {
  const page = readFileSync(resolve("app/tools/math-paper-ocr/page.tsx"), "utf8");
  assert.equal(page.includes('import { AdminGate } from "@/components/auth/AdminGate"'), true);
  assert.equal(page.includes("<AdminGate>"), true);
});

test("所有现有写入型 Route Handler 都先验证管理员身份", () => {
  const mutationRoutes = [
    "app/api/english/attempt/route.ts",
    "app/api/ai/analyze/route.ts",
    "app/api/ai/config/route.ts",
    "app/api/ai/document-markdown-review/route.ts",
    "app/api/ai/document-ocr/route.ts",
    "app/api/ai/english-subjective-grade/route.ts",
    "app/api/ai/economics-graph/route.ts",
    "app/api/ai/math3-classify/route.ts",
    "app/api/ai/math3-self-test/generate/route.ts",
    "app/api/ai/math3-self-test/grade-step/route.ts",
    "app/api/ai/note-qa/route.ts",
    "app/api/ai/ocr/route.ts",
    "app/api/jobs/[id]/claim/route.ts",
    "app/api/jobs/[id]/cancel/route.ts",
    "app/api/jobs/[id]/advance/route.ts",
    "app/api/jobs/[id]/retry/route.ts",
    "app/api/jobs/[id]/source/route.ts",
    "app/api/jobs/markdown-review/route.ts",
    "app/api/jobs/problem-ocr/route.ts",
    "app/api/english/subjective/route.ts",
    "app/api/math/attempt/route.ts",
    "app/api/math/grade/route.ts",
    "app/api/booklets/route.ts",
    "app/api/ai/math-paper-grade/route.ts",
  ];

  for (const routePath of mutationRoutes) {
    const route = readFileSync(resolve(routePath), "utf8");
    assert.equal(
      route.includes("requireAdminRequest(req)") || route.includes("getAdminRequestContext(req)"),
      true,
      routePath,
    );
  }
});

test("AI 内容提案接口只接受 AI 学科账号，不复用管理员写入门", () => {
  const routes = [
    "app/api/ai/content-proposals/route.ts",
    "app/api/ai/content-proposals/[id]/route.ts",
    "app/api/ai/content-proposals/[id]/self-check/route.ts",
    "app/api/ai/content-proposals/[id]/submit/route.ts",
  ];
  for (const routePath of routes) {
    const route = readFileSync(resolve(routePath), "utf8");
    assert.equal(route.includes("getAiRequestContext(req)"), true, routePath);
    assert.equal(route.includes("getAdminRequestContext(req)"), false, routePath);
  }
  const workspace = readFileSync(resolve("components/ai-content/AiContentWorkspace.tsx"), "utf8");
  assert.equal(workspace.includes("/api/ai/content-proposals"), true);
  assert.equal(workspace.includes("ContentPreview"), true);
  assert.equal(workspace.includes("保存并提交审核"), true);
});

test("AI 内容提案先按 RLS 要求写入草稿，再由同一账号提升为已自检", () => {
  const workflow = readFileSync(resolve("lib/server-ai-content.ts"), "utf8");
  const createStart = workflow.indexOf("export async function createAiContentProposal");
  const createEnd = workflow.indexOf("export type UpdateAiContentProposalInput");
  const createWorkflow = workflow.slice(createStart, createEnd);
  const insertStatus = createWorkflow.indexOf('review_status: "draft"');
  const insertCall = createWorkflow.indexOf('.insert(insert)');
  const promotionCall = createWorkflow.indexOf('.update({ review_status: "self_checked" })');

  assert.equal(insertStatus >= 0, true);
  assert.equal(insertCall > insertStatus, true);
  assert.equal(promotionCall > insertCall, true);
  assert.equal(createWorkflow.includes('.eq("owner_user_id", input.userId)'), true);
  assert.equal(createWorkflow.includes('.eq("review_status", "draft")'), true);
  assert.equal(createWorkflow.includes('review_status: selfCheck.passed ? "self_checked" : "draft"'), false);
});

test("AI 内容提案通过所有者受控 RPC 提交，通用 RLS 不开放 pending_review 更新", () => {
  const workflow = readFileSync(resolve("lib/server-ai-content.ts"), "utf8");
  const migration = readFileSync(resolve("supabase/migrations/0029_ai_content_submission_rpc.sql"), "utf8");
  const reviewPolicy = readFileSync(resolve("supabase/migrations/0024_ai_content_review_comments.sql"), "utf8");

  assert.equal(workflow.includes('.rpc("submit_ai_content_proposal"'), true);
  assert.equal(migration.includes("v_proposal.review_status <> 'self_checked'"), true);
  assert.equal(migration.includes("v_proposal.owner_user_id <> v_user_id"), true);
  assert.equal(migration.includes("set review_status = 'pending_review'"), true);
  assert.equal(reviewPolicy.includes("review_status in ('draft', 'self_checked', 'changes_requested')"), true);
  assert.equal(reviewPolicy.includes("review_status in ('draft', 'self_checked', 'pending_review', 'changes_requested')"), false);
});

test("本地预部署构建显式离线且不会尝试 Supabase 预加载", () => {
  const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
  const runner = readFileSync(resolve("scripts/run-offline-next-build.mjs"), "utf8");
  const notesPage = readFileSync(resolve("app/notes/page.tsx"), "utf8");
  const sitemap = readFileSync(resolve("app/sitemap.ts"), "utf8");
  assert.equal(packageJson.scripts["verify:predeploy"].includes("build:offline"), true);
  assert.equal(runner.includes('ASTEROID_OFFLINE_BUILD: "1"'), true);
  assert.equal(notesPage.includes('process.env.ASTEROID_OFFLINE_BUILD === "1"'), true);
  assert.equal(sitemap.includes('process.env.ASTEROID_OFFLINE_BUILD === "1"'), true);
});

test("公开阅读地址与所有者私有阅读地址保持严格分离", () => {
  const publicNote = { id: "public-note", isPublished: true };
  const privateNote = { id: "private note", isPublished: false };

  assert.equal(getNoteReadPath(publicNote), "/notes/public-note");
  assert.equal(getNoteReadPath(privateNote), "/notes/private/private%20note");
  assert.equal(getPrivateNoteReadPath("private note"), "/notes/private/private%20note");
  assert.equal(
    getNoteReadHref(privateNote, "#problem-1"),
    "/notes/private/private%20note#problem-1",
  );

  const publicReader = readFileSync(resolve("app/notes/[id]/page.tsx"), "utf8");
  const privateReader = readFileSync(resolve("app/notes/private/[id]/page.tsx"), "utf8");
  assert.equal(publicReader.includes("notesApi.getPublishedById"), true);
  assert.equal(privateReader.includes('accessScope="owner"'), true);
});

test("WP4 四类页面模板共用统一版心与语义契约", () => {
  const scaffold = readFileSync(resolve("components/ui/PageScaffold.tsx"), "utf8");
  const home = readFileSync(resolve("app/page.tsx"), "utf8");
  const library = readFileSync(resolve("components/notes/NotesClient.tsx"), "utf8");
  const reader = readFileSync(resolve("components/notes/NoteReaderClient.tsx"), "utf8");
  const workspace = readFileSync(resolve("app/create/page.tsx"), "utf8");
  const training = readFileSync(resolve("app/tools/page.tsx"), "utf8");

  for (const template of ["library", "reader", "workspace", "training"]) {
    assert.equal(scaffold.includes(`| "${template}"`), true, template);
  }
  assert.equal(home.includes('data-page-template="home"'), true);
  assert.equal(library.includes('template="library"'), true);
  assert.equal(reader.includes('data-page-template="reader"'), true);
  assert.equal(workspace.includes('data-page-template="workspace"'), true);
  assert.equal(training.includes('template="training"'), true);
  for (const width of ["compact", "normal", "wide", "workspace"]) {
    assert.equal(scaffold.includes(`${width}: "page-frame--${width}"`), true, width);
  }
  assert.equal(scaffold.includes("<dl"), true);
});

test("WP4 主题令牌在运行时解析且普通打印不再被题册规则隐藏", () => {
  const css = readFileSync(resolve("app/globals.css"), "utf8");
  const reader = readFileSync(resolve("components/notes/NoteReaderClient.tsx"), "utf8");

  assert.equal(css.includes("@theme inline"), false);
  assert.equal(css.includes("@theme {"), true);
  assert.equal(css.includes("body[data-problem-booklet-print] *"), true);
  assert.equal(css.includes("\n  body * {\n    visibility: hidden;"), false);
  assert.equal(css.includes("@page booklet"), true);
  assert.equal(css.includes("body:not([data-problem-booklet-print]) [data-print-hide]"), true);
  assert.equal(reader.includes("data-print-hide"), true);
});

test("WP4 笔记库与工具入口使用连续索引而非重复悬浮卡片", () => {
  const noteCard = readFileSync(resolve("components/notes/NoteCard.tsx"), "utf8");
  const toolHub = readFileSync(resolve("components/tools/ToolHubCard.tsx"), "utf8");
  const css = readFileSync(resolve("app/globals.css"), "utf8");

  assert.equal(noteCard.includes("whileHover"), false);
  assert.equal(noteCard.includes("library-card"), true);
  assert.equal(toolHub.includes("catalog-index"), true);
  assert.equal(toolHub.includes("catalog-row"), true);
  assert.equal(css.includes(".catalog-row"), true);
  assert.equal(css.includes(".library-card"), true);
});

test("笔记目录按人工与 AI 来源原位切换且缓存严格隔离", () => {
  const notesPage = readFileSync(resolve("app/notes/page.tsx"), "utf8");
  const notesClient = readFileSync(resolve("components/notes/NotesClient.tsx"), "utf8");
  const notesApi = readFileSync(resolve("lib/supabase.ts"), "utf8");
  const notesCache = readFileSync(resolve("lib/notes-list-cache.ts"), "utf8");

  assert.equal(notesPage.includes('authorKind: "human"'), true);
  assert.equal(notesClient.includes('useState<NoteAuthorKind>("human")'), true);
  assert.equal(notesClient.includes("我的笔记"), true);
  assert.equal(notesClient.includes("AI 笔记"), true);
  assert.equal(notesClient.includes('aria-controls="notes-directory-content"'), true);
  assert.equal(notesClient.includes("router.push"), false);
  assert.equal(notesClient.includes("authorKind: directoryKind"), true);
  assert.equal(notesApi.includes('query.eq("author_kind", options.authorKind)'), true);
  assert.equal(notesApi.includes('q.eq("author_kind", options.authorKind)'), true);
  assert.equal(notesCache.includes("${authorKind}:${selectedType}:${selectedSubject}:${sortOrder}"), true);
});

test("月度规划快照以备考周期和稳定外部键输出", () => {
  assert.equal(isPlanningMonthKey("2026-08"), true);
  assert.equal(isPlanningMonthKey("2026/08"), false);
  assert.equal(getPlanningCycle(DEFAULT_PLANNING_CYCLE_ID)?.targetExamYear, 2027);

  const snapshot = buildMonthlyPlanningSnapshot(DEFAULT_PLANNING_CYCLE_ID, "2026-08");
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.timezone, "Asia/Shanghai");
  assert.equal(snapshot.month.key, "2026-08");
  assert.equal(snapshot.month.label, "8月");
  assert.equal(snapshot.items.length, 15);
  assert.equal(snapshot.items[0].id, "kaoyan-2027:math-08-first-past-2014-2020");
  assert.equal(snapshot.items[0].externalKey, "math-08-first-past-2014-2020");
  assert.equal(snapshot.items[0].order, 1);
  assert.equal(snapshot.items.at(-1)?.order, snapshot.items.length);
  assert.equal(snapshot.updatedAt, null);
  assert.deepEqual(snapshot.capabilities, { taskStatus: false, exactDate: false });
  assert.equal(computePlanningEtag(snapshot), computePlanningEtag(buildMonthlyPlanningSnapshot(DEFAULT_PLANNING_CYCLE_ID, "2026-08")));
});

test("月度规划接口契约使用专用只读认证并支持条件请求", () => {
  const route = readFileSync(resolve("app/api/planning/monthly/route.ts"), "utf8");
  const envExample = readFileSync(resolve(".env.example"), "utf8");
  const documentation = readFileSync(resolve("docs/planning-monthly-api.md"), "utf8");

  assert.equal(route.includes("BLOG_PLANNING_READ_TOKEN"), true);
  assert.equal(route.includes("timingSafeEqual"), true);
  assert.equal(route.includes("If-None-Match"), true);
  assert.equal(route.includes("return new NextResponse(null, { status: 304"), true);
  assert.equal(route.includes("export function OPTIONS"), true);
  assert.equal(route.includes("requireAdminRequest"), false);
  assert.equal(envExample.includes("BLOG_PLANNING_READ_TOKEN="), true);
  assert.equal(envExample.includes("BLOG_PLANNING_ALLOWED_ORIGINS="), true);
  assert.equal(documentation.includes("planning_task_status"), true);
  assert.equal(documentation.includes("<REDACTED>"), true);
});
