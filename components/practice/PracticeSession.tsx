"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  ListChecks,
  Loader2,
  LockKeyhole,
  RotateCcw,
  SkipForward,
  X,
} from "lucide-react";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { useToast } from "@/components/ui/Toast";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import {
  flattenPracticeProblems,
  getMath3ScopeProblemSetStats,
  getPracticeProblemKey,
  type Math3PracticeScope,
  type PracticeProblemItem,
} from "@/lib/math3-practice";
import { notesApi, problemPracticeApi } from "@/lib/supabase";
import type { Note, PracticeResult, ProblemPracticeStatus } from "@/lib/types";
import { difficultyMap, problemTypeMap } from "@/lib/types";

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

type PracticeSessionProps = {
  scopeTitle: string;
  scopeDescription?: string;
  problemSetIds: string[];
  scope?: Math3PracticeScope;
  onClose?: () => void;
};

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

function toStatusMap(statuses: ProblemPracticeStatus[]): Record<string, ProblemPracticeStatus> {
  return Object.fromEntries(
    statuses.map((status) => [getPracticeProblemKey(status.noteId, status.problemId), status])
  );
}

export function PracticeSession({
  scopeTitle,
  scopeDescription,
  problemSetIds,
  scope,
  onClose,
}: PracticeSessionProps) {
  const toast = useToast();
  const { loading: authLoading, isAdmin } = useAdminAuth();
  const loadRequestRef = useRef(0);
  const [problemSets, setProblemSets] = useState<Note[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, ProblemPracticeStatus>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [practiceFilter, setPracticeFilter] = useState<PracticeFilter>("all");
  const [showAnswer, setShowAnswer] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [recordingResult, setRecordingResult] = useState<PracticeResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const normalizedProblemSetIds = useMemo(
    () => Array.from(new Set(problemSetIds.filter(Boolean))),
    [problemSetIds],
  );
  const problemSetIdsKey = normalizedProblemSetIds.join("|");
  const scopeKey = scope ? `${scope.type}:${scope.id}` : "all";

  useEffect(() => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setProblemSets([]);
    setStatusMap({});
    setCurrentIndex(0);
    setPracticeFilter("all");
    setShowAnswer(false);
    setLoadError(null);

    if (normalizedProblemSetIds.length === 0) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    async function loadPracticeSets() {
      try {
        const loadedSets = await Promise.all(
          normalizedProblemSetIds.map((id) => notesApi.getPracticeSet(id))
        );
        const validSets = loadedSets.filter((set): set is Note => Boolean(set));
        const statusGroups = await Promise.all(
          validSets.map((set) =>
            problemPracticeApi.getByNoteId(set.id).catch((error) => {
              console.error("Failed to load practice statuses:", error);
              toast.error("刷题状态加载失败，请确认 problem_practice_statuses 表可访问");
              return [];
            })
          )
        );

        if (requestId !== loadRequestRef.current) return;

        setProblemSets(validSets);
        setStatusMap(toStatusMap(statusGroups.flat()));
      } catch (error) {
        if (requestId !== loadRequestRef.current) return;
        const message = error instanceof Error ? error.message : "未知错误";
        setLoadError(message);
        toast.error(`题集加载失败：${message}`);
      } finally {
        if (requestId === loadRequestRef.current) setIsLoading(false);
      }
    }

    void loadPracticeSets();
  }, [normalizedProblemSetIds, problemSetIdsKey, scopeKey, toast]);

  const problemSetStats = useMemo(() => {
    if (scope) return getMath3ScopeProblemSetStats(problemSets, scope);

    return problemSets.map((set) => ({
      noteId: set.id,
      title: set.title,
      totalProblems: set.problems?.length ?? 0,
      matchedProblems: set.problems?.length ?? 0,
      matchedPointIds: [],
    }));
  }, [problemSets, scope]);
  const problemSetStatsById = useMemo(
    () => new Map(problemSetStats.map((item) => [item.noteId, item])),
    [problemSetStats],
  );
  const problems = useMemo(() => flattenPracticeProblems(problemSets, scope), [problemSets, scope]);
  const problemIndexByKey = useMemo(
    () => new Map(problems.map((problem, index) => [problem.practiceKey, index])),
    [problems],
  );
  const filteredProblems = useMemo(
    () => problems.filter((problem) => matchesPracticeFilter(statusMap[problem.practiceKey], practiceFilter)),
    [practiceFilter, problems, statusMap],
  );
  const activeIndex = filteredProblems.length === 0
    ? 0
    : Math.min(currentIndex, filteredProblems.length - 1);
  const currentProblem = filteredProblems[activeIndex];
  const currentStatus = currentProblem ? statusMap[currentProblem.practiceKey] : undefined;
  const [progressStart, progressEnd] = getProgressWindow(activeIndex, filteredProblems.length);
  const visibleProgressProblems = filteredProblems.slice(progressStart, progressEnd);
  const canRecord = isAdmin && !authLoading;

  const stats = useMemo(() => {
    let practiced = 0;
    let wrong = 0;
    let mastered = 0;
    let review = 0;

    for (const problem of problems) {
      const status = statusMap[problem.practiceKey];
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
  const practicedPercent = stats.total > 0 ? Math.round((stats.practiced / stats.total) * 100) : 0;

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
    if (!currentProblem || recordingResult || !canRecord) return;

    setRecordingResult(result);
    try {
      const saved = await problemPracticeApi.recordResult(
        currentProblem.sourceNoteId,
        currentProblem.id,
        result,
        currentStatus,
      );

      setStatusMap((current) => ({
        ...current,
        [getPracticeProblemKey(saved.noteId, saved.problemId)]: saved,
      }));
      toast.success(`已记录为${getRoundLabel(saved.round)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`刷题状态保存失败：${message}`);
    } finally {
      setRecordingResult(null);
    }
  };

  const handleResetCurrent = async () => {
    if (!currentProblem || recordingResult || !canRecord) return;

    setRecordingResult("skipped");
    try {
      await problemPracticeApi.reset(currentProblem.sourceNoteId, currentProblem.id);
      setStatusMap((current) => {
        const next = { ...current };
        delete next[currentProblem.practiceKey];
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
    <section className="relative overflow-hidden rounded-lg border border-primary/20 bg-surface-container-lowest shadow-ambient">
      <div className="border-b border-outline-variant/15 bg-surface-container-low px-4 py-4 md:px-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <BookOpen className="h-3.5 w-3.5" />
              刷题器
            </div>
            <h2 className="font-headline text-xl font-bold text-on-surface md:text-2xl">{scopeTitle}</h2>
            {scopeDescription && (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-on-surface-variant">{scopeDescription}</p>
            )}
          </div>

          <div className="flex flex-col gap-3 xl:min-w-[460px]">
            {stats.total > 0 && (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <SessionStat label="总题数" value={stats.total} />
                  <SessionStat label="已刷" value={stats.practiced} tone="text-primary" />
                  <SessionStat label="待回看" value={stats.review} tone="text-red-600" />
                  <SessionStat label="已掌握" value={stats.mastered} tone="text-green-600" />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-on-surface-variant">
                    <span>刷题进度</span>
                    <span>{practicedPercent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${practicedPercent}%` }}
                    />
                  </div>
                </div>
              </>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
                aria-label="关闭刷题"
                title="关闭刷题"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-5 p-4 lg:grid-cols-[300px_1fr] lg:p-5">
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-lg bg-surface-container-low p-4">
            <h3 className="mb-3 text-sm font-semibold text-on-surface">题集来源</h3>
            {normalizedProblemSetIds.length === 0 ? (
              <p className="text-sm leading-6 text-on-surface-variant">
                这个目录范围还没有匹配到题集。请到数学题集编辑页，给小题分配数三知识点。
              </p>
            ) : isLoading ? (
              <div className="flex items-center gap-2 py-3 text-sm text-on-surface-variant">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                加载题集...
              </div>
            ) : (
              <div className="space-y-2">
                {problemSets.map((set) => {
                  const sourceStat = problemSetStatsById.get(set.id);
                  const totalProblems = sourceStat?.totalProblems ?? set.problems?.length ?? 0;
                  const matchedProblems = scope ? sourceStat?.matchedProblems ?? 0 : totalProblems;

                  return (
                    <div key={set.id} className="rounded-md bg-surface-container-lowest px-3 py-2">
                      <div className="line-clamp-2 text-sm font-medium text-on-surface">{set.title}</div>
                      <div className="mt-1 text-xs text-on-surface-variant">
                        {scope
                          ? `本范围 ${matchedProblems} 题 / 原题集 ${totalProblems} 题`
                          : `${totalProblems} 题`}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {problems.length > 0 && (
            <div className="rounded-lg bg-surface-container-low p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-on-surface">
                <ListChecks className="h-4 w-4 text-primary" />
                练习队列
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {PRACTICE_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
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
            <div className="rounded-lg bg-surface-container-low p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-on-surface">题目进度</h3>
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
                    <ProgressButton
                      title="上一段"
                      onClick={() => moveToProblem(Math.max(0, progressStart - PROGRESS_WINDOW_SIZE))}
                    >
                      <ChevronLeft className="mx-auto h-4 w-4" />
                    </ProgressButton>
                  )}
                  {visibleProgressProblems.map((problem, offset) => {
                    const index = progressStart + offset;
                    const originalIndex = problemIndexByKey.get(problem.practiceKey) ?? index;
                    const status = statusMap[problem.practiceKey];
                    return (
                      <button
                        key={problem.practiceKey}
                        type="button"
                        onClick={() => moveToProblem(index)}
                        className={`h-9 rounded-lg text-xs font-semibold transition-colors ${
                          index === activeIndex
                            ? "bg-primary text-on-primary"
                            : getStatusTone(status)
                        }`}
                        title={`队列第 ${originalIndex + 1} 题 · ${getRoundLabel(status?.round ?? 0)}`}
                      >
                        {originalIndex + 1}
                      </button>
                    );
                  })}
                  {progressEnd < filteredProblems.length && (
                    <ProgressButton title="下一段" onClick={() => moveToProblem(progressEnd)}>
                      <ChevronRight className="mx-auto h-4 w-4" />
                    </ProgressButton>
                  )}
                </div>
              )}
            </div>
          )}

          {!authLoading && !canRecord && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
              <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>登录管理员后可以记录答对、答错和重置状态。</span>
            </div>
          )}
        </aside>

        <div className="min-h-[520px] rounded-lg bg-surface-container-low p-3 sm:p-5">
          {isLoading ? (
            <EmptyPracticeState icon={<Loader2 className="h-6 w-6 animate-spin text-primary" />} text="加载题目..." />
          ) : loadError ? (
            <EmptyPracticeState text={loadError} tone="text-red-600" />
          ) : normalizedProblemSetIds.length === 0 ? (
            <EmptyPracticeState text="这个目录范围还没有匹配到题集。请到数学题集编辑页给小题分配数三知识点。" />
          ) : problems.length === 0 ? (
            <EmptyPracticeState text="相关题集里暂时没有符合当前知识点范围的小题。" />
          ) : !currentProblem ? (
            <EmptyPracticeState text="当前队列没有符合条件的题目。" />
          ) : (
            <PracticeProblemView
              problem={currentProblem}
              index={activeIndex}
              total={filteredProblems.length}
              originalIndex={problemIndexByKey.get(currentProblem.practiceKey) ?? activeIndex}
              allTotal={problems.length}
              status={currentStatus}
              showAnswer={showAnswer}
              recordingResult={recordingResult}
              canRecord={canRecord}
              onToggleAnswer={() => setShowAnswer((value) => !value)}
              onPrevious={() => moveToProblem(activeIndex - 1)}
              onNext={() => moveToProblem(activeIndex + 1)}
              onRecordResult={handleRecordResult}
              onReset={handleResetCurrent}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function SessionStat({ label, value, tone = "text-on-surface" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg bg-surface-container-lowest px-3 py-2 text-center">
      <div className={`text-lg font-bold ${tone}`}>{value}</div>
      <div className="text-xs text-on-surface-variant">{label}</div>
    </div>
  );
}

function ProgressButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-9 rounded-lg bg-surface-container-high text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-highest"
      title={title}
    >
      {children}
    </button>
  );
}

function EmptyPracticeState({
  icon,
  text,
  tone = "text-on-surface-variant",
}: {
  icon?: ReactNode;
  text: string;
  tone?: string;
}) {
  return (
    <div className={`flex min-h-[420px] flex-col items-center justify-center gap-3 text-center ${tone}`}>
      {icon ?? <BookOpen className="h-10 w-10 opacity-50" />}
      <p className="text-sm">{text}</p>
    </div>
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
  canRecord,
  onToggleAnswer,
  onPrevious,
  onNext,
  onRecordResult,
  onReset,
}: {
  problem: PracticeProblemItem;
  index: number;
  total: number;
  originalIndex: number;
  allTotal: number;
  status?: ProblemPracticeStatus;
  showAnswer: boolean;
  recordingResult: PracticeResult | null;
  canRecord: boolean;
  onToggleAnswer: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onRecordResult: (result: PracticeResult) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex min-h-[480px] flex-col">
      <div className="mb-4 rounded-lg border border-outline-variant/15 bg-surface-container-lowest p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="line-clamp-2 text-xs text-on-surface-variant">
              来源：{problem.sourceNoteTitle} · 原题集第 {problem.sourceProblemIndex + 1} 题
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
                {total === allTotal
                  ? `第 ${originalIndex + 1} / ${allTotal} 题`
                  : `队列 ${index + 1} / ${total} · 总第 ${originalIndex + 1} 题`}
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
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <button
              type="button"
              onClick={onPrevious}
              disabled={index === 0 || recordingResult !== null}
              className="inline-flex h-10 items-center justify-center gap-1 rounded-lg bg-surface-container-high px-3 text-sm text-on-surface-variant hover:bg-surface-container-highest disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              上一题
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={index >= total - 1 || recordingResult !== null}
              className="inline-flex h-10 items-center justify-center gap-1 rounded-lg bg-surface-container-high px-3 text-sm text-on-surface-variant hover:bg-surface-container-highest disabled:opacity-40"
            >
              下一题
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-container-high">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: total > 0 ? `${Math.round(((index + 1) / total) * 100)}%` : "0%" }}
          />
        </div>
      </div>

      <div className="flex-1 space-y-4">
        <div className="rounded-lg border border-outline-variant/15 bg-surface-container-lowest p-4 sm:p-5">
          <h3 className="mb-3 text-sm font-semibold text-on-surface-variant">题目</h3>
          <div className="text-base leading-7">
            <MarkdownContent content={problem.question} className="text-on-surface" />
          </div>
        </div>

        {problem.type === "choice" && problem.options && problem.options.length > 0 && (
          <div className="grid gap-2">
            {problem.options.map((option) => (
              <div key={`${option.label}-${option.content}`} className="rounded-lg bg-surface-container-lowest px-4 py-3 text-sm text-on-surface">
                <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {option.label}
                </span>
                <MarkdownContent content={option.content} className="text-on-surface" />
              </div>
            ))}
          </div>
        )}

        {showAnswer && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 sm:p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-green-700">
              <Check className="h-4 w-4" />
              答案
            </h3>
            <MarkdownContent content={problem.answer || "暂无答案"} className="text-green-950" />
          </div>
        )}
      </div>

      <div className="mt-5 rounded-lg border border-outline-variant/15 bg-surface-container-lowest p-3">
        <div className="grid gap-3 xl:grid-cols-[auto_1fr] xl:items-center xl:justify-between">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <button
            type="button"
            onClick={onToggleAnswer}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-surface-container-high px-4 text-sm font-medium text-on-surface-variant hover:bg-surface-container-highest"
          >
            {showAnswer ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showAnswer ? "收起答案" : "查看答案"}
          </button>
          <button
            type="button"
            onClick={onReset}
            disabled={recordingResult !== null || !status || !canRecord}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-surface-container-high px-4 text-sm font-medium text-on-surface-variant hover:bg-surface-container-highest disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" />
            重置状态
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <ResultButton
            result="wrong"
            active={recordingResult === "wrong"}
            disabled={recordingResult !== null || !canRecord}
            onClick={onRecordResult}
            className="bg-red-50 text-red-700 hover:bg-red-100"
            icon={<X className="h-4 w-4" />}
          >
            答错
          </ResultButton>
          <ResultButton
            result="skipped"
            active={recordingResult === "skipped"}
            disabled={recordingResult !== null || !canRecord}
            onClick={onRecordResult}
            className="bg-amber-50 text-amber-700 hover:bg-amber-100"
            icon={<SkipForward className="h-4 w-4" />}
          >
            跳过
          </ResultButton>
          <ResultButton
            result="correct"
            active={recordingResult === "correct"}
            disabled={recordingResult !== null || !canRecord}
            onClick={onRecordResult}
            className="bg-green-50 text-green-700 hover:bg-green-100"
            icon={<Check className="h-4 w-4" />}
          >
            答对
          </ResultButton>
          </div>
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
      type="button"
      onClick={() => onClick(result)}
      disabled={disabled}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors disabled:opacity-50 sm:px-4 ${className}`}
    >
      {active ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
