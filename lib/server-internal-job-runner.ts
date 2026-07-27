import "server-only";

import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
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
import { analyzeProblemOcrText, recognizeProblemImage } from "./problem-ocr-service";
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
const PROBLEM_OCR_BUCKET = "ocr-documents";

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
  if (code === "55000" || message.includes("owned failed item")) return true;
  throw response.error;
}

export async function internalJobLeaseAvailable(supabase: SupabaseClient<Database>): Promise<boolean> {
  return internalJobLeaseRolloutEnabled() && await hasLeaseRpc(supabase);
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
    update.result = toJson({ proposal });
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

export function internalJobLeaseRolloutEnabled(): boolean {
  return isInternalJobLeaseEnabled(process.env.WP3_INTERNAL_JOB_LEASE_ENABLED);
}

export async function createMarkdownReviewJob(
  supabase: SupabaseClient<Database>,
  input: CreateMarkdownReviewJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  if (!internalJobLeaseRolloutEnabled()) {
    return { availability: "schema_pending", data: null };
  }
  if (!await hasLeaseRpc(supabase)) {
    return { availability: "schema_pending", data: null };
  }

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

  const sourceChecksum = await calculateMarkdownChecksum(sourceMarkdown);
  const jobPayload: Json = toJson({
    operation: "document_markdown_review",
    sourceMarkdown,
    sourceChecksum,
    sourceLength: sourceMarkdown.length,
    chunkCount: chunks.length,
    model,
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
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const chunkChecksum = await calculateMarkdownChecksum(chunk);
      await callRpcRows<JobItemRow>(supabase, "enqueue_job_item", {
        p_job_id: job.id,
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
  } catch (error: unknown) {
    const message = getErrorMessage(error, "Markdown 审阅分块登记失败");
    await supabase
      .from("jobs")
      .update({
        status: "failed",
        error: message,
        finished_at: new Date().toISOString(),
        payload: toJson({ ...getJobPayload(job), phase: "任务登记失败", statusText: message }),
      })
      .eq("id", job.id)
      .eq("user_id", input.userId);
    throw error;
  }

  return { availability: "synced", data: job };
}

export async function createProblemOcrJob(
  supabase: SupabaseClient<Database>,
  input: CreateProblemOcrJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  if (!await internalJobLeaseAvailable(supabase)) {
    return { availability: "schema_pending", data: null };
  }
  if (input.assets.length < 1 || input.assets.length > MAX_PROBLEM_OCR_IMAGES) {
    throw new Error(`题库 OCR 每个任务必须包含 1–${MAX_PROBLEM_OCR_IMAGES} 张图片。`);
  }
  const qwenModel = input.qwenModel.trim();
  const deepseekModel = input.deepseekModel.trim();
  if (!qwenModel || qwenModel.length > 120 || !deepseekModel || deepseekModel.length > 120) {
    throw new Error("题库 OCR 模型配置无效。");
  }
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
    await enqueueProblemOcrItems(supabase, job.id, assets, chapterContext, qwenModel, deepseekModel);
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

export async function advanceMarkdownReviewJob(
  supabase: SupabaseClient<Database>,
  input: AdvanceMarkdownReviewJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  if (!internalJobLeaseRolloutEnabled()) {
    return { availability: "schema_pending", data: null };
  }
  const job = await selectOwnedMarkdownReviewJob(supabase, input.userId, input.jobId);
  if (!job) return { availability: "synced", data: null };
  if (["succeeded", "failed", "claimed"].includes(job.status)) {
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
  if (!internalJobLeaseRolloutEnabled()) return { availability: "schema_pending", data: null };
  const job = await selectOwnedInternalJob(supabase, input.userId, input.jobId);
  if (!job || job.job_kind !== "problem_ocr") return { availability: "synced", data: null };
  if (["succeeded", "failed", "claimed"].includes(job.status)) return { availability: "synced", data: job };
  if (!input.qwenApiKey.trim()) throw new Error("服务器 Qwen API Key 未配置");
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
    const downloaded = await supabase.storage.from(PROBLEM_OCR_BUCKET).download(sourceStoragePath);
    if (downloaded.error || !downloaded.data) throw downloaded.error ?? new Error("题库 OCR 临时源图下载失败");
    const imageBase64 = Buffer.from(await downloaded.data.arrayBuffer()).toString("base64");
    const recognized = await recognizeProblemImage({
      apiKey: input.qwenApiKey,
      model: qwenModel,
      imageBase64,
      mimeType,
    });
    const ocrText = recognized.text.length > MAX_PROBLEM_OCR_TEXT
      ? `${recognized.text.slice(0, MAX_PROBLEM_OCR_TEXT)}\n...(文本过长已截断)`
      : recognized.text;
    const analyzed = await analyzeProblemOcrText({
      apiKey: input.deepseekApiKey,
      model: deepseekModel,
      ocrText,
      chapterContext: chapterContext.map((chapter) => chapter.name),
    });
    const problems = analyzed.problems
      .map((problem) => materializeProblemOcrProblem(problem, ocrText, chapterContext))
      .filter((problem): problem is NonNullable<typeof problem> => Boolean(problem));
    await callRpcRows<JobItemRow>(supabase, "complete_job_item", {
      p_item_id: item.id,
      p_worker_id: workerId,
      p_lease_attempt: item.attempt_count,
      p_result: {
        imageIndex,
        imageCount,
        imageName,
        ocrText,
        problems,
        warning: analyzed.warning ?? null,
        qwenModel: recognized.model,
        deepseekModel,
        tokensUsed: analyzed.tokensUsed,
      },
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

export async function advanceInternalJob(
  supabase: SupabaseClient<Database>,
  input: AdvanceInternalJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  if (!internalJobLeaseRolloutEnabled()) return { availability: "schema_pending", data: null };
  const job = await selectOwnedInternalJob(supabase, input.userId, input.jobId);
  if (!job) return { availability: "synced", data: null };
  if (job.job_kind === "markdown_review") {
    return advanceMarkdownReviewJob(supabase, { userId: input.userId, jobId: input.jobId, apiKey: input.deepseekApiKey });
  }
  if (job.job_kind === "problem_ocr") return advanceProblemOcrJob(supabase, input);
  throw new Error(`不支持推进站内任务类型：${job.job_kind}`);
}

export async function retryMarkdownReviewJob(
  supabase: SupabaseClient<Database>,
  input: RetryMarkdownReviewJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  if (!internalJobLeaseRolloutEnabled()) {
    return { availability: "schema_pending", data: null };
  }
  const job = await selectOwnedMarkdownReviewJob(supabase, input.userId, input.jobId);
  if (!job) return { availability: "synced", data: null };

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
  if (!internalJobLeaseRolloutEnabled()) return { availability: "schema_pending", data: null };
  const job = await selectOwnedInternalJob(supabase, input.userId, input.jobId);
  if (!job) return { availability: "synced", data: null };
  if (!["markdown_review", "problem_ocr"].includes(job.job_kind)) {
    throw new Error(`不支持重试站内任务类型：${job.job_kind}`);
  }

  const jobPayload = getJobPayload(job);
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
      await enqueueProblemOcrItems(supabase, job.id, assets, chapterContext, qwenModel, deepseekModel);
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
  const retryingCleanup = job.job_kind === "problem_ocr" && job.status === "stalled";
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
