"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Layers,
  ListChecks,
  Loader2,
  RotateCcw,
  Search,
  SkipForward,
  SlidersHorizontal,
  Target,
  X,
} from "lucide-react";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { useToast } from "@/components/ui/Toast";
import {
  flattenPracticeProblems,
  getMath3ChapterById,
  getMath3ProblemChapterIds,
  getPracticeProblemKey,
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
import { notesApi, problemPracticeApi } from "@/lib/supabase";
import type { Note, PracticeResult, ProblemPracticeStatus } from "@/lib/types";
import { difficultyMap, problemTypeMap } from "@/lib/types";

const UNASSIGNED_CHAPTER_ID = "__unassigned__";

type ReviewProblemItem = PracticeProblemItem & {
  status?: ProblemPracticeStatus;
  primaryChapterId: string;
  chapterTitle: string;
  areaTitle?: string;
};

type ChapterReviewStat = {
  id: string;
  title: string;
  total: number;
  practiced: number;
  review: number;
  wrong: number;
  mastered: number;
};

function getPrimaryChapter(problem: PracticeProblemItem): {
  id: string;
  title: string;
  areaTitle?: string;
} {
  const chapterId = getMath3ProblemChapterIds(problem)[0];
  const result = chapterId ? getMath3ChapterById(chapterId) : null;

  if (!result) {
    return {
      id: UNASSIGNED_CHAPTER_ID,
      title: "未归章节",
    };
  }

  return {
    id: result.chapter.id,
    title: result.chapter.title,
    areaTitle: result.area.shortTitle,
  };
}

function formatDate(date?: Date): string {
  if (!date) return "还没有记录";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function createReviewItem(problem: PracticeProblemItem, status?: ProblemPracticeStatus): ReviewProblemItem {
  const chapter = getPrimaryChapter(problem);
  return {
    ...problem,
    status,
    primaryChapterId: chapter.id,
    chapterTitle: chapter.title,
    areaTitle: chapter.areaTitle,
  };
}

function itemMatchesQuery(item: ReviewProblemItem, query: string): boolean {
  if (!query) return true;
  const searchable = [
    item.question,
    item.answer,
    item.sourceNoteTitle,
    item.chapterTitle,
    item.areaTitle,
  ].filter(Boolean).join(" ").toLowerCase();

  return searchable.includes(query);
}

function getChapterStats(items: ReviewProblemItem[]): ChapterReviewStat[] {
  const stats = new Map<string, ChapterReviewStat>();

  for (const item of items) {
    const current = stats.get(item.primaryChapterId) ?? {
      id: item.primaryChapterId,
      title: item.chapterTitle,
      total: 0,
      practiced: 0,
      review: 0,
      wrong: 0,
      mastered: 0,
    };

    current.total += 1;
    if (isPracticed(item.status)) current.practiced += 1;
    if (isReviewStatus(item.status)) current.review += 1;
    if (item.status?.lastResult === "wrong") current.wrong += 1;
    if (item.status?.isMastered) current.mastered += 1;
    stats.set(item.primaryChapterId, current);
  }

  return Array.from(stats.values()).sort((left, right) =>
    right.review - left.review
    || right.wrong - left.wrong
    || right.total - left.total
  );
}

export function ReviewCenter() {
  const toast = useToast();
  const [problemSets, setProblemSets] = useState<Note[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, ProblemPracticeStatus>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<PracticeFilter>("review");
  const [chapterFilter, setChapterFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [recordingResult, setRecordingResult] = useState<PracticeResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadReviewData() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const sets = await notesApi.getSummaries({
          type: "problem",
          subject: "math",
          sortOrder: "desc",
          limit: 200,
          offset: 0,
          includeCoverImage: false,
          includeProblems: true,
        });
        const statuses = await problemPracticeApi.getByNoteIds(sets.map((set) => set.id));

        if (cancelled) return;
        setProblemSets(sets);
        setStatusMap(toPracticeStatusMap(statuses));
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "未知错误";
        setLoadError(message);
        toast.error(`复盘数据加载失败：${message}`);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadReviewData();

    return () => {
      cancelled = true;
    };
  }, [toast]);

  const allProblems = useMemo(() => flattenPracticeProblems(problemSets), [problemSets]);
  const reviewItems = useMemo(
    () => allProblems.map((problem) => createReviewItem(problem, statusMap[problem.practiceKey])),
    [allProblems, statusMap],
  );

  const stats = useMemo(() => {
    let practiced = 0;
    let review = 0;
    let wrong = 0;
    let mastered = 0;

    for (const item of reviewItems) {
      if (isPracticed(item.status)) practiced += 1;
      if (isReviewStatus(item.status)) review += 1;
      if (item.status?.lastResult === "wrong") wrong += 1;
      if (item.status?.isMastered) mastered += 1;
    }

    return {
      total: reviewItems.length,
      practiced,
      review,
      wrong,
      mastered,
      unpracticed: reviewItems.length - practiced,
    };
  }, [reviewItems]);

  const filterCounts = useMemo<Record<PracticeFilter, number>>(() => ({
    all: stats.total,
    review: stats.review,
    wrong: stats.wrong,
    unpracticed: stats.unpracticed,
    unmastered: stats.total - stats.mastered,
    mastered: stats.mastered,
  }), [stats]);

  const normalizedQuery = query.trim().toLowerCase();
  const chapterStats = useMemo(() => getChapterStats(reviewItems), [reviewItems]);
  const chapterOptions = useMemo(
    () => [
      { id: "all", title: "全部章节", total: stats.total },
      ...chapterStats,
    ],
    [chapterStats, stats.total],
  );
  const hasFilters = normalizedQuery || activeFilter !== "review" || chapterFilter !== "all";
  const shouldShowFilters = showFilters || Boolean(hasFilters);

  const visibleProblems = useMemo(
    () => reviewItems.filter((item) =>
      matchesPracticeFilter(item.status, activeFilter)
      && (chapterFilter === "all" || item.primaryChapterId === chapterFilter)
      && itemMatchesQuery(item, normalizedQuery)
    ),
    [activeFilter, chapterFilter, normalizedQuery, reviewItems],
  );

  const activeIndex = visibleProblems.length === 0
    ? 0
    : Math.min(currentIndex, visibleProblems.length - 1);
  const currentProblem = visibleProblems[activeIndex];
  const masteredPercent = stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0;

  useEffect(() => {
    setCurrentIndex(0);
    setShowAnswer(false);
  }, [activeFilter, chapterFilter, normalizedQuery]);

  useEffect(() => {
    setCurrentIndex((index) => Math.min(index, Math.max(visibleProblems.length - 1, 0)));
  }, [visibleProblems.length]);

  const moveToProblem = (index: number) => {
    if (index < 0 || index >= visibleProblems.length || recordingResult) return;
    setCurrentIndex(index);
    setShowAnswer(false);
  };

  const handleRecordResult = async (result: PracticeResult) => {
    if (!currentProblem || recordingResult) return;

    setRecordingResult(result);
    try {
      const saved = await problemPracticeApi.recordResult(
        currentProblem.sourceNoteId,
        currentProblem.id,
        result,
        currentProblem.status,
      );

      setStatusMap((current) => ({
        ...current,
        [getPracticeProblemKey(saved.noteId, saved.problemId)]: saved,
      }));
      setShowAnswer(false);
      toast.success(`已记录为${getRoundLabel(saved.round)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`保存失败：${message}`);
    } finally {
      setRecordingResult(null);
    }
  };

  const handleResetCurrent = async () => {
    if (!currentProblem || recordingResult || !currentProblem.status) return;

    setRecordingResult("skipped");
    try {
      await problemPracticeApi.reset(currentProblem.sourceNoteId, currentProblem.id);
      setStatusMap((current) => {
        const next = { ...current };
        delete next[currentProblem.practiceKey];
        return next;
      });
      setShowAnswer(false);
      toast.success("已重置这道题的状态");
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`重置失败：${message}`);
    } finally {
      setRecordingResult(null);
    }
  };

  const resetFilters = () => {
    setActiveFilter("review");
    setChapterFilter("all");
    setQuery("");
  };

  return (
    <main className="min-h-screen bg-surface pt-24">
      <section className="border-b border-outline-variant/20 bg-surface-container-low/70">
        <div className="mx-auto max-w-6xl px-4 py-7">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
            <div>
              <div className="eyebrow-chip mb-3 px-3 py-1 text-xs">
                <Target className="h-4 w-4" />
                学习闭环
              </div>
              <h1 className="font-headline text-3xl font-bold text-on-surface md:text-4xl">
                错题复盘
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-on-surface-variant md:text-base">
                集中处理答错、跳过和未掌握的题目，按章节看薄弱点，做完后直接记录状态。
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-lg border border-outline-variant/15 bg-surface-container-lowest p-2 sm:grid-cols-4">
              <HeaderStat label="待回看" value={stats.review} tone="text-red-600" />
              <HeaderStat label="答错" value={stats.wrong} tone="text-red-600" />
              <HeaderStat label="已掌握" value={stats.mastered} tone="text-green-600" />
              <HeaderStat label="掌握率" value={`${masteredPercent}%`} tone="text-primary" />
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <section className="mb-5 rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-3 shadow-ambient">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant/50" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索题干、答案、来源或章节"
                className="h-11 w-full rounded-lg border border-outline-variant/30 bg-surface-container-low px-10 text-sm text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/45 focus:border-primary/50 focus:bg-surface-container-lowest"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
                  aria-label="清空搜索"
                  title="清空搜索"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowFilters((value) => !value)}
              className={`control-button h-11 px-4 text-sm ${shouldShowFilters ? "control-button-selected" : ""}`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              筛选
            </button>

            {hasFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="control-button h-11 px-4 text-sm"
              >
                <RotateCcw className="h-4 w-4" />
                恢复默认
              </button>
            )}
          </div>

          {shouldShowFilters && (
            <div className="mt-3 grid gap-3 border-t border-outline-variant/10 pt-3 lg:grid-cols-[1fr_260px] lg:items-end">
              <div>
                <div className="mb-2 text-xs font-medium text-on-surface-variant">题目状态</div>
                <div className="flex flex-wrap gap-2">
                  {PRACTICE_FILTERS.map((filter) => (
                    <button
                      key = {filter.value}
                      type="button"
                      onClick={() => setActiveFilter(filter.value)}
                      className={`h-9 rounded-lg border px-3 text-sm font-medium transition-colors ${
                        activeFilter === filter.value
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-outline-variant/30 text-on-surface-variant hover:border-primary/30 hover:text-primary"
                      }`}
                    >
                      {filter.label}
                      <span className="ml-1 text-xs opacity-70">{filterCounts[filter.value]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-on-surface-variant">章节</label>
                <select
                  value={chapterFilter}
                  onChange={(event) => setChapterFilter(event.target.value)}
                  className="h-10 w-full rounded-lg border border-outline-variant/30 bg-surface-container-low px-3 text-sm text-on-surface outline-none transition-colors focus:border-primary/50 focus:bg-surface-container-lowest"
                >
                  {chapterOptions.map((chapter) => (
                    <option key = {chapter.id} value={chapter.id}>
                      {chapter.title} · {chapter.total} 题
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </section>

        <ChapterOverview
          chapterStats={chapterStats}
          activeChapterId={chapterFilter}
          isLoading={isLoading}
          onSelectChapter={setChapterFilter}
        />

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-h-[560px] rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-3 shadow-ambient sm:p-5">
            {isLoading ? (
              <EmptyState icon={<Loader2 className="h-6 w-6 animate-spin text-primary" />} text="正在加载复盘数据..." />
            ) : loadError ? (
              <EmptyState icon={<AlertCircle className="h-8 w-8 text-red-500" />} text={loadError} tone="text-red-600" />
            ) : stats.total === 0 ? (
              <EmptyState text="还没有数学题集。先导入或创建一些题目，再回来做复盘。" actionHref="/create?type=problem" actionLabel="去创建题集" />
            ) : !currentProblem ? (
              <EmptyState text="当前筛选下没有题目。可以切换状态或章节看看。" />
            ) : (
              <ReviewProblemCard
                problem={currentProblem}
                index={activeIndex}
                total={visibleProblems.length}
                showAnswer={showAnswer}
                recordingResult={recordingResult}
                onToggleAnswer={() => setShowAnswer((value) => !value)}
                onPrevious={() => moveToProblem(activeIndex - 1)}
                onNext={() => moveToProblem(activeIndex + 1)}
                onRecordResult={handleRecordResult}
                onReset={handleResetCurrent}
              />
            )}
          </div>

          <QueuePanel
            problems={visibleProblems}
            activeIndex={activeIndex}
            isLoading={isLoading}
            onSelect={moveToProblem}
          />
        </section>
      </div>
    </main>
  );
}

function HeaderStat({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <div className="rounded-md bg-surface-container-low px-2 py-2 text-center">
      <div className={`text-base font-bold md:text-lg ${tone}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-on-surface-variant">{label}</div>
    </div>
  );
}

function ChapterOverview({
  chapterStats,
  activeChapterId,
  isLoading,
  onSelectChapter,
}: {
  chapterStats: ChapterReviewStat[];
  activeChapterId: string;
  isLoading: boolean;
  onSelectChapter: (chapterId: string) => void;
}) {
  const topChapters = chapterStats.slice(0, 6);

  if (isLoading || topChapters.length === 0) return null;

  return (
    <section className="mb-5 rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
          <Layers className="h-4 w-4 text-primary" />
          章节概览
        </h2>
        <span className="text-xs text-on-surface-variant">按待回看数量排序</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {topChapters.map((chapter) => {
          const masteredPercent = chapter.total > 0 ? Math.round((chapter.mastered / chapter.total) * 100) : 0;

          return (
            <button
              key = {chapter.id}
              type="button"
              onClick={() => onSelectChapter(activeChapterId === chapter.id ? "all" : chapter.id)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                activeChapterId === chapter.id
                  ? "border-primary/35 bg-primary/5"
                  : "border-outline-variant/15 bg-surface-container-low hover:border-primary/25"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="line-clamp-1 text-sm font-semibold text-on-surface">{chapter.title}</div>
                  <div className="mt-1 text-xs text-on-surface-variant">
                    {chapter.review} 待回看 · {chapter.wrong} 错题
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-surface-container-lowest px-2 py-0.5 text-xs font-medium text-primary">
                  {chapter.total} 题
                </span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-container-high">
                <div
                  className="h-full rounded-full bg-green-500 transition-all"
                  style={{ width: `${masteredPercent}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ReviewProblemCard({
  problem,
  index,
  total,
  showAnswer,
  recordingResult,
  onToggleAnswer,
  onPrevious,
  onNext,
  onRecordResult,
  onReset,
}: {
  problem: ReviewProblemItem;
  index: number;
  total: number;
  showAnswer: boolean;
  recordingResult: PracticeResult | null;
  onToggleAnswer: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onRecordResult: (result: PracticeResult) => void;
  onReset: () => void;
}) {
  return (
    <article className="flex min-h-[520px] flex-col">
      <div className="mb-4 rounded-lg border border-outline-variant/15 bg-surface-container-low p-3 sm:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary">
                第 {index + 1} / {total} 题
              </span>
              <span className={`rounded-full px-2.5 py-1 font-medium ${getStatusTone(problem.status)}`}>
                {getRoundLabel(problem.status?.round ?? 0)}
              </span>
              <span className="rounded-full bg-surface-container-lowest px-2.5 py-1 text-on-surface-variant">
                {problemTypeMap[problem.type]}
              </span>
              <span className="rounded-full bg-surface-container-lowest px-2.5 py-1 text-on-surface-variant">
                {difficultyMap[problem.difficulty]}
              </span>
            </div>
            <div className="mt-3 grid gap-1.5 text-xs text-on-surface-variant sm:grid-cols-2">
              <span className="line-clamp-1">章节：{problem.areaTitle ? `${problem.areaTitle} · ` : ""}{problem.chapterTitle}</span>
              <span className="line-clamp-1">来源：{problem.sourceNoteTitle}</span>
              <span>状态：{getResultLabel(problem.status?.lastResult)}</span>
              <span>上次：{formatDate(problem.status?.lastPracticedAt)}</span>
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
      </div>

      <div className="flex-1 space-y-4">
        <div className="rounded-lg border border-outline-variant/15 bg-surface-container-low p-5 sm:p-6">
          <div className="text-[15px] leading-8 sm:text-base">
            <MarkdownContent content={problem.question} className="text-on-surface" />
          </div>
        </div>

        {problem.type === "choice" && problem.options && problem.options.length > 0 && (
          <div className="grid gap-2">
            {problem.options.map((option) => (
              <div
                key = {`${option.label}-${option.content}`}
                className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3 rounded-lg bg-surface-container-low px-4 py-3 text-sm text-on-surface"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {option.label}
                </span>
                <MarkdownContent content={option.content} className="min-w-0 text-on-surface" />
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

      <div className="mt-5 rounded-lg border border-outline-variant/15 bg-surface-container-low p-3">
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
              disabled={recordingResult !== null}
              onClick={onRecordResult}
              className="bg-amber-50 text-amber-700 hover:bg-amber-100"
              icon={<SkipForward className="h-4 w-4" />}
            >
              跳过
            </ResultButton>
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
            <button
              type="button"
              onClick={onToggleAnswer}
              className="inline-flex h-9 w-fit items-center justify-center gap-2 rounded-lg bg-surface-container-high px-3 text-xs font-medium text-on-surface-variant hover:bg-surface-container-highest"
            >
              <EyeOff className="h-4 w-4" />
              收起答案
            </button>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
                icon={<SkipForward className="h-4 w-4" />}
              >
                跳过
              </ResultButton>
              <button
                type="button"
                onClick={onReset}
                disabled={recordingResult !== null || !problem.status}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-surface-container-high px-3 text-sm font-medium text-on-surface-variant hover:bg-surface-container-highest disabled:opacity-40 sm:px-4"
              >
                <RotateCcw className="h-4 w-4" />
                重置
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function QueuePanel({
  problems,
  activeIndex,
  isLoading,
  onSelect,
}: {
  problems: ReviewProblemItem[];
  activeIndex: number;
  isLoading: boolean;
  onSelect: (index: number) => void;
}) {
  const visibleQueue = problems.slice(0, 36);

  return (
    <aside className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-4 shadow-ambient lg:sticky lg:top-24 lg:self-start">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
          <ListChecks className="h-4 w-4 text-primary" />
          复盘队列
        </h2>
        <span className="rounded-full bg-surface-container-low px-2.5 py-1 text-xs font-medium text-on-surface-variant">
          {isLoading ? "加载中" : `${problems.length} 题`}
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          加载队列...
        </div>
      ) : problems.length === 0 ? (
        <p className="py-4 text-sm leading-6 text-on-surface-variant">
          当前没有符合条件的题。
        </p>
      ) : (
        <div className="space-y-2">
          {visibleQueue.map((problem, index) => (
            <button
              key = {problem.practiceKey}
              type="button"
              onClick={() => onSelect(index)}
              className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                index === activeIndex
                  ? "border-primary/35 bg-primary/5"
                  : "border-outline-variant/10 bg-surface-container-low hover:border-primary/25"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-primary">#{problem.sourceProblemIndex + 1}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${getStatusTone(problem.status)}`}>
                  {getResultLabel(problem.status?.lastResult)}
                </span>
              </div>
              <div className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface">{problem.chapterTitle}</div>
              <div className="mt-0.5 line-clamp-1 text-[11px] text-on-surface-variant">{problem.sourceNoteTitle}</div>
            </button>
          ))}
          {problems.length > visibleQueue.length && (
            <p className="px-1 pt-1 text-xs text-on-surface-variant">
              队列较长，仅展示前 {visibleQueue.length} 题，可用搜索或章节缩小范围。
            </p>
          )}
        </div>
      )}
    </aside>
  );
}

function EmptyState({
  icon,
  text,
  tone = "text-on-surface-variant",
  actionHref,
  actionLabel,
}: {
  icon?: ReactNode;
  text: string;
  tone?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className={`flex min-h-[480px] flex-col items-center justify-center gap-3 text-center ${tone}`}>
      {icon ?? <BookOpen className="h-10 w-10 opacity-50" />}
      <p className="max-w-sm text-sm leading-6">{text}</p>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-on-primary hover:bg-primary/90"
        >
          {actionLabel}
        </Link>
      )}
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
