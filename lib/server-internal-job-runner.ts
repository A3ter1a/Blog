import "server-only";

import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_DEEPSEEK_MODEL, DEFAULT_DEEPSEEK_OCR_MODEL } from "./ai-config";
import { resolveAIProviderRoute } from "./ai-provider-routing";
import { splitMarkdownForReview } from "./document-markdown-review";
import {
  prepareDocumentMarkdownReviewSource,
  reviewDocumentMarkdown,
} from "./document-markdown-review-service";
import {
  isInternalJobLeaseEnabled,
  planInternalJobProjection,
} from "./internal-job-contract";
import {
  buildMarkdownReviewProposal,
  calculateMarkdownChecksum,
  type MarkdownReviewChunkCapture,
} from "./markdown-review-proposal";
import {
  buildProblemOcrJobResult,
  isOwnedProblemOcrAssetPath,
  materializeProblemOcrProblem,
  type ProblemOcrChapterContextItem,
  type ProblemOcrItemCapture,
  type ProblemOcrSourceAsset,
} from "./problem-ocr-contract";
import {
  buildMathPaperOcrJobResult,
  isOwnedMathPaperOcrAssetPath,
  type MathPaperOcrCapture,
  type MathPaperOcrSourceAsset,
} from "./math-paper-ocr-job";
import { analyzeProblemOcrText, recognizeProblemImage } from "./problem-ocr-service";
import {
  generateVerifiedMath3SelfTestPaper,
  type Math3SelfTestGenerationStage,
} from "./server-math3-self-test-generation";
import {
  generateAndRecordMathPaperGrade,
  type MathPaperGradeStage,
} from "./server-math-paper-grade";
import type { Math3SelfTestDifficulty, Math3SelfTestMode } from "./math3-self-test";
import {
  normalizeMath3ChapterAssignments,
  type Math3ChapterAssignment,
  type Math3ProblemClassifyInput,
} from "./math3-classification";
import { classifyMath3Problems } from "./server-math3-classification";
import type { Math3ClassificationJobResult } from "./math3-classification-job";
import {
  generateAndRecordEnglishSubjectiveGrade,
  normalizeEnglishSubjectiveAnswers,
  type EnglishSubjectiveGradeStage,
} from "./server-english-subjective-grade";
import { generateEconomicsGraph } from "./server-economics-graph-generation";
import {
  gradeMath3SelfTestStep,
  type Math3StepGradeQuestionSnapshot,
  type Math3StepGradeRubricSnapshot,
} from "./server-math3-step-grade";
import { generateAndRecordAiKnowledgeQuiz } from "./server-ai-knowledge-quiz-generation";
import {
  isJobLedgerSchemaPending,
  type JobLedgerResult,
  type JobRow,
} from "./server-job-ledger";
import type { Database, Json, Tables, TablesInsert, TablesUpdate } from "./supabase-schema";

type JobItemRow = Tables<"job_items">;
type RpcResponse = { data: unknown; error: unknown };
type RpcInvoker = (name: string, args: Record<string, unknown>) => PromiseLike<RpcResponse>;

type CreateMarkdownReviewJobInput = {
  userId: string;
  markdown: string;
  model: string;
  targetId: string;
};

type AdvanceMarkdownReviewJobInput = {
  userId: string;
  jobId: string;
  apiKey: string;
};

type CreateProblemOcrJobInput = {
  userId: string;
  assets: ProblemOcrSourceAsset[];
  chapterContext: ProblemOcrChapterContextItem[];
  qwenModel: string;
  deepseekModel: string;
  ocrProvider: "deepseek" | "qwen";
  targetId: string;
};

type CreateMathPaperOcrJobInput = {
  userId: string;
  assets: MathPaperOcrSourceAsset[];
  qwenModel: string;
};

type CreateMath3SelfTestGenerationJobInput = {
  userId: string;
  mode: Math3SelfTestMode;
  difficulty: Math3SelfTestDifficulty;
};

type CreateMathPaperGradeJobInput = {
  userId: string;
  paperId: string;
  confirmationId: string;
  targetId: string;
};

type CreateMath3ClassificationJobInput = {
  userId: string;
  problems: Math3ProblemClassifyInput[];
  sourceChecksum: string;
  scopeLabel: string;
  targetId: string;
};

type CreateEnglishSubjectiveGradeJobInput = {
  userId: string;
  passageId: string;
  round: 1 | 2 | 3;
  answers: Record<string, string>;
  targetId: string;
};

type CreateEconomicsGraphJobInput = {
  userId: string;
  prompt: string;
  model: string;
  targetId: string;
};

type CreateMath3StepGradeJobInput = {
  userId: string;
  testId: string;
  question: Math3StepGradeQuestionSnapshot;
  step: Math3StepGradeRubricSnapshot;
  studentAnswer: string;
  model: string;
  targetId: string;
};

type CreateAiKnowledgeQuizJobInput = {
  userId: string;
  proposalId: string;
  proposalTitle: string;
  proposalContent: string;
  model: string;
  targetId: string;
};

type AdvanceInternalJobInput = {
  userId: string;
  jobId: string;
  deepseekApiKey: string;
  qwenApiKey: string;
};

type RetryMarkdownReviewJobInput = {
  userId: string;
  jobId: string;
};

const ACTIVE_INTERNAL_JOB_STATUSES = ["queued", "running", "waiting_for_trigger", "stalled"];
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const MAX_MARKDOWN_REVIEW_CHUNKS = 60;
const MAX_PROBLEM_OCR_IMAGES = 10;
const MAX_PROBLEM_OCR_TEXT = 6000;
const MAX_MATH_PAPER_OCR_IMAGES = 20;
const MAX_MATH_PAPER_OCR_TEXT = 20_000;
const MAX_MATH3_CLASSIFICATION_PROBLEMS = 200;
const MATH3_CLASSIFICATION_BATCH_SIZE = 6;
const PROBLEM_OCR_BUCKET = "ocr-documents";

function isMath3SelfTestMode(value: unknown): value is Math3SelfTestMode {
  return value === "quick" || value === "full";
}

function isMath3SelfTestDifficulty(value: unknown): value is Math3SelfTestDifficulty {
  return value === "comfort" || value === "simulation" || value === "challenge";
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toJson(value: unknown): Json {
  return value as Json;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  const record = asRecord(error);
  return toText(record?.message) || fallback;
}

function isMissingLeaseRpc(error: unknown): boolean {
  if (isJobLedgerSchemaPending(error)) return true;
  const record = asRecord(error);
  const code = toText(record?.code).toUpperCase();
  const message = toText(record?.message).toLowerCase();
  return code === "PGRST202"
    || (message.includes("schema cache") && message.includes("function"))
    || message.includes("could not find the function");
}

function rpcInvoker(supabase: SupabaseClient<Database>): RpcInvoker {
  return supabase.rpc.bind(supabase) as unknown as RpcInvoker;
}

async function callRpcRows<T>(
  supabase: SupabaseClient<Database>,
  name: string,
  args: Record<string, unknown>,
): Promise<T[]> {
  const response = await rpcInvoker(supabase)(name, args);
  if (response.error) throw response.error;
  return Array.isArray(response.data) ? response.data as T[] : [];
}

async function hasLeaseRpc(supabase: SupabaseClient<Database>): Promise<boolean> {
  const response = await rpcInvoker(supabase)("reset_failed_job_item", { p_item_id: ZERO_UUID });
  if (!response.error) return true;
  if (isMissingLeaseRpc(response.error)) return false;

  const record = asRecord(response.error);
  const code = toText(record?.code).toUpperCase();
  const message = toText(record?.message).toLowerCase();
  if (code !== "55000" && !message.includes("owned failed item")) throw response.error;

  const renewal = await rpcInvoker(supabase)("renew_job_item_lease", {
    p_item_id: ZERO_UUID,
    p_worker_id: "schema-check",
    p_lease_attempt: 1,
    p_lease_seconds: 300,
  });
  if (renewal.error) {
    if (isMissingLeaseRpc(renewal.error)) return false;
    const renewalRecord = asRecord(renewal.error);
    const renewalCode = toText(renewalRecord?.code).toUpperCase();
    const renewalMessage = toText(renewalRecord?.message).toLowerCase();
    if (renewalCode !== "55000" && !renewalMessage.includes("active job and lease")) throw renewal.error;
  }

  const commitGate = await rpcInvoker(supabase)("job_commit_gate_ready", {});
  if (commitGate.error) {
    if (isMissingLeaseRpc(commitGate.error)) return false;
    throw commitGate.error;
  }
  return commitGate.data === true;
}

export async function renewInternalJobItemLease(
  supabase: SupabaseClient<Database>,
  input: { itemId: string; workerId: string; leaseAttempt: number; leaseSeconds?: number },
): Promise<void> {
  const rows = await callRpcRows<JobItemRow>(supabase, "renew_job_item_lease", {
    p_item_id: input.itemId,
    p_worker_id: input.workerId,
    p_lease_attempt: input.leaseAttempt,
    p_lease_seconds: input.leaseSeconds ?? 300,
  });
  if (rows.length !== 1) throw new Error("任务租约续期没有返回当前分块");
}

async function runWithInternalJobItemLease<T>(
  supabase: SupabaseClient<Database>,
  input: { item: JobItemRow; workerId: string },
  work: (signal: AbortSignal, renewNow: () => Promise<void>) => Promise<T>,
): Promise<T> {
  const abortController = new AbortController();
  let renewalError: unknown = null;
  let renewalInFlight = false;
  const renewNow = async () => {
    if (renewalError) throw renewalError;
    await renewInternalJobItemLease(supabase, {
      itemId: input.item.id,
      workerId: input.workerId,
      leaseAttempt: input.item.attempt_count,
    });
  };
  const timer = setInterval(() => {
    if (renewalInFlight || renewalError) return;
    renewalInFlight = true;
    void renewNow().catch((error: unknown) => {
      renewalError = error;
      abortController.abort(error);
    }).finally(() => {
      renewalInFlight = false;
    });
  }, 60_000);
  try {
    const result = await work(abortController.signal, renewNow);
    if (renewalError) throw renewalError;
    await renewNow();
    return result;
  } finally {
    clearInterval(timer);
  }
}

export async function internalJobLeaseAvailable(supabase: SupabaseClient<Database>): Promise<boolean> {
  return hasLeaseRpc(supabase);
}

async function enqueueMarkdownReviewItems(
  supabase: SupabaseClient<Database>,
  jobId: string,
  chunks: string[],
  sourceChecksum: string,
  model: string,
): Promise<void> {
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const chunkChecksum = await calculateMarkdownChecksum(chunk);
    await callRpcRows<JobItemRow>(supabase, "enqueue_job_item", {
      p_job_id: jobId,
      p_ordinal: index,
      p_idempotency_key: `${sourceChecksum}:${index + 1}:${chunkChecksum}`,
      p_payload: {
        operation: "document_markdown_review",
        chunkIndex: index + 1,
        chunkCount: chunks.length,
        sourceMarkdown: chunk,
        sourceChecksum: chunkChecksum,
        model,
      },
    });
  }
}

export async function internalJobLeaseSchemaAvailable(supabase: SupabaseClient<Database>): Promise<boolean> {
  return hasLeaseRpc(supabase);
}

async function selectOwnedInternalJob(
  supabase: SupabaseClient<Database>,
  userId: string,
  jobId: string,
): Promise<JobRow | null> {
  const selected = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .eq("job_class", "internal")
    .maybeSingle();
  if (selected.error) throw selected.error;
  return selected.data as JobRow | null;
}

async function selectOwnedMarkdownReviewJob(
  supabase: SupabaseClient<Database>,
  userId: string,
  jobId: string,
): Promise<JobRow | null> {
  const job = await selectOwnedInternalJob(supabase, userId, jobId);
  return job?.job_kind === "markdown_review" ? job : null;
}

function getJobPayload(job: JobRow): Record<string, unknown> {
  return asRecord(job.payload) ?? {};
}

function withJobUiPayload(
  job: JobRow,
  phase: string,
  statusText: string,
): Json {
  return toJson({
    ...getJobPayload(job),
    phase,
    statusText,
  });
}

function parseChunkCapture(item: JobItemRow): MarkdownReviewChunkCapture {
  const payload = asRecord(item.payload);
  const result = asRecord(item.result);
  const chunkIndex = Number(payload?.chunkIndex);
  const chunkCount = Number(payload?.chunkCount);
  const sourceMarkdown = toText(payload?.sourceMarkdown);
  const reviewedMarkdown = toText(result?.reviewedMarkdown);
  const summary = toText(result?.summary);
  const tokensUsed = Number(result?.tokensUsed);
  if (
    !Number.isInteger(chunkIndex)
    || !Number.isInteger(chunkCount)
    || chunkIndex < 1
    || chunkCount < 1
    || !sourceMarkdown
    || !reviewedMarkdown
  ) {
    throw new Error(`任务分块 ${item.ordinal + 1} 的结果记录不完整。`);
  }
  return {
    chunkIndex,
    chunkCount,
    sourceMarkdown,
    reviewedMarkdown,
    summary,
    tokensUsed: Number.isFinite(tokensUsed) && tokensUsed > 0 ? tokensUsed : 0,
  };
}

async function syncMarkdownReviewJobState(
  supabase: SupabaseClient<Database>,
  userId: string,
  jobId: string,
): Promise<JobRow | null> {
  const job = await selectOwnedMarkdownReviewJob(supabase, userId, jobId);
  if (!job) return null;

  const selectedItems = await supabase
    .from("job_items")
    .select("*")
    .eq("job_id", jobId)
    .order("ordinal", { ascending: true });
  if (selectedItems.error) throw selectedItems.error;
  const items = (selectedItems.data ?? []) as JobItemRow[];
  if (items.length === 0) return job;

  const projection = planInternalJobProjection(items.map((item) => ({
    ordinal: item.ordinal,
    status: item.status as "pending" | "leased" | "succeeded" | "failed",
    error: item.error,
  })));
  const now = new Date().toISOString();
  const update: TablesUpdate<"jobs"> = {
    status: projection.status,
    progress_current: projection.progressCurrent,
    progress_total: projection.progressTotal,
    payload: withJobUiPayload(job, projection.phase, projection.statusText),
    heartbeat_at: now,
    error: projection.error ?? null,
    finished_at: projection.status === "succeeded" || projection.status === "failed" ? now : null,
  };

  if (projection.status === "succeeded") {
    const payload = getJobPayload(job);
    const sourceMarkdown = toText(payload.sourceMarkdown);
    const model = toText(payload.model);
    const captures = items.map(parseChunkCapture);
    const reviewedMarkdown = captures
      .map((capture) => capture.reviewedMarkdown.trim())
      .join("\n\n")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim();
    const summary = captures.length > 1
      ? `已分 ${captures.length} 段审查公式和标题层级`
      : captures[0]?.summary || "已审查公式和标题层级";
    const proposal = await buildMarkdownReviewProposal({
      sourceMarkdown,
      reviewedMarkdown,
      model,
      summary,
      chunks: captures,
      proposalId: `markdown-review-job-${job.id}`,
      createdAt: job.created_at,
    });
    update.result = toJson({ proposal, targetId: toText(payload.targetId) });
  }

  const updated = await supabase
    .from("jobs")
    .update(update)
    .eq("id", jobId)
    .eq("user_id", userId)
    .in("status", ACTIVE_INTERNAL_JOB_STATUSES)
    .select("*")
    .maybeSingle();
  if (updated.error) throw updated.error;
  if (updated.data) return updated.data as JobRow;
  return selectOwnedMarkdownReviewJob(supabase, userId, jobId);
}

function parseProblemOcrChapterContext(value: unknown): ProblemOcrChapterContextItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ProblemOcrChapterContextItem[] => {
    const record = asRecord(item);
    const id = toText(record?.id);
    const name = toText(record?.name);
    return id && name ? [{ id, name }] : [];
  }).slice(0, 200);
}

