"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Check, ChevronLeft, ChevronRight, Loader2, RotateCcw, Target, X } from "lucide-react";
import { AdminGate } from "@/components/auth/AdminGate";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { useToast } from "@/components/ui/Toast";
import { notesApi, problemPracticeApi } from "@/lib/supabase";
import type { Note, PracticeResult, Problem, ProblemPracticeStatus } from "@/lib/types";
import { difficultyMap, problemTypeMap } from "@/lib/types";

const PROBLEM_SET_LIMIT = 100;
const PROGRESS_WINDOW_SIZE = 45;

type PracticeFilter = "all" | "review" | "wrong" | "unpracticed" | "unmastered" | "mastered";

const PRACTICE_FILTERS: Array<{ value: PracticeFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "review", label: "待回看" },
  { value: "wrong", label: "答错" },
  { value: "unpracticed", label: "未刷" },
  { value: "unmastered", label: "未掌握" },
  { value: "mastered", label: "已掌握" },
];

function getRoundLabel(round: number): string {
  const labels = ["未刷", "一刷", "二刷", "三刷", "四刷", "五刷"];
  return labels[round] ?? `${round} 刷`;
}

function getResultLabel(result?: PracticeResult): string {
  if (result === "correct") return "最近答对";
  if (result === "wrong") return "最近答错";
  if (result === "skipped") return "已跳过";
  return "未作答";
}

function getStatusTone(status?: ProblemPracticeStatus): string {
  if (!status || status.round === 0) return "bg-surface-container-high text-on-surface-variant";
  if (status.lastResult === "wrong") return "bg-red-50 text-red-700";
  if (status.isMastered) return "bg-green-50 text-green-700";
  if (status.lastResult === "correct") return "bg-primary/10 text-primary";
  return "bg-amber-50 text-amber-700";
}

function toStatusMap(statuses: ProblemPracticeStatus[]): Record<string, ProblemPracticeStatus> {
  return Object.fromEntries(statuses.map((status) => [status.problemId, status]));
}

function isPracticed(status?: ProblemPracticeStatus): boolean {
  return (status?.round ?? 0) > 0;
}

function isReviewStatus(status?: ProblemPracticeStatus): boolean {
  return status?.lastResult === "wrong" || status?.lastResult === "skipped";
}

function matchesPracticeFilter(status: ProblemPracticeStatus | undefined, filter: PracticeFilter): boolean {
  if (filter === "all") return true;
  if (filter === "review") return isReviewStatus(status);
  if (filter === "wrong") return status?.lastResult === "wrong";
  if (filter === "unpracticed") return !isPracticed(status);
  if (filter === "unmastered") return !status?.isMastered;
  return Boolean(status?.isMastered);
}

function getProgressWindow(currentIndex: number, total: number): [number, number] {
  if (total <= PROGRESS_WINDOW_SIZE) return [0, total];

  const half = Math.floor(PROGRESS_WINDOW_SIZE / 2);
  const start = Math.min(
    Math.max(currentIndex - half, 0),
    Math.max(total - PROGRESS_WINDOW_SIZE, 0),
  );

  return [start, start + PROGRESS_WINDOW_SIZE];
}

