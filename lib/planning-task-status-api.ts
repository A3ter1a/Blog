import { getSupabase } from "@/lib/supabase";
import {
  getMissingTimelineTaskStatuses,
  isTimelineTaskStatus,
  mergeTimelineTaskStatuses,
  type TimelineTaskStatus,
  type TimelineTaskStatusMap,
} from "@/lib/study-timeline";

export type RemotePlanningTaskStatuses = {
  userId: string;
  statuses: TimelineTaskStatusMap;
};

async function getAuthenticatedUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.user.id ?? null;
}

export async function loadPlanningTaskStatuses(): Promise<RemotePlanningTaskStatuses | null> {
  const userId = await getAuthenticatedUserId();
  if (!userId) return null;

  const { data, error } = await getSupabase()
    .from("planning_task_status")
    .select("task_id, status")
    .eq("user_id", userId);

  if (error) throw error;

  const statuses = Object.fromEntries((data ?? [])
    .filter((row): row is typeof row & { task_id: string; status: TimelineTaskStatus } => (
      typeof row.task_id === "string" && isTimelineTaskStatus(row.status)
    ))
    .map((row) => [row.task_id, row.status]));

  return { userId, statuses };
}

export async function savePlanningTaskStatus(taskId: string, status: TimelineTaskStatus): Promise<boolean> {
  const normalizedTaskId = taskId.trim();
  if (!normalizedTaskId) throw new Error("规划任务 ID 不能为空");

  const userId = await getAuthenticatedUserId();
  if (!userId) return false;

  const { error } = await getSupabase()
    .from("planning_task_status")
    .upsert({
      user_id: userId,
      task_id: normalizedTaskId,
      status,
    }, { onConflict: "user_id,task_id" });

  if (error) throw error;
  return true;
}

export async function importMissingPlanningTaskStatuses(
  userId: string,
  localStatuses: TimelineTaskStatusMap,
  remoteStatuses: TimelineTaskStatusMap,
): Promise<TimelineTaskStatusMap> {
  const missingStatuses = getMissingTimelineTaskStatuses(localStatuses, remoteStatuses);
  const missingRows = Object.entries(missingStatuses)
    .map(([taskId, status]) => ({ user_id: userId, task_id: taskId, status }));

  if (missingRows.length > 0) {
    const { error } = await getSupabase()
      .from("planning_task_status")
      .upsert(missingRows, { onConflict: "user_id,task_id", ignoreDuplicates: true });

    if (error) throw error;
  }

  return mergeTimelineTaskStatuses(localStatuses, remoteStatuses);
}

export async function savePlanningTaskStatuses(
  userId: string,
  statuses: TimelineTaskStatusMap,
): Promise<void> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) throw new Error("规划同步用户 ID 不能为空");

  const rows = Object.entries(statuses).map(([taskId, status]) => ({
    user_id: normalizedUserId,
    task_id: taskId,
    status,
  }));
  if (rows.length === 0) return;

  const { error } = await getSupabase()
    .from("planning_task_status")
    .upsert(rows, { onConflict: "user_id,task_id" });

  if (error) throw error;
}
