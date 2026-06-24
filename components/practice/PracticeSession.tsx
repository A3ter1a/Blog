"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Info,
  Layers,
  ListChecks,
  Loader2,
  LockKeyhole,
  RotateCcw,
  SlidersHorizontal,
  SkipForward,
  X,
} from "lucide-react";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { AnswerReveal } from "@/components/problems/AnswerReveal";
import { useToast } from "@/components/ui/Toast";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import {
  flattenPracticeProblems,
  getMath3ScopeProblemSetStats,
  getPracticeProblemKey,
  type Math3PracticeScope,
  type PracticeProblemItem,
} from "@/lib/math3-practice";
import {
  getResultLabel,
  getRoundLabel,
  getStatusTone,
  isPracticed,
  isReviewStatus,
  matchesPracticeFilter,
  PRACTICE_FILTERS,
  toPracticeStatusMap,
  type PracticeFilter,
} from "@/lib/problem-practice";
import { problemPracticeApi } from "@/lib/problem-practice-api";
import { notesApi } from "@/lib/supabase";
import type { Note, PracticeResult, ProblemPracticeStatus } from "@/lib/types";
import { difficultyMap, problemTypeMap } from "@/lib/types";
import { scheduleDeferredClientWork } from "@/lib/deferred-client-work";

const PROGRESS_WINDOW_SIZE = 45;

type PracticeSessionProps = {
  scopeTitle: string;
  scopeDescription?: string;
  problemSetIds: string[];
  scope?: Math3PracticeScope;
  onClose?: () => void;
};

