import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BaiduOcrTaskStatus } from "@/lib/baidu-unlimited-ocr";
import { planExternalJobStatusTransition, type JobStatus } from "@/lib/job-contract";
import type { Database, Json, Tables, TablesInsert, TablesUpdate } from "@/lib/supabase-schema";

export const DOCUMENT_OCR_PROVIDER = "baidu-unlimited-ocr";
export const OCR_DOCUMENT_BUCKET = "ocr-documents";
export const TERMINAL_JOB_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

export type JobLedgerAvailability = "synced" | "schema_pending";
export type JobRow = Tables<"jobs">;
export type JobSummaryRow = Omit<JobRow, "result">;
export type JobResultRow = Pick<JobRow, "id" | "status" | "result" | "claimed_at">;

export type JobLedgerResult<T> = {
  availability: JobLedgerAvailability;
  data: T;
};

type RegisterExternalOcrJobInput = {
  userId: string;
  taskId: string;
  title: string;
  sourcePath?: string;
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isJobLedgerSchemaPending(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const candidate = error as SupabaseErrorLike;
  const code = candidate.code?.trim().toUpperCase() ?? "";
  const message = candidate.message?.toLowerCase() ?? "";
  return ["42P01", "42703", "PGRST200", "PGRST202", "PGRST204", "PGRST205"].includes(code)
    || (message.includes("jobs") && (
      message.includes("does not exist")
      || message.includes("schema cache")
      || message.includes("could not find")
    ));
}

function sanitizeJobSummaryPayload(value: Json): Json {
  if (!isRecord(value)) return {};
  const allowedKeys = [
    "operation",
    "phase",
    "statusText",
    "sourceChecksum",
    "sourceLength",
    "chunkCount",
    "imageCount",
    "model",
    "cleanupError",
  ];
  return Object.fromEntries(
    allowedKeys.flatMap((key) => key in value ? [[key, value[key] as Json]] : []),
  ) as Json;
}

export function sanitizeJobSummaryRow(row: JobRow): JobSummaryRow {
  const { result: _result, ...summary } = row;
  return {
    ...summary,
    payload: sanitizeJobSummaryPayload(row.payload),
  };
}

export function normalizeOcrSourcePath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const path = value.trim().replace(/\\/g, "/");
  if (
    !path
    || path.length > 240
    || !/^ocr-temp\/[A-Za-z0-9._/-]+\.pdf$/i.test(path)
    || path.split("/").some((segment) => segment === ".." || segment === ".")
  ) {
    return undefined;
  }
  return path;
}

async function selectExternalOcrJob(
  supabase: SupabaseClient<Database>,
  userId: string,
  taskId: string,
): Promise<{ data: JobRow | null; error: unknown }> {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", DOCUMENT_OCR_PROVIDER)
    .eq("external_task_id", taskId)
    .maybeSingle();
  return { data: data as JobRow | null, error };
}

export async function registerExternalOcrJob(
  supabase: SupabaseClient<Database>,
  input: RegisterExternalOcrJobInput,
): Promise<JobLedgerResult<JobRow | null>> {
  const existing = await selectExternalOcrJob(supabase, input.userId, input.taskId);
  if (existing.error) {
    if (isJobLedgerSchemaPending(existing.error)) return { availability: "schema_pending", data: null };
    throw existing.error;
  }
  if (existing.data) return { availability: "synced", data: existing.data };

  const sourcePath = normalizeOcrSourcePath(input.sourcePath);
  const payload: TablesInsert<"jobs"> = {
    user_id: input.userId,
    job_class: "external",
    job_kind: "document_ocr",
    status: "dispatched",
    title: input.title,
    provider: DOCUMENT_OCR_PROVIDER,
    external_task_id: input.taskId,
    progress_current: 0,
    progress_total: 0,
    payload: {
      phase: "外部处理中",
      statusText: "已提交百度 OCR，可从任务中心恢复查询",
    },
    source_storage_bucket: sourcePath ? OCR_DOCUMENT_BUCKET : null,
    source_storage_path: sourcePath ?? null,
    heartbeat_at: new Date().toISOString(),
  };

  const inserted = await supabase.from("jobs").insert(payload).select("*").single();
  if (inserted.error) {
    if (isJobLedgerSchemaPending(inserted.error)) return { availability: "schema_pending", data: null };
    if (inserted.error.code === "23505") {
      const raced = await selectExternalOcrJob(supabase, input.userId, input.taskId);
      if (raced.error) throw raced.error;
      return { availability: "synced", data: raced.data };
    }
    throw inserted.error;
  }

  return { availability: "synced", data: inserted.data as JobRow };
}