function parseProblemOcrAssets(value: unknown, userId: string): ProblemOcrSourceAsset[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ProblemOcrSourceAsset[] => {
    const record = asRecord(item);
    const path = toText(record?.path);
    const name = toText(record?.name);
    const mimeType = toText(record?.mimeType);
    if (
      !path
      || !name
      || !isOwnedProblemOcrAssetPath(path, userId)
      || !["image/jpeg", "image/png", "image/webp"].includes(mimeType)
    ) return [];
    return [{ path, name, mimeType: mimeType as ProblemOcrSourceAsset["mimeType"] }];
  }).slice(0, MAX_PROBLEM_OCR_IMAGES);
}

async function enqueueProblemOcrItems(
  supabase: SupabaseClient<Database>,
  jobId: string,
  assets: ProblemOcrSourceAsset[],
  chapterContext: ProblemOcrChapterContextItem[],
  qwenModel: string,
  deepseekModel: string,
  ocrProvider: "deepseek" | "qwen" = "qwen",
): Promise<void> {
  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index];
    const identityChecksum = await calculateMarkdownChecksum(`${asset.path}\u0000${asset.mimeType}`);
    await callRpcRows<JobItemRow>(supabase, "enqueue_job_item", {
      p_job_id: jobId,
      p_ordinal: index,
      p_idempotency_key: `problem-ocr:${index + 1}:${identityChecksum}`,
      p_payload: {
        operation: "problem_ocr",
        imageIndex: index + 1,
        imageCount: assets.length,
        imageName: asset.name,
        sourceStorageBucket: PROBLEM_OCR_BUCKET,
        sourceStoragePath: asset.path,
        mimeType: asset.mimeType,
        chapterContext,
        qwenModel,
        deepseekModel,
        ocrProvider,
      },
    });
  }
}

function parseProblemOcrCapture(item: JobItemRow): ProblemOcrItemCapture {
  const payload = asRecord(item.payload);
  const result = asRecord(item.result);
  const imageIndex = Number(payload?.imageIndex);
  const imageCount = Number(payload?.imageCount);
  const imageName = toText(payload?.imageName);
  const ocrText = toText(result?.ocrText);
  const problems = Array.isArray(result?.problems) ? result.problems : null;
  const qwenModel = toText(result?.qwenModel);
  const deepseekModel = toText(result?.deepseekModel);
  const tokensUsed = Number(result?.tokensUsed);
  if (
    !Number.isInteger(imageIndex)
    || !Number.isInteger(imageCount)
    || imageIndex < 1
    || imageCount < 1
    || !imageName
    || !ocrText
    || !problems
    || !qwenModel
    || !deepseekModel
  ) {
    throw new Error(`题库 OCR 分块 ${item.ordinal + 1} 的结果记录不完整。`);
  }
  return {
    imageIndex,
    imageCount,
    imageName,
    ocrText,
    problems: problems as ProblemOcrItemCapture["problems"],
    warning: toText(result?.warning) || undefined,
    qwenModel,
    deepseekModel,
    tokensUsed: Number.isFinite(tokensUsed) && tokensUsed > 0 ? tokensUsed : 0,
  };
}

async function syncProblemOcrJobState(
  supabase: SupabaseClient<Database>,
  userId: string,
  jobId: string,
): Promise<JobRow | null> {
  const job = await selectOwnedInternalJob(supabase, userId, jobId);
  if (!job || job.job_kind !== "problem_ocr") return null;
  const selectedItems = await supabase
    .from("job_items")
    .select("*")
    .eq("job_id", jobId)
    .order("ordinal", { ascending: true });
  if (selectedItems.error) throw selectedItems.error;
  const items = (selectedItems.data ?? []) as JobItemRow[];
  if (items.length === 0) return job;

  const projection = planInternalJobProjection(items.map((item) => ({
    ordinal: item.ordinal,
    status: item.status as "pending" | "leased" | "succeeded" | "failed",
    error: item.error,
  })));
  const now = new Date().toISOString();
  const update: TablesUpdate<"jobs"> = {
    status: projection.status,
    progress_current: projection.progressCurrent,
    progress_total: projection.progressTotal,
    payload: withJobUiPayload(job, projection.phase, projection.statusText),
    heartbeat_at: now,
    error: projection.error ?? null,
    finished_at: projection.status === "succeeded" || projection.status === "failed" ? now : null,
  };

  if (projection.status === "succeeded") {
    const result = buildProblemOcrJobResult(items.map(parseProblemOcrCapture));
    update.result = toJson(result);
    const paths = items.map((item) => toText(asRecord(item.payload)?.sourceStoragePath)).filter(Boolean);
    const removed = await supabase.storage.from(PROBLEM_OCR_BUCKET).remove(paths);
    if (removed.error) {
      const cleanupError = `题库 OCR 已完成，但临时源图清理失败：${removed.error.message}`;
      update.status = "stalled";
      update.finished_at = null;
      update.error = cleanupError;
      update.payload = toJson({
        ...getJobPayload(job),
        phase: "源文件清理失败",
        statusText: "识别结果已保留；请显式重试临时源图清理",
        cleanupError,
      });
    } else {
      update.source_storage_bucket = null;
      update.source_storage_path = null;
      update.payload = toJson({
        ...getJobPayload(job),
        phase: "结果待领取",
        statusText: `识别完成，共提取 ${result.extractedProblems.length} 道题；临时源图已清理`,
      });
    }
  }

  const updated = await supabase
    .from("jobs")
    .update(update)
    .eq("id", jobId)
    .eq("user_id", userId)
    .in("status", ACTIVE_INTERNAL_JOB_STATUSES)
    .select("*")
    .maybeSingle();
  if (updated.error) throw updated.error;
  if (updated.data) return updated.data as JobRow;
  return selectOwnedInternalJob(supabase, userId, jobId);
}

async function createSingleItemInternalJob(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    jobKind: string;
    title: string;
    payload: Record<string, Json>;
    idempotencyKey: string;
    itemPayload: Record<string, Json>;
    registrationError: string;
  },
): Promise<JobLedgerResult<JobRow | null>> {
  if (!await hasLeaseRpc(supabase)) return { availability: "schema_pending", data: null };
  const inserted = await supabase.from("jobs").insert({
    user_id: input.userId,
    job_class: "internal",
    job_kind: input.jobKind,
    status: "queued",
    title: input.title,
    progress_current: 0,
    progress_total: 1,
    payload: toJson({
      ...input.payload,
      registrationComplete: false,
    }),
    heartbeat_at: new Date().toISOString(),
  } satisfies TablesInsert<"jobs">).select("*").single();
  if (inserted.error) {
    if (isJobLedgerSchemaPending(inserted.error)) return { availability: "schema_pending", data: null };
    throw inserted.error;
  }
  const job = inserted.data as JobRow;
  try {
    await callRpcRows<JobItemRow>(supabase, "enqueue_job_item", {
      p_job_id: job.id,
      p_ordinal: 0,
      p_idempotency_key: input.idempotencyKey,
      p_payload: input.itemPayload,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error, input.registrationError);
    await supabase.from("jobs").update({
      status: "failed",
      error: message,
      finished_at: new Date().toISOString(),
      payload: toJson({ ...getJobPayload(job), registrationComplete: false, phase: "任务登记失败", statusText: message }),
    }).eq("id", job.id).eq("user_id", input.userId);
    throw error;
  }
  const registered = await supabase.from("jobs").update({
    payload: toJson({ ...getJobPayload(job), registrationComplete: true }),
  }).eq("id", job.id).eq("user_id", input.userId).eq("status", "queued").select("*").maybeSingle();
  if (registered.error) throw registered.error;
  return { availability: "synced", data: (registered.data as JobRow | null) ?? job };
}

function parseMath3StepQuestion(value: unknown): Math3StepGradeQuestionSnapshot | null {
  const record = asRecord(value);
  const id = toText(record?.id).slice(0, 160);
  const question = toText(record?.question).slice(0, 20_000);
  const answer = toText(record?.answer).slice(0, 20_000);
  const explanation = toText(record?.explanation).slice(0, 30_000);
  return id && question && answer ? { id, question, answer, explanation } : null;
}

function parseMath3StepRubric(value: unknown): Math3StepGradeRubricSnapshot | null {
  const record = asRecord(value);
  const id = toText(record?.id).slice(0, 160);
  const label = toText(record?.label).slice(0, 500);
  const expected = toText(record?.expected).slice(0, 10_000);
  const points = Number(record?.points);
  return id && label && expected && Number.isFinite(points) && points >= 0 && points <= 100
    ? { id, label, expected, points }
    : null;
}

function parseMathPaperOcrAssets(value: unknown, userId: string): MathPaperOcrSourceAsset[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): MathPaperOcrSourceAsset[] => {
    const record = asRecord(item);
    const path = toText(record?.path);
    const pageId = toText(record?.pageId);
    const name = toText(record?.name);
    const sourceFingerprint = toText(record?.sourceFingerprint);
    const mimeType = toText(record?.mimeType);
    if (
      !path
      || !isUuid(pageId)
      || !name
      || !/^[0-9a-f]{64}$/i.test(sourceFingerprint)
      || !isOwnedMathPaperOcrAssetPath(path, userId)
      || !["image/jpeg", "image/png", "image/webp"].includes(mimeType)
    ) return [];
    return [{
      path,
      pageId,
      name,
      sourceFingerprint,
      mimeType: mimeType as MathPaperOcrSourceAsset["mimeType"],
    }];
  }).slice(0, MAX_MATH_PAPER_OCR_IMAGES);
}

async function enqueueMathPaperOcrItems(
  supabase: SupabaseClient<Database>,
  jobId: string,
  assets: MathPaperOcrSourceAsset[],
  qwenModel: string,
): Promise<void> {
  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index];
    await callRpcRows<JobItemRow>(supabase, "enqueue_job_item", {
      p_job_id: jobId,
      p_ordinal: index,
      p_idempotency_key: `math-paper-ocr:${asset.pageId}:${asset.sourceFingerprint}`,
      p_payload: {
        operation: "math_paper_ocr",
        pageIndex: index + 1,
        pageCount: assets.length,
        pageId: asset.pageId,
        fileName: asset.name,
        sourceFingerprint: asset.sourceFingerprint,
        sourceStorageBucket: PROBLEM_OCR_BUCKET,
        sourceStoragePath: asset.path,
        mimeType: asset.mimeType,
        qwenModel,
      },
    });
  }
}

function parseMathPaperOcrCapture(item: JobItemRow): MathPaperOcrCapture {
  const payload = asRecord(item.payload);
  const result = asRecord(item.result);
  const capture: MathPaperOcrCapture = {
    pageIndex: Number(payload?.pageIndex),
    pageCount: Number(payload?.pageCount),
    pageId: toText(payload?.pageId),
    fileName: toText(payload?.fileName),
    sourceFingerprint: toText(payload?.sourceFingerprint),
    text: toText(result?.text),
    model: toText(result?.model),
  };
  if (
    !Number.isInteger(capture.pageIndex)
    || !Number.isInteger(capture.pageCount)
    || !isUuid(capture.pageId)
    || !capture.fileName
    || !/^[0-9a-f]{64}$/i.test(capture.sourceFingerprint)
    || !capture.text
    || !capture.model
  ) throw new Error(`数学答题纸 OCR 分块 ${item.ordinal + 1} 的结果记录不完整。`);
  return capture;
}

async function syncMathPaperOcrJobState(
  supabase: SupabaseClient<Database>,
  userId: string,
  jobId: string,
): Promise<JobRow | null> {
  const job = await selectOwnedInternalJob(supabase, userId, jobId);
  if (!job || job.job_kind !== "math_paper_ocr") return null;
  const selectedItems = await supabase
    .from("job_items")
    .select("*")
    .eq("job_id", jobId)
    .order("ordinal", { ascending: true });
  if (selectedItems.error) throw selectedItems.error;
  const items = (selectedItems.data ?? []) as JobItemRow[];
  if (items.length === 0) return job;

  const projection = planInternalJobProjection(items.map((item) => ({
    ordinal: item.ordinal,
    status: item.status as "pending" | "leased" | "succeeded" | "failed",
    error: item.error,
  })));
  const now = new Date().toISOString();
  const update: TablesUpdate<"jobs"> = {
    status: projection.status,
    progress_current: projection.progressCurrent,
    progress_total: projection.progressTotal,
    payload: withJobUiPayload(job, projection.phase, projection.statusText),
    heartbeat_at: now,
    error: projection.error ?? null,
    finished_at: projection.status === "succeeded" || projection.status === "failed" ? now : null,
  };

  if (projection.status === "succeeded") {
    const result = buildMathPaperOcrJobResult(items.map(parseMathPaperOcrCapture));
    update.result = toJson({ ...result, targetId: toText(getJobPayload(job).targetId) });
    const paths = items.map((item) => toText(asRecord(item.payload)?.sourceStoragePath)).filter(Boolean);
    const removed = await supabase.storage.from(PROBLEM_OCR_BUCKET).remove(paths);
    if (removed.error) {
      const cleanupError = `数学答题纸 OCR 已完成，但临时源图清理失败：${removed.error.message}`;
      update.status = "stalled";
      update.finished_at = null;
      update.error = cleanupError;
      update.payload = toJson({
        ...getJobPayload(job),
        phase: "源文件清理失败",
        statusText: "识别结果已保留；请显式重试临时源图清理",
        cleanupError,
      });
    } else {
      update.source_storage_bucket = null;
      update.source_storage_path = null;
      update.payload = toJson({
        ...getJobPayload(job),
        phase: "结果待领取",
        statusText: `已识别 ${result.totalPages} 页答题纸；临时源图已清理，请逐页人工核对`,
      });
    }
  }

  const updated = await supabase
    .from("jobs")
    .update(update)
    .eq("id", jobId)
    .eq("user_id", userId)
    .in("status", ACTIVE_INTERNAL_JOB_STATUSES)
    .select("*")
    .maybeSingle();
  if (updated.error) throw updated.error;
  if (updated.data) return updated.data as JobRow;
  return selectOwnedInternalJob(supabase, userId, jobId);
}

function parseMath3ClassificationProblems(value: unknown): Math3ProblemClassifyInput[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): Math3ProblemClassifyInput[] => {
    const record = asRecord(item);
    const id = toText(record?.id);
    const question = toText(record?.question);
    const index = Number(record?.index);
    const type = toText(record?.type);
    if (!id || !question || !Number.isInteger(index) || index < 1 || !type) return [];
    const options = Array.isArray(record?.options)
      ? record.options.flatMap((option, optionIndex) => {
        const candidate = asRecord(option);
        const content = toText(candidate?.content);
        return content ? [{ label: toText(candidate?.label) || String.fromCharCode(65 + optionIndex), content }] : [];
      })
      : [];
    return [{ id, index, type, question, answer: toText(record?.answer), options }];
  }).slice(0, MAX_MATH3_CLASSIFICATION_PROBLEMS);
}

async function enqueueMath3ClassificationItems(
  supabase: SupabaseClient<Database>,
  jobId: string,
  problems: Math3ProblemClassifyInput[],
  sourceChecksum: string,
): Promise<void> {
  for (let start = 0, ordinal = 0; start < problems.length; start += MATH3_CLASSIFICATION_BATCH_SIZE, ordinal += 1) {
    const batch = problems.slice(start, start + MATH3_CLASSIFICATION_BATCH_SIZE);
    await callRpcRows<JobItemRow>(supabase, "enqueue_job_item", {
      p_job_id: jobId,
      p_ordinal: ordinal,
      p_idempotency_key: `math3-classify:${sourceChecksum}:${ordinal + 1}`,
      p_payload: { operation: "math3_auto_classify", problems: batch },
    });
  }
}