export default function PracticePage() {
  const toast = useToast();
  const loadRequestRef = useRef(0);
  const [problemSets, setProblemSets] = useState<Note[]>([]);
  const [selectedSetId, setSelectedSetId] = useState("");
  const [selectedSet, setSelectedSet] = useState<Note | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, ProblemPracticeStatus>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [practiceFilter, setPracticeFilter] = useState<PracticeFilter>("all");
  const [showAnswer, setShowAnswer] = useState(false);
  const [isLoadingSets, setIsLoadingSets] = useState(true);
  const [isLoadingSet, setIsLoadingSet] = useState(false);
  const [recordingResult, setRecordingResult] = useState<PracticeResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const problems = useMemo(() => selectedSet?.problems ?? [], [selectedSet]);
  const problemIndexById = useMemo(() => (
    new Map(problems.map((problem, index) => [problem.id, index]))
  ), [problems]);
  const filteredProblems = useMemo(() => (
    problems.filter((problem) => matchesPracticeFilter(statusMap[problem.id], practiceFilter))
  ), [practiceFilter, problems, statusMap]);
  const activeIndex = filteredProblems.length === 0
    ? 0
    : Math.min(currentIndex, filteredProblems.length - 1);
  const currentProblem = filteredProblems[activeIndex];
  const currentStatus = currentProblem ? statusMap[currentProblem.id] : undefined;
  const [progressStart, progressEnd] = getProgressWindow(activeIndex, filteredProblems.length);
  const visibleProgressProblems = filteredProblems.slice(progressStart, progressEnd);

  const stats = useMemo(() => {
    let practiced = 0;
    let wrong = 0;
    let mastered = 0;
    let review = 0;

    for (const problem of problems) {
      const status = statusMap[problem.id];
      if (isPracticed(status)) practiced += 1;
      if (status?.lastResult === "wrong") wrong += 1;
      if (status?.isMastered) mastered += 1;
      if (isReviewStatus(status)) review += 1;
    }

    const unpracticed = problems.length - practiced;
    const unmastered = problems.length - mastered;

    return { total: problems.length, practiced, wrong, mastered, review, unpracticed, unmastered };
  }, [problems, statusMap]);

  const filterCounts = useMemo<Record<PracticeFilter, number>>(() => ({
    all: stats.total,
    review: stats.review,
    wrong: stats.wrong,
    unpracticed: stats.unpracticed,
    unmastered: stats.unmastered,
    mastered: stats.mastered,
  }), [stats]);

  const loadProblemSet = useCallback(async (noteId: string) => {
    if (!noteId) return;

    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setIsLoadingSet(true);
    setLoadError(null);
    try {
      const [note, statuses] = await Promise.all([
        notesApi.getPracticeSet(noteId),
        problemPracticeApi.getByNoteId(noteId).catch((error) => {
          console.error("Failed to load practice statuses:", error);
          toast.error("刷题状态加载失败，请确认 Supabase 中已创建 problem_practice_statuses 表");
          return [];
        }),
      ]);

      if (!note || note.type !== "problem") {
        throw new Error("没有找到这个题集");
      }

      if (requestId !== loadRequestRef.current) return;

      setSelectedSet(note);
      setStatusMap(toStatusMap(statuses));
      setCurrentIndex(0);
      setPracticeFilter("all");
      setShowAnswer(false);
    } catch (error) {
      if (requestId !== loadRequestRef.current) return;
      const message = error instanceof Error ? error.message : "未知错误";
      setLoadError(message);
      setSelectedSet(null);
      setStatusMap({});
      toast.error(`题集加载失败：${message}`);
    } finally {
      if (requestId === loadRequestRef.current) setIsLoadingSet(false);
    }
  }, [toast]);

  useEffect(() => {
    let cancelled = false;

    async function loadSets() {
      setIsLoadingSets(true);
      setLoadError(null);
      try {
        const sets = await notesApi.getSummaries({
          type: "problem",
          sortOrder: "desc",
          limit: PROBLEM_SET_LIMIT,
          offset: 0,
        });

        if (cancelled) return;

        setProblemSets(sets);
        setIsLoadingSets(false);
        const firstSet = sets[0];
        if (firstSet) {
          setSelectedSetId(firstSet.id);
          void loadProblemSet(firstSet.id);
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "未知错误";
        setLoadError(message);
        toast.error(`题集列表加载失败：${message}`);
      } finally {
        if (!cancelled) setIsLoadingSets(false);
      }
    }

    void loadSets();

    return () => {
      cancelled = true;
      loadRequestRef.current += 1;
    };
  }, [loadProblemSet, toast]);

  const handleSelectSet = (noteId: string) => {
    if (noteId === selectedSetId || isLoadingSet) return;
    setSelectedSetId(noteId);
    void loadProblemSet(noteId);
  };

  const moveToProblem = (index: number) => {
    if (index < 0 || index >= filteredProblems.length || recordingResult) return;
    setCurrentIndex(index);
    setShowAnswer(false);
  };

  const handleFilterChange = (filter: PracticeFilter) => {
    setPracticeFilter(filter);
    setCurrentIndex(0);
    setShowAnswer(false);
  };

  const handleRecordResult = async (result: PracticeResult) => {
    if (!selectedSet || !currentProblem || recordingResult) return;

    setRecordingResult(result);
    try {
      const saved = await problemPracticeApi.recordResult(
        selectedSet.id,
        currentProblem.id,
        result,
        currentStatus,
      );

      setStatusMap((current) => ({ ...current, [saved.problemId]: saved }));
      toast.success(`已记录为${getRoundLabel(saved.round)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`刷题状态保存失败：${message}`);
    } finally {
      setRecordingResult(null);
    }
  };

  const handleResetCurrent = async () => {
    if (!selectedSet || !currentProblem || recordingResult) return;

    setRecordingResult("skipped");
    try {
      await problemPracticeApi.reset(selectedSet.id, currentProblem.id);
      setStatusMap((current) => {
        const next = { ...current };
        delete next[currentProblem.id];
        return next;
      });
      toast.success("已重置这道题的刷题状态");
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`重置失败：${message}`);
    } finally {
      setRecordingResult(null);
    }
  };

  return (
    <AdminGate>
      <main className="min-h-screen bg-surface pt-24 pb-20">
        <div className="border-b border-outline-variant/20 bg-surface-container-low">
          <div className="mx-auto max-w-6xl px-6 py-6">
            <Link
              href="/tools"
              className="mb-4 inline-flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              返回工具
            </Link>
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="flex items-center gap-2 text-3xl font-bold text-on-surface font-headline">
                  <Target className="h-7 w-7 text-primary" />
                  刷题
                </h1>
                <p className="mt-2 text-sm text-on-surface-variant">
                  从题集里刷题，并记录每道题的一刷、二刷和最近答题状态。
                </p>
              </div>
              {selectedSet && (
                <div className="grid grid-cols-4 gap-3 text-center">
                  <div>
                    <div className="text-xl font-bold text-on-surface">{stats.total}</div>
                    <div className="text-xs text-on-surface-variant">总题数</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-primary">{stats.practiced}</div>
                    <div className="text-xs text-on-surface-variant">已刷</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-red-600">{stats.review}</div>
                    <div className="text-xs text-on-surface-variant">待回看</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-green-600">{stats.mastered}</div>
                    <div className="text-xs text-on-surface-variant">已掌握</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[280px_1fr]">
          <aside className="space-y-4">
            <div className="rounded-xl bg-surface-container-lowest p-4 shadow-ambient">
              <h2 className="mb-3 text-sm font-semibold text-on-surface">题集范围</h2>
              {isLoadingSets ? (
                <div className="flex items-center gap-2 py-4 text-sm text-on-surface-variant">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  加载题集...
                </div>
              ) : problemSets.length === 0 ? (
                <p className="py-4 text-sm text-on-surface-variant">
                  还没有题集。先到创建页新建“题集”类型笔记。
                </p>
              ) : (
                <div className="space-y-2">
                  {problemSets.map((set) => (
                    <button
                      key={set.id}
                      onClick={() => handleSelectSet(set.id)}
                      disabled={isLoadingSet}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 ${
                        selectedSetId === set.id
                          ? "bg-primary text-on-primary"
                          : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
                      }`}
                    >
                      <div className="line-clamp-2 font-medium">{set.title}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {problems.length > 0 && (
              <div className="rounded-xl bg-surface-container-lowest p-4 shadow-ambient">
                <h2 className="mb-3 text-sm font-semibold text-on-surface">练习队列</h2>
                <div className="grid grid-cols-2 gap-2">
                  {PRACTICE_FILTERS.map((filter) => (
                    <button
                      key={filter.value}
                      onClick={() => handleFilterChange(filter.value)}
                      className={`rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        practiceFilter === filter.value
                          ? "bg-primary text-on-primary"
                          : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
                      }`}
                    >
                      <span className="block font-medium">{filter.label}</span>
                      <span className="text-xs opacity-80">{filterCounts[filter.value]} 题</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {problems.length > 0 && (
              <div className="rounded-xl bg-surface-container-lowest p-4 shadow-ambient">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-on-surface">题目进度</h2>
                  <span className="text-xs text-on-surface-variant">
                    {filteredProblems.length > 0
                      ? `${progressStart + 1}-${progressEnd} / ${filteredProblems.length}`
                      : "0 / 0"}
                  </span>
                </div>
                {filteredProblems.length === 0 ? (
                  <p className="py-4 text-sm text-on-surface-variant">当前队列没有符合条件的题目。</p>
                ) : (
                  <div className="grid grid-cols-5 gap-2">
                    {progressStart > 0 && (
                      <button
                        onClick={() => moveToProblem(Math.max(0, progressStart - PROGRESS_WINDOW_SIZE))}
                        className="h-9 rounded-lg bg-surface-container-high text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-highest"
                        title="上一段"
                      >
                        <ChevronLeft className="mx-auto h-4 w-4" />
                      </button>
                    )}
                    {visibleProgressProblems.map((problem, offset) => {
                      const index = progressStart + offset;
                      const originalIndex = problemIndexById.get(problem.id) ?? index;
                      const status = statusMap[problem.id];
                      return (
                        <button
                          key={problem.id}
                          onClick={() => moveToProblem(index)}
                          className={`h-9 rounded-lg text-xs font-semibold transition-colors ${
                            index === activeIndex
                              ? "bg-primary text-on-primary"
                              : getStatusTone(status)
                          }`}
                          title={`原第 ${originalIndex + 1} 题 · ${getRoundLabel(status?.round ?? 0)}`}
                        >
                          {originalIndex + 1}
                        </button>
                      );
                    })}
                    {progressEnd < filteredProblems.length && (
                      <button
                        onClick={() => moveToProblem(progressEnd)}
                        className="h-9 rounded-lg bg-surface-container-high text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-highest"
                        title="下一段"
                      >
                        <ChevronRight className="mx-auto h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </aside>

          <section className="min-h-[520px] rounded-xl bg-surface-container-lowest p-5 shadow-ambient">
            {isLoadingSet ? (
              <div className="flex min-h-[420px] items-center justify-center gap-3 text-on-surface-variant">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                加载题目...
              </div>
            ) : loadError ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
                <p className="text-sm text-red-600">{loadError}</p>
              </div>
            ) : !selectedSet ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center text-center text-on-surface-variant">
                <BookOpen className="mb-3 h-10 w-10 opacity-50" />
                <p>选择一个题集开始刷题。</p>
              </div>
            ) : problems.length === 0 ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center text-center text-on-surface-variant">
                <BookOpen className="mb-3 h-10 w-10 opacity-50" />
                <p>这个题集还没有题目。</p>
              </div>
            ) : !currentProblem ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center text-center text-on-surface-variant">
                <BookOpen className="mb-3 h-10 w-10 opacity-50" />
                <p>当前队列没有符合条件的题目。</p>
              </div>
            ) : (
              <PracticeProblemView
                problem={currentProblem}
                index={activeIndex}
                total={filteredProblems.length}
                originalIndex={problemIndexById.get(currentProblem.id) ?? activeIndex}
                allTotal={problems.length}
                status={currentStatus}
                showAnswer={showAnswer}
                recordingResult={recordingResult}
                onToggleAnswer={() => setShowAnswer((value) => !value)}
                onPrevious={() => moveToProblem(activeIndex - 1)}
                onNext={() => moveToProblem(activeIndex + 1)}
                onRecordResult={handleRecordResult}
                onReset={handleResetCurrent}
              />
            )}
          </section>
        </div>
      </main>
    </AdminGate>
  );
}

function PracticeProblemView({
  problem,
  index,
  total,
  originalIndex,
  allTotal,
  status,
  showAnswer,
  recordingResult,
  onToggleAnswer,
  onPrevious,
  onNext,
  onRecordResult,
  onReset,
}: {
  problem: Problem;
  index: number;
  total: number;
  originalIndex: number;
  allTotal: number;
  status?: ProblemPracticeStatus;
  showAnswer: boolean;
  recordingResult: PracticeResult | null;
  onToggleAnswer: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onRecordResult: (result: PracticeResult) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex min-h-[480px] flex-col">
      <div className="mb-5 flex flex-col gap-3 border-b border-outline-variant/10 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
              {total === allTotal
                ? `第 ${originalIndex + 1} / ${allTotal} 题`
                : `队列 ${index + 1} / ${total} · 原第 ${originalIndex + 1} 题`}
            </span>
            <span className="rounded-full bg-surface-container-high px-2.5 py-1 text-on-surface-variant">
              {problemTypeMap[problem.type]}
            </span>
            <span className="rounded-full bg-surface-container-high px-2.5 py-1 text-on-surface-variant">
              {difficultyMap[problem.difficulty]}
            </span>
            <span className={`rounded-full px-2.5 py-1 font-medium ${getStatusTone(status)}`}>
              {getRoundLabel(status?.round ?? 0)}
            </span>
            <span className="rounded-full bg-surface-container-high px-2.5 py-1 text-on-surface-variant">
              {getResultLabel(status?.lastResult)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onPrevious}
            disabled={index === 0 || recordingResult !== null}
            className="inline-flex items-center gap-1 rounded-lg bg-surface-container-high px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container-highest disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            上一题
          </button>
          <button
            onClick={onNext}
            disabled={index >= total - 1 || recordingResult !== null}
            className="inline-flex items-center gap-1 rounded-lg bg-surface-container-high px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container-highest disabled:opacity-40"
          >
            下一题
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-5">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-on-surface-variant">题目</h2>
          <div className="rounded-xl bg-surface-container-low p-5">
            <MarkdownContent content={problem.question} className="text-on-surface" />
          </div>
        </div>

        {problem.type === "choice" && problem.options && problem.options.length > 0 && (
          <div className="grid gap-2">
            {problem.options.map((option) => (
              <div key={`${option.label}-${option.content}`} className="rounded-lg bg-surface-container-low px-4 py-3 text-sm text-on-surface">
                <span className="mr-2 font-semibold text-primary">{option.label}.</span>
                <MarkdownContent content={option.content} className="inline text-on-surface" />
              </div>
            ))}
          </div>
        )}

        {showAnswer && (
          <div className="rounded-xl bg-green-50 p-5">
            <h3 className="mb-3 text-sm font-semibold text-green-700">答案</h3>
            <MarkdownContent content={problem.answer || "暂无答案"} className="text-green-950" />
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3 border-t border-outline-variant/10 pt-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onToggleAnswer}
            className="rounded-lg bg-surface-container-high px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container-highest"
          >
            {showAnswer ? "收起答案" : "查看答案"}
          </button>
          <button
            onClick={onReset}
            disabled={recordingResult !== null || !status}
            className="inline-flex items-center gap-2 rounded-lg bg-surface-container-high px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container-highest disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" />
            重置状态
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <ResultButton
            result="wrong"
            active={recordingResult === "wrong"}
            disabled={recordingResult !== null}
            onClick={onRecordResult}
            className="bg-red-50 text-red-700 hover:bg-red-100"
            icon={<X className="h-4 w-4" />}
          >
            答错
          </ResultButton>
          <ResultButton
            result="skipped"
            active={recordingResult === "skipped"}
            disabled={recordingResult !== null}
            onClick={onRecordResult}
            className="bg-amber-50 text-amber-700 hover:bg-amber-100"
          >
            跳过
          </ResultButton>
          <ResultButton
            result="correct"
            active={recordingResult === "correct"}
            disabled={recordingResult !== null}
            onClick={onRecordResult}
            className="bg-green-50 text-green-700 hover:bg-green-100"
            icon={<Check className="h-4 w-4" />}
          >
            答对
          </ResultButton>
        </div>
      </div>
    </div>
  );
}

function ResultButton({
  result,
  active,
  disabled,
  onClick,
  className,
  icon,
  children,
}: {
  result: PracticeResult;
  active: boolean;
  disabled: boolean;
  onClick: (result: PracticeResult) => void;
  className: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      onClick={() => onClick(result)}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${className}`}
    >
      {active ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
