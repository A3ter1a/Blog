import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BaiduOcrTaskStatus } from "@/lib/baidu-unlimited-ocr";
import { planExternalJobStatusTransition, type JobStatus } from "@/lib/job-contract";
import type { Database, Json, Tables, TablesInsert, TablesUpdate } from "@/lib/supabase-schema";

export const DOCUMENT_OCR_PROVIDER = "baidu-unlimited-ocr";
export const OCR_DOCUMENT_BUCKET = "ocr-documents";
export const TERMINAL_JOB_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const ORPHANED_OCR_ASSET_RETENTION_MS = 24 * 60 * 60 * 1000;
const ORPHAN_CLEANUP_THROTTLE_MS = 60 * 60 * 1000;
const orphanCleanupAtByUser = new Map<string, number>();

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
    "mode",
    "difficulty",
    "cleanupError",
    "targetId",
  ];
  return Object.fromEntries(
    allowedKeys.flatMap((key) => key in value ? [[key, value[key] as Json]] : []),
  ) as Json;
}

function getOwnedInternalOcrAssetPaths(job: JobRow, userId: string): string[] {
  if (job.source_storage_bucket !== OCR_DOCUMENT_BUCKET || !isRecord(job.payload)) return [];
  const assets = Array.isArray(job.payload.assets) ? job.payload.assets : [];
  const ownedPrefixes = [`problem-ocr/${userId}/`, `math-paper-ocr/${userId}/`];
  return Array.from(new Set(assets.flatMap((asset): string[] => {
    if (!isRecord(asset) || typeof asset.path !== "string") return [];
    const path = asset.path.trim().replace(/\\/g, "/");
    if (
      !path
      || path.length > 300
      || path.split("/").some((segment) => segment === "." || segment === "..")
      || !ownedPrefixes.some((prefix) => path.startsWith(prefix))
    ) return [];
    return [path];
  })));
}

async function cleanupOwnedJobAssets(
  supabase: SupabaseClient<Database>,
  job: JobRow,
  userId: string,
): Promise<void> {
  const paths = getOwnedInternalOcrAssetPaths(job, userId);
  const externalPath = job.source_storage_bucket === OCR_DOCUMENT_BUCKET
    ? normalizeOcrSourcePath(job.source_storage_path)
    : undefined;
  const ownedPaths = Array.from(new Set([...paths, ...(externalPath ? [externalPath] : [])]));
  if (ownedPaths.length === 0) return;
  const removed = await supabase.storage.from(OCR_DOCUMENT_BUCKET).remove(ownedPaths);
  if (removed.error) throw new Error(`临时源文件清理失败：${removed.error.message}`);
}