function parseMath3ClassificationCapture(item: JobItemRow): {
  assignments: Math3ChapterAssignment[];
  tokensUsed: number;
  model: string;
} {
  const payload = asRecord(item.payload);
  const result = asRecord(item.result);
  const problems = parseMath3ClassificationProblems(payload?.problems);
  const normalizedAssignments = normalizeMath3ChapterAssignments(
    result ? { assignments: result.assignments } : [],
    problems.map((problem) => problem.id),
  );
  const expectedIds = new Set(problems.map((problem) => problem.id));
  if (
    problems.length === 0
    || normalizedAssignments.length !== problems.length
    || normalizedAssignments.some((assignment) => !expectedIds.has(assignment.problemId))
    || new Set(normalizedAssignments.map((assignment) => assignment.problemId)).size !== problems.length
  ) throw new Error(`数学三批量归类分块 ${item.ordinal + 1} 的结果记录不完整。`);
  const tokensUsed = Number(result?.tokensUsed);
  return {
    assignments: normalizedAssignments,
    tokensUsed: Number.isFinite(tokensUsed) && tokensUsed > 0 ? tokensUsed : 0,
    model: toText(result?.model),
  };
}

async function syncMath3ClassificationJobState(
  supabase: SupabaseClient<Database>,
  userId: string,
  jobId: string,
): Promise<JobRow | null> {
  const job = await selectOwnedInternalJob(supabase, userId, jobId);
  if (!job || job.job_kind !== "math3_auto_classify") return null;
  const selectedItems = await supabase.from("job_items").select("*").eq("job_id", jobId).order("ordinal", { ascending: true });
  if (selectedItems.error) throw selectedItems.error;
  const items = (selectedItems.data ?? []) as JobItemRow[];
  if (items.length === 0) return job;
  const projection = planInternalJobProjection(items.map((item) => ({
    ordinal: item.ordinal,
    status: item.status as "pending" | "leased" | "succeeded" | "failed",
    error: item.error,
  })));
  const jobPayload = getJobPayload(job);
  const problems = parseMath3ClassificationProblems(jobPayload.problems);
  const succeededItems = items.filter((item) => item.status === "succeeded");
  const completedProblems = succeededItems.reduce(
    (sum, item) => sum + parseMath3ClassificationProblems(asRecord(item.payload)?.problems).length,
    0,
  );
  const now = new Date().toISOString();
  const update: TablesUpdate<"jobs"> = {
    status: projection.status,
    progress_current: completedProblems,
    progress_total: problems.length,
    payload: withJobUiPayload(
      job,
      projection.status === "succeeded" ? "结果待应用" : projection.phase,
      projection.status === "succeeded"
        ? `已完成 ${problems.length} 道题的章节归类；回到题目编辑器校验快照后应用`
        : projection.statusText,
    ),
    heartbeat_at: now,
    error: projection.error ?? null,
    finished_at: projection.status === "succeeded" || projection.status === "failed" ? now : null,
  };
  if (projection.status === "succeeded") {
    const captures = items.map(parseMath3ClassificationCapture);
    const assignments = captures.flatMap((capture) => capture.assignments);
    const problemIds = problems.map((problem) => problem.id);
    if (assignments.length !== problemIds.length || new Set(assignments.map((assignment) => assignment.problemId)).size !== problemIds.length) {
      throw new Error("数学三批量归类结果没有完整覆盖源题快照");
    }
    const result: Math3ClassificationJobResult = {
      resultVersion: 1,
      sourceChecksum: toText(jobPayload.sourceChecksum),
      scopeLabel: toText(jobPayload.scopeLabel) || "题目",
      assignments,
      problemIds,
      tokensUsed: captures.reduce((sum, capture) => sum + capture.tokensUsed, 0),
      targetId: toText(jobPayload.targetId),
    };
    update.result = toJson(result);
  }
  const updated = await supabase.from("jobs").update(update)
    .eq("id", jobId).eq("user_id", userId).in("status", ACTIVE_INTERNAL_JOB_STATUSES).select("*").maybeSingle();
  if (updated.error) throw updated.error;
  if (updated.data) return updated.data as JobRow;
  return selectOwnedInternalJob(supabase, userId, jobId);
}

async function syncSingleGeneratedJobState(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    jobId: string;
    jobKind: "economics_graph_generation" | "math3_step_grade" | "ai_knowledge_quiz_generation";
    successPhase: string;
    successStatusText: string;
  },
): Promise<JobRow | null> {
  const job = await selectOwnedInternalJob(supabase, input.userId, input.jobId);
  if (!job || job.job_kind !== input.jobKind) return null;
  const selectedItems = await supabase.from("job_items").select("*").eq("job_id", job.id).order("ordinal", { ascending: true });
  if (selectedItems.error) throw selectedItems.error;
  const items = (selectedItems.data ?? []) as JobItemRow[];
  if (items.length === 0) return job;
  const projection = planInternalJobProjection(items.map((item) => ({
    ordinal: item.ordinal,
    status: item.status as "pending" | "leased" | "succeeded" | "failed",
    error: item.error,
  })));
  const now = new Date().toISOString();
  const update: TablesUpdate<"jobs"> = {
    status: projection.status,
    progress_current: projection.progressCurrent,
    progress_total: 1,
    payload: withJobUiPayload(
      job,
      projection.status === "succeeded" ? input.successPhase : projection.phase,
      projection.status === "succeeded" ? input.successStatusText : projection.statusText,
    ),
    heartbeat_at: now,
    error: projection.error ?? null,
    finished_at: projection.status === "succeeded" || projection.status === "failed" ? now : null,
  };
  if (projection.status === "succeeded") {
    const result = asRecord(items[0]?.result);
    if (!result) throw new Error("任务分块已完成，但结构化结果缺失");
    update.result = toJson({ ...result, targetId: toText(getJobPayload(job).targetId) });
  }
  const updated = await supabase.from("jobs").update(update)
    .eq("id", job.id).eq("user_id", input.userId).in("status", ACTIVE_INTERNAL_JOB_STATUSES).select("*").maybeSingle();
  if (updated.error) throw updated.error;
  if (updated.data) return updated.data as JobRow;
  return selectOwnedInternalJob(supabase, input.userId, job.id);
}

async function failClaimedInternalJobItem(
  supabase: SupabaseClient<Database>,
  input: { item: JobItemRow; workerId: string; error: unknown; fallback: string },
): Promise<void> {
  await callRpcRows<JobItemRow>(supabase, "fail_job_item", {
    p_item_id: input.item.id,
    p_worker_id: input.workerId,
    p_lease_attempt: input.item.attempt_count,
    p_error: getErrorMessage(input.error, input.fallback).slice(0, 32768),
  });
}

function parseEnglishSubjectiveGradeCapture(item: JobItemRow): Record<string, unknown> {
  const payload = asRecord(item.payload);
  const result = asRecord(item.result);
  const passageId = payload?.passageId;
  const round = Number(payload?.round);
  const revisionId = result?.revisionId;
  const mode = result?.mode;
  const ledgers = result?.ledgers;
  if (
    !isUuid(passageId)
    || !Number.isInteger(round)
    || round < 1
    || round > 3
    || !isUuid(revisionId)
    || (mode !== "dual" && mode !== "shared")
    || !Array.isArray(ledgers)
    || ledgers.length === 0
  ) throw new Error("英语主观题建议评分结果记录不完整。");
  return { ...result, passageId, round, revisionId, mode, ledgers };
}

async function syncEnglishSubjectiveGradeJobState(
  supabase: SupabaseClient<Database>,
  userId: string,
  jobId: string,
): Promise<JobRow | null> {
  const job = await selectOwnedInternalJob(supabase, userId, jobId);
  if (!job || job.job_kind !== "english_subjective_grade") return null;
  const selectedItems = await supabase.from("job_items").select("*").eq("job_id", jobId).order("ordinal", { ascending: true });
  if (selectedItems.error) throw selectedItems.error;
  const items = (selectedItems.data ?? []) as JobItemRow[];
  if (items.length === 0) return job;
  const projection = planInternalJobProjection(items.map((item) => ({
    ordinal: item.ordinal,
    status: item.status as "pending" | "leased" | "succeeded" | "failed",
    error: item.error,
  })));
  const now = new Date().toISOString();
  const update: TablesUpdate<"jobs"> = {
    status: projection.status,
    progress_current: projection.status === "succeeded" ? 2 : Math.min(1, projection.progressCurrent),
    progress_total: 2,
    payload: withJobUiPayload(
      job,
      projection.status === "succeeded" ? "建议分已保存" : projection.phase,
      projection.status === "succeeded"
        ? "英语主观题 AI 建议已追加保存；打开英语真题训练核对并确认终分"
        : projection.statusText,
    ),
    heartbeat_at: now,
    error: projection.error ?? null,
    finished_at: projection.status === "succeeded" || projection.status === "failed" ? now : null,
  };
  if (projection.status === "succeeded") {
    update.result = toJson({
      ...parseEnglishSubjectiveGradeCapture(items[0]),
      targetId: toText(getJobPayload(job).targetId),
    });
  }
  const updated = await supabase.from("jobs").update(update)
    .eq("id", jobId).eq("user_id", userId).in("status", ACTIVE_INTERNAL_JOB_STATUSES).select("*").maybeSingle();
  if (updated.error) throw updated.error;
  if (updated.data) return updated.data as JobRow;
  return selectOwnedInternalJob(supabase, userId, jobId);
}

function parseMath3SelfTestGenerationCapture(item: JobItemRow): Record<string, unknown> {
  const payload = asRecord(item.payload);
  const result = asRecord(item.result);
  const mode = payload?.mode;
  const difficulty = payload?.difficulty;
  const paper = asRecord(result?.paper);
  const verification = asRecord(result?.verification);
  const tokensUsed = Number(result?.tokensUsed);
  if (
    !isMath3SelfTestMode(mode)
    || !isMath3SelfTestDifficulty(difficulty)
    || !paper
    || !verification
    || verification.status !== "verified"
  ) {
    throw new Error("数学三试卷生成结果记录不完整。");
  }
  return {
    mode,
    difficulty,
    paper,
    verification,
    tokensUsed: Number.isFinite(tokensUsed) && tokensUsed > 0 ? tokensUsed : 0,
  };
}

async function syncMath3SelfTestGenerationJobState(
  supabase: SupabaseClient<Database>,
  userId: string,
  jobId: string,
): Promise<JobRow | null> {
  const job = await selectOwnedInternalJob(supabase, userId, jobId);
  if (!job || job.job_kind !== "math3_self_test_generation") return null;
  const selectedItems = await supabase
    .from("job_items")
    .select("*")
    .eq("job_id", jobId)
    .order("ordinal", { ascending: true });
  if (selectedItems.error) throw selectedItems.error;
  const items = (selectedItems.data ?? []) as JobItemRow[];
  if (items.length === 0) return job;

  const projection = planInternalJobProjection(items.map((item) => ({
    ordinal: item.ordinal,
    status: item.status as "pending" | "leased" | "succeeded" | "failed",
    error: item.error,
  })));
  const now = new Date().toISOString();
  const update: TablesUpdate<"jobs"> = {
    status: projection.status,
    progress_current: projection.status === "succeeded" ? 3 : projection.progressCurrent,
    progress_total: 3,
    payload: withJobUiPayload(
      job,
      projection.status === "succeeded" ? "结果待领取" : projection.phase,
      projection.status === "succeeded"
        ? "试卷已通过命题、分科审校与高风险终审；打开数学三自测领取"
        : projection.statusText,
    ),
    heartbeat_at: now,
    error: projection.error ?? null,
    finished_at: projection.status === "succeeded" || projection.status === "failed" ? now : null,
  };
  if (projection.status === "succeeded") {
    update.result = toJson(parseMath3SelfTestGenerationCapture(items[0]));
  }

  const updated = await supabase
    .from("jobs")
    .update(update)
    .eq("id", jobId)
    .eq("user_id", userId)
    .in("status", ACTIVE_INTERNAL_JOB_STATUSES)
    .select("*")
    .maybeSingle();
  if (updated.error) throw updated.error;
  if (updated.data) return updated.data as JobRow;
  return selectOwnedInternalJob(supabase, userId, jobId);
}

function parseMathPaperGradeCapture(item: JobItemRow): Record<string, unknown> {
  const payload = asRecord(item.payload);
  const result = asRecord(item.result);
  const paperId = payload?.paperId;
  const confirmationId = payload?.confirmationId;
  const suggestion = asRecord(result?.suggestion);
  const gradeId = result?.gradeId;
  if (!isUuid(paperId) || !isUuid(confirmationId) || !isUuid(gradeId) || !suggestion) {
    throw new Error("数学真题建议评分结果记录不完整。");
  }
  return {
    ...result,
    paperId,
    confirmationId,
    gradeId,
    suggestion,
  };
}

async function syncMathPaperGradeJobState(
  supabase: SupabaseClient<Database>,
  userId: string,
  jobId: string,
): Promise<JobRow | null> {
  const job = await selectOwnedInternalJob(supabase, userId, jobId);
  if (!job || job.job_kind !== "math_paper_grade") return null;
  const selectedItems = await supabase
    .from("job_items")
    .select("*")
    .eq("job_id", jobId)
    .order("ordinal", { ascending: true });
  if (selectedItems.error) throw selectedItems.error;
  const items = (selectedItems.data ?? []) as JobItemRow[];
  if (items.length === 0) return job;

  const projection = planInternalJobProjection(items.map((item) => ({
    ordinal: item.ordinal,
    status: item.status as "pending" | "leased" | "succeeded" | "failed",
    error: item.error,
  })));
  const now = new Date().toISOString();
  const update: TablesUpdate<"jobs"> = {
    status: projection.status,
    progress_current: projection.status === "succeeded" ? 2 : Math.min(1, projection.progressCurrent),
    progress_total: 2,
    payload: withJobUiPayload(
      job,
      projection.status === "succeeded" ? "建议分已保存" : projection.phase,
      projection.status === "succeeded"
        ? "AI 建议已追加保存；打开数学真题 OCR 页面逐步核对并确认终分"
        : projection.statusText,
    ),
    heartbeat_at: now,
    error: projection.error ?? null,
    finished_at: projection.status === "succeeded" || projection.status === "failed" ? now : null,
  };
  if (projection.status === "succeeded") {
    update.result = toJson({
      ...parseMathPaperGradeCapture(items[0]),
      targetId: toText(getJobPayload(job).targetId),
    });
  }

  const updated = await supabase
    .from("jobs")
    .update(update)
    .eq("id", jobId)
    .eq("user_id", userId)
    .in("status", ACTIVE_INTERNAL_JOB_STATUSES)
    .select("*")
    .maybeSingle();
  if (updated.error) throw updated.error;
  if (updated.data) return updated.data as JobRow;
  return selectOwnedInternalJob(supabase, userId, jobId);
}

export function internalJobLeaseRolloutEnabled(): boolean {
  return isInternalJobLeaseEnabled(process.env.WP3_INTERNAL_JOB_LEASE_ENABLED);
}

export async function createEconomicsGraphJob(
  supabase: SupabaseClient<Database>,
  input: CreateEconomicsGraphJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  const prompt = input.prompt.replace(/\s+/g, " ").trim().slice(0, 1200);
  const model = input.model.trim().slice(0, 120);
  const targetId = input.targetId.trim().slice(0, 200);
  if (!prompt) throw new Error("请输入曲线需求");
  if (!model) throw new Error("经济学曲线生成模型无效");
  if (!/^[A-Za-z0-9:_-]{8,200}$/.test(targetId)) throw new Error("经济学曲线编辑目标无效");
  return createSingleItemInternalJob(supabase, {
    userId: input.userId,
    jobKind: "economics_graph_generation",
    title: "经济学曲线结构生成",
    payload: {
      operation: "economics_graph_generation",
      prompt,
      model,
      targetId,
      phase: "任务已登记",
      statusText: "曲线需求已保存到任务账本，等待任务中心推进",
    },
    idempotencyKey: `economics-graph:${targetId}:${Date.now()}`,
    itemPayload: { operation: "economics_graph_generation", prompt, model },
    registrationError: "经济学曲线生成任务登记失败",
  });
}

