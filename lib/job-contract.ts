export type JobClass = "external" | "internal";
export type JobStatus = "queued" | "dispatched" | "running" | "waiting_for_trigger" | "succeeded" | "failed" | "stalled" | "claimed" | "cancelled";
export type JobItemStatus = "pending" | "leased" | "succeeded" | "failed";
export type ExternalProviderStatus = "pending" | "running" | "success" | "failed" | "unknown";

export interface JobItemContractRecord {
  id: string;
  jobId: string;
  idempotencyKey: string;
  status: JobItemStatus;
  claimedBy?: string;
  leaseExpiresAt?: string;
  attemptCount: number;
  error?: string;
}

export function assertUniqueJobItemKeys(items: JobItemContractRecord[]): void {
  const keys = new Set<string>();

  for (const item of items) {
    const key = `${item.jobId}\u0000${item.idempotencyKey}`;
    if (keys.has(key)) {
      throw new Error(`同一 job 内 idempotency_key 重复：${item.idempotencyKey}`);
    }
    keys.add(key);
  }
}

export function claimJobItem(
  item: JobItemContractRecord,
  claimedBy: string,
  now: Date,
  leaseDurationMs: number,
): JobItemContractRecord | null {
  if (!claimedBy.trim()) throw new Error("claimed_by 不能为空。");
  if (!Number.isFinite(leaseDurationMs) || leaseDurationMs <= 0) {
    throw new Error("lease 时长必须是正数。");
  }

  const existingLeaseIsActive = item.status === "leased"
    && item.leaseExpiresAt !== undefined
    && Date.parse(item.leaseExpiresAt) > now.getTime();

  if (item.status === "succeeded" || item.status === "failed" || existingLeaseIsActive) {
    return null;
  }
  if (item.status !== "pending" && item.status !== "leased") {
    return null;
  }

  return {
    ...item,
    status: "leased",
    claimedBy,
    leaseExpiresAt: new Date(now.getTime() + leaseDurationMs).toISOString(),
    attemptCount: item.attemptCount + 1,
  };
}

export function resetFailedJobItem(item: JobItemContractRecord): JobItemContractRecord {
  if (item.status !== "failed") {
    throw new Error("只有 failed item 可以手动重试。");
  }

  return {
    ...item,
    status: "pending",
    claimedBy: undefined,
    leaseExpiresAt: undefined,
  };
}

export function completeJobItem(
  item: JobItemContractRecord,
  claimedBy: string,
  now: Date,
): JobItemContractRecord {
  if (item.status !== "leased" || item.claimedBy !== claimedBy) {
    throw new Error("只有当前 lease 持有者可以完成 item。");
  }
  if (!item.leaseExpiresAt || Date.parse(item.leaseExpiresAt) <= now.getTime()) {
    throw new Error("lease 已过期，必须重新领取后再完成。");
  }

  return {
    ...item,
    status: "succeeded",
    leaseExpiresAt: undefined,
    error: undefined,
  };
}

export function canClaimJobResult(status: JobStatus): boolean {
  return status === "succeeded";
}

export function shouldRetainJobSource(status: JobStatus): boolean {
  return status !== "succeeded";
}

export function getExternalTaskIdentity(provider: string, externalTaskId: string): string {
  const normalizedProvider = provider.trim().toLowerCase();
  const normalizedTaskId = externalTaskId.trim();
  if (!normalizedProvider || !normalizedTaskId) {
    throw new Error("provider 与 external_task_id 均不能为空。");
  }
  return `${normalizedProvider}:${normalizedTaskId}`;
}

export type ExternalJobStatusTransition = {
  shouldPersist: boolean;
  nextStatus: JobStatus;
};

export function planExternalJobStatusTransition(
  currentStatus: JobStatus,
  providerStatus: ExternalProviderStatus,
  hasDurableResult: boolean,
): ExternalJobStatusTransition {
  if (currentStatus === "claimed" || currentStatus === "succeeded" || currentStatus === "cancelled") {
    return { shouldPersist: false, nextStatus: currentStatus };
  }
  if (currentStatus === "failed" && providerStatus !== "success") {
    return { shouldPersist: false, nextStatus: currentStatus };
  }
  if (providerStatus === "success") {
    return { shouldPersist: true, nextStatus: hasDurableResult ? "succeeded" : "stalled" };
  }
  if (providerStatus === "failed") {
    return { shouldPersist: true, nextStatus: "failed" };
  }
  if (providerStatus === "running") {
    return { shouldPersist: true, nextStatus: "running" };
  }
  if (providerStatus === "pending") {
    return {
      shouldPersist: true,
      nextStatus: currentStatus === "running" || currentStatus === "stalled"
        ? currentStatus
        : "dispatched",
    };
  }
  return { shouldPersist: true, nextStatus: currentStatus };
}
