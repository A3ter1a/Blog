"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BookOpen,
  Calculator,
  CheckCircle2,
  ChevronDown,
  Circle,
  GraduationCap,
  Layers,
  ListChecks,
  ListFilter,
  Loader2,
  Search,
  SlidersHorizontal,
  Star,
  Target,
  X,
} from "lucide-react";
import { PracticeSession } from "@/components/practice/PracticeSession";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import {
  difficultyMeta,
  math3KnowledgeChapterIds,
  math3KnowledgeAreas,
  math3KnowledgePointIds,
  math3KnowledgeTotals,
  MATH3_KNOWLEDGE_COLLAPSED_CHAPTERS_STORAGE_KEY,
  MATH3_KNOWLEDGE_MASTERED_STORAGE_KEY,
  MATH3_KNOWLEDGE_SOURCE,
  MATH3_KNOWLEDGE_STAR_STORAGE_KEY,
  type KnowledgeDifficulty,
  type Math3KnowledgeAreaId,
  type Math3KnowledgeArea,
  type Math3KnowledgeChapter,
  type Math3KnowledgePoint,
} from "@/lib/math3-knowledge";
import { readJsonStorage, writeJsonStorage } from "@/lib/browser-storage";
import {
  getMath3ChapterIdsFromTags,
  getLinkedProblemSetIds,
  getMath3PointIdsFromTags,
  getMath3ScopeChapterIds,
  getMath3ScopePointIds,
  getMath3ScopeProblemCount,
  getVisibleNoteTags,
  type Math3PracticeScope,
} from "@/lib/math3-practice";
import { notesApi } from "@/lib/supabase";
import type { Note } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";

type AreaFilter = "all" | Math3KnowledgeAreaId;
type DifficultyFilter = "all" | KnowledgeDifficulty;
type MasteryFilter = "all" | "unmastered" | "mastered";

interface VisibleChapter extends Math3KnowledgeChapter {
  points: Math3KnowledgePoint[];
}

interface VisibleArea {
  id: Math3KnowledgeAreaId;
  title: string;
  shortTitle: string;
  examWeight: string;
  description: string;
  chapters: VisibleChapter[];
}

const areaOptions: Array<{ value: AreaFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "calculus", label: "微积分" },
  { value: "linear-algebra", label: "线代" },
  { value: "probability-statistics", label: "概率统计" },
];

const difficultyOptions: Array<{ value: DifficultyFilter; label: string }> = [
  { value: "all", label: "全部难度" },
  { value: "basic", label: "基础" },
  { value: "core", label: "核心" },
  { value: "advanced", label: "综合" },
];

const masteryOptions: Array<{ value: MasteryFilter; label: string }> = [
  { value: "all", label: "全部进度" },
  { value: "unmastered", label: "未掌握" },
  { value: "mastered", label: "已掌握" },
];

const areaTone: Record<Math3KnowledgeAreaId, string> = {
  calculus: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  "linear-algebra": "bg-violet-500/10 text-violet-700 border-violet-500/20",
  "probability-statistics": "bg-cyan-500/10 text-cyan-700 border-cyan-500/20",
};

const validKnowledgePointIds = new Set(math3KnowledgePointIds);
const validKnowledgeChapterIds = new Set(math3KnowledgeChapterIds);

function normalizeIds(value: unknown, validIds: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.filter((item): item is string => typeof item === "string" && validIds.has(item)))
  );
}

function normalizePointIds(value: unknown): string[] {
  return normalizeIds(value, validKnowledgePointIds);
}

function normalizeChapterIds(value: unknown): string[] {
  return normalizeIds(value, validKnowledgeChapterIds);
}

function matchesQuery(point: Math3KnowledgePoint, query: string): boolean {
  if (!query) return true;
  const searchable = `${point.title} ${point.tags.join(" ")}`.toLowerCase();
  return searchable.includes(query);
}