export async function createMath3StepGradeJob(
  supabase: SupabaseClient<Database>,
  input: CreateMath3StepGradeJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  const question = parseMath3StepQuestion(input.question);
  const step = parseMath3StepRubric(input.step);
  const studentAnswer = input.studentAnswer.trim().slice(0, 30_000);
  const model = input.model.trim().slice(0, 120);
  const targetId = input.targetId.trim().slice(0, 200);
  if (!isUuid(input.testId) || !question || !step || question.id !== input.question.id || step.id !== input.step.id) {
    throw new Error("数学三分步评分缺少有效试卷、题目或评分步骤");
  }
  if (!model) throw new Error("数学三分步评分模型无效");
  if (!/^[A-Za-z0-9:_-]{8,200}$/.test(targetId)) throw new Error("数学三分步评分目标无效");
  return createSingleItemInternalJob(supabase, {
    userId: input.userId,
    jobKind: "math3_step_grade",
    title: `数学三分步评分 · 第 ${input.question.id} 题`,
    payload: {
      operation: "math3_step_grade",
      testId: input.testId,
      question,
      step,
      studentAnswer,
      model,
      targetId,
      phase: "任务已登记",
      statusText: "题目、作答和评分步骤已保存，等待任务中心推进",
    },
    idempotencyKey: `math3-step-grade:${input.testId}:${question.id}:${step.id}`,
    itemPayload: { operation: "math3_step_grade", testId: input.testId, question, step, studentAnswer, model },
    registrationError: "数学三分步评分任务登记失败",
  });
}

export async function createAiKnowledgeQuizJob(
  supabase: SupabaseClient<Database>,
  input: CreateAiKnowledgeQuizJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  const proposalTitle = input.proposalTitle.trim().slice(0, 500);
  const proposalContent = input.proposalContent.slice(0, 120_000);
  const model = input.model.trim().slice(0, 120);
  const targetId = input.targetId.trim().slice(0, 200);
  if (!isUuid(input.proposalId) || !proposalTitle || !proposalContent.trim()) {
    throw new Error("知识点快测任务缺少有效讲义提案快照");
  }
  if (!model) throw new Error("知识点快测生成模型无效");
  if (!/^[A-Za-z0-9:_-]{8,200}$/.test(targetId)) throw new Error("知识点快测生成目标无效");
  return createSingleItemInternalJob(supabase, {
    userId: input.userId,
    jobKind: "ai_knowledge_quiz_generation",
    title: `${proposalTitle} · 知识点快测`,
    payload: {
      operation: "ai_knowledge_quiz_generation",
      proposalId: input.proposalId,
      proposalTitle,
      proposalContent,
      model,
      targetId,
      phase: "任务已登记",
      statusText: "讲义快照已保存到任务账本，等待任务中心推进",
    },
    idempotencyKey: `ai-knowledge-quiz:${input.proposalId}:${Date.now()}`,
    itemPayload: { operation: "ai_knowledge_quiz_generation", proposalId: input.proposalId, proposalTitle, proposalContent, model },
    registrationError: "知识点快测生成任务登记失败",
  });
}

export async function createMarkdownReviewJob(
  supabase: SupabaseClient<Database>,
  input: CreateMarkdownReviewJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  if (!await hasLeaseRpc(supabase)) return { availability: "schema_pending", data: null };

  const sourceMarkdown = input.markdown;
  if (!sourceMarkdown.trim()) throw new Error("正文为空，无法创建 Markdown 审阅任务。");
  const chunks = splitMarkdownForReview(sourceMarkdown);
  if (chunks.length === 0) throw new Error("正文为空，无法创建 Markdown 审阅任务。");
  if (chunks.length > MAX_MARKDOWN_REVIEW_CHUNKS) {
    throw new Error(`正文被分成 ${chunks.length} 段，超过单任务 ${MAX_MARKDOWN_REVIEW_CHUNKS} 段上限。`);
  }
  chunks.forEach((chunk) => {
    prepareDocumentMarkdownReviewSource(chunk);
  });
  const model = input.model.trim();
  if (!model || model.length > 120) throw new Error("Markdown 审阅模型名称无效。");
  const targetId = input.targetId.trim().slice(0, 200);
  if (!/^[A-Za-z0-9:_-]{8,200}$/.test(targetId)) throw new Error("Markdown 审阅编辑目标无效。");

  const sourceChecksum = await calculateMarkdownChecksum(sourceMarkdown);
  const jobPayload: Json = toJson({
    operation: "document_markdown_review",
    sourceMarkdown,
    sourceChecksum,
    sourceLength: sourceMarkdown.length,
    chunkCount: chunks.length,
    model,
    targetId,
    registrationComplete: false,
    phase: "任务已分块",
    statusText: `已登记 ${chunks.length} 个分块，等待任务中心推进`,
  });
  const inserted = await supabase
    .from("jobs")
    .insert({
      user_id: input.userId,
      job_class: "internal",
      job_kind: "markdown_review",
      status: "queued",
      title: `Markdown 公式审阅 · ${chunks.length} 段`,
      progress_current: 0,
      progress_total: chunks.length,
      payload: jobPayload,
      heartbeat_at: new Date().toISOString(),
    } satisfies TablesInsert<"jobs">)
    .select("*")
    .single();
  if (inserted.error) {
    if (isJobLedgerSchemaPending(inserted.error)) return { availability: "schema_pending", data: null };
    throw inserted.error;
  }
  const job = inserted.data as JobRow;

  try {
    await enqueueMarkdownReviewItems(supabase, job.id, chunks, sourceChecksum, model);
  } catch (error: unknown) {
    const message = getErrorMessage(error, "Markdown 审阅分块登记失败");
    await supabase
      .from("jobs")
      .update({
        status: "failed",
        error: message,
        finished_at: new Date().toISOString(),
        payload: toJson({ ...getJobPayload(job), registrationComplete: false, phase: "任务登记失败", statusText: message }),
      })
      .eq("id", job.id)
      .eq("user_id", input.userId);
    throw error;
  }

  const registered = await supabase.from("jobs").update({
    payload: toJson({
      ...getJobPayload(job),
      registrationComplete: true,
      phase: "任务已分块",
      statusText: `已登记 ${chunks.length} 个分块，等待任务中心推进`,
    }),
  }).eq("id", job.id).eq("user_id", input.userId).eq("status", "queued").select("*").maybeSingle();
  if (registered.error) throw registered.error;
  return { availability: "synced", data: (registered.data as JobRow | null) ?? job };
}

export async function createProblemOcrJob(
  supabase: SupabaseClient<Database>,
  input: CreateProblemOcrJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  if (!await hasLeaseRpc(supabase)) return { availability: "schema_pending", data: null };
  if (input.assets.length < 1 || input.assets.length > MAX_PROBLEM_OCR_IMAGES) {
    throw new Error(`题库 OCR 每个任务必须包含 1–${MAX_PROBLEM_OCR_IMAGES} 张图片。`);
  }
  const qwenModel = input.qwenModel.trim();
  const deepseekModel = input.deepseekModel.trim();
  if (!qwenModel || qwenModel.length > 120 || !deepseekModel || deepseekModel.length > 120) {
    throw new Error("题库 OCR 模型配置无效。");
  }
  const targetId = input.targetId.trim().slice(0, 200);
  if (!/^[A-Za-z0-9:_-]{8,200}$/.test(targetId)) throw new Error("题库 OCR 编辑目标无效。");
  const assets = input.assets.map((asset) => ({
    path: asset.path.trim(),
    name: asset.name.trim().slice(0, 200) || "题目图片",
    mimeType: asset.mimeType,
  }));
  if (assets.some((asset) => !isOwnedProblemOcrAssetPath(asset.path, input.userId))) {
    throw new Error("题库 OCR 临时源图路径不属于当前用户。");
  }
  const prefixes = new Set(assets.map((asset) => asset.path.split("/").slice(0, 3).join("/")));
  if (prefixes.size !== 1) throw new Error("同一题库 OCR 任务的源图必须来自同一上传批次。");
  const sourcePrefix = `${Array.from(prefixes)[0]}/`;
  const chapterContext = input.chapterContext
    .filter((chapter) => chapter.id.trim() && chapter.name.trim())
    .slice(0, 200)
    .map((chapter) => ({ id: chapter.id.trim(), name: chapter.name.trim().slice(0, 200) }));

  const inserted = await supabase
    .from("jobs")
    .insert({
      user_id: input.userId,
      job_class: "internal",
      job_kind: "problem_ocr",
      status: "queued",
      title: `${assets.length} 张题目图片 OCR`,
      progress_current: 0,
      progress_total: assets.length,
      payload: toJson({
        operation: "problem_ocr",
        imageCount: assets.length,
        assets,
        chapterContext,
        qwenModel,
        deepseekModel,
        ocrProvider: input.ocrProvider,
        targetId,
        registrationComplete: false,
        phase: "源图已持久化",
        statusText: `已登记 ${assets.length} 张私有临时源图，等待任务中心推进`,
      }),
      source_storage_bucket: PROBLEM_OCR_BUCKET,
      source_storage_path: sourcePrefix,
      heartbeat_at: new Date().toISOString(),
    } satisfies TablesInsert<"jobs">)
    .select("*")
    .single();
  if (inserted.error) {
    if (isJobLedgerSchemaPending(inserted.error)) return { availability: "schema_pending", data: null };
    throw inserted.error;
  }
  const job = inserted.data as JobRow;

  try {
    await enqueueProblemOcrItems(supabase, job.id, assets, chapterContext, qwenModel, deepseekModel, input.ocrProvider);
  } catch (error: unknown) {
    const message = getErrorMessage(error, "题库 OCR 分块登记失败");
    await supabase.from("jobs").update({
      status: "failed",
      error: message,
      finished_at: new Date().toISOString(),
      payload: toJson({ ...getJobPayload(job), phase: "任务登记失败", statusText: message }),
    }).eq("id", job.id).eq("user_id", input.userId);
    throw error;
  }

  const registered = await supabase.from("jobs").update({
    payload: toJson({
      ...getJobPayload(job),
      registrationComplete: true,
      phase: "源图已持久化",
      statusText: `已登记 ${assets.length} 张私有临时源图，等待任务中心推进`,
    }),
  }).eq("id", job.id).eq("user_id", input.userId).eq("status", "queued").select("*").maybeSingle();
  if (registered.error) throw registered.error;
  return { availability: "synced", data: (registered.data as JobRow | null) ?? job };
}

export async function createMathPaperOcrJob(
  supabase: SupabaseClient<Database>,
  input: CreateMathPaperOcrJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  if (!await hasLeaseRpc(supabase)) return { availability: "schema_pending", data: null };
  if (input.assets.length < 1 || input.assets.length > MAX_MATH_PAPER_OCR_IMAGES) {
    throw new Error(`数学答题纸 OCR 每个任务必须包含 1–${MAX_MATH_PAPER_OCR_IMAGES} 张图片。`);
  }
  const qwenModel = input.qwenModel.trim();
  if (!qwenModel || qwenModel.length > 120) throw new Error("数学答题纸 OCR 模型配置无效。");
  const assets = input.assets.map((asset) => ({
    path: asset.path.trim(),
    pageId: asset.pageId.trim(),
    name: asset.name.trim().slice(0, 200) || "答题纸",
    sourceFingerprint: asset.sourceFingerprint.trim().toLowerCase(),
    mimeType: asset.mimeType,
  }));
  if (assets.some((asset) => (
    !isUuid(asset.pageId)
    || !/^[0-9a-f]{64}$/.test(asset.sourceFingerprint)
    || !isOwnedMathPaperOcrAssetPath(asset.path, input.userId)
  ))) throw new Error("数学答题纸 OCR 临时源图或页面标识不属于当前用户。");
  if (new Set(assets.map((asset) => asset.pageId)).size !== assets.length) {
    throw new Error("数学答题纸 OCR 页面标识不能重复。");
  }
  const prefixes = new Set(assets.map((asset) => asset.path.split("/").slice(0, 3).join("/")));
  if (prefixes.size !== 1) throw new Error("同一数学答题纸 OCR 任务的源图必须来自同一上传批次。");
  const sourcePrefix = `${Array.from(prefixes)[0]}/`;

  const inserted = await supabase
    .from("jobs")
    .insert({
      user_id: input.userId,
      job_class: "internal",
      job_kind: "math_paper_ocr",
      status: "queued",
      title: `${assets.length} 页数学答题纸 OCR`,
      progress_current: 0,
      progress_total: assets.length,
      payload: toJson({
        operation: "math_paper_ocr",
        pageCount: assets.length,
        assets,
        qwenModel,
        registrationComplete: false,
        phase: "原图已持久化",
        statusText: `已登记 ${assets.length} 页私有临时原图，等待任务中心推进`,
      }),
      source_storage_bucket: PROBLEM_OCR_BUCKET,
      source_storage_path: sourcePrefix,
      heartbeat_at: new Date().toISOString(),
    } satisfies TablesInsert<"jobs">)
    .select("*")
    .single();
  if (inserted.error) {
    if (isJobLedgerSchemaPending(inserted.error)) return { availability: "schema_pending", data: null };
    throw inserted.error;
  }
  const job = inserted.data as JobRow;

  try {
    await enqueueMathPaperOcrItems(supabase, job.id, assets, qwenModel);
  } catch (error: unknown) {
    const message = getErrorMessage(error, "数学答题纸 OCR 分块登记失败");
    await supabase.from("jobs").update({
      status: "failed",
      error: message,
      finished_at: new Date().toISOString(),
      payload: toJson({ ...getJobPayload(job), phase: "任务登记失败", statusText: message }),
    }).eq("id", job.id).eq("user_id", input.userId);
    throw error;
  }

  const registered = await supabase.from("jobs").update({
    payload: toJson({
      ...getJobPayload(job),
      registrationComplete: true,
      phase: "原图已持久化",
      statusText: `已登记 ${assets.length} 页私有临时原图，等待任务中心推进`,
    }),
  }).eq("id", job.id).eq("user_id", input.userId).eq("status", "queued").select("*").maybeSingle();
  if (registered.error) throw registered.error;
  return { availability: "synced", data: (registered.data as JobRow | null) ?? job };
}

