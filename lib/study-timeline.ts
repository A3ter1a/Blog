export type TimelineTaskStatus = "not_started" | "in_progress" | "completed";

export type TimelineTaskStatusMap = Record<string, TimelineTaskStatus>;

const STATUS_ORDER: Record<TimelineTaskStatus, number> = {
  in_progress: 0,
  not_started: 1,
  completed: 2,
};

export function isTimelineTaskStatus(value: unknown): value is TimelineTaskStatus {
  return value === "not_started" || value === "in_progress" || value === "completed";
}

export function normalizeTimelineTaskStatusMap(value: unknown): TimelineTaskStatusMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, TimelineTaskStatus] => (
      entry[0].trim().length > 0 && isTimelineTaskStatus(entry[1])
    )),
  );
}

export function getMissingTimelineTaskStatuses(
  localStatuses: TimelineTaskStatusMap,
  remoteStatuses: TimelineTaskStatusMap,
): TimelineTaskStatusMap {
  return Object.fromEntries(
    Object.entries(localStatuses).filter(([taskId]) => remoteStatuses[taskId] === undefined),
  );
}

export function mergeTimelineTaskStatuses(
  localStatuses: TimelineTaskStatusMap,
  remoteStatuses: TimelineTaskStatusMap,
  pendingStatuses: TimelineTaskStatusMap = {},
): TimelineTaskStatusMap {
  return { ...localStatuses, ...remoteStatuses, ...pendingStatuses };
}

export function migrateLegacyTimelineCompletion(value: unknown): TimelineTaskStatusMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([taskId, completed]) => taskId.trim().length > 0 && completed === true)
      .map(([taskId]) => [taskId, "completed" as const]),
  );
}

export function getNextTimelineTaskStatus(status: TimelineTaskStatus): TimelineTaskStatus {
  if (status === "not_started") return "in_progress";
  if (status === "in_progress") return "completed";
  return "not_started";
}

export function getTimelineTaskStatusWeight(status: TimelineTaskStatus): number {
  return STATUS_ORDER[status];
}

export function getBeijingMonth(date: Date): number {
  const month = new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    timeZone: "Asia/Shanghai",
  }).format(date);

  return Number(month);
}

export function getMonthNumber(label: string): number | null {
  const match = label.match(/\d+/);
  if (!match) return null;

  const month = Number(match[0]);
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
}

export function resolveCurrentTimelineMonthId<T extends { id: string; label: string }>(
  months: T[],
  now = new Date(),
): string | null {
  if (months.length === 0) return null;

  const currentMonth = getBeijingMonth(now);
  const ordered = months
    .map((month, index) => ({ month, index, number: getMonthNumber(month.label) }))
    .filter((entry): entry is { month: T; index: number; number: number } => entry.number !== null)
    .sort((left, right) => left.number - right.number || left.index - right.index);

  if (ordered.length === 0) return months[0].id;

  const exact = ordered.find((entry) => entry.number === currentMonth);
  if (exact) return exact.month.id;

  if (currentMonth < ordered[0].number) return ordered[0].month.id;
  return ordered[ordered.length - 1].month.id;
}
