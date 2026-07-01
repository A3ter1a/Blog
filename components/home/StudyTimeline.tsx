"use client";

import { useMemo, useRef, useState } from "react";
import {
  brushStageLabels,
  studyTimelines,
  type BrushStage,
  type StudySubjectTimeline,
  type StudyTimelineTask,
} from "@/components/home/studyTimelineData";

const STORAGE_KEY = "asteroid-study-timeline-completed:v1";

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

const detailStageColumns = "minmax(22rem,1.35fr) minmax(20rem,1.2fr) minmax(16rem,1fr) minmax(24rem,1.45fr)";

type CompletionMap = Record<string, true>;

type TimelineMonthSlot = {
  id: string;
  label: string;
  subjects: Array<{
    id: string;
    label: string;
    tasks: StudyTimelineTask[];
  }>;
};

export default function StudyTimeline() {
  const subjects = studyTimelines;
  const months = useMemo(() => buildTimelineMonths(subjects), [subjects]);
  const detailRef = useRef<HTMLDivElement | null>(null);
  const [activeMonthId, setActiveMonthId] = useState<string | null>(null);
  const [selectedMonthId, setSelectedMonthId] = useState<string | null>(null);
  const activeMonth = activeMonthId
    ? months.find((month) => month.id === activeMonthId) ?? null
    : null;
  const selectedMonth = selectedMonthId
    ? months.find((month) => month.id === selectedMonthId) ?? null
    : null;
  const activeMonthIndex = activeMonth
    ? months.findIndex((month) => month.id === activeMonth.id)
    : -1;
  const [completed, setCompleted] = useState<CompletionMap>(() => readStoredCompletion());

  const activeSubjectGroups = useMemo(() => {
    return (activeMonth?.subjects ?? [])
      .map((subject) => ({
        ...subject,
        tasks: sortTasksByCompletion(subject.tasks, completed),
      }))
      .filter((subject) => subject.tasks.length > 0);
  }, [activeMonth, completed]);

  const selectedSubjectGroups = useMemo(() => {
    return (selectedMonth?.subjects ?? [])
      .map((subject) => ({
        ...subject,
        tasks: sortTasksByCompletion(subject.tasks, completed),
      }))
      .filter((subject) => subject.tasks.length > 0);
  }, [selectedMonth, completed]);

  const selectMonth = (monthId: string) => {
    setActiveMonthId(null);
    setSelectedMonthId(monthId);

    window.requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const toggleTask = (taskId: string) => {
    setCompleted((current) => {
      const next = { ...current };

      if (next[taskId]) {
        delete next[taskId];
      } else {
        next[taskId] = true;
      }

      persistCompletion(next);
      return next;
    });
  };

  if (months.length === 0) {
    return null;
  }

  const cardLeft = activeMonthIndex >= 0
    ? `${((activeMonthIndex + 0.5) / months.length) * 100}%`
    : "50%";
  const cardAlign =
    activeMonthIndex <= 0
      ? "translate-x-0"
      : activeMonthIndex >= months.length - 1
        ? "-translate-x-full"
        : "-translate-x-1/2";
  const showSubjectLabels = activeSubjectGroups.length > 1;

  return (
    <div
      className="relative mx-auto w-full py-8 sm:py-10"
      onMouseLeave={() => setActiveMonthId(null)}
    >
      <div className="relative mx-auto w-full max-w-6xl pb-36 sm:pb-40">
        <div className="absolute left-[8.333%] right-[8.333%] top-2.5 z-0 h-4 rounded-full bg-[linear-gradient(90deg,#0284c7_0%,#0ea5e9_28%,#f59e0b_45%,#f97316_80%,#e11d48_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.38),0_14px_34px_-20px_rgba(15,23,42,0.9)]" />

        <div className="relative z-10 grid grid-cols-6">
          {months.map((month) => {
            const tone = getMonthTone(month.label);
            const toneStyle = monthToneStyles[tone];
            const isActive = month.id === activeMonth?.id;
            const isSelected = month.id === selectedMonth?.id;

            return (
              <div key={month.id} className="relative flex justify-center">
                <button
                  type="button"
                  onClick={() => selectMonth(month.id)}
                  onFocus={() => setActiveMonthId(month.id)}
                  onMouseEnter={() => setActiveMonthId(month.id)}
                  className={`motion-ui group flex min-w-0 flex-col items-center gap-3 rounded-lg px-2 pb-1 pt-0 text-center focus:outline-none focus-visible:ring-2 ${toneStyle.button} ${
                    isActive ? toneStyle.active : ""
                  }`}
                  aria-expanded={isActive}
                >
                  <span
                    className={`motion-ui relative flex h-9 w-9 items-center justify-center rounded-full border-[5px] border-surface group-hover:scale-110 ${
                      toneStyle.marker
                    } ${isActive || isSelected ? "scale-110" : ""}`}
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

        {activeMonth ? (
          <div
            className={`absolute top-20 z-20 w-[min(22rem,calc(100vw-2rem))] ${cardAlign}`}
            style={{ left: cardLeft }}
          >
            <div className="motion-ui rounded-xl border border-white/10 bg-[#14263a]/95 p-4 text-white shadow-[0_18px_50px_-24px_rgba(15,23,42,0.95)] backdrop-blur-md">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <span className="font-headline text-lg font-bold leading-none">
                  {activeMonth.label}
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  {Object.entries(brushStageLabels).map(([stage, label]) => (
                    <span key={stage} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/76">
                      <span className={`h-2 w-2 rounded-full ${stageStyles[stage as BrushStage].dot}`} />
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                {activeSubjectGroups.map((subject) => (
                  <div key={subject.id}>
                    {showSubjectLabels ? (
                      <p className="mb-2 text-xs font-semibold text-white/58">
                        {subject.label}
                      </p>
                    ) : null}
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {subject.tasks.map((task) => {
                        const done = Boolean(completed[task.id]);

                        return (
                          <button
                            key={task.id}
                            type="button"
                            aria-pressed={done}
                            aria-label={`${task.title}，${brushStageLabels[task.stage]}，${done ? "已完成" : "未完成"}`}
                            onClick={() => toggleTask(task.id)}
                            className={`motion-ui motion-interactive shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold text-white hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 sm:text-sm ${
                              stageStyles[task.stage].pill
                            } ${done ? "order-last opacity-40 saturate-75 hover:opacity-65" : "opacity-100"}`}
                          >
                            {task.title}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {selectedMonth ? (
        <div
          ref={detailRef}
          className="motion-ui relative left-1/2 w-[min(96vw,104rem)] -translate-x-1/2 scroll-mt-24 rounded-2xl border border-primary/10 bg-surface-container-lowest/50 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_18px_48px_-34px_rgba(15,23,42,0.58)] backdrop-blur-sm sm:p-6"
        >
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-headline text-2xl font-bold leading-none text-primary">
                {selectedMonth.label}
              </p>
              <p className="mt-2 text-sm font-semibold text-on-surface-variant">
                本月重心
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
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
                  <div className="overflow-x-auto pb-1">
                    <div
                      className="grid min-w-[88rem] gap-4"
                      style={{
                        gridTemplateColumns: detailStageColumns,
                      }}
                    >
                      {stageGroups.map(({ stage, label, tasks }) => (
                        <div key={stage} className="min-w-0">
                          <p className="mb-2 text-xs font-bold text-on-surface-variant">
                            {label}
                          </p>
                          <div className="flex gap-2 overflow-x-auto pb-1">
                            {tasks.map((task) => {
                              const done = Boolean(completed[task.id]);

                              return (
                                <button
                                  key={task.id}
                                  type="button"
                                  aria-pressed={done}
                                  aria-label={`${task.title}，${brushStageLabels[task.stage]}，${done ? "已完成" : "未完成"}`}
                                  onClick={() => toggleTask(task.id)}
                                  className={`motion-ui motion-interactive shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold text-white hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 sm:text-sm ${
                                    stageStyles[task.stage].pill
                                  } ${done ? "order-last opacity-40 saturate-75 hover:opacity-65" : "opacity-100"}`}
                                >
                                  {task.title}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
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
  const match = label.match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
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

function sortTasksByCompletion(tasks: StudyTimelineTask[], completed: CompletionMap) {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((left, right) => {
      const leftDone = completed[left.task.id] ? 1 : 0;
      const rightDone = completed[right.task.id] ? 1 : 0;

      if (leftDone !== rightDone) {
        return leftDone - rightDone;
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

function readStoredCompletion(): CompletionMap {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => value === true),
    ) as CompletionMap;
  } catch {
    return {};
  }
}

function persistCompletion(completion: CompletionMap) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(completion));
  } catch {
    // Local storage can fail in private modes; the UI still works for this session.
  }
}