export async function createMath3SelfTestGenerationJob(
  supabase: SupabaseClient<Database>,
  input: CreateMath3SelfTestGenerationJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  if (!await hasLeaseRpc(supabase)) return { availability: "schema_pending", data: null };

  const modeLabel = input.mode === "full" ? "完整模拟" : "快速自测";
  const difficultyLabel = input.difficulty === "comfort"
    ? "安心卷"
    : input.difficulty === "challenge"
      ? "拔高卷"
      : "模拟卷";
  const inserted = await supabase
    .from("jobs")
    .insert({
      user_id: input.userId,
      job_class: "internal",
      job_kind: "math3_self_test_generation",
      status: "queued",
      title: `数学三${modeLabel} · ${difficultyLabel}`,
      progress_current: 0,
      progress_total: 3,
      payload: toJson({
        operation: "math3_self_test_generation",
        mode: input.mode,
        difficulty: input.difficulty,
        phase: "任务已登记",
        statusText: "命题配置已保存到任务账本，等待任务中心推进",
      }),
      heartbeat_at: new Date().toISOString(),
    } satisfies TablesInsert<"jobs">)
    .select("*")
    .single();
  if (inserted.error) {
    if (isJobLedgerSchemaPending(inserted.error)) return { availability: "schema_pending", data: null };
    throw inserted.error;
  }
  const job = inserted.data as JobRow;

  try {
    await callRpcRows<JobItemRow>(supabase, "enqueue_job_item", {
      p_job_id: job.id,
      p_ordinal: 0,
      p_idempotency_key: `math3-self-test:${input.mode}:${input.difficulty}`,
      p_payload: {
        operation: "math3_self_test_generation",
        mode: input.mode,
        difficulty: input.difficulty,
      },
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error, "数学三试卷生成任务登记失败");
    await supabase.from("jobs").update({
      status: "failed",
      error: message,
      finished_at: new Date().toISOString(),
      payload: withJobUiPayload(job, "任务登记失败", message),
    }).eq("id", job.id).eq("user_id", input.userId);
    throw error;
  }

  return { availability: "synced", data: job };
}

export async function createMathPaperGradeJob(
  supabase: SupabaseClient<Database>,
  input: CreateMathPaperGradeJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  if (!await hasLeaseRpc(supabase)) return { availability: "schema_pending", data: null };
  if (!isUuid(input.paperId) || !isUuid(input.confirmationId)) {
    throw new Error("数学真题建议评分缺少有效的试卷或 OCR 确认版本。");
  }
  const targetId = input.targetId.trim().slice(0, 200);
  if (!/^[A-Za-z0-9:_-]{8,200}$/.test(targetId)) throw new Error("数学真题建议评分目标无效。");

  const inserted = await supabase
    .from("jobs")
    .insert({
      user_id: input.userId,
      job_class: "internal",
      job_kind: "math_paper_grade",
      status: "queued",
      title: "数学真题整套建议评分",
      progress_current: 0,
      progress_total: 2,
      payload: toJson({
        operation: "math_paper_grade",
        paperId: input.paperId,
        confirmationId: input.confirmationId,
        targetId,
        phase: "任务已登记",
        statusText: "试卷与 OCR 确认版本已保存到任务账本，等待任务中心推进",
      }),
      heartbeat_at: new Date().toISOString(),
    } satisfies TablesInsert<"jobs">)
    .select("*")
    .single();
  if (inserted.error) {
    if (isJobLedgerSchemaPending(inserted.error)) return { availability: "schema_pending", data: null };
    throw inserted.error;
  }
  const job = inserted.data as JobRow;

  try {
    await callRpcRows<JobItemRow>(supabase, "enqueue_job_item", {
      p_job_id: job.id,
      p_ordinal: 0,
      p_idempotency_key: `math-paper-grade:${input.confirmationId}`,
      p_payload: {
        operation: "math_paper_grade",
        paperId: input.paperId,
        confirmationId: input.confirmationId,
      },
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error, "数学真题建议评分任务登记失败");
    await supabase.from("jobs").update({
      status: "failed",
      error: message,
      finished_at: new Date().toISOString(),
      payload: withJobUiPayload(job, "任务登记失败", message),
    }).eq("id", job.id).eq("user_id", input.userId);
    throw error;
  }

  return { availability: "synced", data: job };
}

export async function createMath3ClassificationJob(
  supabase: SupabaseClient<Database>,
  input: CreateMath3ClassificationJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  if (!await hasLeaseRpc(supabase)) return { availability: "schema_pending", data: null };
  if (input.problems.length < 1 || input.problems.length > MAX_MATH3_CLASSIFICATION_PROBLEMS) {
    throw new Error(`数学三批量归类每个任务必须包含 1–${MAX_MATH3_CLASSIFICATION_PROBLEMS} 道题。`);
  }
  if (!/^[0-9a-f]{64}$/i.test(input.sourceChecksum)) throw new Error("数学三批量归类源题快照校验值无效。");
  if (new Set(input.problems.map((problem) => problem.id)).size !== input.problems.length) {
    throw new Error("数学三批量归类源题 ID 不能重复。");
  }
  const problems = parseMath3ClassificationProblems(input.problems);
  if (problems.length !== input.problems.length) throw new Error("数学三批量归类源题结构不完整。");
  const scopeLabel = input.scopeLabel.trim().slice(0, 120) || "题目";
  const targetId = input.targetId.trim().slice(0, 200);
  if (!/^[A-Za-z0-9:_-]{8,200}$/.test(targetId)) throw new Error("数学三批量归类编辑目标无效。");

  const inserted = await supabase.from("jobs").insert({
    user_id: input.userId,
    job_class: "internal",
    job_kind: "math3_auto_classify",
    status: "queued",
    title: `数学三大纲批量归类 · ${problems.length} 题`,
    progress_current: 0,
    progress_total: problems.length,
    payload: toJson({
      operation: "math3_auto_classify",
      problems,
      sourceChecksum: input.sourceChecksum,
      scopeLabel,
      targetId,
      registrationComplete: false,
      phase: "任务已分批",
      statusText: `已保存 ${problems.length} 道题的源题快照，等待任务中心推进`,
    }),
    heartbeat_at: new Date().toISOString(),
  } satisfies TablesInsert<"jobs">).select("*").single();
  if (inserted.error) {
    if (isJobLedgerSchemaPending(inserted.error)) return { availability: "schema_pending", data: null };
    throw inserted.error;
  }
  const job = inserted.data as JobRow;
  try {
    await enqueueMath3ClassificationItems(supabase, job.id, problems, input.sourceChecksum);
  } catch (error: unknown) {
    const message = getErrorMessage(error, "数学三批量归类分块登记失败");
    await supabase.from("jobs").update({
      status: "failed",
      error: message,
      finished_at: new Date().toISOString(),
      payload: withJobUiPayload(job, "任务登记失败", message),
    }).eq("id", job.id).eq("user_id", input.userId);
    throw error;
  }
  const registered = await supabase.from("jobs").update({
    payload: toJson({
      ...getJobPayload(job),
      registrationComplete: true,
      phase: "任务已分批",
      statusText: `已保存 ${problems.length} 道题的源题快照，等待任务中心推进`,
    }),
  }).eq("id", job.id).eq("user_id", input.userId).eq("status", "queued").select("*").maybeSingle();
  if (registered.error) throw registered.error;
  return { availability: "synced", data: (registered.data as JobRow | null) ?? job };
}

export async function createEnglishSubjectiveGradeJob(
  supabase: SupabaseClient<Database>,
  input: CreateEnglishSubjectiveGradeJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  if (!await hasLeaseRpc(supabase)) return { availability: "schema_pending", data: null };
  const answers = normalizeEnglishSubjectiveAnswers(input.answers);
  if (!isUuid(input.passageId) || ![1, 2, 3].includes(input.round)) {
    throw new Error("英语主观题建议评分缺少有效题组或轮次。");
  }
  if (!Object.values(answers).some((answer) => answer.trim())) throw new Error("英语主观题作答为空。");
  const targetId = input.targetId.trim().slice(0, 200);
  if (!/^[A-Za-z0-9:_-]{8,200}$/.test(targetId)) throw new Error("英语主观题建议评分目标无效。");
  const inserted = await supabase.from("jobs").insert({
    user_id: input.userId,
    job_class: "internal",
    job_kind: "english_subjective_grade",
    status: "queued",
    title: `英语主观题 R${input.round} 建议评分`,
    progress_current: 0,
    progress_total: 2,
    payload: toJson({
      operation: "english_subjective_grade",
      passageId: input.passageId,
      round: input.round,
      answers,
      targetId,
      phase: "任务已登记",
      statusText: "本轮作答快照已保存到任务账本，等待任务中心推进",
    }),
    heartbeat_at: new Date().toISOString(),
  } satisfies TablesInsert<"jobs">).select("*").single();
  if (inserted.error) {
    if (isJobLedgerSchemaPending(inserted.error)) return { availability: "schema_pending", data: null };
    throw inserted.error;
  }
  const job = inserted.data as JobRow;
  try {
    await callRpcRows<JobItemRow>(supabase, "enqueue_job_item", {
      p_job_id: job.id,
      p_ordinal: 0,
      p_idempotency_key: `english-subjective-grade:${input.passageId}:${input.round}:${job.id}`,
      p_payload: {
        operation: "english_subjective_grade",
        passageId: input.passageId,
        round: input.round,
        answers,
      },
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error, "英语主观题建议评分任务登记失败");
    await supabase.from("jobs").update({
      status: "failed",
      error: message,
      finished_at: new Date().toISOString(),
      payload: withJobUiPayload(job, "任务登记失败", message),
    }).eq("id", job.id).eq("user_id", input.userId);
    throw error;
  }
  return { availability: "synced", data: job };
}

export async function advanceMarkdownReviewJob(
  supabase: SupabaseClient<Database>,
  input: AdvanceMarkdownReviewJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  if (!await hasLeaseRpc(supabase)) return { availability: "schema_pending", data: null };
  const job = await selectOwnedMarkdownReviewJob(supabase, input.userId, input.jobId);
  if (!job) return { availability: "synced", data: null };
  if (["succeeded", "failed", "claimed", "cancelled"].includes(job.status)) {
    return { availability: "synced", data: job };
  }

  const workerId = `route-${randomUUID()}`;
  const claimed = await callRpcRows<JobItemRow>(supabase, "claim_next_job_item", {
    p_job_id: job.id,
    p_worker_id: workerId,
    p_lease_seconds: 300,
  });
  const item = claimed[0];
  if (!item) {
    return { availability: "synced", data: await syncMarkdownReviewJobState(supabase, input.userId, job.id) };
  }

  const payload = asRecord(item.payload);
  const sourceMarkdown = toText(payload?.sourceMarkdown);
  const model = toText(payload?.model);
  const chunkIndex = Number(payload?.chunkIndex);
  const chunkCount = Number(payload?.chunkCount);
  if (!sourceMarkdown || !model || !Number.isInteger(chunkIndex) || !Number.isInteger(chunkCount)) {
    const message = "Markdown 审阅分块 payload 不完整。";
    await callRpcRows<JobItemRow>(supabase, "fail_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_error: message,
    });
    return { availability: "synced", data: await syncMarkdownReviewJobState(supabase, input.userId, job.id) };
  }

  await supabase
    .from("jobs")
    .update({
      status: "running",
      started_at: job.started_at ?? new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
      payload: withJobUiPayload(job, `审阅第 ${chunkIndex}/${chunkCount} 段`, "DeepSeek 正在审查公式和标题层级"),
      error: null,
    })
    .eq("id", job.id)
    .eq("user_id", input.userId)
    .in("status", ACTIVE_INTERNAL_JOB_STATUSES);

  try {
    const result = await reviewDocumentMarkdown({
      apiKey: input.apiKey,
      model,
      markdown: sourceMarkdown,
      chunkIndex,
      chunkCount,
    });
    await callRpcRows<JobItemRow>(supabase, "complete_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_result: {
        reviewedMarkdown: result.markdown,
        summary: result.summary,
        tokensUsed: result.tokensUsed,
        model: result.model,
        chunkIndex,
        chunkCount,
      },
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error, `第 ${chunkIndex}/${chunkCount} 段审阅失败`);
    await callRpcRows<JobItemRow>(supabase, "fail_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_error: message.slice(0, 32768),
    });
  }

  return { availability: "synced", data: await syncMarkdownReviewJobState(supabase, input.userId, job.id) };
}

export async function advanceProblemOcrJob(
  supabase: SupabaseClient<Database>,
  input: AdvanceInternalJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  if (!await hasLeaseRpc(supabase)) return { availability: "schema_pending", data: null };
  const job = await selectOwnedInternalJob(supabase, input.userId, input.jobId);
  if (!job || job.job_kind !== "problem_ocr") return { availability: "synced", data: null };
  if (["succeeded", "failed", "claimed", "cancelled"].includes(job.status)) return { availability: "synced", data: job };
  if (getJobPayload(job).ocrProvider !== "deepseek" && !input.qwenApiKey.trim()) throw new Error("服务器 Qwen API Key 未配置");
  if (!input.deepseekApiKey.trim()) throw new Error("服务器 DeepSeek API Key 未配置");

  const workerId = `route-${randomUUID()}`;
  const claimed = await callRpcRows<JobItemRow>(supabase, "claim_next_job_item", {
    p_job_id: job.id,
    p_worker_id: workerId,
    p_lease_seconds: 300,
  });
  const item = claimed[0];
  if (!item) return { availability: "synced", data: await syncProblemOcrJobState(supabase, input.userId, job.id) };

  const payload = asRecord(item.payload);
  const imageIndex = Number(payload?.imageIndex);
  const imageCount = Number(payload?.imageCount);
  const imageName = toText(payload?.imageName);
  const sourceStorageBucket = toText(payload?.sourceStorageBucket);
  const sourceStoragePath = toText(payload?.sourceStoragePath);
  const mimeType = toText(payload?.mimeType);
  const qwenModel = toText(payload?.qwenModel);
  const deepseekModel = toText(payload?.deepseekModel);
  const ocrProvider = payload?.ocrProvider === "deepseek" ? "deepseek" : "qwen";
  const chapterContext = parseProblemOcrChapterContext(payload?.chapterContext);
  if (
    !Number.isInteger(imageIndex)
    || !Number.isInteger(imageCount)
    || imageIndex < 1
    || imageCount < 1
    || !imageName
    || sourceStorageBucket !== PROBLEM_OCR_BUCKET
    || !isOwnedProblemOcrAssetPath(sourceStoragePath, input.userId)
    || !["image/jpeg", "image/png", "image/webp"].includes(mimeType)
    || !qwenModel
    || !deepseekModel
  ) {
    const message = "题库 OCR 分块 payload 不完整或源图边界无效。";
    await callRpcRows<JobItemRow>(supabase, "fail_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_error: message,
    });
    return { availability: "synced", data: await syncProblemOcrJobState(supabase, input.userId, job.id) };
  }

  await supabase.from("jobs").update({
    status: "running",
    started_at: job.started_at ?? new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
    payload: withJobUiPayload(job, `识别第 ${imageIndex}/${imageCount} 张`, "正在识别文字并整理为可编辑题目"),
    error: null,
  }).eq("id", job.id).eq("user_id", input.userId).in("status", ACTIVE_INTERNAL_JOB_STATUSES);

  try {
    const result = await runWithInternalJobItemLease(supabase, { item, workerId }, async (signal) => {
      const downloaded = await supabase.storage.from(PROBLEM_OCR_BUCKET).download(sourceStoragePath);
      if (downloaded.error || !downloaded.data) throw downloaded.error ?? new Error("题库 OCR 临时源图下载失败");
      signal.throwIfAborted();
      const imageBase64 = Buffer.from(await downloaded.data.arrayBuffer()).toString("base64");
      const recognized = await recognizeProblemImage({
        apiKey: ocrProvider === "deepseek" ? input.deepseekApiKey : input.qwenApiKey,
        model: ocrProvider === "deepseek" ? DEFAULT_DEEPSEEK_OCR_MODEL : qwenModel,
        provider: ocrProvider,
        imageBase64,
        mimeType,
        signal,
      });
      const ocrText = recognized.text.length > MAX_PROBLEM_OCR_TEXT
        ? `${recognized.text.slice(0, MAX_PROBLEM_OCR_TEXT)}\n...(文本过长已截断)`
        : recognized.text;
      const analyzed = await analyzeProblemOcrText({
        apiKey: input.deepseekApiKey,
        model: deepseekModel,
        ocrText,
        chapterContext: chapterContext.map((chapter) => chapter.name),
        signal,
      });
      const problems = analyzed.problems
        .map((problem) => materializeProblemOcrProblem(problem, ocrText, chapterContext))
        .filter((problem): problem is NonNullable<typeof problem> => Boolean(problem));
      return {
        imageIndex,
        imageCount,
        imageName,
        ocrText,
        problems,
        warning: analyzed.warning ?? null,
        qwenModel: recognized.model,
        ocrProvider,
        deepseekModel,
        tokensUsed: analyzed.tokensUsed,
      };
    });
    await callRpcRows<JobItemRow>(supabase, "complete_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_result: result,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error, `第 ${imageIndex}/${imageCount} 张题目图片处理失败`);
    await callRpcRows<JobItemRow>(supabase, "fail_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_error: message.slice(0, 32768),
    });
  }

  return { availability: "synced", data: await syncProblemOcrJobState(supabase, input.userId, job.id) };
}

