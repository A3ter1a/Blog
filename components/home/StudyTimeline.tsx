"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  brushStageLabels,
  studyTimelines,
  type BrushStage,
  type StudySubjectTimeline,
  type StudyTimelineTask,
} from "@/components/home/studyTimelineData";
import {
  getMonthNumber,
  getNextTimelineTaskStatus,
  getTimelineTaskStatusWeight,
  mergeTimelineTaskStatuses,
  migrateLegacyTimelineCompletion,
  normalizeTimelineTaskStatusMap,
  resolveCurrentTimelineMonthId,
  type TimelineTaskStatus,
  type TimelineTaskStatusMap,
} from "@/lib/study-timeline";
import {
  importMissingPlanningTaskStatuses,
  loadPlanningTaskStatuses,
  savePlanningTaskStatus,
  savePlanningTaskStatuses,
} from "@/lib/planning-task-status-api";

const STORAGE_KEY = "asteroid-study-timeline-status:v2";
const LEGACY_STORAGE_KEY = "asteroid-study-timeline-completed:v1";
const PENDING_STORAGE_KEY = "asteroid-study-timeline-pending:v1";

const stageStyles: Record<BrushStage, { dot: string; pill: string }> = {
  first: {
    dot: "bg-sky-600",
    pill: "bg-sky-600 shadow-[0_8px_18px_-10px_rgba(2,132,199,0.85)]",
  },
  second: {
    dot: "bg-orange-500",
    pill: "bg-orange-500 shadow-[0_8px_18px_-10px_rgba(249,115,22,0.85)]",
  },
  third: {
    dot: "bg-rose-600",
    pill: "bg-rose-600 shadow-[0_8px_18px_-10px_rgba(225,29,72,0.85)]",
  },
  course: {
    dot: "bg-emerald-500",
    pill: "bg-emerald-600 shadow-[0_8px_18px_-10px_rgba(5,150,105,0.85)]",
  },
};

const monthToneStyles = {
  blue: {
    button: "text-sky-700 hover:text-sky-900 focus-visible:ring-sky-500/35",
    marker: "border-sky-500/60 bg-sky-500 shadow-[0_0_0_6px_rgba(14,165,233,0.12),0_10px_24px_-12px_rgba(2,132,199,0.95)]",
    active: "text-sky-950",
  },
  orange: {
    button: "text-orange-700 hover:text-orange-950 focus-visible:ring-orange-500/35",
    marker: "border-orange-500/60 bg-orange-500 shadow-[0_0_0_6px_rgba(249,115,22,0.13),0_10px_24px_-12px_rgba(234,88,12,0.95)]",
    active: "text-orange-950",
  },
  red: {
    button: "text-rose-700 hover:text-rose-950 focus-visible:ring-rose-500/35",
    marker: "border-rose-500/60 bg-rose-600 shadow-[0_0_0_6px_rgba(225,29,72,0.13),0_10px_24px_-12px_rgba(190,18,60,0.95)]",
    active: "text-rose-950",
  },
} as const;

const taskStatusMeta: Record<TimelineTaskStatus, { label: string; symbol: string; className: string }> = {
  not_started: {
    label: "未开始",
    symbol: "○",
    className: "opacity-65 saturate-75 hover:opacity-90",
  },
  in_progress: {
    label: "进行中",
    symbol: "◐",
    className: "opacity-100 ring-2 ring-white/30",
  },
  completed: {
    label: "已完成",
    symbol: "✓",
    className: "order-last opacity-40 saturate-50 hover:opacity-65",
  },
};

type TimelineMonthSlot = {
  id: string;
  label: string;
  subjects: Array<{
    id: string;
    label: string;
    tasks: StudyTimelineTask[];
  }>;
};

type PlanningAccessState = "checking" | "anonymous" | "authenticated" | "unavailable";