function readStorageTimestamp(value: Record<string, unknown>): number {
  for (const key of ["created_at", "updated_at", "last_accessed_at"]) {
    if (typeof value[key] !== "string") continue;
    const timestamp = Date.parse(value[key]);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return Number.NaN;
}

export async function cleanupOrphanedUserOcrAssets(
  supabase: SupabaseClient<Database>,
  userId: string,
  now = Date.now(),
): Promise<JobLedgerResult<number>> {
  const lastCleanupAt = orphanCleanupAtByUser.get(userId) ?? 0;
  if (now - lastCleanupAt < ORPHAN_CLEANUP_THROTTLE_MS) return { availability: "synced", data: 0 };
  orphanCleanupAtByUser.set(userId, now);

  const referenced = await supabase
    .from("jobs")
    .select("payload")
    .eq("user_id", userId)
    .eq("source_storage_bucket", OCR_DOCUMENT_BUCKET);
  if (referenced.error) {
    orphanCleanupAtByUser.delete(userId);
    if (isJobLedgerSchemaPending(referenced.error)) return { availability: "schema_pending", data: 0 };
    throw referenced.error;
  }
  const referencedPaths = new Set<string>();
  for (const row of referenced.data ?? []) {
    if (!isRecord(row.payload) || !Array.isArray(row.payload.assets)) continue;
    for (const asset of row.payload.assets) {
      if (isRecord(asset) && typeof asset.path === "string") referencedPaths.add(asset.path.replace(/\\/g, "/"));
    }
  }

  const cutoff = now - ORPHANED_OCR_ASSET_RETENTION_MS;
  const orphanPaths: string[] = [];
  for (const kind of ["problem-ocr", "math-paper-ocr"] as const) {
    const userPrefix = `${kind}/${userId}`;
    const batches = await supabase.storage.from(OCR_DOCUMENT_BUCKET).list(userPrefix, {
      limit: 20,
      sortBy: { column: "created_at", order: "asc" },
    });
    if (batches.error) continue;
    for (const batch of batches.data ?? []) {
      if (!/^[0-9a-f-]{36}$/i.test(batch.name)) continue;
      const batchPrefix = `${userPrefix}/${batch.name}`;
      const files = await supabase.storage.from(OCR_DOCUMENT_BUCKET).list(batchPrefix, {
        limit: 100,
        sortBy: { column: "created_at", order: "asc" },
      });
      if (files.error) continue;
      for (const file of files.data ?? []) {
        if (!/^\d{2}\.(?:jpg|png|webp)$/i.test(file.name)) continue;
        const path = `${batchPrefix}/${file.name}`;
        if (referencedPaths.has(path)) continue;
        const createdAt = readStorageTimestamp(file as unknown as Record<string, unknown>);
        if (Number.isFinite(createdAt) && createdAt < cutoff) orphanPaths.push(path);
      }
    }
  }
  if (orphanPaths.length === 0) return { availability: "synced", data: 0 };
  const removed = await supabase.storage.from(OCR_DOCUMENT_BUCKET).remove(orphanPaths);
  if (removed.error) throw new Error(`孤立 OCR 源文件清理失败：${removed.error.message}`);
  return { availability: "synced", data: orphanPaths.length };
}

export function sanitizeJobSummaryRow(row: JobRow): JobSummaryRow {
  const summary = Object.fromEntries(
    Object.entries(row).filter(([key]) => key !== "result"),
  ) as JobSummaryRow;
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
  const activeStatuses = ["queued", "dispatched", "running", "waiting_for_trigger", "stalled"];
  const selected = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .in("status", activeStatuses)
    .maybeSingle();
  if (selected.error) {
    if (isJobLedgerSchemaPending(selected.error)) return { availability: "schema_pending", data: null };
    throw selected.error;
  }
  if (!selected.data) return { availability: "synced", data: null };

  const selectedJob = selected.data as JobRow;
  const originalPayload = isRecord(selectedJob.payload) ? selectedJob.payload : {};
  const sourcePaths = getOwnedInternalOcrAssetPaths(selectedJob, userId);
  const now = new Date().toISOString();
  const cancelledPayload = {
    ...originalPayload,
    operation: "cancelled",
    phase: "已取消",
    statusText: sourcePaths.length > 0 ? "任务已取消，正在清理临时源图" : "任务已取消，已停止本地跟踪",
  } satisfies Record<string, Json>;
  const cancelled = await supabase
    .from("jobs")
    .update({
      status: "cancelled",
      error: "用户已取消任务",
      finished_at: now,
      heartbeat_at: now,
      payload: cancelledPayload,
    })
    .eq("id", jobId)
    .eq("user_id", userId)
    .in("status", activeStatuses)
    .select("*")
    .maybeSingle();

  if (cancelled.error) {
    if (isJobLedgerSchemaPending(cancelled.error)) return { availability: "schema_pending", data: null };
    throw cancelled.error;
  }
  if (!cancelled.data || sourcePaths.length === 0) {
    return { availability: "synced", data: cancelled.data as JobRow | null };
  }

  const removed = await supabase.storage.from(OCR_DOCUMENT_BUCKET).remove(sourcePaths);
  const cleanupError = removed.error
    ? `任务已取消，但临时源图清理失败：${removed.error.message}`
    : null;
  const finalPayload = cleanupError
    ? { ...cancelledPayload, phase: "已取消，源文件待清理", statusText: cleanupError, cleanupError }
    : { operation: "cancelled", phase: "已取消", statusText: "任务已取消，临时源图已清理" };
  const finalized = await supabase
    .from("jobs")
    .update({
      payload: finalPayload,
      source_storage_bucket: cleanupError ? selectedJob.source_storage_bucket : null,
      source_storage_path: cleanupError ? selectedJob.source_storage_path : null,
    })
    .eq("id", jobId)
    .eq("user_id", userId)
    .eq("status", "cancelled")
    .select("*")
    .maybeSingle();

  if (!finalized.error && finalized.data) {
    return { availability: "synced", data: finalized.data as JobRow };
  }
  return {
    availability: "synced",
    data: {
      ...(cancelled.data as JobRow),
      payload: finalPayload as Json,
      source_storage_bucket: cleanupError ? selectedJob.source_storage_bucket : null,
      source_storage_path: cleanupError ? selectedJob.source_storage_path : null,
    },
  };
}

export async function cleanupExpiredUserJobs(
  supabase: SupabaseClient<Database>,
  userId: string,
  now = Date.now(),
): Promise<JobLedgerResult<number>> {
  const cutoff = new Date(now - TERMINAL_JOB_RETENTION_MS).toISOString();
  const expired = await supabase
    .from("jobs")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["failed", "claimed", "cancelled"])
    .lt("updated_at", cutoff);
  if (expired.error) {
    if (isJobLedgerSchemaPending(expired.error)) return { availability: "schema_pending", data: 0 };
    throw expired.error;
  }
  let deletedCount = 0;
  for (const row of expired.data ?? []) {
    const job = row as JobRow;
    try {
      await cleanupOwnedJobAssets(supabase, job, userId);
    } catch {
      // Keep the job metadata so a later cleanup pass can still discover and
      // remove its private source assets instead of orphaning them forever.
      continue;
    }
    const deleted = await supabase.from("jobs").delete({ count: "exact" })
      .eq("id", job.id)
      .eq("user_id", userId)
      .eq("status", job.status);
    if (deleted.error) throw deleted.error;
    deletedCount += deleted.count ?? 0;
  }
  return { availability: "synced", data: deletedCount };
}

export async function dismissTerminalUserJob(
  supabase: SupabaseClient<Database>,
  userId: string,
  jobId: string,
): Promise<JobLedgerResult<boolean>> {
  const selected = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .in("status", ["failed", "claimed", "cancelled"])
    .maybeSingle();
  if (selected.error) {
    if (isJobLedgerSchemaPending(selected.error)) return { availability: "schema_pending", data: false };
    throw selected.error;
  }
  if (!selected.data) return { availability: "synced", data: false };

  const job = selected.data as JobRow;
  await cleanupOwnedJobAssets(supabase, job, userId);
  const deleted = await supabase.from("jobs").delete({ count: "exact" })
    .eq("id", job.id)
    .eq("user_id", userId)
    .eq("status", job.status);
  if (deleted.error) throw deleted.error;
  return { availability: "synced", data: (deleted.count ?? 0) > 0 };
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