export async function advanceMathPaperOcrJob(
  supabase: SupabaseClient<Database>,
  input: AdvanceInternalJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  if (!await hasLeaseRpc(supabase)) return { availability: "schema_pending", data: null };
  const job = await selectOwnedInternalJob(supabase, input.userId, input.jobId);
  if (!job || job.job_kind !== "math_paper_ocr") return { availability: "synced", data: null };
  if (["succeeded", "failed", "claimed", "cancelled"].includes(job.status)) return { availability: "synced", data: job };
  if (!input.qwenApiKey.trim()) throw new Error("服务器 Qwen API Key 未配置");

  const workerId = `route-${randomUUID()}`;
  const claimed = await callRpcRows<JobItemRow>(supabase, "claim_next_job_item", {
    p_job_id: job.id,
    p_worker_id: workerId,
    p_lease_seconds: 300,
  });
  const item = claimed[0];
  if (!item) return { availability: "synced", data: await syncMathPaperOcrJobState(supabase, input.userId, job.id) };

  const payload = asRecord(item.payload);
  const pageIndex = Number(payload?.pageIndex);
  const pageCount = Number(payload?.pageCount);
  const pageId = toText(payload?.pageId);
  const fileName = toText(payload?.fileName);
  const sourceFingerprint = toText(payload?.sourceFingerprint);
  const sourceStorageBucket = toText(payload?.sourceStorageBucket);
  const sourceStoragePath = toText(payload?.sourceStoragePath);
  const mimeType = toText(payload?.mimeType);
  const qwenModel = toText(payload?.qwenModel);
  if (
    !Number.isInteger(pageIndex)
    || !Number.isInteger(pageCount)
    || pageIndex < 1
    || pageCount < 1
    || !isUuid(pageId)
    || !fileName
    || !/^[0-9a-f]{64}$/i.test(sourceFingerprint)
    || sourceStorageBucket !== PROBLEM_OCR_BUCKET
    || !isOwnedMathPaperOcrAssetPath(sourceStoragePath, input.userId)
    || !["image/jpeg", "image/png", "image/webp"].includes(mimeType)
    || !qwenModel
  ) {
    await callRpcRows<JobItemRow>(supabase, "fail_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_error: "数学答题纸 OCR 分块 payload 不完整或源图边界无效。",
    });
    return { availability: "synced", data: await syncMathPaperOcrJobState(supabase, input.userId, job.id) };
  }

  const started = await supabase.from("jobs").update({
    status: "running",
    started_at: job.started_at ?? new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
    payload: withJobUiPayload(job, `识别第 ${pageIndex}/${pageCount} 页`, "正在识别答题纸文字；结果仍需逐页人工核对"),
    error: null,
  }).eq("id", job.id).eq("user_id", input.userId).in("status", ACTIVE_INTERNAL_JOB_STATUSES).select("id").maybeSingle();
  if (started.error) throw started.error;
  if (!started.data) throw new Error("数学答题纸 OCR 任务已取消或不再处于可推进状态");

  try {
    const result = await runWithInternalJobItemLease(supabase, { item, workerId }, async (signal) => {
      const downloaded = await supabase.storage.from(PROBLEM_OCR_BUCKET).download(sourceStoragePath);
      if (downloaded.error || !downloaded.data) throw downloaded.error ?? new Error("数学答题纸 OCR 临时原图下载失败");
      signal.throwIfAborted();
      const imageBase64 = Buffer.from(await downloaded.data.arrayBuffer()).toString("base64");
      const recognized = await recognizeProblemImage({
        apiKey: input.qwenApiKey,
        model: qwenModel,
        imageBase64,
        mimeType,
        signal,
      });
      const text = recognized.text.length > MAX_MATH_PAPER_OCR_TEXT
        ? `${recognized.text.slice(0, MAX_MATH_PAPER_OCR_TEXT)}\n...(文本过长已截断)`
        : recognized.text;
      return { text, model: recognized.model };
    });
    await callRpcRows<JobItemRow>(supabase, "complete_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_result: result,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error, `第 ${pageIndex}/${pageCount} 页答题纸识别失败`);
    await callRpcRows<JobItemRow>(supabase, "fail_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_error: message.slice(0, 32768),
    });
  }

  return { availability: "synced", data: await syncMathPaperOcrJobState(supabase, input.userId, job.id) };
}

async function updateMath3SelfTestGenerationStage(
  supabase: SupabaseClient<Database>,
  job: JobRow,
  userId: string,
  stage: Math3SelfTestGenerationStage,
): Promise<void> {
  const updated = await supabase.from("jobs").update({
    status: "running",
    started_at: job.started_at ?? new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
    progress_current: stage.progressCurrent,
    progress_total: stage.progressTotal,
    payload: withJobUiPayload(job, stage.phase, stage.statusText),
    error: null,
  }).eq("id", job.id).eq("user_id", userId).in("status", ACTIVE_INTERNAL_JOB_STATUSES).select("id").maybeSingle();
  if (updated.error) throw updated.error;
  if (!updated.data) throw new Error("数学三试卷生成任务已取消或不再处于可推进状态");
}

async function updateMathPaperGradeStage(
  supabase: SupabaseClient<Database>,
  job: JobRow,
  userId: string,
  stage: MathPaperGradeStage,
): Promise<void> {
  const updated = await supabase.from("jobs").update({
    status: "running",
    started_at: job.started_at ?? new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
    progress_current: stage.progressCurrent,
    progress_total: stage.progressTotal,
    payload: withJobUiPayload(job, stage.phase, stage.statusText),
    error: null,
  }).eq("id", job.id).eq("user_id", userId).in("status", ACTIVE_INTERNAL_JOB_STATUSES).select("id").maybeSingle();
  if (updated.error) throw updated.error;
  if (!updated.data) throw new Error("数学真题建议评分任务已取消或不再处于可推进状态");
}

export async function advanceMath3SelfTestGenerationJob(
  supabase: SupabaseClient<Database>,
  input: AdvanceInternalJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  if (!await hasLeaseRpc(supabase)) return { availability: "schema_pending", data: null };
  const job = await selectOwnedInternalJob(supabase, input.userId, input.jobId);
  if (!job || job.job_kind !== "math3_self_test_generation") return { availability: "synced", data: null };
  if (["succeeded", "failed", "claimed", "cancelled"].includes(job.status)) {
    return { availability: "synced", data: job };
  }
  if (!input.deepseekApiKey.trim()) throw new Error("服务器 DeepSeek API Key 未配置");

  const workerId = `route-${randomUUID()}`;
  const claimed = await callRpcRows<JobItemRow>(supabase, "claim_next_job_item", {
    p_job_id: job.id,
    p_worker_id: workerId,
    p_lease_seconds: 300,
  });
  const item = claimed[0];
  if (!item) {
    return { availability: "synced", data: await syncMath3SelfTestGenerationJobState(supabase, input.userId, job.id) };
  }

  const payload = asRecord(item.payload);
  const mode = payload?.mode;
  const difficulty = payload?.difficulty;
  if (!isMath3SelfTestMode(mode) || !isMath3SelfTestDifficulty(difficulty)) {
    await callRpcRows<JobItemRow>(supabase, "fail_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_error: "数学三试卷生成任务缺少有效的模式或难度配置。",
    });
    return { availability: "synced", data: await syncMath3SelfTestGenerationJobState(supabase, input.userId, job.id) };
  }

  try {
    const result = await runWithInternalJobItemLease(supabase, { item, workerId }, (signal) => (
      generateVerifiedMath3SelfTestPaper({
        apiKey: input.deepseekApiKey,
        generationModel: DEFAULT_DEEPSEEK_MODEL,
        reviewerModel: resolveAIProviderRoute("deep_reasoning").model,
        mode,
        difficulty,
        signal,
        onStage: (stage) => updateMath3SelfTestGenerationStage(supabase, job, input.userId, stage),
      })
    ));
    await callRpcRows<JobItemRow>(supabase, "complete_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_result: {
        ...result,
        mode,
        difficulty,
      },
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error, "数学三试卷生成失败");
    await callRpcRows<JobItemRow>(supabase, "fail_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_error: message.slice(0, 32768),
    });
  }

  return { availability: "synced", data: await syncMath3SelfTestGenerationJobState(supabase, input.userId, job.id) };
}

export async function advanceMathPaperGradeJob(
  supabase: SupabaseClient<Database>,
  input: AdvanceInternalJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  if (!await hasLeaseRpc(supabase)) return { availability: "schema_pending", data: null };
  const job = await selectOwnedInternalJob(supabase, input.userId, input.jobId);
  if (!job || job.job_kind !== "math_paper_grade") return { availability: "synced", data: null };
  if (["succeeded", "failed", "claimed", "cancelled"].includes(job.status)) {
    return { availability: "synced", data: job };
  }
  if (!input.deepseekApiKey.trim()) throw new Error("服务器 DeepSeek API Key 未配置");

  const workerId = `route-${randomUUID()}`;
  const claimed = await callRpcRows<JobItemRow>(supabase, "claim_next_job_item", {
    p_job_id: job.id,
    p_worker_id: workerId,
    p_lease_seconds: 300,
  });
  const item = claimed[0];
  if (!item) return { availability: "synced", data: await syncMathPaperGradeJobState(supabase, input.userId, job.id) };

  const payload = asRecord(item.payload);
  const paperId = payload?.paperId;
  const confirmationId = payload?.confirmationId;
  if (!isUuid(paperId) || !isUuid(confirmationId)) {
    await callRpcRows<JobItemRow>(supabase, "fail_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_error: "数学真题建议评分任务缺少有效的试卷或 OCR 确认版本。",
    });
    return { availability: "synced", data: await syncMathPaperGradeJobState(supabase, input.userId, job.id) };
  }

  try {
    const result = await runWithInternalJobItemLease(supabase, { item, workerId }, (signal, renewNow) => (
      generateAndRecordMathPaperGrade({
        supabase,
        paperId,
        confirmationId,
        commandId: job.id,
        apiKey: input.deepseekApiKey,
        signal,
        beforePersist: renewNow,
        onStage: (stage) => updateMathPaperGradeStage(supabase, job, input.userId, stage),
      })
    ));
    await callRpcRows<JobItemRow>(supabase, "complete_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_result: result,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error, "数学真题建议评分失败");
    await callRpcRows<JobItemRow>(supabase, "fail_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_error: message.slice(0, 32768),
    });
  }

  return { availability: "synced", data: await syncMathPaperGradeJobState(supabase, input.userId, job.id) };
}

export async function advanceMath3ClassificationJob(
  supabase: SupabaseClient<Database>,
  input: AdvanceInternalJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  if (!await hasLeaseRpc(supabase)) return { availability: "schema_pending", data: null };
  const job = await selectOwnedInternalJob(supabase, input.userId, input.jobId);
  if (!job || job.job_kind !== "math3_auto_classify") return { availability: "synced", data: null };
  if (["succeeded", "failed", "claimed", "cancelled"].includes(job.status)) return { availability: "synced", data: job };
  if (!input.deepseekApiKey.trim()) throw new Error("服务器 DeepSeek API Key 未配置");

  const workerId = `route-${randomUUID()}`;
  const claimed = await callRpcRows<JobItemRow>(supabase, "claim_next_job_item", {
    p_job_id: job.id,
    p_worker_id: workerId,
    p_lease_seconds: 300,
  });
  const item = claimed[0];
  if (!item) return { availability: "synced", data: await syncMath3ClassificationJobState(supabase, input.userId, job.id) };
  const problems = parseMath3ClassificationProblems(asRecord(item.payload)?.problems);
  if (problems.length === 0 || problems.length > MATH3_CLASSIFICATION_BATCH_SIZE) {
    await callRpcRows<JobItemRow>(supabase, "fail_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_error: "数学三批量归类分块缺少有效题目。",
    });
    return { availability: "synced", data: await syncMath3ClassificationJobState(supabase, input.userId, job.id) };
  }
  const started = await supabase.from("jobs").update({
    status: "running",
    started_at: job.started_at ?? new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
    payload: withJobUiPayload(job, `归类第 ${item.ordinal + 1} 批`, `DeepSeek 正在归类本批 ${problems.length} 道题`),
    error: null,
  }).eq("id", job.id).eq("user_id", input.userId).in("status", ACTIVE_INTERNAL_JOB_STATUSES).select("id").maybeSingle();
  if (started.error) throw started.error;
  if (!started.data) throw new Error("数学三批量归类任务已取消或不再处于可推进状态");
  try {
    const result = await runWithInternalJobItemLease(supabase, { item, workerId }, (signal) => (
      classifyMath3Problems({
        apiKey: input.deepseekApiKey,
        model: DEFAULT_DEEPSEEK_MODEL,
        problems,
        signal,
      })
    ));
    await callRpcRows<JobItemRow>(supabase, "complete_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_result: result,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error, `数学三批量归类第 ${item.ordinal + 1} 批失败`);
    await callRpcRows<JobItemRow>(supabase, "fail_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_error: message.slice(0, 32768),
    });
  }
  return { availability: "synced", data: await syncMath3ClassificationJobState(supabase, input.userId, job.id) };
}

async function updateEnglishSubjectiveGradeStage(
  supabase: SupabaseClient<Database>,
  job: JobRow,
  userId: string,
  stage: EnglishSubjectiveGradeStage,
): Promise<void> {
  const updated = await supabase.from("jobs").update({
    status: "running",
    started_at: job.started_at ?? new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
    progress_current: stage.progressCurrent,
    progress_total: stage.progressTotal,
    payload: withJobUiPayload(job, stage.phase, stage.statusText),
    error: null,
  }).eq("id", job.id).eq("user_id", userId).in("status", ACTIVE_INTERNAL_JOB_STATUSES).select("id").maybeSingle();
  if (updated.error) throw updated.error;
  if (!updated.data) throw new Error("英语主观题建议评分任务已取消或不再处于可推进状态");
}

export async function advanceEnglishSubjectiveGradeJob(
  supabase: SupabaseClient<Database>,
  input: AdvanceInternalJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  if (!await hasLeaseRpc(supabase)) return { availability: "schema_pending", data: null };
  const job = await selectOwnedInternalJob(supabase, input.userId, input.jobId);
  if (!job || job.job_kind !== "english_subjective_grade") return { availability: "synced", data: null };
  if (["succeeded", "failed", "claimed", "cancelled"].includes(job.status)) return { availability: "synced", data: job };
  if (!input.deepseekApiKey.trim()) throw new Error("服务器 DeepSeek API Key 未配置");
  const workerId = `route-${randomUUID()}`;
  const claimed = await callRpcRows<JobItemRow>(supabase, "claim_next_job_item", {
    p_job_id: job.id,
    p_worker_id: workerId,
    p_lease_seconds: 300,
  });
  const item = claimed[0];
  if (!item) return { availability: "synced", data: await syncEnglishSubjectiveGradeJobState(supabase, input.userId, job.id) };
  const payload = asRecord(item.payload);
  const passageId = payload?.passageId;
  const round = Number(payload?.round);
  const answers = normalizeEnglishSubjectiveAnswers(payload?.answers);
  if (!isUuid(passageId) || !Number.isInteger(round) || round < 1 || round > 3 || !Object.values(answers).some((answer) => answer.trim())) {
    await callRpcRows<JobItemRow>(supabase, "fail_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_error: "英语主观题建议评分任务缺少有效题组、轮次或作答快照。",
    });
    return { availability: "synced", data: await syncEnglishSubjectiveGradeJobState(supabase, input.userId, job.id) };
  }
  try {
    const result = await runWithInternalJobItemLease(supabase, { item, workerId }, (signal, renewNow) => (
      generateAndRecordEnglishSubjectiveGrade({
        supabase,
        userId: input.userId,
        passageId,
        round: round as 1 | 2 | 3,
        answers,
        commandId: job.id,
        apiKey: input.deepseekApiKey,
        signal,
        beforePersist: renewNow,
        onStage: (stage) => updateEnglishSubjectiveGradeStage(supabase, job, input.userId, stage),
      })
    ));
    await callRpcRows<JobItemRow>(supabase, "complete_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_result: result,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error, "英语主观题建议评分失败");
    await callRpcRows<JobItemRow>(supabase, "fail_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_error: message.slice(0, 32768),
    });
  }
  return { availability: "synced", data: await syncEnglishSubjectiveGradeJobState(supabase, input.userId, job.id) };
}