function getProgressWindow(currentIndex: number, total: number): [number, number] {
  if (total <= PROGRESS_WINDOW_SIZE) return [0, total];

  const half = Math.floor(PROGRESS_WINDOW_SIZE / 2);
  const start = Math.min(
    Math.max(currentIndex - half, 0),
    Math.max(total - PROGRESS_WINDOW_SIZE, 0),
  );

  return [start, start + PROGRESS_WINDOW_SIZE];
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
  const [showPracticeTools, setShowPracticeTools] = useState(false);
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
    let cancelled = false;

    async function loadPracticeSets() {
      try {
        const validSets = await notesApi.getPracticeSets(normalizedProblemSetIds);
        const statuses = await problemPracticeApi.getByNoteIds(validSets.map((set) => set.id)).catch(() => {
          toast.error("刷题状态加载失败，将以未刷状态继续");
          return [];
        });

        if (cancelled || requestId !== loadRequestRef.current) return;

        setProblemSets(validSets);
        setStatusMap(toPracticeStatusMap(statuses));
      } catch (error) {
        if (cancelled || requestId !== loadRequestRef.current) return;
        const message = error instanceof Error ? error.message : "未知错误";
        setLoadError(message);
        toast.error(`题集加载失败：${message}`);
      } finally {
        if (!cancelled && requestId === loadRequestRef.current) setIsLoading(false);
      }
    }

    const cancelDeferredLoad = scheduleDeferredClientWork(() => {
      setProblemSets([]);
      setStatusMap({});
      setCurrentIndex(0);
      setPracticeFilter("all");
      setShowAnswer(false);
      setShowPracticeTools(false);
      setLoadError(null);

      if (normalizedProblemSetIds.length === 0) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      void loadPracticeSets();
    });

    return () => {
      cancelled = true;
      cancelDeferredLoad();
    };
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

      const currentStillInQueue = matchesPracticeFilter(saved, practiceFilter);
      const nextIndex = currentStillInQueue
        ? Math.min(activeIndex + 1, Math.max(filteredProblems.length - 1, 0))
        : Math.min(activeIndex, Math.max(filteredProblems.length - 2, 0));
      const hasNextProblem = currentStillInQueue
        ? activeIndex < filteredProblems.length - 1
        : filteredProblems.length > 1;

      setCurrentIndex(nextIndex);
      setShowAnswer(false);
      toast.success(hasNextProblem ? `已记录为${getRoundLabel(saved.round)}，进入下一题` : `已记录为${getRoundLabel(saved.round)}`);
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

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            {stats.total > 0 && (
              <span className="tag-chip px-2.5 py-1 text-xs">
                已刷 {stats.practiced}/{stats.total} · {practicedPercent}%
              </span>
            )}
            {problems.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPracticeTools((value) => !value)}
                className={`control-button h-9 px-3 text-xs ${showPracticeTools ? "control-button-selected" : ""}`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                练习设置
                {showPracticeTools ? <ChevronLeft className="h-3.5 w-3.5 rotate-90" /> : <ChevronRight className="h-3.5 w-3.5 rotate-90" />}
              </button>
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

      <div className={`grid gap-5 p-4 lg:p-5 ${showPracticeTools ? "lg:grid-cols-[300px_1fr]" : ""}`}>
        {showPracticeTools && (
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {stats.total > 0 && (
            <div className="rounded-lg bg-surface-container-low p-4">
              <div className="grid grid-cols-2 gap-2">
                <SessionStat label="总题数" value={stats.total} />
                <SessionStat label="已刷" value={stats.practiced} tone="text-primary" />
                <SessionStat label="待回看" value={stats.review} tone="text-red-600" />
                <SessionStat label="已掌握" value={stats.mastered} tone="text-green-600" />
              </div>
              <div className="mt-3">
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
            </div>
          )}

          <div className="rounded-lg bg-surface-container-low p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                <Layers className="h-4 w-4 text-primary" />
                本次范围
              </h3>
              {problemSets.length > 0 && (
                <span className="rounded-full bg-surface-container-lowest px-2.5 py-1 text-xs font-medium text-on-surface-variant">
                  {problemSets.length} 题集
                </span>
              )}
            </div>
            {normalizedProblemSetIds.length === 0 ? (
              <p className="text-sm leading-6 text-on-surface-variant">
                这个目录范围还没有匹配到题集。请到数学题集编辑页，先给小题分配数三章节。
              </p>
            ) : isLoading ? (
              <div className="flex items-center gap-2 py-3 text-sm text-on-surface-variant">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                加载题集...
              </div>
            ) : (
              <div>
                <p className="text-sm leading-6 text-on-surface-variant">
                  当前队列共 {stats.total} 题。先做题，查看答案后记录结果，记录后会自动进入下一题。
                </p>
                <details className="mt-3 group">
                  <summary className="cursor-pointer list-none rounded-lg bg-surface-container-lowest px-3 py-2 text-xs font-medium text-on-surface-variant transition-colors hover:text-primary">
                    查看来源题集
                  </summary>
                  <div className="mt-2 space-y-2">
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
                </details>
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
        )}

        <div className="min-h-[520px] rounded-lg bg-surface-container-low p-3 sm:p-5">
          {isLoading ? (
            <EmptyPracticeState icon={<Loader2 className="h-6 w-6 animate-spin text-primary" />} text="加载题目..." />
          ) : loadError ? (
            <EmptyPracticeState text={loadError} tone="text-red-600" />
          ) : normalizedProblemSetIds.length === 0 ? (
            <EmptyPracticeState text="这个目录范围还没有匹配到题集。请到数学题集编辑页先给小题分配数三章节。" />
          ) : problems.length === 0 ? (
            <EmptyPracticeState text="相关题集里暂时没有符合当前章节范围的小题。" />
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
      <div className="mb-4 rounded-lg border border-outline-variant/15 bg-surface-container-lowest p-3 sm:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary">
              {total === allTotal
                ? `第 ${originalIndex + 1} / ${allTotal} 题`
                : `队列 ${index + 1} / ${total}`}
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
        <details className="mt-3 rounded-lg bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium hover:text-primary">
            <Info className="h-3.5 w-3.5" />
            题目信息
          </summary>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            <span className="line-clamp-2">来源：{problem.sourceNoteTitle}</span>
            <span>原题集第 {problem.sourceProblemIndex + 1} 题</span>
            {total !== allTotal && <span>总题序：{originalIndex + 1} / {allTotal}</span>}
            <span>最近状态：{getResultLabel(status?.lastResult)}</span>
          </div>
        </details>
      </div>

      <div className="flex-1 space-y-4">
        <div className="rounded-lg border border-outline-variant/15 bg-surface-container-lowest p-5 sm:p-6">
          <div className="text-[15px] leading-8 sm:text-base">
            <MarkdownContent content={problem.question} className="text-on-surface" />
          </div>
        </div>

        {problem.type === "choice" && problem.options && problem.options.length > 0 && (
          <div className="grid gap-2">
            {problem.options.map((option) => (
              <div key={`${option.label}-${option.content}`} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3 rounded-lg bg-surface-container-lowest px-4 py-3 text-sm text-on-surface">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {option.label}
                </span>
                <MarkdownContent content={option.content} className="min-w-0 text-on-surface" />
              </div>
            ))}
          </div>
        )}

        <AnswerReveal open={showAnswer}>
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 sm:p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-green-700">
              <Check className="h-4 w-4" />
              答案
            </h3>
            <MarkdownContent content={problem.answer || "暂无答案"} className="text-green-950" />
          </div>
        </AnswerReveal>
      </div>

      <div className="mt-5 rounded-lg border border-outline-variant/15 bg-surface-container-lowest p-3">
        {!showAnswer ? (
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <button
              type="button"
              onClick={onToggleAnswer}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary/90"
            >
              <Eye className="h-4 w-4" />
              查看答案
            </button>
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
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
            <div className="flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
              <button
                type="button"
                onClick={onToggleAnswer}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-surface-container-high px-3 text-xs font-medium text-on-surface-variant hover:bg-surface-container-highest"
              >
                <EyeOff className="h-4 w-4" />
                收起答案
              </button>
              <span>记录结果后自动进入下一题。</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
              <button
                type="button"
                onClick={onReset}
                disabled={recordingResult !== null || !status || !canRecord}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-surface-container-high px-3 text-sm font-medium text-on-surface-variant hover:bg-surface-container-highest disabled:opacity-40 sm:px-4"
              >
                <RotateCcw className="h-4 w-4" />
                重置
              </button>
            </div>
          </div>
        )}
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