export default function StudyTimeline() {
  const subjects = studyTimelines;
  const months = useMemo(() => buildTimelineMonths(subjects), [subjects]);
  const currentMonthId = useMemo(() => resolveCurrentTimelineMonthId(months), [months]);
  const [selectedMonthId, setSelectedMonthId] = useState<string | null>(() => currentMonthId);
  const selectedMonth = selectedMonthId
    ? months.find((month) => month.id === selectedMonthId) ?? null
    : null;
  const [taskStatuses, setTaskStatuses] = useState<TimelineTaskStatusMap>({});
  const [planningAccess, setPlanningAccess] = useState<PlanningAccessState>("checking");
  const remoteUserIdRef = useRef<string | null>(null);
  const saveSequenceRef = useRef<Record<string, number>>({});
  const canEditTaskStatuses = planningAccess === "authenticated";

  useEffect(() => {
    let cancelled = false;

    void loadPlanningTaskStatuses().then(async (remote) => {
      if (cancelled) return;
      if (!remote) {
        setPlanningAccess("anonymous");
        return;
      }

      remoteUserIdRef.current = remote.userId;
      const localStatuses = readStoredTaskStatuses();
      const importedStatuses = await importMissingPlanningTaskStatuses(remote.userId, localStatuses, remote.statuses);
      const pendingStatuses = readPendingTaskStatuses(remote.userId);
      if (Object.keys(pendingStatuses).length > 0) {
        await savePlanningTaskStatuses(remote.userId, pendingStatuses);
        clearPendingTaskStatuses(remote.userId, pendingStatuses);
      }
      const mergedStatuses = mergeTimelineTaskStatuses(importedStatuses, remote.statuses, pendingStatuses);

      if (cancelled) return;
      persistTaskStatuses(mergedStatuses);
      setTaskStatuses(mergedStatuses);
      setPlanningAccess("authenticated");
    }).catch(() => {
      if (cancelled) return;
      // Keep local and pending states for a later authenticated retry, but do not
      // expose editable controls while the owner boundary cannot be confirmed.
      setPlanningAccess("unavailable");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedSubjectGroups = useMemo(() => {
    return (selectedMonth?.subjects ?? [])
      .map((subject) => ({
        ...subject,
        tasks: sortTasksByStatus(subject.tasks, canEditTaskStatuses ? taskStatuses : {}),
      }))
      .filter((subject) => subject.tasks.length > 0);
  }, [canEditTaskStatuses, selectedMonth, taskStatuses]);

  const selectMonth = (monthId: string) => {
    setSelectedMonthId(monthId);
  };

  const cycleTaskStatus = (taskId: string) => {
    if (!canEditTaskStatuses) return;

    setTaskStatuses((current) => {
      const currentStatus = current[taskId] ?? "not_started";
      const next = {
        ...current,
        [taskId]: getNextTimelineTaskStatus(currentStatus),
      };

      persistTaskStatuses(next);
      const userId = remoteUserIdRef.current;
      const sequence = (saveSequenceRef.current[taskId] ?? 0) + 1;
      saveSequenceRef.current[taskId] = sequence;
      if (userId) persistPendingTaskStatus(userId, taskId, next[taskId]);

      void savePlanningTaskStatus(taskId, next[taskId])
        .then(() => {
          if (saveSequenceRef.current[taskId] !== sequence || !userId) return;
          clearPendingTaskStatus(userId, taskId, next[taskId]);
        })
        .catch(() => {
          // The pending queue keeps the latest authenticated manual change for retry.
        });
      return next;
    });
  };

  if (months.length === 0) {
    return null;
  }

  return (
    <div className="relative mx-auto w-full py-4 sm:py-6">
      <div className="relative mx-auto w-full max-w-6xl pb-6">
        <div className="absolute left-[8.333%] right-[8.333%] top-2.5 z-0 hidden h-4 rounded-full bg-[linear-gradient(90deg,#0284c7_0%,#0ea5e9_28%,#f59e0b_45%,#f97316_80%,#e11d48_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.38),0_14px_34px_-20px_rgba(15,23,42,0.9)] sm:block" />

        <div className="relative z-10 grid grid-cols-3 gap-y-5 sm:grid-cols-6 sm:gap-y-0">
          {months.map((month) => {
            const tone = getMonthTone(month.label);
            const toneStyle = monthToneStyles[tone];
            const isSelected = month.id === selectedMonth?.id;

            return (
              <div key={month.id} className="relative flex justify-center">
                <button
                  type="button"
                  onClick={() => selectMonth(month.id)}
                  className={`motion-ui group flex min-w-0 flex-col items-center gap-3 rounded-lg px-2 pb-1 pt-0 text-center focus:outline-none focus-visible:ring-2 ${toneStyle.button} ${
                    isSelected ? `${toneStyle.active} bg-surface-container-lowest/70` : ""
                  }`}
                  aria-pressed={isSelected}
                >
                  <span
                    className={`motion-ui relative flex h-9 w-9 items-center justify-center rounded-full border-[5px] border-surface group-hover:scale-110 ${
                      toneStyle.marker
                    } ${isSelected ? "scale-110" : ""}`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-white/95" />
                  </span>
                  <span className="font-headline text-base font-bold leading-none sm:text-lg">
                    {month.label}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

      </div>

      {selectedMonth ? (
        <div
          className="motion-ui mx-auto w-full max-w-6xl rounded-2xl border border-primary/10 bg-surface-container-lowest/50 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_18px_48px_-34px_rgba(15,23,42,0.58)] backdrop-blur-sm sm:p-6"
        >
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-headline text-2xl font-bold leading-none text-primary">
                {selectedMonth.label}
              </p>
              <p className="mt-2 text-sm font-semibold text-on-surface-variant">
                {selectedMonth.id === currentMonthId ? "北京时间 · 当前重心" : "北京时间 · 月度计划"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {canEditTaskStatuses ? (
                (Object.entries(taskStatusMeta) as Array<[TimelineTaskStatus, (typeof taskStatusMeta)[TimelineTaskStatus]]>).map(([status, meta]) => (
                  <span key={status} className="inline-flex items-center gap-1 text-xs font-semibold text-on-surface-variant">
                    <span aria-hidden="true">{meta.symbol}</span>
                    {meta.label}
                  </span>
                ))
              ) : (
                <span className="text-xs font-semibold text-on-surface-variant">
                  {planningAccess === "checking"
                    ? "正在确认登录状态"
                    : planningAccess === "unavailable"
                      ? "个人状态同步暂不可用"
                      : "登录后可更新个人状态"}
                </span>
              )}
              {Object.entries(brushStageLabels).map(([stage, label]) => (
                <span key={stage} className="inline-flex items-center gap-1.5 text-xs font-bold text-on-surface-variant">
                  <span className={`h-2.5 w-2.5 rounded-full ${stageStyles[stage as BrushStage].dot}`} />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            {selectedSubjectGroups.map((subject) => {
              const stageGroups = buildStageGroups(subject.tasks);

              return (
                <section key={subject.id} className="rounded-xl border border-primary/10 bg-surface/40 p-4">
                  <h3 className="mb-4 font-headline text-lg font-bold text-primary">
                    {subject.label}
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      {stageGroups.map(({ stage, label, tasks }) => (
                        <div key={stage} className="min-w-0 rounded-lg bg-surface-container-low/55 p-3">
                          <p className="mb-2 text-xs font-bold text-on-surface-variant">
                            {label}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {tasks.map((task) => {
                              if (!canEditTaskStatuses) {
                                return (
                                  <span
                                    key={task.id}
                                    className={`max-w-full whitespace-normal rounded-full px-3 py-1.5 text-left text-xs font-bold leading-5 text-white sm:text-sm ${
                                      stageStyles[task.stage].pill
                                    }`}
                                  >
                                    {task.title}
                                  </span>
                                );
                              }

                              const status = taskStatuses[task.id] ?? "not_started";
                              const statusMeta = taskStatusMeta[status];
                              const nextStatus = getNextTimelineTaskStatus(status);

                              return (
                                <button
                                  key={task.id}
                                  type="button"
                                  data-status={status}
                                  aria-label={`${task.title}，${brushStageLabels[task.stage]}，当前${statusMeta.label}；点击切换为${taskStatusMeta[nextStatus].label}`}
                                  onClick={() => cycleTaskStatus(task.id)}
                                  className={`motion-ui motion-interactive min-h-11 max-w-full whitespace-normal rounded-full px-3 py-1.5 text-left text-xs font-bold leading-5 text-white hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 sm:text-sm ${
                                    stageStyles[task.stage].pill
                                  } ${statusMeta.className}`}
                                >
                                  <span aria-hidden="true" className="mr-1.5">{statusMeta.symbol}</span>
                                  {task.title}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildTimelineMonths(subjects: StudySubjectTimeline[]) {
  const monthMap = new Map<string, TimelineMonthSlot>();

  subjects.forEach((subject) => {
    subject.months.forEach((month) => {
      const slot = monthMap.get(month.label) ?? {
        id: month.label,
        label: month.label,
        subjects: [],
      };

      slot.subjects.push({
        id: subject.id,
        label: subject.label,
        tasks: month.tasks,
      });
      monthMap.set(month.label, slot);
    });
  });

  return Array.from(monthMap.values()).sort((left, right) => {
    return getMonthOrder(left.label) - getMonthOrder(right.label);
  });
}

function getMonthOrder(label: string) {
  return getMonthNumber(label) ?? Number.MAX_SAFE_INTEGER;
}

function getMonthTone(label: string): keyof typeof monthToneStyles {
  const order = getMonthOrder(label);

  if (order <= 8) {
    return "blue";
  }

  if (order >= 12) {
    return "red";
  }

  return "orange";
}

function sortTasksByStatus(tasks: StudyTimelineTask[], statuses: TimelineTaskStatusMap) {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((left, right) => {
      const leftStatus = statuses[left.task.id] ?? "not_started";
      const rightStatus = statuses[right.task.id] ?? "not_started";
      const leftWeight = getTimelineTaskStatusWeight(leftStatus);
      const rightWeight = getTimelineTaskStatusWeight(rightStatus);

      if (leftWeight !== rightWeight) {
        return leftWeight - rightWeight;
      }

      return left.index - right.index;
    })
    .map(({ task }) => task);
}

function buildStageGroups(tasks: StudyTimelineTask[]) {
  return (Object.entries(brushStageLabels) as Array<[BrushStage, string]>)
    .map(([stage, label]) => ({
      stage,
      label,
      tasks: tasks.filter((task) => task.stage === stage),
    }));
}

function readStoredTaskStatuses(): TimelineTaskStatusMap {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (raw) {
      return normalizeTimelineTaskStatusMap(JSON.parse(raw));
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacyRaw) {
      return {};
    }

    const migrated = migrateLegacyTimelineCompletion(JSON.parse(legacyRaw));
    persistTaskStatuses(migrated);
    return migrated;
  } catch {
    return {};
  }
}

function persistTaskStatuses(statuses: TimelineTaskStatusMap) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(statuses));
  } catch {
    // Local storage can fail in private modes; the UI still works for this session.
  }
}

function getPendingStorageKey(userId: string): string {
  return `${PENDING_STORAGE_KEY}:${userId}`;
}

function readPendingTaskStatuses(userId: string): TimelineTaskStatusMap {
  if (typeof window === "undefined") return {};
  try {
    return normalizeTimelineTaskStatusMap(JSON.parse(window.localStorage.getItem(getPendingStorageKey(userId)) ?? "{}"));
  } catch {
    return {};
  }
}

function persistPendingTaskStatus(userId: string, taskId: string, status: TimelineTaskStatus) {
  try {
    window.localStorage.setItem(
      getPendingStorageKey(userId),
      JSON.stringify({ ...readPendingTaskStatuses(userId), [taskId]: status }),
    );
  } catch {
    // The immediate UI remains usable even when browser storage is unavailable.
  }
}

function clearPendingTaskStatus(userId: string, taskId: string, expectedStatus: TimelineTaskStatus) {
  const current = readPendingTaskStatuses(userId);
  if (current[taskId] !== expectedStatus) return;
  delete current[taskId];
  try {
    window.localStorage.setItem(getPendingStorageKey(userId), JSON.stringify(current));
  } catch {
    // A stale retry marker is safer than silently losing a failed authenticated save.
  }
}

function clearPendingTaskStatuses(userId: string, uploaded: TimelineTaskStatusMap) {
  for (const [taskId, status] of Object.entries(uploaded)) {
    clearPendingTaskStatus(userId, taskId, status);
  }
}