export async function advanceEconomicsGraphJob(
  supabase: SupabaseClient<Database>,
  input: AdvanceInternalJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  if (!await hasLeaseRpc(supabase)) return { availability: "schema_pending", data: null };
  const job = await selectOwnedInternalJob(supabase, input.userId, input.jobId);
  if (!job || job.job_kind !== "economics_graph_generation") return { availability: "synced", data: null };
  if (["succeeded", "failed", "claimed", "cancelled"].includes(job.status)) return { availability: "synced", data: job };
  if (!input.deepseekApiKey.trim()) throw new Error("服务器 DeepSeek API Key 未配置");
  const workerId = `route-${randomUUID()}`;
  const [item] = await callRpcRows<JobItemRow>(supabase, "claim_next_job_item", {
    p_job_id: job.id,
    p_worker_id: workerId,
    p_lease_seconds: 300,
  });
  if (!item) return { availability: "synced", data: await syncSingleGeneratedJobState(supabase, {
    userId: input.userId,
    jobId: job.id,
    jobKind: "economics_graph_generation",
    successPhase: "结构待插入",
    successStatusText: "经济学曲线结构已生成；打开编辑页检查后插入正文",
  }) };
  const payload = asRecord(item.payload);
  const prompt = toText(payload?.prompt);
  const model = toText(payload?.model);
  if (!prompt || !model) {
    await failClaimedInternalJobItem(supabase, {
      item,
      workerId,
      error: new Error("经济学曲线任务缺少需求或模型快照"),
      fallback: "经济学曲线任务输入无效",
    });
    return { availability: "synced", data: await syncSingleGeneratedJobState(supabase, {
      userId: input.userId,
      jobId: job.id,
      jobKind: "economics_graph_generation",
      successPhase: "结构待插入",
      successStatusText: "经济学曲线结构已生成；打开编辑页检查后插入正文",
    }) };
  }
  const started = await supabase.from("jobs").update({
    status: "running",
    started_at: job.started_at ?? new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
    payload: withJobUiPayload(job, "正在生成曲线结构", "DeepSeek 正在选择模板并生成可审查结构"),
    error: null,
  }).eq("id", job.id).eq("user_id", input.userId).in("status", ACTIVE_INTERNAL_JOB_STATUSES).select("id").maybeSingle();
  if (started.error) throw started.error;
  if (!started.data) throw new Error("经济学曲线任务已取消或不再处于可推进状态");
  try {
    const result = await runWithInternalJobItemLease(supabase, { item, workerId }, (signal) => generateEconomicsGraph({
      apiKey: input.deepseekApiKey,
      model,
      prompt,
      signal,
    }));
    await callRpcRows<JobItemRow>(supabase, "complete_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_result: result,
    });
  } catch (error: unknown) {
    await callRpcRows<JobItemRow>(supabase, "fail_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_error: getErrorMessage(error, "经济学曲线生成失败").slice(0, 32768),
    });
  }
  return { availability: "synced", data: await syncSingleGeneratedJobState(supabase, {
    userId: input.userId,
    jobId: job.id,
    jobKind: "economics_graph_generation",
    successPhase: "结构待插入",
    successStatusText: "经济学曲线结构已生成；打开编辑页检查后插入正文",
  }) };
}

export async function advanceMath3StepGradeJob(
  supabase: SupabaseClient<Database>,
  input: AdvanceInternalJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  if (!await hasLeaseRpc(supabase)) return { availability: "schema_pending", data: null };
  const job = await selectOwnedInternalJob(supabase, input.userId, input.jobId);
  if (!job || job.job_kind !== "math3_step_grade") return { availability: "synced", data: null };
  if (["succeeded", "failed", "claimed", "cancelled"].includes(job.status)) return { availability: "synced", data: job };
  if (!input.deepseekApiKey.trim()) throw new Error("服务器 DeepSeek API Key 未配置");
  const workerId = `route-${randomUUID()}`;
  const [item] = await callRpcRows<JobItemRow>(supabase, "claim_next_job_item", {
    p_job_id: job.id,
    p_worker_id: workerId,
    p_lease_seconds: 300,
  });
  if (!item) return { availability: "synced", data: await syncSingleGeneratedJobState(supabase, {
    userId: input.userId,
    jobId: job.id,
    jobKind: "math3_step_grade",
    successPhase: "评分待写入",
    successStatusText: "本步骤建议分已生成；打开数学三自测写入试卷进度",
  }) };
  const payload = asRecord(item.payload);
  const testId = toText(payload?.testId);
  const question = parseMath3StepQuestion(payload?.question);
  const step = parseMath3StepRubric(payload?.step);
  const studentAnswer = toText(payload?.studentAnswer);
  const model = toText(payload?.model);
  if (!isUuid(testId) || !question || !step || !model) {
    await failClaimedInternalJobItem(supabase, {
      item,
      workerId,
      error: new Error("数学三分步评分任务输入快照不完整"),
      fallback: "数学三分步评分任务输入无效",
    });
    return { availability: "synced", data: await syncSingleGeneratedJobState(supabase, {
      userId: input.userId,
      jobId: job.id,
      jobKind: "math3_step_grade",
      successPhase: "评分待写入",
      successStatusText: "本步骤建议分已生成；打开数学三自测写入试卷进度",
    }) };
  }
  const started = await supabase.from("jobs").update({
    status: "running",
    started_at: job.started_at ?? new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
    payload: withJobUiPayload(job, "正在评分当前步骤", "DeepSeek 正在按当前给分点核对作答"),
    error: null,
  }).eq("id", job.id).eq("user_id", input.userId).in("status", ACTIVE_INTERNAL_JOB_STATUSES).select("id").maybeSingle();
  if (started.error) throw started.error;
  if (!started.data) throw new Error("数学三分步评分任务已取消或不再处于可推进状态");
  try {
    const result = await runWithInternalJobItemLease(supabase, { item, workerId }, (signal) => gradeMath3SelfTestStep({
      apiKey: input.deepseekApiKey,
      model,
      question,
      step,
      studentAnswer,
      signal,
    }));
    await callRpcRows<JobItemRow>(supabase, "complete_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_result: { ...result, testId, questionId: question.id, stepId: step.id, studentAnswer },
    });
  } catch (error: unknown) {
    await callRpcRows<JobItemRow>(supabase, "fail_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_error: getErrorMessage(error, "数学三分步评分失败").slice(0, 32768),
    });
  }
  return { availability: "synced", data: await syncSingleGeneratedJobState(supabase, {
    userId: input.userId,
    jobId: job.id,
    jobKind: "math3_step_grade",
    successPhase: "评分待写入",
    successStatusText: "本步骤建议分已生成；打开数学三自测写入试卷进度",
  }) };
}

export async function advanceAiKnowledgeQuizJob(
  supabase: SupabaseClient<Database>,
  input: AdvanceInternalJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  if (!await hasLeaseRpc(supabase)) return { availability: "schema_pending", data: null };
  const job = await selectOwnedInternalJob(supabase, input.userId, input.jobId);
  if (!job || job.job_kind !== "ai_knowledge_quiz_generation") return { availability: "synced", data: null };
  if (["succeeded", "failed", "claimed", "cancelled"].includes(job.status)) return { availability: "synced", data: job };
  if (!input.deepseekApiKey.trim()) throw new Error("服务器 DeepSeek API Key 未配置");
  const workerId = `route-${randomUUID()}`;
  const [item] = await callRpcRows<JobItemRow>(supabase, "claim_next_job_item", {
    p_job_id: job.id,
    p_worker_id: workerId,
    p_lease_seconds: 300,
  });
  if (!item) return { availability: "synced", data: await syncSingleGeneratedJobState(supabase, {
    userId: input.userId,
    jobId: job.id,
    jobKind: "ai_knowledge_quiz_generation",
    successPhase: "快测待审核",
    successStatusText: "知识点快测已保存；打开 AI 内容工作台检查并提交审核",
  }) };
  const payload = asRecord(item.payload);
  const proposalId = toText(payload?.proposalId);
  const proposalTitle = toText(payload?.proposalTitle);
  const proposalContent = typeof payload?.proposalContent === "string" ? payload.proposalContent.slice(0, 120_000) : "";
  const model = toText(payload?.model);
  if (!isUuid(proposalId) || !proposalTitle || !proposalContent.trim() || !model) {
    await failClaimedInternalJobItem(supabase, {
      item,
      workerId,
      error: new Error("知识点快测任务输入快照不完整"),
      fallback: "知识点快测任务输入无效",
    });
    return { availability: "synced", data: await syncSingleGeneratedJobState(supabase, {
      userId: input.userId,
      jobId: job.id,
      jobKind: "ai_knowledge_quiz_generation",
      successPhase: "快测待审核",
      successStatusText: "知识点快测已保存；打开 AI 内容工作台检查并提交审核",
    }) };
  }
  const profileResult = await supabase.from("ai_profiles").select("*").eq("id", input.userId).eq("is_active", true).maybeSingle();
  if (profileResult.error || !profileResult.data) {
    await failClaimedInternalJobItem(supabase, {
      item,
      workerId,
      error: profileResult.error ?? new Error("知识点快测任务所属 AI 学科账号已停用或不存在"),
      fallback: "知识点快测任务无法读取所属账号",
    });
    return { availability: "synced", data: await syncSingleGeneratedJobState(supabase, {
      userId: input.userId,
      jobId: job.id,
      jobKind: "ai_knowledge_quiz_generation",
      successPhase: "快测待审核",
      successStatusText: "知识点快测已保存；打开 AI 内容工作台检查并提交审核",
    }) };
  }
  const started = await supabase.from("jobs").update({
    status: "running",
    started_at: job.started_at ?? new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
    payload: withJobUiPayload(job, "正在生成知识点快测", "DeepSeek 正在依据讲义快照生成可审核题目"),
    error: null,
  }).eq("id", job.id).eq("user_id", input.userId).in("status", ACTIVE_INTERNAL_JOB_STATUSES).select("id").maybeSingle();
  if (started.error) throw started.error;
  if (!started.data) throw new Error("知识点快测任务已取消或不再处于可推进状态");
  try {
    const result = await runWithInternalJobItemLease(supabase, { item, workerId }, (signal, renewNow) => generateAndRecordAiKnowledgeQuiz({
      supabase,
      userId: input.userId,
      profile: profileResult.data as Tables<"ai_profiles">,
      proposalId,
      proposalTitle,
      proposalContent,
      quizId: job.id,
      apiKey: input.deepseekApiKey,
      model,
      signal,
      beforePersist: renewNow,
    }));
    await callRpcRows<JobItemRow>(supabase, "complete_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_result: { ...result, proposalId },
    });
  } catch (error: unknown) {
    await callRpcRows<JobItemRow>(supabase, "fail_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_error: getErrorMessage(error, "知识点快测生成失败").slice(0, 32768),
    });
  }
  return { availability: "synced", data: await syncSingleGeneratedJobState(supabase, {
    userId: input.userId,
    jobId: job.id,
    jobKind: "ai_knowledge_quiz_generation",
    successPhase: "快测待审核",
    successStatusText: "知识点快测已保存；打开 AI 内容工作台检查并提交审核",
  }) };
}

export async function advanceInternalJob(
  supabase: SupabaseClient<Database>,
  input: AdvanceInternalJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  const job = await selectOwnedInternalJob(supabase, input.userId, input.jobId);
  if (!job) return { availability: "synced", data: null };
  switch (job.job_kind) {
    case "markdown_review":
      return advanceMarkdownReviewJob(supabase, { userId: input.userId, jobId: input.jobId, apiKey: input.deepseekApiKey });
    case "problem_ocr":
      return advanceProblemOcrJob(supabase, input);
    case "math3_self_test_generation":
      return advanceMath3SelfTestGenerationJob(supabase, input);
    case "math_paper_grade":
      return advanceMathPaperGradeJob(supabase, input);
    case "math_paper_ocr":
      return advanceMathPaperOcrJob(supabase, input);
    case "math3_auto_classify":
      return advanceMath3ClassificationJob(supabase, input);
    case "english_subjective_grade":
      return advanceEnglishSubjectiveGradeJob(supabase, input);
    case "economics_graph_generation":
      return advanceEconomicsGraphJob(supabase, input);
    case "math3_step_grade":
      return advanceMath3StepGradeJob(supabase, input);
    case "ai_knowledge_quiz_generation":
      return advanceAiKnowledgeQuizJob(supabase, input);
  }
  if (!await hasLeaseRpc(supabase)) return { availability: "schema_pending", data: null };
  throw new Error(`不支持推进站内任务类型：${job.job_kind}`);
}

export async function retryMarkdownReviewJob(
  supabase: SupabaseClient<Database>,
  input: RetryMarkdownReviewJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  if (!await hasLeaseRpc(supabase)) return { availability: "schema_pending", data: null };
  const job = await selectOwnedMarkdownReviewJob(supabase, input.userId, input.jobId);
  if (!job) return { availability: "synced", data: null };
  const jobPayload = getJobPayload(job);
  const retryingMarkdownReviewRegistration = job.status === "failed"
    && jobPayload.registrationComplete !== true;
  if (retryingMarkdownReviewRegistration) {
    const sourceMarkdown = toText(jobPayload.sourceMarkdown);
    const sourceChecksum = toText(jobPayload.sourceChecksum);
    const model = toText(jobPayload.model);
    const chunks = splitMarkdownForReview(sourceMarkdown);
    const expectedChunkCount = Number(jobPayload.chunkCount);
    if (
      !sourceMarkdown
      || !/^[0-9a-f]{64}$/i.test(sourceChecksum)
      || !model
      || chunks.length < 1
      || chunks.length > MAX_MARKDOWN_REVIEW_CHUNKS
      || chunks.length !== expectedChunkCount
      || await calculateMarkdownChecksum(sourceMarkdown) !== sourceChecksum
    ) throw new Error("Markdown 审阅登记失败任务缺少可重试的完整正文快照。");
    chunks.forEach((chunk) => prepareDocumentMarkdownReviewSource(chunk));
    const reopened = await supabase.from("jobs").update({
      status: "queued",
      error: null,
      finished_at: null,
      heartbeat_at: new Date().toISOString(),
      payload: toJson({ ...jobPayload, phase: "正在补齐任务分块", statusText: "正文快照仍保留，正在幂等补齐登记失败的分块" }),
    }).eq("id", job.id).eq("user_id", input.userId).eq("status", "failed").select("*").maybeSingle();
    if (reopened.error) throw reopened.error;
    if (!reopened.data) return { availability: "synced", data: await selectOwnedMarkdownReviewJob(supabase, input.userId, job.id) };
    try {
      await enqueueMarkdownReviewItems(supabase, job.id, chunks, sourceChecksum, model);
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Markdown 审阅分块重新登记失败");
      const failed = await supabase.from("jobs").update({
        status: "failed",
        error: message,
        finished_at: new Date().toISOString(),
        payload: toJson({ ...jobPayload, registrationComplete: false, phase: "任务登记失败", statusText: message }),
      }).eq("id", job.id).eq("user_id", input.userId).eq("status", "queued").select("*").maybeSingle();
      if (failed.error) throw failed.error;
      throw error;
    }
    const recovered = await supabase.from("jobs").update({
      status: "waiting_for_trigger",
      error: null,
      heartbeat_at: new Date().toISOString(),
      payload: toJson({ ...jobPayload, registrationComplete: true, phase: "等待继续处理", statusText: "缺失分块已补齐，任务中心将继续推进" }),
    }).eq("id", job.id).eq("user_id", input.userId).eq("status", "queued").select("*").maybeSingle();
    if (recovered.error) throw recovered.error;
    return {
      availability: "synced",
      data: (recovered.data as JobRow | null) ?? await selectOwnedMarkdownReviewJob(supabase, input.userId, job.id),
    };
  }

  const failedItems = await supabase
    .from("job_items")
    .select("id")
    .eq("job_id", job.id)
    .eq("status", "failed");
  if (failedItems.error) throw failedItems.error;
  for (const item of failedItems.data ?? []) {
    await callRpcRows<JobItemRow>(supabase, "reset_failed_job_item", { p_item_id: item.id });
  }
  if ((failedItems.data ?? []).length === 0) return { availability: "synced", data: job };

  const updated = await supabase
    .from("jobs")
    .update({
      status: "waiting_for_trigger",
      error: null,
      finished_at: null,
      heartbeat_at: new Date().toISOString(),
      payload: withJobUiPayload(job, "等待重新处理", "失败分块已重置，任务中心将继续推进"),
    })
    .eq("id", job.id)
    .eq("user_id", input.userId)
    .eq("status", "failed")
    .select("*")
    .maybeSingle();
  if (updated.error) throw updated.error;
  return { availability: "synced", data: (updated.data as JobRow | null) ?? job };
}

