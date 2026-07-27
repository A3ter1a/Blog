import type { JobItemStatus, JobStatus } from "./job-contract";

export type InternalJobItemProjectionInput = {
  ordinal: number;
  status: JobItemStatus;
  error?: string | null;
};

export type InternalJobProjection = {
  status: Extract<JobStatus, "running" | "waiting_for_trigger" | "succeeded" | "failed">;
  progressCurrent: number;
  progressTotal: number;
  phase: string;
  statusText: string;
  error?: string;
};

export function isInternalJobLeaseEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function planInternalJobProjection(
  items: InternalJobItemProjectionInput[],
): InternalJobProjection {
  if (items.length === 0) {
    throw new Error("站内任务至少需要一个 job item。");
  }

  const succeeded = items.filter((item) => item.status === "succeeded").length;
  const failed = items
    .filter((item) => item.status === "failed")
    .sort((left, right) => left.ordinal - right.ordinal);
  const leased = items.filter((item) => item.status === "leased").length;
  const total = items.length;

  if (failed.length > 0) {
    return {
      status: "failed",
      progressCurrent: succeeded,
      progressTotal: total,
      phase: "分块处理失败",
      statusText: `已完成 ${succeeded}/${total} 个分块；失败分块需要显式重试`,
      error: failed[0].error?.trim() || "站内任务分块处理失败",
    };
  }

  if (succeeded === total) {
    return {
      status: "succeeded",
      progressCurrent: total,
      progressTotal: total,
      phase: "结果待领取",
      statusText: `全部 ${total} 个分块已完成，可领取结果`,
    };
  }

  if (leased > 0) {
    return {
      status: "running",
      progressCurrent: succeeded,
      progressTotal: total,
      phase: "正在处理分块",
      statusText: `已完成 ${succeeded}/${total} 个分块，${leased} 个分块持有有效 lease`,
    };
  }

  return {
    status: "waiting_for_trigger",
    progressCurrent: succeeded,
    progressTotal: total,
    phase: "等待继续处理",
    statusText: `已完成 ${succeeded}/${total} 个分块；打开任务中心或目标页后继续`,
  };
}