function buildOcrStatusUpdate(
  existing: JobRow,
  result: BaiduOcrTaskStatus,
  nextStatus: JobStatus,
): TablesUpdate<"jobs"> {
  const now = new Date().toISOString();
  const base: TablesUpdate<"jobs"> = {
    heartbeat_at: now,
    error: null,
  };

  if (nextStatus === "succeeded") {
    const durableResult: Json = {
      markdown: result.markdown,
      providerStatus: "success",
    };
    return {
      ...base,
      status: "succeeded",
      result: durableResult,
      finished_at: existing.finished_at ?? now,
    };
  }
  if (nextStatus === "failed") {
    return {
      ...base,
      status: "failed",
      error: result.taskError ?? "百度 OCR 解析失败",
      result: { providerStatus: "failed" },
      finished_at: existing.finished_at ?? now,
    };
  }
  if (nextStatus === "stalled") {
    return {
      ...base,
      status: "stalled",
      error: "百度 OCR 已完成，但 Markdown 结果尚未下载成功；请重新查询",
    };
  }
  if (nextStatus === "running") {
    return {
      ...base,
      status: "running",
      started_at: existing.started_at ?? now,
    };
  }
  if (nextStatus === "dispatched") {
    return {
      ...base,
      status: "dispatched",
    };
  }

  return { ...base, status: nextStatus };
}

export async function persistExternalOcrStatus(
  supabase: SupabaseClient<Database>,
  userId: string,
  result: BaiduOcrTaskStatus,
): Promise<JobLedgerResult<JobRow | null>> {
  const existing = await selectExternalOcrJob(supabase, userId, result.taskId);
  if (existing.error) {
    if (isJobLedgerSchemaPending(existing.error)) return { availability: "schema_pending", data: null };
    throw existing.error;
  }
  let currentJob = existing.data;
  if (!currentJob) {
    const registered = await registerExternalOcrJob(supabase, {
      userId,
      taskId: result.taskId,
      title: "PDF 讲义 OCR",
    });
    if (registered.availability !== "synced" || !registered.data) return registered;
    currentJob = registered.data;
  }

  const transition = planExternalJobStatusTransition(
    currentJob.status as JobStatus,
    result.status,
    Boolean(result.markdown?.trim()),
  );
  if (!transition.shouldPersist) {
    return { availability: "synced", data: currentJob };
  }

  const updated = await supabase
    .from("jobs")
    .update(buildOcrStatusUpdate(currentJob, result, transition.nextStatus))
    .eq("id", currentJob.id)
    .eq("user_id", userId)
    .eq("status", currentJob.status)
    .select("*")
    .maybeSingle();

  if (updated.error) {
    if (isJobLedgerSchemaPending(updated.error)) return { availability: "schema_pending", data: null };
    throw updated.error;
  }
  if (updated.data) return { availability: "synced", data: updated.data as JobRow };

  const raced = await selectExternalOcrJob(supabase, userId, result.taskId);
  if (raced.error) throw raced.error;
  return { availability: "synced", data: raced.data };
}