export async function retryInternalJob(
  supabase: SupabaseClient<Database>,
  input: RetryMarkdownReviewJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  const job = await selectOwnedInternalJob(supabase, input.userId, input.jobId);
  if (!job) return { availability: "synced", data: null };
  if (["markdown_review", "problem_ocr", "math3_self_test_generation", "math_paper_grade", "math_paper_ocr", "math3_auto_classify", "english_subjective_grade", "economics_graph_generation", "math3_step_grade", "ai_knowledge_quiz_generation"].includes(job.job_kind)) {
    if (!await hasLeaseRpc(supabase)) return { availability: "schema_pending", data: null };
  }
  if (!["markdown_review", "problem_ocr", "math3_self_test_generation", "math_paper_grade", "math_paper_ocr", "math3_auto_classify", "english_subjective_grade", "economics_graph_generation", "math3_step_grade", "ai_knowledge_quiz_generation"].includes(job.job_kind)) {
    throw new Error(`不支持重试站内任务类型：${job.job_kind}`);
  }

  const jobPayload = getJobPayload(job);
  const singleItemRegistrationKinds = [
    "math3_self_test_generation",
    "math_paper_grade",
    "english_subjective_grade",
    "economics_graph_generation",
    "math3_step_grade",
    "ai_knowledge_quiz_generation",
  ];
  if (job.status === "failed" && singleItemRegistrationKinds.includes(job.job_kind)) {
    const existingItems = await supabase.from("job_items").select("id").eq("job_id", job.id).limit(1);
    if (existingItems.error) throw existingItems.error;
    if ((existingItems.data ?? []).length === 0) {
      let idempotencyKey = "";
      let itemPayload: Record<string, Json> = {};
      if (job.job_kind === "math3_self_test_generation") {
        const mode = jobPayload.mode;
        const difficulty = jobPayload.difficulty;
        if (!isMath3SelfTestMode(mode) || !isMath3SelfTestDifficulty(difficulty)) {
          throw new Error("数学三试卷生成登记失败任务缺少可重试的模式或难度配置。");
        }
        idempotencyKey = `math3-self-test:${mode}:${difficulty}`;
        itemPayload = { operation: "math3_self_test_generation", mode, difficulty };
      } else if (job.job_kind === "math_paper_grade") {
        const paperId = jobPayload.paperId;
        const confirmationId = jobPayload.confirmationId;
        if (!isUuid(paperId) || !isUuid(confirmationId)) {
          throw new Error("数学真题建议评分登记失败任务缺少可重试的试卷或确认版本。");
        }
        idempotencyKey = `math-paper-grade:${confirmationId}`;
        itemPayload = { operation: "math_paper_grade", paperId, confirmationId };
      } else if (job.job_kind === "english_subjective_grade") {
        const passageId = jobPayload.passageId;
        const round = Number(jobPayload.round);
        const answers = normalizeEnglishSubjectiveAnswers(jobPayload.answers);
        if (!isUuid(passageId) || !Number.isInteger(round) || round < 1 || round > 3 || !Object.values(answers).some(Boolean)) {
          throw new Error("英语主观题建议评分登记失败任务缺少可重试的题组、轮次或作答快照。");
        }
        idempotencyKey = `english-subjective-grade:${passageId}:${round}:${job.id}`;
        itemPayload = { operation: "english_subjective_grade", passageId, round, answers };
      } else if (job.job_kind === "economics_graph_generation") {
        const prompt = toText(jobPayload.prompt);
        const model = toText(jobPayload.model);
        if (!prompt || !model) throw new Error("经济学曲线登记失败任务缺少可重试的需求或模型快照。");
        idempotencyKey = `economics-graph:${job.id}`;
        itemPayload = { operation: "economics_graph_generation", prompt, model };
      } else if (job.job_kind === "math3_step_grade") {
        const testId = toText(jobPayload.testId);
        const question = parseMath3StepQuestion(jobPayload.question);
        const step = parseMath3StepRubric(jobPayload.step);
        const studentAnswer = toText(jobPayload.studentAnswer);
        const model = toText(jobPayload.model);
        if (!isUuid(testId) || !question || !step || !model) {
          throw new Error("数学三分步评分登记失败任务缺少可重试的输入快照。");
        }
        idempotencyKey = `math3-step-grade:${testId}:${question.id}:${step.id}`;
        itemPayload = { operation: "math3_step_grade", testId, question, step, studentAnswer, model };
      } else {
        const proposalId = toText(jobPayload.proposalId);
        const proposalTitle = toText(jobPayload.proposalTitle);
        const proposalContent = typeof jobPayload.proposalContent === "string" ? jobPayload.proposalContent.slice(0, 120_000) : "";
        const model = toText(jobPayload.model);
        if (!isUuid(proposalId) || !proposalTitle || !proposalContent.trim() || !model) {
          throw new Error("知识点快测登记失败任务缺少可重试的讲义快照。");
        }
        idempotencyKey = `ai-knowledge-quiz:${proposalId}:${job.id}`;
        itemPayload = { operation: "ai_knowledge_quiz_generation", proposalId, proposalTitle, proposalContent, model };
      }

      const reopened = await supabase.from("jobs").update({
        status: "queued",
        error: null,
        finished_at: null,
        heartbeat_at: new Date().toISOString(),
        payload: toJson({ ...jobPayload, phase: "正在补齐任务分块", statusText: "任务输入快照仍保留，正在幂等补齐缺失分块" }),
      }).eq("id", job.id).eq("user_id", input.userId).eq("status", "failed").select("*").maybeSingle();
      if (reopened.error) throw reopened.error;
      if (!reopened.data) return { availability: "synced", data: await selectOwnedInternalJob(supabase, input.userId, job.id) };

      try {
        await callRpcRows<JobItemRow>(supabase, "enqueue_job_item", {
          p_job_id: job.id,
          p_ordinal: 0,
          p_idempotency_key: idempotencyKey,
          p_payload: itemPayload,
        });
      } catch (error: unknown) {
        const message = getErrorMessage(error, "任务分块重新登记失败");
        const failed = await supabase.from("jobs").update({
          status: "failed",
          error: message,
          finished_at: new Date().toISOString(),
          payload: toJson({ ...jobPayload, phase: "任务登记失败", statusText: message }),
        }).eq("id", job.id).eq("user_id", input.userId).eq("status", "queued").select("*").maybeSingle();
        if (failed.error) throw failed.error;
        throw error;
      }

      const recovered = await supabase.from("jobs").update({
        status: "waiting_for_trigger",
        error: null,
        heartbeat_at: new Date().toISOString(),
        payload: toJson({ ...jobPayload, registrationComplete: true, phase: "等待继续处理", statusText: "缺失分块已补齐，任务中心将继续推进" }),
      }).eq("id", job.id).eq("user_id", input.userId).eq("status", "queued").select("*").maybeSingle();
      if (recovered.error) throw recovered.error;
      return {
        availability: "synced",
        data: (recovered.data as JobRow | null) ?? await selectOwnedInternalJob(supabase, input.userId, job.id),
      };
    }
  }
  const retryingMath3ClassificationRegistration = job.job_kind === "math3_auto_classify"
    && job.status === "failed"
    && jobPayload.registrationComplete !== true;
  if (retryingMath3ClassificationRegistration) {
    const problems = parseMath3ClassificationProblems(jobPayload.problems);
    const sourceChecksum = toText(jobPayload.sourceChecksum);
    if (problems.length === 0 || !/^[0-9a-f]{64}$/i.test(sourceChecksum)) {
      throw new Error("数学三批量归类登记失败任务缺少可重试的源题快照。");
    }
    const reopened = await supabase.from("jobs").update({
      status: "queued",
      error: null,
      finished_at: null,
      heartbeat_at: new Date().toISOString(),
      payload: toJson({ ...jobPayload, phase: "正在补齐任务分块", statusText: "源题快照仍保留，正在幂等补齐登记失败的批次" }),
    }).eq("id", job.id).eq("user_id", input.userId).eq("status", "failed").select("*").maybeSingle();
    if (reopened.error) throw reopened.error;
    if (!reopened.data) return { availability: "synced", data: await selectOwnedInternalJob(supabase, input.userId, job.id) };
    try {
      await enqueueMath3ClassificationItems(supabase, job.id, problems, sourceChecksum);
    } catch (error: unknown) {
      const message = getErrorMessage(error, "数学三批量归类分块重新登记失败");
      const failed = await supabase.from("jobs").update({
        status: "failed",
        error: message,
        finished_at: new Date().toISOString(),
        payload: toJson({ ...jobPayload, registrationComplete: false, phase: "任务登记失败", statusText: message }),
      }).eq("id", job.id).eq("user_id", input.userId).eq("status", "queued").select("*").maybeSingle();
      if (failed.error) throw failed.error;
      throw error;
    }
    const recovered = await supabase.from("jobs").update({
      status: "waiting_for_trigger",
      error: null,
      heartbeat_at: new Date().toISOString(),
      payload: toJson({ ...jobPayload, registrationComplete: true, phase: "等待继续处理", statusText: "缺失批次已补齐，任务中心将继续推进" }),
    }).eq("id", job.id).eq("user_id", input.userId).eq("status", "queued").select("*").maybeSingle();
    if (recovered.error) throw recovered.error;
    return {
      availability: "synced",
      data: (recovered.data as JobRow | null) ?? await selectOwnedInternalJob(supabase, input.userId, job.id),
    };
  }
  const retryingMathPaperOcrRegistration = job.job_kind === "math_paper_ocr"
    && job.status === "failed"
    && jobPayload.registrationComplete !== true;
  if (retryingMathPaperOcrRegistration) {
    const assets = parseMathPaperOcrAssets(jobPayload.assets, input.userId);
    const qwenModel = toText(jobPayload.qwenModel);
    const expectedPageCount = Number(jobPayload.pageCount);
    if (
      !Number.isInteger(expectedPageCount)
      || expectedPageCount < 1
      || assets.length !== expectedPageCount
      || !qwenModel
    ) throw new Error("数学答题纸 OCR 登记失败任务缺少可重试的私有原图或模型配置。");

    const reopened = await supabase.from("jobs").update({
      status: "queued",
      error: null,
      finished_at: null,
      heartbeat_at: new Date().toISOString(),
      payload: toJson({ ...jobPayload, phase: "正在补齐任务分块", statusText: "原图仍保留，正在幂等补齐登记失败的页面分块" }),
    }).eq("id", job.id).eq("user_id", input.userId).eq("status", "failed").select("*").maybeSingle();
    if (reopened.error) throw reopened.error;
    if (!reopened.data) return { availability: "synced", data: await selectOwnedInternalJob(supabase, input.userId, job.id) };

    try {
      await enqueueMathPaperOcrItems(supabase, job.id, assets, qwenModel);
    } catch (error: unknown) {
      const message = getErrorMessage(error, "数学答题纸 OCR 分块重新登记失败");
      const failed = await supabase.from("jobs").update({
        status: "failed",
        error: message,
        finished_at: new Date().toISOString(),
        payload: toJson({ ...jobPayload, registrationComplete: false, phase: "任务登记失败", statusText: message }),
      }).eq("id", job.id).eq("user_id", input.userId).eq("status", "queued").select("*").maybeSingle();
      if (failed.error) throw failed.error;
      throw error;
    }

    const recovered = await supabase.from("jobs").update({
      status: "waiting_for_trigger",
      error: null,
      heartbeat_at: new Date().toISOString(),
      payload: toJson({ ...jobPayload, registrationComplete: true, phase: "等待继续处理", statusText: "缺失页面分块已补齐，任务中心将继续推进" }),
    }).eq("id", job.id).eq("user_id", input.userId).eq("status", "queued").select("*").maybeSingle();
    if (recovered.error) throw recovered.error;
    return {
      availability: "synced",
      data: (recovered.data as JobRow | null) ?? await selectOwnedInternalJob(supabase, input.userId, job.id),
    };
  }
  const retryingRegistration = job.job_kind === "problem_ocr"
    && job.status === "failed"
    && jobPayload.registrationComplete !== true;
  if (retryingRegistration) {
    const assets = parseProblemOcrAssets(jobPayload.assets, input.userId);
    const chapterContext = parseProblemOcrChapterContext(jobPayload.chapterContext);
    const qwenModel = toText(jobPayload.qwenModel);
    const deepseekModel = toText(jobPayload.deepseekModel);
    const expectedImageCount = Number(jobPayload.imageCount);
    if (
      !Number.isInteger(expectedImageCount)
      || expectedImageCount < 1
      || assets.length !== expectedImageCount
      || !qwenModel
      || !deepseekModel
    ) {
      throw new Error("题库 OCR 登记失败任务缺少可重试的私有源图或模型配置。");
    }
    const reopened = await supabase.from("jobs").update({
      status: "queued",
      error: null,
      finished_at: null,
      heartbeat_at: new Date().toISOString(),
      payload: toJson({ ...jobPayload, phase: "正在补齐任务分块", statusText: "源图仍保留，正在幂等补齐登记失败的分块" }),
    }).eq("id", job.id).eq("user_id", input.userId).eq("status", "failed").select("*").maybeSingle();
    if (reopened.error) throw reopened.error;
    if (!reopened.data) return { availability: "synced", data: await selectOwnedInternalJob(supabase, input.userId, job.id) };

    try {
      await enqueueProblemOcrItems(supabase, job.id, assets, chapterContext, qwenModel, deepseekModel, jobPayload.ocrProvider === "deepseek" ? "deepseek" : "qwen");
    } catch (error: unknown) {
      const message = getErrorMessage(error, "题库 OCR 分块重新登记失败");
      const failed = await supabase.from("jobs").update({
        status: "failed",
        error: message,
        finished_at: new Date().toISOString(),
        payload: toJson({ ...jobPayload, registrationComplete: false, phase: "任务登记失败", statusText: message }),
      }).eq("id", job.id).eq("user_id", input.userId).eq("status", "queued").select("*").maybeSingle();
      if (failed.error) throw failed.error;
      throw error;
    }

    const recovered = await supabase.from("jobs").update({
      status: "waiting_for_trigger",
      error: null,
      heartbeat_at: new Date().toISOString(),
      payload: toJson({ ...jobPayload, registrationComplete: true, phase: "等待继续处理", statusText: "缺失分块已补齐，任务中心将继续推进" }),
    }).eq("id", job.id).eq("user_id", input.userId).eq("status", "queued").select("*").maybeSingle();
    if (recovered.error) throw recovered.error;
    return {
      availability: "synced",
      data: (recovered.data as JobRow | null) ?? await selectOwnedInternalJob(supabase, input.userId, job.id),
    };
  }

  const failedItems = await supabase.from("job_items").select("id").eq("job_id", job.id).eq("status", "failed");
  if (failedItems.error) throw failedItems.error;
  for (const item of failedItems.data ?? []) {
    await callRpcRows<JobItemRow>(supabase, "reset_failed_job_item", { p_item_id: item.id });
  }
  const retryingCleanup = ["problem_ocr", "math_paper_ocr"].includes(job.job_kind) && job.status === "stalled";
  if ((failedItems.data ?? []).length === 0 && !retryingCleanup) return { availability: "synced", data: job };

  const updated = await supabase.from("jobs").update({
    status: "waiting_for_trigger",
    error: null,
    finished_at: null,
    heartbeat_at: new Date().toISOString(),
    payload: withJobUiPayload(
      job,
      retryingCleanup ? "等待重新清理" : "等待重新处理",
      retryingCleanup ? "识别结果仍保留，任务中心将重试临时源图清理" : "失败分块已重置，任务中心将继续推进",
    ),
  }).eq("id", job.id).eq("user_id", input.userId).in("status", ["failed", "stalled"]).select("*").maybeSingle();
  if (updated.error) throw updated.error;
  return { availability: "synced", data: (updated.data as JobRow | null) ?? job };
}
