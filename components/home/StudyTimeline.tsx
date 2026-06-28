"use client";

import { useMemo, useState } from "react";
import {
  brushStageLabels,
  studyTimelines,
  type BrushStage,
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
};

type CompletionMap = Record<string, true>;

export default function StudyTimeline() {
  const subjects = studyTimelines;
  const [activeSubjectId, setActiveSubjectId] = useState(subjects[0]?.id ?? "math");
  const activeSubject = subjects.find((subject) => subject.id === activeSubjectId) ?? subjects[0];
  const [activeMonthId, setActiveMonthId] = useState(activeSubject?.months[0]?.id ?? "");
  const activeMonth =
    activeSubject?.months.find((month) => month.id === activeMonthId) ?? activeSubject?.months[0];
  const [completed, setCompleted] = useState<CompletionMap>(() => readStoredCompletion());

  const subjectTasks = useMemo(
    () => activeSubject?.months.flatMap((month) => month.tasks) ?? [],
    [activeSubject],
  );

  const completedCount = subjectTasks.filter((task) => completed[task.id]).length;
  const completionRate = subjectTasks.length > 0 ? Math.round((completedCount / subjectTasks.length) * 100) : 0;

  const visibleTasks = useMemo(() => {
    return sortTasksByCompletion(activeMonth?.tasks ?? [], completed);
  }, [activeMonth, completed]);

  const switchSubject = (subjectId: typeof activeSubjectId) => {
    const nextSubject = subjects.find((subject) => subject.id === subjectId);

    if (!nextSubject) {
      return;
    }

    setActiveSubjectId(subjectId);
    setActiveMonthId(nextSubject.months[0]?.id ?? "");
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

  if (!activeSubject || !activeMonth) {
    return null;
  }

  return (
    <div className="surface-panel overflow-hidden p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="tag-chip tag-chip-primary px-3 py-1 text-xs font-bold">
            导学时间轴
          </span>
          <h2 className="mt-3 font-headline text-2xl font-bold leading-tight text-on-surface sm:text-3xl">
            {activeSubject.label}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {Object.entries(brushStageLabels).map(([stage, label]) => (
            <span key={stage} className="inline-flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
              <span className={`h-2.5 w-2.5 rounded-full ${stageStyles[stage as BrushStage].dot}`} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {subjects.length > 1 ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {subjects.map((subject) => (
            <button
              key={subject.id}
              type="button"
              onClick={() => switchSubject(subject.id)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                subject.id === activeSubject.id
                  ? "bg-primary text-on-primary shadow-ambient"
                  : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high hover:text-primary"
              }`}
            >
              {subject.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-6">
        <div className="flex items-center justify-between gap-4 text-xs font-semibold text-on-surface-variant">
          <span>{completedCount}/{subjectTasks.length}</span>
          <span>{completionRate}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-container-high">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${completionRate}%` }}
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {activeSubject.months.map((month) => {
          const monthTotal = month.tasks.length;
          const monthDone = month.tasks.filter((task) => completed[task.id]).length;
          const isActive = month.id === activeMonth.id;

          return (
            <button
              key={month.id}
              type="button"
              onClick={() => setActiveMonthId(month.id)}
              onFocus={() => setActiveMonthId(month.id)}
              onMouseEnter={() => setActiveMonthId(month.id)}
              className={`group rounded-xl border px-3 py-3 text-left transition-all duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                isActive
                  ? "border-primary/35 bg-primary text-on-primary shadow-ambient"
                  : "border-outline-variant/28 bg-surface-container-lowest text-on-surface hover:-translate-y-0.5 hover:border-primary/25 hover:text-primary hover:shadow-ambient"
              }`}
            >
              <span className="block font-headline text-lg font-bold leading-none">{month.label}</span>
              <span className={`mt-2 block text-xs font-semibold ${isActive ? "text-on-primary/75" : "text-on-surface-variant"}`}>
                {monthDone}/{monthTotal}
              </span>
            </button>
          );
        })}
      </div>

      <section className="mt-6 rounded-2xl border border-outline-variant/25 bg-surface-container-low p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <h3 className="font-headline text-xl font-bold text-on-surface">
            {activeMonth.label}
          </h3>
          <span className="text-xs font-semibold text-on-surface-variant">
            {activeMonth.tasks.filter((task) => completed[task.id]).length}/{activeMonth.tasks.length}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {visibleTasks.map((task) => {
            const done = Boolean(completed[task.id]);

            return (
              <button
                key={task.id}
                type="button"
                aria-pressed={done}
                aria-label={`${task.title}，${brushStageLabels[task.stage]}，${done ? "已完成" : "未完成"}`}
                onClick={() => toggleTask(task.id)}
                className={`rounded-full px-4 py-2 text-sm font-bold text-white transition-all duration-300 ease-out hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                  stageStyles[task.stage].pill
                } ${done ? "order-last opacity-50 saturate-75 hover:opacity-75" : "opacity-100"}`}
              >
                {task.title}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
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