export async function listUserJobs(
  supabase: SupabaseClient<Database>,
  userId: string,
  limit = 40,
): Promise<JobLedgerResult<JobSummaryRow[]>> {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 100));
  const listed = await supabase
    .from("jobs")
    .select("id, user_id, job_class, job_kind, status, title, provider, external_task_id, progress_current, progress_total, payload, error, source_storage_bucket, source_storage_path, heartbeat_at, started_at, finished_at, claimed_at, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(safeLimit);

  if (listed.error) {
    if (isJobLedgerSchemaPending(listed.error)) return { availability: "schema_pending", data: [] };
    throw listed.error;
  }
  return {
    availability: "synced",
    data: ((listed.data ?? []) as JobRow[]).map(sanitizeJobSummaryRow),
  };
}

export async function cancelUserJob(
  supabase: SupabaseClient<Database>,
  userId: string,
  jobId: string,
): Promise<JobLedgerResult<JobRow | null>> {
  const now = new Date().toISOString();
  const cancelled = await supabase
    .from("jobs")
    .update({
      status: "cancelled",
      error: "用户已取消任务",
      finished_at: now,
      heartbeat_at: now,
      payload: {
        operation: "cancelled",
        phase: "已取消",
        statusText: "任务已取消，已停止本地跟踪",
      },
    })
    .eq("id", jobId)
    .eq("user_id", userId)
    .in("status", ["queued", "dispatched", "running", "waiting_for_trigger", "stalled"])
    .select("*")
    .maybeSingle();

  if (cancelled.error) {
    if (isJobLedgerSchemaPending(cancelled.error)) return { availability: "schema_pending", data: null };
    throw cancelled.error;
  }
  return { availability: "synced", data: cancelled.data as JobRow | null };
}

export async function cleanupExpiredUserJobs(
  supabase: SupabaseClient<Database>,
  userId: string,
  now = Date.now(),
): Promise<JobLedgerResult<number>> {
  const cutoff = new Date(now - TERMINAL_JOB_RETENTION_MS).toISOString();
  const deleted = await supabase
    .from("jobs")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .in("status", ["succeeded", "failed", "stalled", "claimed", "cancelled"])
    .lt("updated_at", cutoff);
  if (deleted.error) {
    if (isJobLedgerSchemaPending(deleted.error)) return { availability: "schema_pending", data: 0 };
    throw deleted.error;
  }
  return { availability: "synced", data: deleted.count ?? 0 };
}

export async function getUserJobResult(
  supabase: SupabaseClient<Database>,
  userId: string,
  jobId: string,
): Promise<JobLedgerResult<JobResultRow | null>> {
  const selected = await supabase
    .from("jobs")
    .select("id, status, result, claimed_at")
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();

  if (selected.error) {
    if (isJobLedgerSchemaPending(selected.error)) return { availability: "schema_pending", data: null };
    throw selected.error;
  }
  return { availability: "synced", data: selected.data as JobResultRow | null };
}

export async function clearTerminalJobSource(
  supabase: SupabaseClient<Database>,
  userId: string,
  jobId: string,
): Promise<JobLedgerResult<JobRow | null>> {
  const cleared = await supabase
    .from("jobs")
    .update({ source_storage_bucket: null, source_storage_path: null })
    .eq("id", jobId)
    .eq("user_id", userId)
    .in("status", ["succeeded", "failed", "stalled", "claimed", "cancelled"])
    .select("*")
    .maybeSingle();

  if (cleared.error) {
    if (isJobLedgerSchemaPending(cleared.error)) return { availability: "schema_pending", data: null };
    throw cleared.error;
  }
  return { availability: "synced", data: cleared.data as JobRow | null };
}

export async function claimSucceededJob(
  supabase: SupabaseClient<Database>,
  userId: string,
  jobId: string,
): Promise<JobLedgerResult<JobRow | null>> {
  const now = new Date().toISOString();
  const claimed = await supabase
    .from("jobs")
    .update({ status: "claimed", claimed_at: now })
    .eq("id", jobId)
    .eq("user_id", userId)
    .eq("status", "succeeded")
    .select("*")
    .maybeSingle();

  if (claimed.error) {
    if (isJobLedgerSchemaPending(claimed.error)) return { availability: "schema_pending", data: null };
    throw claimed.error;
  }
  return { availability: "synced", data: claimed.data as JobRow | null };
}