export function Math3KnowledgeCatalog() {
  const toast = useToast();
  const practiceSessionRef = useRef<HTMLDivElement | null>(null);
  const [areaFilter, setAreaFilter] = useState<AreaFilter>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>("all");
  const [masteryFilter, setMasteryFilter] = useState<MasteryFilter>("all");
  const [query, setQuery] = useState("");
  const [onlyStarred, setOnlyStarred] = useState(false);
  const [showCatalogTools, setShowCatalogTools] = useState(false);
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const [masteredIds, setMasteredIds] = useState<string[]>([]);
  const [collapsedChapterIds, setCollapsedChapterIds] = useState<string[]>([]);
  const [problemSets, setProblemSets] = useState<Note[]>([]);
  const [isLoadingProblemSets, setIsLoadingProblemSets] = useState(true);
  const [problemSetLoadError, setProblemSetLoadError] = useState<string | null>(null);
  const [activePracticeScope, setActivePracticeScope] = useState<Math3PracticeScope | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStarredIds(readJsonStorage(MATH3_KNOWLEDGE_STAR_STORAGE_KEY, [], normalizePointIds));
      setMasteredIds(readJsonStorage(MATH3_KNOWLEDGE_MASTERED_STORAGE_KEY, [], normalizePointIds));
      setCollapsedChapterIds(
        readJsonStorage(MATH3_KNOWLEDGE_COLLAPSED_CHAPTERS_STORAGE_KEY, math3KnowledgeChapterIds, normalizeChapterIds)
      );
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadProblemSetSummaries() {
      setIsLoadingProblemSets(true);
      setProblemSetLoadError(null);

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

        if (!cancelled) setProblemSets(sets);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "未知错误";
        setProblemSetLoadError(message);
        toast.error(`题集列表加载失败：${message}`);
      } finally {
        if (!cancelled) setIsLoadingProblemSets(false);
      }
    }

    void loadProblemSetSummaries();

    return () => {
      cancelled = true;
    };
  }, [toast]);

  const starredSet = useMemo(() => new Set(starredIds), [starredIds]);
  const masteredSet = useMemo(() => new Set(masteredIds), [masteredIds]);
  const collapsedChapterSet = useMemo(() => new Set(collapsedChapterIds), [collapsedChapterIds]);
  const normalizedQuery = query.trim().toLowerCase();
  const forceExpandedChapters = Boolean(normalizedQuery) || difficultyFilter !== "all" || masteryFilter !== "all" || onlyStarred;

  const visibleAreas = useMemo<VisibleArea[]>(() => {
    return math3KnowledgeAreas
      .filter((area) => areaFilter === "all" || area.id === areaFilter)
      .map((area) => ({
        ...area,
        chapters: area.chapters
          .map((chapter) => ({
            ...chapter,
            points: chapter.points.filter((pointItem) => {
              if (difficultyFilter !== "all" && pointItem.difficulty !== difficultyFilter) return false;
              if (onlyStarred && !starredSet.has(pointItem.id)) return false;
              if (masteryFilter === "mastered" && !masteredSet.has(pointItem.id)) return false;
              if (masteryFilter === "unmastered" && masteredSet.has(pointItem.id)) return false;
              return matchesQuery(pointItem, normalizedQuery);
            }),
          }))
          .filter((chapter) => chapter.points.length > 0),
      }))
      .filter((area) => area.chapters.length > 0);
  }, [areaFilter, difficultyFilter, masteredSet, masteryFilter, normalizedQuery, onlyStarred, starredSet]);

  const visiblePointCount = useMemo(
    () => visibleAreas.reduce(
      (sum, area) => sum + area.chapters.reduce((chapterSum, chapter) => chapterSum + chapter.points.length, 0),
      0
    ),
    [visibleAreas]
  );

  const difficultyCounts = useMemo(() => {
    const counts: Record<KnowledgeDifficulty, number> = { basic: 0, core: 0, advanced: 0 };
    for (const area of math3KnowledgeAreas) {
      for (const chapter of area.chapters) {
        for (const pointItem of chapter.points) {
          counts[pointItem.difficulty] += 1;
        }
      }
    }
    return counts;
  }, []);

  const masteredCount = masteredIds.length;
  const progressPercent = math3KnowledgeTotals.points > 0
    ? Math.round((masteredCount / math3KnowledgeTotals.points) * 100)
    : 0;
  const hasCatalogFilters = Boolean(normalizedQuery)
    || areaFilter !== "all"
    || difficultyFilter !== "all"
    || masteryFilter !== "all"
    || onlyStarred;
  const shouldShowCatalogTools = showCatalogTools || hasCatalogFilters;
  const activePracticeSetIds = useMemo(() => {
    if (!activePracticeScope) return [];
    return getLinkedProblemSetIds(problemSets, activePracticeScope);
  }, [activePracticeScope, problemSets]);

  useEffect(() => {
    if (!activePracticeScope) return;

    const timer = window.setTimeout(() => {
      practiceSessionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [activePracticeScope]);

  const handleStartPractice = (scope: Math3PracticeScope) => {
    setActivePracticeScope(scope);
  };

  const toggleStar = (pointId: string) => {
    setStarredIds((current) => {
      const next = current.includes(pointId)
        ? current.filter((id) => id !== pointId)
        : [...current, pointId];
      writeJsonStorage(MATH3_KNOWLEDGE_STAR_STORAGE_KEY, next);
      return next;
    });
  };

  const toggleMastered = (pointId: string) => {
    setMasteredIds((current) => {
      const next = current.includes(pointId)
        ? current.filter((id) => id !== pointId)
        : [...current, pointId];
      writeJsonStorage(MATH3_KNOWLEDGE_MASTERED_STORAGE_KEY, next);
      return next;
    });
  };

  const toggleChapter = (chapterId: string) => {
    setCollapsedChapterIds((current) => {
      const next = current.includes(chapterId)
        ? current.filter((id) => id !== chapterId)
        : [...current, chapterId];
      writeJsonStorage(MATH3_KNOWLEDGE_COLLAPSED_CHAPTERS_STORAGE_KEY, next);
      return next;
    });
  };

  const setAllChaptersCollapsed = (collapsed: boolean) => {
    const next = collapsed ? math3KnowledgeChapterIds : [];
    setCollapsedChapterIds(next);
    writeJsonStorage(MATH3_KNOWLEDGE_COLLAPSED_CHAPTERS_STORAGE_KEY, next);
  };

  const resetFilters = () => {
    setAreaFilter("all");
    setDifficultyFilter("all");
    setMasteryFilter("all");
    setOnlyStarred(false);
    setQuery("");
  };

  return (
    <>
      <PageHeader
        width="normal"
        eyebrow="数三考研"
        icon={<GraduationCap className="h-4 w-4" />}
        title="知识目录"
        description={`依据 ${MATH3_KNOWLEDGE_SOURCE} 整理。`}
        stats={[
          { label: "章节", value: math3KnowledgeTotals.chapters },
          { label: "知识点", value: math3KnowledgeTotals.points },
          { label: "已掌握", value: masteredCount },
          { label: "已加星", value: starredIds.length },
        ]}
      />

      <PageShell width="normal" topPadding="content">
        <section className="mb-5 rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-3 shadow-ambient">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant/50" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索知识点、公式、章节关键词"
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
              onClick={() => setShowCatalogTools((value) => !value)}
              className={`control-button h-11 px-4 text-sm ${shouldShowCatalogTools ? "control-button-selected" : ""}`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              目录工具
              <ChevronDown className={`h-4 w-4 transition-transform ${shouldShowCatalogTools ? "rotate-180" : ""}`} />
            </button>

            {hasCatalogFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="control-button h-11 px-4 text-sm"
            >
              <X className="h-4 w-4" />
              重置
            </button>
            )}
          </div>

          {shouldShowCatalogTools && (
            <div className="mt-3 grid gap-3 border-t border-outline-variant/10 pt-3 xl:grid-cols-[1fr_1fr_1fr_auto] xl:items-center">
              <FilterGroup icon={<BookOpen className="h-4 w-4" />} label="模块">
                {areaOptions.map((option) => (
                  <FilterButton
                    key={option.value}
                    active={areaFilter === option.value}
                    onClick={() => setAreaFilter(option.value)}
                  >
                    {option.label}
                  </FilterButton>
                ))}
              </FilterGroup>

              <FilterGroup icon={<ListFilter className="h-4 w-4" />} label="难度">
                {difficultyOptions.map((option) => (
                  <FilterButton
                    key={option.value}
                    active={difficultyFilter === option.value}
                    onClick={() => setDifficultyFilter(option.value)}
                  >
                    {option.label}
                  </FilterButton>
                ))}
              </FilterGroup>

              <FilterGroup icon={<CheckCircle2 className="h-4 w-4" />} label="进度">
                {masteryOptions.map((option) => (
                  <FilterButton
                    key={option.value}
                    active={masteryFilter === option.value}
                    onClick={() => setMasteryFilter(option.value)}
                  >
                    {option.label}
                  </FilterButton>
                ))}
              </FilterGroup>

              <button
                type="button"
                onClick={() => setOnlyStarred((value) => !value)}
                aria-pressed={onlyStarred}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors ${
                  onlyStarred
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-700"
                    : "border-outline-variant/30 text-on-surface-variant hover:border-amber-500/30 hover:text-amber-700"
                }`}
              >
                <Star className={`h-4 w-4 ${onlyStarred ? "fill-current" : ""}`} />
                只看加星
              </button>
            </div>
          )}
        </section>

        {shouldShowCatalogTools && (
          <section className="mb-6 rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-on-surface">掌握进度</span>
                  <span className="text-sm font-semibold text-primary">{progressPercent}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-container-low">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-on-surface-variant">
                  已掌握 {masteredCount} / {math3KnowledgeTotals.points} 个知识点，加星 {starredIds.length} 个。
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAllChaptersCollapsed(false)}
                  className="control-button h-9 min-h-0 px-3 text-sm"
                >
                  展开全部
                </button>
                <button
                  type="button"
                  onClick={() => setAllChaptersCollapsed(true)}
                  className="control-button h-9 min-h-0 px-3 text-sm"
                >
                  折叠全部
                </button>
              </div>
            </div>
          </section>
        )}

        {problemSetLoadError && (
          <section className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            题集列表暂时无法加载：{problemSetLoadError}
          </section>
        )}

        {activePracticeScope && (
          <div ref={practiceSessionRef} className="mb-8 scroll-mt-24">
            <PracticeSession
              scopeTitle={activePracticeScope.title}
              scopeDescription={
                activePracticeScope.type === "area"
                  ? "本队列按数三章节归属汇总这个模块下的相关题目，知识点只作为复盘标签。"
                  : "本队列按数三章节归属抽取题目，知识点只作为复盘标签。"
              }
              problemSetIds={activePracticeSetIds}
              scope={activePracticeScope}
              onClose={() => setActivePracticeScope(null)}
            />
          </div>
        )}

        {shouldShowCatalogTools && (
          <>
            <section className="mb-6 grid gap-3 md:grid-cols-3">
              {math3KnowledgeAreas.map((area) => (
                <AreaPracticeCard
                  key={area.id}
                  area={area}
                  problemSets={problemSets}
                  isLoadingProblemSets={isLoadingProblemSets}
                  onStartPractice={handleStartPractice}
                />
              ))}
            </section>

            <section className="mb-6 grid gap-3 md:grid-cols-4">
              <DifficultyStat label="当前显示" value={visiblePointCount} tone="border-primary/20 bg-primary/5 text-primary" />
              <DifficultyStat label="基础" value={difficultyCounts.basic} tone={difficultyMeta.basic.tone} />
              <DifficultyStat label="核心" value={difficultyCounts.core} tone={difficultyMeta.core.tone} />
              <DifficultyStat label="综合" value={difficultyCounts.advanced} tone={difficultyMeta.advanced.tone} />
            </section>
          </>
        )}

        {visibleAreas.length === 0 ? (
          <div className="rounded-lg border border-dashed border-outline-variant/40 bg-surface-container-lowest p-10 text-center">
            <ListChecks className="mx-auto h-10 w-10 text-on-surface-variant/40" />
            <p className="mt-3 text-sm text-on-surface-variant">没有匹配的知识点。</p>
          </div>
        ) : (
          <div className="space-y-7">
            {visibleAreas.map((area) => (
              <section key={area.id} className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/20 pb-3">
                  <div>
                    <div className={`mb-2 inline-flex rounded-full border px-3 py-1 text-xs font-medium ${areaTone[area.id]}`}>
                      {area.examWeight}
                    </div>
                    <h2 className="font-headline text-xl font-bold text-on-surface md:text-2xl">{area.title}</h2>
                  </div>
                  <div className="rounded-full bg-surface-container-low px-3 py-1 text-xs font-medium text-on-surface-variant">
                    {area.chapters.length} 章 / {area.chapters.reduce((sum, chapter) => sum + chapter.points.length, 0)} 个知识点
                  </div>
                </div>

                <div className="space-y-4">
                  {area.chapters.map((chapter) => (
                    <ChapterBlock
                      key={chapter.id}
                      areaId={area.id}
                      chapter={chapter}
                      problemSets={problemSets}
                      starredSet={starredSet}
                      masteredSet={masteredSet}
                      collapsed={collapsedChapterSet.has(chapter.id) && !forceExpandedChapters}
                      isLoadingProblemSets={isLoadingProblemSets}
                      onToggleStar={toggleStar}
                      onToggleMastered={toggleMastered}
                      onToggleChapter={() => toggleChapter(chapter.id)}
                      onStartPractice={handleStartPractice}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </PageShell>
    </>
  );
}

function FilterGroup({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-on-surface-variant">
        {icon}
        {label}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function FilterButton({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 rounded-lg border px-3 text-sm font-medium transition-colors ${
        active
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-outline-variant/30 text-on-surface-variant hover:border-primary/30 hover:text-primary"
      }`}
    >
      {children}
    </button>
  );
}

function DifficultyStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-lg border p-4 ${tone}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-1 text-xs font-medium">{label}</div>
    </div>
  );
}

function getAreaPracticeName(area: Math3KnowledgeArea): string {
  if (area.id === "calculus") return "高数";
  if (area.id === "linear-algebra") return "线代";
  return "概率";
}

function AreaPracticeCard({
  area,
  problemSets,
  isLoadingProblemSets,
  onStartPractice,
}: {
  area: Math3KnowledgeArea;
  problemSets: Note[];
  isLoadingProblemSets: boolean;
  onStartPractice: (scope: Math3PracticeScope) => void;
}) {
  const practiceName = getAreaPracticeName(area);
  const scope: Math3PracticeScope = {
    type: "area",
    id: area.id,
    title: `${practiceName}刷题`,
  };
  const directLinkedSetIds = getLinkedProblemSetIds(problemSets, scope);
  const directProblemCount = getMath3ScopeProblemCount(problemSets, scope);

  return (
    <div className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-4">
      <div className="flex items-center justify-between gap-3">
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${areaTone[area.id]}`}>
          {area.shortTitle}
        </span>
        <span className="text-xs font-semibold text-on-surface-variant">{area.examWeight}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-on-surface-variant">{area.description}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onStartPractice(scope)}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary/10 px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
        >
          <Target className="h-4 w-4" />
          刷整个{practiceName}
        </button>
        <span className="text-xs text-on-surface-variant">
          汇总 {isLoadingProblemSets ? "加载中" : `${directProblemCount} 题`}
        </span>
      </div>

      <div className="mt-4">
        <ProblemSetLinkPanel
          scope={scope}
          title={`${practiceName}相关题集`}
          problemSets={problemSets}
          linkedSetIds={directLinkedSetIds}
          isLoadingProblemSets={isLoadingProblemSets}
        />
      </div>
    </div>
  );
}

function ProblemSetLinkPanel({
  scope,
  title,
  problemSets,
  linkedSetIds,
  isLoadingProblemSets,
  defaultOpen = false,
}: {
  scope: Math3PracticeScope;
  title: string;
  problemSets: Note[];
  linkedSetIds: string[];
  isLoadingProblemSets: boolean;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const linkedIdSet = useMemo(() => new Set(linkedSetIds), [linkedSetIds]);
  const scopeChapterIdSet = useMemo(() => new Set(getMath3ScopeChapterIds(scope)), [scope]);
  const scopePointIdSet = useMemo(() => new Set(getMath3ScopePointIds(scope)), [scope]);
  const linkedSets = useMemo(
    () => problemSets.filter((set) => linkedIdSet.has(set.id)),
    [linkedIdSet, problemSets],
  );

  return (
    <details
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      className="group rounded-lg border border-outline-variant/20 bg-surface-container-low"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
          <Layers className="h-3.5 w-3.5" />
          {title}
        </div>
        <div className="inline-flex items-center gap-2 text-xs text-on-surface-variant">
          <span>{isLoadingProblemSets ? "加载中" : `${linkedSets.length} 个`}</span>
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </div>
      </summary>

      <div className="border-t border-outline-variant/15 px-3 py-3">
        {isLoadingProblemSets ? (
          <div className="flex items-center gap-2 py-2 text-xs text-on-surface-variant">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            加载题集...
          </div>
        ) : linkedSets.length === 0 ? (
          <p className="text-xs leading-5 text-on-surface-variant">
            这个范围还没有匹配到题集。请到数学题集编辑页先给小题分配数三章节。
          </p>
        ) : (
          <div className="space-y-2">
            {linkedSets.map((set) => {
              const visibleTags = getVisibleNoteTags(set.tags);
              const coveredChapterCount = getMath3ChapterIdsFromTags(set.tags)
                .filter((chapterId) => scopeChapterIdSet.has(chapterId)).length;
              const coveredPointCount = getMath3PointIdsFromTags(set.tags)
                .filter((pointId) => scopePointIdSet.has(pointId)).length;
              return (
                <div
                  key={set.id}
                  className="flex items-start justify-between gap-2 rounded-md bg-surface-container-lowest px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="line-clamp-2 text-xs font-medium text-on-surface">{set.title}</div>
                    {visibleTags.length > 0 && (
                      <div className="mt-1 line-clamp-1 text-[11px] text-on-surface-variant/70">
                        {visibleTags.slice(0, 3).join(" · ")}
                      </div>
                    )}
                    {(coveredChapterCount > 0 || coveredPointCount > 0) && (
                      <div className="mt-1 text-[11px] text-on-surface-variant/70">
                        覆盖 {coveredChapterCount} 章{coveredPointCount > 0 ? ` / ${coveredPointCount} 个知识点标签` : ""}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}

function ChapterBlock({
  areaId,
  chapter,
  problemSets,
  starredSet,
  masteredSet,
  collapsed,
  isLoadingProblemSets,
  onToggleStar,
  onToggleMastered,
  onToggleChapter,
  onStartPractice,
}: {
  areaId: Math3KnowledgeAreaId;
  chapter: VisibleChapter;
  problemSets: Note[];
  starredSet: Set<string>;
  masteredSet: Set<string>;
  collapsed: boolean;
  isLoadingProblemSets: boolean;
  onToggleStar: (pointId: string) => void;
  onToggleMastered: (pointId: string) => void;
  onToggleChapter: () => void;
  onStartPractice: (scope: Math3PracticeScope) => void;
}) {
  const masteredPointCount = chapter.points.filter((pointItem) => masteredSet.has(pointItem.id)).length;
  const chapterProgressPercent = chapter.points.length > 0
    ? Math.round((masteredPointCount / chapter.points.length) * 100)
    : 0;
  const scope: Math3PracticeScope = {
    type: "chapter",
    id: chapter.id,
    title: `${chapter.title}刷题`,
    areaId,
  };
  const linkedSetIds = getLinkedProblemSetIds(problemSets, scope);
  const linkedProblemCount = getMath3ScopeProblemCount(problemSets, scope);

  return (
    <article className="overflow-hidden rounded-lg border border-outline-variant/20 bg-surface-container-lowest">
      <div className="border-b border-outline-variant/15 bg-surface-container-low px-4 py-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <button
            type="button"
            onClick={onToggleChapter}
            aria-expanded={!collapsed}
            className="min-w-0 flex-1 text-left"
          >
            <div>
              <div className="flex items-center gap-2">
                <ChevronDown className={`h-4 w-4 shrink-0 text-on-surface-variant transition-transform ${collapsed ? "-rotate-90" : ""}`} />
                <h3 className="font-headline text-lg font-bold text-on-surface">{chapter.title}</h3>
              </div>
              <p className="mt-1 text-sm leading-6 text-on-surface-variant">{chapter.summary}</p>
            </div>
          </button>
          <div className="flex w-fit flex-wrap items-center gap-2 md:justify-end">
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-lowest px-3 py-1 text-xs font-medium text-on-surface-variant">
              <Calculator className="h-3.5 w-3.5" />
              {chapter.points.length} 点
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {masteredPointCount}/{chapter.points.length}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-lowest px-3 py-1 text-xs font-medium text-on-surface-variant">
              <Layers className="h-3.5 w-3.5" />
              {isLoadingProblemSets ? "加载题目" : `${linkedProblemCount} 题`}
            </span>
            <button
              type="button"
              onClick={() => onStartPractice(scope)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary/10 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
            >
              <Target className="h-3.5 w-3.5" />
              刷本章
            </button>
          </div>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-container-lowest">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${chapterProgressPercent}%` }}
          />
        </div>
      </div>

      {!collapsed && (
        <div className="space-y-3 p-3">
          <div>
            <ProblemSetLinkPanel
              scope={scope}
              title="相关题集"
              problemSets={problemSets}
              linkedSetIds={linkedSetIds}
              isLoadingProblemSets={isLoadingProblemSets}
            />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {chapter.points.map((pointItem) => (
              <KnowledgePointRow
                key={pointItem.id}
                pointItem={pointItem}
                starred={starredSet.has(pointItem.id)}
                mastered={masteredSet.has(pointItem.id)}
                onToggleStar={() => onToggleStar(pointItem.id)}
                onToggleMastered={() => onToggleMastered(pointItem.id)}
              />
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function KnowledgePointRow({
  pointItem,
  starred,
  mastered,
  onToggleStar,
  onToggleMastered,
}: {
  pointItem: Math3KnowledgePoint;
  starred: boolean;
  mastered: boolean;
  onToggleStar: () => void;
  onToggleMastered: () => void;
}) {
  const difficulty = difficultyMeta[pointItem.difficulty];

  return (
    <div className={`grid gap-3 rounded-lg border border-outline-variant/15 bg-surface-container-low px-3 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center ${mastered ? "border-emerald-500/20 bg-emerald-500/[0.04]" : ""}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {mastered && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3 w-3" />
              已掌握
            </span>
          )}
          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${difficulty.tone}`}>
            {difficulty.label}
          </span>
          {pointItem.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-surface-container-lowest px-2 py-0.5 text-xs text-on-surface-variant">
              {tag}
            </span>
          ))}
        </div>
        <p className="mt-2 text-sm font-medium leading-6 text-on-surface">{pointItem.title}</p>
      </div>

      <div className="flex items-center gap-1 md:justify-end">
        <button
          type="button"
          onClick={onToggleMastered}
          aria-pressed={mastered}
          aria-label={mastered ? "标为未掌握" : "标为已掌握"}
          title={mastered ? "标为未掌握" : "标为已掌握"}
          className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
            mastered
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
              : "border-outline-variant/30 text-on-surface-variant/60 hover:border-emerald-500/30 hover:text-emerald-600"
          }`}
        >
          {mastered ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={onToggleStar}
          aria-pressed={starred}
          aria-label={starred ? "取消重点" : "标为重点"}
          title={starred ? "取消重点" : "标为重点"}
          className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
            starred
              ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
              : "border-outline-variant/30 text-on-surface-variant/60 hover:border-amber-500/30 hover:text-amber-600"
          }`}
        >
          <Star className={`h-4 w-4 ${starred ? "fill-current" : ""}`} />
        </button>
      </div>
    </div>
  );
}
