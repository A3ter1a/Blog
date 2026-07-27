export const CLIENT_JOB_STORAGE_KEY = "asteroid:jobs:v1";

export type ClientJobStatus = "queued" | "running" | "waiting_for_trigger" | "succeeded" | "failed" | "claimed";
export type ClientJobLedgerState = "local_only" | "synced" | "schema_pending" | "sync_failed";

export type ClientJob = {
  id: string;
  type: "document_ocr" | "problem_ocr" | "markdown_review" | "markdown_migration" | "rag_index" | "batch_grade";
  class: "external" | "internal";
  provider?: string;
  externalTaskId?: string;
  remoteJobId?: string;
  ledgerState?: ClientJobLedgerState;
  title: string;
  status: ClientJobStatus;
  phase: string;
  statusText: string;
  createdAt: string;
  updatedAt: string;
  heartbeatAt?: string;
  pollCount: number;
  progress?: number;
  progressCurrent?: number;
  progressTotal?: number;
  sourcePath?: string;
  resultMarkdown?: string;
  resultPayload?: unknown;
  resultClaimedAt?: string;
  error?: string;
  cleanupError?: string;
};

type RemoteJobLedgerRow = {
  id?: unknown;
  job_class?: unknown;
  job_kind?: unknown;
  status?: unknown;
  title?: unknown;
  provider?: unknown;
  external_task_id?: unknown;
  progress_current?: unknown;
  progress_total?: unknown;
  payload?: unknown;
  result?: unknown;
  error?: unknown;
  source_storage_path?: unknown;
  heartbeat_at?: unknown;
  claimed_at?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeClientJobType(value: unknown): ClientJob["type"] {
  return ["document_ocr", "problem_ocr", "markdown_review", "markdown_migration", "rag_index", "batch_grade"].includes(String(value))
    ? value as ClientJob["type"]
    : "document_ocr";
}

function normalizeRemoteStatus(value: unknown): ClientJobStatus {
  switch (value) {
    case "running": return "running";
    case "waiting_for_trigger": return "waiting_for_trigger";
    case "succeeded": return "succeeded";
    case "failed":
    case "stalled": return "failed";
    case "claimed": return "claimed";
    default: return "queued";
  }
}

function defaultRemotePhase(status: ClientJobStatus): string {
  if (status === "running") return "外部处理中";
  if (status === "waiting_for_trigger") return "等待继续处理";
  if (status === "succeeded") return "结果待领取";
  if (status === "failed") return "处理失败";
  if (status === "claimed") return "结果已领取";
  return "任务排队中";
}

function defaultRemoteStatusText(status: ClientJobStatus): string {
  if (status === "waiting_for_trigger") return "站内任务已暂停，打开任务中心或目标页后可继续";
  if (status === "succeeded") return "任务完成，可在任务中心领取结果";
  if (status === "failed") return "任务失败，错误详情已保留";
  if (status === "claimed") return "结果已经领取";
  if (status === "running") return "外部平台正在处理";
  return "任务已经持久登记，等待外部平台处理";
}

export function normalizeRemoteJobRows(value: unknown): ClientJob[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((raw): ClientJob[] => {
    const row = asRecord(raw) as RemoteJobLedgerRow | null;
    const id = optionalText(row?.id);
    const title = optionalText(row?.title);
    const createdAt = optionalText(row?.created_at);
    const updatedAt = optionalText(row?.updated_at);
    if (!row || !id || !title || !createdAt || !updatedAt) return [];

    const status = normalizeRemoteStatus(row.status);
    const payload = asRecord(row.payload);
    const result = asRecord(row.result);
    const progressCurrent = Number(row.progress_current);
    const progressTotal = Number(row.progress_total);
    const hasProgress = Number.isFinite(progressCurrent) && Number.isFinite(progressTotal) && progressTotal > 0;
    const jobClass = row.job_class === "internal" ? "internal" : "external";

    return [{
      id,
      remoteJobId: id,
      ledgerState: "synced",
      type: normalizeClientJobType(row.job_kind),
      class: jobClass,
      provider: optionalText(row.provider),
      externalTaskId: optionalText(row.external_task_id),
      title,
      status,
      phase: optionalText(payload?.phase) ?? defaultRemotePhase(status),
      statusText: optionalText(payload?.statusText) ?? defaultRemoteStatusText(status),
      createdAt,
      updatedAt,
      heartbeatAt: optionalText(row.heartbeat_at),
      pollCount: 0,
      progress: hasProgress ? Math.min(100, Math.max(0, progressCurrent / progressTotal * 100)) : undefined,
      progressCurrent: hasProgress ? Math.max(0, progressCurrent) : undefined,
      progressTotal: hasProgress ? Math.max(0, progressTotal) : undefined,
      sourcePath: optionalText(row.source_storage_path),
      resultMarkdown: optionalText(result?.markdown),
      resultPayload: result ?? undefined,
      resultClaimedAt: optionalText(row.claimed_at),
      error: optionalText(row.error),
      cleanupError: optionalText(payload?.cleanupError),
    }];
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function normalizeRemoteJobResult(value: unknown): Pick<ClientJob, "resultMarkdown" | "resultPayload"> {
  const row = asRecord(value);
  const result = asRecord(row?.result);
  if (!result) return { resultMarkdown: undefined, resultPayload: undefined };
  return {
    resultMarkdown: optionalText(result.markdown),
    resultPayload: result,
  };
}

export function prepareClientJobsForStorage(jobs: ClientJob[]): ClientJob[] {
  return jobs.map((job) => job.remoteJobId
    ? { ...job, resultMarkdown: undefined, resultPayload: undefined }
    : job);
}

function externalIdentity(job: ClientJob): string | null {
  return job.provider && job.externalTaskId
    ? `${job.provider.trim().toLowerCase()}\u0000${job.externalTaskId.trim()}`
    : null;
}

export function mergeClientJobLedgers(localJobs: ClientJob[], remoteJobs: ClientJob[]): ClientJob[] {
  const localByRemoteId = new Map(localJobs.flatMap((job) => job.remoteJobId ? [[job.remoteJobId, job] as const] : []));
  const localByExternalIdentity = new Map(localJobs.flatMap((job) => {
    const identity = externalIdentity(job);
    return identity ? [[identity, job] as const] : [];
  }));
  const mergedLocalIds = new Set<string>();

  const mergedRemote = remoteJobs.map((remote) => {
    const identity = externalIdentity(remote);
    const local = (remote.remoteJobId ? localByRemoteId.get(remote.remoteJobId) : undefined)
      ?? (identity ? localByExternalIdentity.get(identity) : undefined);
    if (!local) return remote;
    mergedLocalIds.add(local.id);
    return {
      ...local,
      ...remote,
      id: local.id,
      pollCount: Math.max(local.pollCount, remote.pollCount),
      resultMarkdown: remote.resultMarkdown ?? local.resultMarkdown,
      resultPayload: remote.resultPayload ?? local.resultPayload,
      cleanupError: remote.cleanupError ?? local.cleanupError,
      sourcePath: remote.sourcePath ?? local.sourcePath,
    };
  });

  return [
    ...mergedRemote,
    ...localJobs.filter((job) => !mergedLocalIds.has(job.id)),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 40);
}

export function normalizeStoredJobs(value: unknown): ClientJob[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): ClientJob[] => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<ClientJob>;
    if (
      typeof candidate.id !== "string"
      || typeof candidate.title !== "string"
      || typeof candidate.createdAt !== "string"
      || typeof candidate.updatedAt !== "string"
      || !["queued", "running", "waiting_for_trigger", "succeeded", "failed", "claimed"].includes(candidate.status ?? "")
    ) {
      return [];
    }

    return [{
      id: candidate.id,
      type: candidate.type ?? "document_ocr",
      class: candidate.class ?? "external",
      provider: candidate.provider,
      externalTaskId: candidate.externalTaskId,
      remoteJobId: candidate.remoteJobId,
      ledgerState: candidate.ledgerState,
      title: candidate.title,
      status: candidate.status as ClientJobStatus,
      phase: candidate.phase ?? "等待处理",
      statusText: candidate.statusText ?? "等待处理",
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
      heartbeatAt: candidate.heartbeatAt,
      pollCount: Number.isFinite(candidate.pollCount) ? Number(candidate.pollCount) : 0,
      progress: Number.isFinite(candidate.progress) ? Math.min(100, Math.max(0, Number(candidate.progress))) : undefined,
      progressCurrent: Number.isFinite(candidate.progressCurrent) ? Math.max(0, Number(candidate.progressCurrent)) : undefined,
      progressTotal: Number.isFinite(candidate.progressTotal) ? Math.max(0, Number(candidate.progressTotal)) : undefined,
      sourcePath: candidate.sourcePath,
      resultMarkdown: candidate.resultMarkdown,
      resultPayload: candidate.resultPayload,
      resultClaimedAt: candidate.resultClaimedAt,
      error: candidate.error,
      cleanupError: candidate.cleanupError,
    }];
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function canRetryClientJob(job: ClientJob): boolean {
  return job.status === "failed" && (
    Boolean(job.externalTaskId)
    || (job.class === "internal" && Boolean(job.remoteJobId))
  );
}

export function isClientJobActive(job: ClientJob): boolean {
  return job.status === "queued" || job.status === "running" || job.status === "waiting_for_trigger";
}

export function getClientJobProgressLabel(job: ClientJob): string {
  if (job.status === "succeeded") return job.resultClaimedAt ? "结果已领取" : "等待领取结果";
  if (job.status === "failed") return "处理失败";
  if (job.status === "claimed") return "结果已领取";
  if (job.status === "waiting_for_trigger") return "等待继续处理";
  return job.phase || "处理中";
}
