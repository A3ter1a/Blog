"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  BookOpen,
  Brain,
  Calculator,
  CheckCircle2,
  ChevronDown,
  Circle,
  GraduationCap,
  Layers,
  ListChecks,
  ListFilter,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Star,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { PracticeSession } from "@/components/practice/PracticeSession";
import { recordDeepSeekUsage } from "@/lib/ai-usage";
import {
  AI_CONFIG_STORAGE_KEY,
  ALLOW_CLIENT_AI_KEYS,
  DEFAULT_AI_CONFIG,
  DEFAULT_DEEPSEEK_MODEL,
  normalizeAIConfig,
} from "@/lib/ai-config";
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
  getAreaPracticeProblemSetIds,
  getMath3ChapterById,
  getLinkedProblemSetIds,
  getMath3ScopeKey,
  getMath3PointById,
  getVisibleNoteTags,
  setMath3ScopeLinked,
  type Math3PracticeScope,
} from "@/lib/math3-practice";
import { notesApi } from "@/lib/supabase";
import { buildAuthHeaders } from "@/lib/fetch-with-auth";
import type { Note } from "@/lib/types";
import { useAdminAuth } from "@/hooks/useAdminAuth";
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

interface Math3ClassificationRecommendation {
  areaId: Math3KnowledgeAreaId;
  chapterId: string;
  pointIds: string[];
  confidence: number;
  reason: string;
  evidence: string[];
}

interface ClassificationReviewState {
  noteId: string;
  noteTitle: string;
  requestedScope: Math3PracticeScope;
  recommendations: Math3ClassificationRecommendation[];
  selectedChapterId: string;
  selectedPointIds: string[];
}

interface ChapterOption {
  area: Math3KnowledgeArea;
  chapter: Math3KnowledgeChapter;
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
const chapterOptions: ChapterOption[] = math3KnowledgeAreas.flatMap((area) =>
  area.chapters.map((chapter) => ({ area, chapter }))
);

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toCleanString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value.trim() : String(value).trim();
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(toCleanString).filter(Boolean)));
}

function clampConfidence(value: unknown): number {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return 0.5;
  return Math.min(1, Math.max(0, confidence));
}

function getAIConfig() {
  return readJsonStorage(AI_CONFIG_STORAGE_KEY, DEFAULT_AI_CONFIG, normalizeAIConfig);
}

function getChapterOption(chapterId: string): ChapterOption | undefined {
  return chapterOptions.find((option) => option.chapter.id === chapterId);
}

function getChapterPointIds(chapterId: string): string[] {
  return getChapterOption(chapterId)?.chapter.points.map((pointItem) => pointItem.id) ?? [];
}

function getScopeFromChapterId(chapterId: string): Math3PracticeScope | null {
  const option = getChapterOption(chapterId);
  if (!option) return null;

  return {
    type: "chapter",
    id: option.chapter.id,
    title: `${option.chapter.title}刷题`,
    areaId: option.area.id,
  };
}

function normalizeClassificationRecommendations(value: unknown): Math3ClassificationRecommendation[] {
  const items = Array.isArray(value) ? value : [];
  const seenChapters = new Set<string>();
  const recommendations: Math3ClassificationRecommendation[] = [];

  for (const item of items) {
    const raw = isRecord(item) ? item : {};
    const chapterId = toCleanString(raw.chapterId);
    const chapter = getMath3ChapterById(chapterId);
    if (!chapter || seenChapters.has(chapterId)) continue;

    const validPointIds = new Set(chapter.chapter.points.map((pointItem) => pointItem.id));
    const pointIds = toStringArray(raw.pointIds)
      .filter((pointId) => validPointIds.has(pointId))
      .slice(0, 6);

    recommendations.push({
      areaId: chapter.area.id,
      chapterId,
      pointIds,
      confidence: clampConfidence(raw.confidence),
      reason: toCleanString(raw.reason) || "AI 未给出详细理由。",
      evidence: toStringArray(raw.evidence).slice(0, 4),
    });
    seenChapters.add(chapterId);
  }

  return recommendations;
}

function getFallbackChapterId(scope: Math3PracticeScope, recommendations: Math3ClassificationRecommendation[]): string {
  if (recommendations[0]?.chapterId) return recommendations[0].chapterId;
  if (scope.type === "chapter") return scope.id;

  const area = math3KnowledgeAreas.find((item) => item.id === scope.id);
  return area?.chapters[0]?.id ?? chapterOptions[0]?.chapter.id ?? "";
}

function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return "高";
  if (confidence >= 0.55) return "中";
  return "低";
}

export function Math3KnowledgeCatalog() {
  const toast = useToast();
  const { isAdmin } = useAdminAuth();
  const [areaFilter, setAreaFilter] = useState<AreaFilter>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>("all");
  const [masteryFilter, setMasteryFilter] = useState<MasteryFilter>("all");
  const [query, setQuery] = useState("");
  const [onlyStarred, setOnlyStarred] = useState(false);
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const [masteredIds, setMasteredIds] = useState<string[]>([]);
  const [collapsedChapterIds, setCollapsedChapterIds] = useState<string[]>([]);
  const [problemSets, setProblemSets] = useState<Note[]>([]);
  const [isLoadingProblemSets, setIsLoadingProblemSets] = useState(true);
  const [problemSetLoadError, setProblemSetLoadError] = useState<string | null>(null);
  const [updatingScopeKey, setUpdatingScopeKey] = useState<string | null>(null);
  const [activePracticeScope, setActivePracticeScope] = useState<Math3PracticeScope | null>(null);

  useEffect(() => {
    setStarredIds(readJsonStorage(MATH3_KNOWLEDGE_STAR_STORAGE_KEY, [], normalizePointIds));
    setMasteredIds(readJsonStorage(MATH3_KNOWLEDGE_MASTERED_STORAGE_KEY, [], normalizePointIds));
    setCollapsedChapterIds(
      readJsonStorage(MATH3_KNOWLEDGE_COLLAPSED_CHAPTERS_STORAGE_KEY, [], normalizeChapterIds)
    );
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
  const activePracticeSetIds = useMemo(() => {
    if (!activePracticeScope) return [];

    if (activePracticeScope.type === "area") {
      const area = math3KnowledgeAreas.find((item) => item.id === activePracticeScope.id);
      return area ? getAreaPracticeProblemSetIds(problemSets, area) : [];
    }

    return getLinkedProblemSetIds(problemSets, activePracticeScope);
  }, [activePracticeScope, problemSets]);

  const handleToggleProblemSetLink = useCallback(async (
    scope: Math3PracticeScope,
    noteId: string,
    linked: boolean,
    pointIds: string[] = [],
  ) => {
    if (!isAdmin) {
      toast.error("需要管理员登录后才能调整题集挂载");
      return;
    }

    const scopeKey = getMath3ScopeKey(scope);
    const targetSet = problemSets.find((set) => set.id === noteId);
    if (!targetSet) return;

    const nextTags = setMath3ScopeLinked(targetSet.tags, scope, linked, pointIds);
    const previousProblemSets = problemSets;
    setUpdatingScopeKey(`${scopeKey}:${noteId}`);
    setProblemSets((current) => current.map((set) => (
      set.id === noteId ? { ...set, tags: nextTags } : set
    )));

    try {
      await notesApi.update(noteId, { tags: nextTags });
      toast.success(linked ? "题集已放入目录" : "题集已从目录移除");
    } catch (error) {
      setProblemSets(previousProblemSets);
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`题集挂载更新失败：${message}`);
    } finally {
      setUpdatingScopeKey(null);
    }
  }, [isAdmin, problemSets, toast]);

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
    <div className="min-h-screen bg-surface pt-24">
      <section className="border-b border-outline-variant/20 bg-surface-container-low">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                <GraduationCap className="h-4 w-4" />
                数三考研
              </div>
              <h1 className="font-headline text-3xl font-bold text-on-surface md:text-4xl">
                知识目录
              </h1>
              <p className="mt-3 text-sm leading-6 text-on-surface-variant md:text-base">
                依据 {MATH3_KNOWLEDGE_SOURCE} 整理，按模块、章节和知识点拆分成复习清单。
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-3 shadow-ambient sm:grid-cols-4 lg:min-w-[460px]">
              <StatCard label="章节" value={math3KnowledgeTotals.chapters.toString()} />
              <StatCard label="知识点" value={math3KnowledgeTotals.points.toString()} />
              <StatCard label="已掌握" value={masteredCount.toString()} />
              <StatCard label="已加星" value={starredIds.length.toString()} />
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <section className="mb-6 rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-4 shadow-ambient">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
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
              onClick={resetFilters}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-outline-variant/30 px-4 text-sm font-medium text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary"
            >
              <X className="h-4 w-4" />
              重置
            </button>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr_1fr_auto] xl:items-center">
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
        </section>

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
                className="h-9 rounded-lg border border-outline-variant/30 px-3 text-sm font-medium text-on-surface-variant transition-colors hover:border-primary/30 hover:text-primary"
              >
                展开全部
              </button>
              <button
                type="button"
                onClick={() => setAllChaptersCollapsed(true)}
                className="h-9 rounded-lg border border-outline-variant/30 px-3 text-sm font-medium text-on-surface-variant transition-colors hover:border-primary/30 hover:text-primary"
              >
                折叠全部
              </button>
            </div>
          </div>
        </section>

        {problemSetLoadError && (
          <section className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            题集列表暂时无法加载：{problemSetLoadError}
          </section>
        )}

        {activePracticeScope && (
          <div className="mb-8">
            <PracticeSession
              scopeTitle={activePracticeScope.title}
              scopeDescription={
                activePracticeScope.type === "area"
                  ? "本队列会汇总这个模块本身以及它下面各章节挂载的题集。"
                  : "本队列只使用这个章节子栏中挂载的题集。"
              }
              problemSetIds={activePracticeSetIds}
              onClose={() => setActivePracticeScope(null)}
            />
          </div>
        )}

        <section className="mb-6 grid gap-3 md:grid-cols-3">
          {math3KnowledgeAreas.map((area) => (
            <AreaPracticeCard
              key={area.id}
              area={area}
              problemSets={problemSets}
              isAdmin={isAdmin}
              isLoadingProblemSets={isLoadingProblemSets}
              updatingScopeKey={updatingScopeKey}
              onToggleProblemSetLink={handleToggleProblemSetLink}
              onStartPractice={setActivePracticeScope}
            />
          ))}
        </section>

        <section className="mb-6 grid gap-3 md:grid-cols-4">
          <DifficultyStat label="当前显示" value={visiblePointCount} tone="border-primary/20 bg-primary/5 text-primary" />
          <DifficultyStat label="基础" value={difficultyCounts.basic} tone={difficultyMeta.basic.tone} />
          <DifficultyStat label="核心" value={difficultyCounts.core} tone={difficultyMeta.core.tone} />
          <DifficultyStat label="综合" value={difficultyCounts.advanced} tone={difficultyMeta.advanced.tone} />
        </section>

        {visibleAreas.length === 0 ? (
          <div className="rounded-lg border border-dashed border-outline-variant/40 bg-surface-container-lowest p-10 text-center">
            <ListChecks className="mx-auto h-10 w-10 text-on-surface-variant/40" />
            <p className="mt-3 text-sm text-on-surface-variant">没有匹配的知识点。</p>
          </div>
        ) : (
          <div className="space-y-8">
            {visibleAreas.map((area) => (
              <section key={area.id} className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3 border-b border-outline-variant/20 pb-3">
                  <div>
                    <div className={`mb-2 inline-flex rounded-full border px-3 py-1 text-xs font-medium ${areaTone[area.id]}`}>
                      {area.examWeight}
                    </div>
                    <h2 className="font-headline text-2xl font-bold text-on-surface">{area.title}</h2>
                  </div>
                  <div className="text-sm text-on-surface-variant">
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
                      isAdmin={isAdmin}
                      isLoadingProblemSets={isLoadingProblemSets}
                      updatingScopeKey={updatingScopeKey}
                      onToggleStar={toggleStar}
                      onToggleMastered={toggleMastered}
                      onToggleChapter={() => toggleChapter(chapter.id)}
                      onToggleProblemSetLink={handleToggleProblemSetLink}
                      onStartPractice={setActivePracticeScope}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-container-low px-3 py-3 text-center">
      <div className="text-xl font-bold text-primary">{value}</div>
      <div className="mt-1 text-xs text-on-surface-variant">{label}</div>
    </div>
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
  isAdmin,
  isLoadingProblemSets,
  updatingScopeKey,
  onToggleProblemSetLink,
  onStartPractice,
}: {
  area: Math3KnowledgeArea;
  problemSets: Note[];
  isAdmin: boolean;
  isLoadingProblemSets: boolean;
  updatingScopeKey: string | null;
  onToggleProblemSetLink: (
    scope: Math3PracticeScope,
    noteId: string,
    linked: boolean,
    pointIds?: string[],
  ) => Promise<void>;
  onStartPractice: (scope: Math3PracticeScope) => void;
}) {
  const practiceName = getAreaPracticeName(area);
  const scope: Math3PracticeScope = {
    type: "area",
    id: area.id,
    title: `${practiceName}刷题`,
  };
  const directLinkedSetIds = getLinkedProblemSetIds(problemSets, scope);
  const aggregateSetIds = getAreaPracticeProblemSetIds(problemSets, area);

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
          汇总 {aggregateSetIds.length} 个题集
        </span>
      </div>

      <div className="mt-4">
        <ProblemSetLinkPanel
          scope={scope}
          title={`${practiceName}整体题集`}
          problemSets={problemSets}
          linkedSetIds={directLinkedSetIds}
          isAdmin={isAdmin}
          isLoadingProblemSets={isLoadingProblemSets}
          updatingScopeKey={updatingScopeKey}
          onToggleProblemSetLink={onToggleProblemSetLink}
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
  isAdmin,
  isLoadingProblemSets,
  updatingScopeKey,
  onToggleProblemSetLink,
}: {
  scope: Math3PracticeScope;
  title: string;
  problemSets: Note[];
  linkedSetIds: string[];
  isAdmin: boolean;
  isLoadingProblemSets: boolean;
  updatingScopeKey: string | null;
  onToggleProblemSetLink: (
    scope: Math3PracticeScope,
    noteId: string,
    linked: boolean,
    pointIds?: string[],
  ) => Promise<void>;
}) {
  const toast = useToast();
  const [selectedSetId, setSelectedSetId] = useState("");
  const [review, setReview] = useState<ClassificationReviewState | null>(null);
  const [classificationError, setClassificationError] = useState<string | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);
  const [isConfirmingReview, setIsConfirmingReview] = useState(false);
  const scopeKey = getMath3ScopeKey(scope);
  const linkedIdSet = useMemo(() => new Set(linkedSetIds), [linkedSetIds]);
  const linkedSets = useMemo(
    () => problemSets.filter((set) => linkedIdSet.has(set.id)),
    [linkedIdSet, problemSets],
  );
  const availableSets = useMemo(
    () => problemSets.filter((set) => !linkedIdSet.has(set.id)),
    [linkedIdSet, problemSets],
  );

  useEffect(() => {
    setSelectedSetId("");
    setReview(null);
    setClassificationError(null);
  }, [scopeKey]);

  useEffect(() => {
    setReview(null);
    setClassificationError(null);
  }, [selectedSetId]);

  const handleRequestClassification = async () => {
    if (!selectedSetId || isClassifying) return;

    setIsClassifying(true);
    setClassificationError(null);

    try {
      const fullSet = await notesApi.getById(selectedSetId);
      const fallbackSet = problemSets.find((set) => set.id === selectedSetId);
      const problemSet = fullSet ?? fallbackSet;
      if (!problemSet || problemSet.type !== "problem") {
        throw new Error("没有找到这个题集，可能已经被删除或权限不足。");
      }

      const config = getAIConfig();
      const response = await fetch("/api/ai/math3-classify", {
        method: "POST",
        headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          problemSet: {
            title: problemSet.title,
            content: problemSet.content,
            tags: getVisibleNoteTags(problemSet.tags),
            problems: problemSet.problems ?? [],
          },
          apiKey: ALLOW_CLIENT_AI_KEYS ? config.deepseekApiKey : undefined,
          model: config.deepseekModel || DEFAULT_DEEPSEEK_MODEL,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = isRecord(payload) && typeof payload.error === "string"
          ? payload.error
          : "AI 归类请求失败";
        throw new Error(message);
      }

      const recommendations = normalizeClassificationRecommendations(
        isRecord(payload) ? payload.recommendations : []
      );
      const tokensUsed = Number(isRecord(payload) ? payload.tokensUsed : 0);
      if (Number.isFinite(tokensUsed) && tokensUsed > 0) {
        recordDeepSeekUsage(tokensUsed);
      }

      const selectedChapterId = getFallbackChapterId(scope, recommendations);
      const selectedPointIds = recommendations.find((item) => item.chapterId === selectedChapterId)?.pointIds ?? [];

      setReview({
        noteId: problemSet.id,
        noteTitle: problemSet.title,
        requestedScope: scope,
        recommendations,
        selectedChapterId,
        selectedPointIds,
      });

      toast.info(recommendations.length > 0 ? "AI 推荐已生成，请人工确认" : "AI 没有给出可用章节，请手动选择后确认");
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 归类失败";
      setClassificationError(message);
      toast.error(`AI 归类失败：${message}`);
    } finally {
      setIsClassifying(false);
    }
  };

  const updateReviewChapter = (chapterId: string) => {
    setReview((current) => {
      if (!current) return current;
      const recommendation = current.recommendations.find((item) => item.chapterId === chapterId);
      return {
        ...current,
        selectedChapterId: chapterId,
        selectedPointIds: recommendation?.pointIds ?? [],
      };
    });
  };

  const toggleReviewPoint = (pointId: string) => {
    setReview((current) => {
      if (!current) return current;
      const pointSet = new Set(current.selectedPointIds);
      if (pointSet.has(pointId)) {
        pointSet.delete(pointId);
      } else {
        pointSet.add(pointId);
      }

      const validPointIds = new Set(getChapterPointIds(current.selectedChapterId));
      return {
        ...current,
        selectedPointIds: Array.from(pointSet).filter((id) => validPointIds.has(id)),
      };
    });
  };

  const confirmReview = async () => {
    if (!review || isConfirmingReview) return;
    const targetScope = getScopeFromChapterId(review.selectedChapterId);
    if (!targetScope) {
      toast.error("请选择一个有效章节后再确认");
      return;
    }

    setIsConfirmingReview(true);
    try {
      await onToggleProblemSetLink(targetScope, review.noteId, true, review.selectedPointIds);
      setReview(null);
      setSelectedSetId("");
    } finally {
      setIsConfirmingReview(false);
    }
  };

  const confirmCurrentScope = async () => {
    if (!review || isConfirmingReview) return;

    setIsConfirmingReview(true);
    try {
      await onToggleProblemSetLink(review.requestedScope, review.noteId, true);
      setReview(null);
      setSelectedSetId("");
    } finally {
      setIsConfirmingReview(false);
    }
  };

  return (
    <div className="rounded-lg border border-outline-variant/20 bg-surface-container-low p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
          <Layers className="h-3.5 w-3.5" />
          {title}
        </div>
        <span className="text-xs text-on-surface-variant">{linkedSets.length} 个</span>
      </div>

      {isLoadingProblemSets ? (
        <div className="flex items-center gap-2 py-2 text-xs text-on-surface-variant">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          加载题集...
        </div>
      ) : linkedSets.length === 0 ? (
        <p className="text-xs leading-5 text-on-surface-variant">
          还没有题集放入这个目录栏。
        </p>
      ) : (
        <div className="space-y-2">
          {linkedSets.map((set) => {
            const updatingKey = `${scopeKey}:${set.id}`;
            const visibleTags = getVisibleNoteTags(set.tags);
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
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      void onToggleProblemSetLink(scope, set.id, false);
                    }}
                    disabled={updatingScopeKey === updatingKey}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-on-surface-variant/60 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    aria-label="移出目录栏"
                    title="移出目录栏"
                  >
                    {updatingScopeKey === updatingKey
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isAdmin ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <select
              value={selectedSetId}
              onChange={(event) => setSelectedSetId(event.target.value)}
              disabled={isLoadingProblemSets || availableSets.length === 0 || isClassifying}
              className="h-9 min-w-0 rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-2 text-xs text-on-surface outline-none focus:border-primary/50 disabled:opacity-50"
            >
              <option value="">
                {availableSets.length === 0 ? "没有可添加题集" : "选择题集给 AI 审核"}
              </option>
              {availableSets.map((set) => (
                <option key={set.id} value={set.id}>{set.title}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleRequestClassification}
              disabled={!selectedSetId || isClassifying}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary/10 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/15 disabled:opacity-40"
            >
              {isClassifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
              AI 审核
            </button>
          </div>

          {classificationError && (
            <div className="flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-5 text-red-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{classificationError}</span>
            </div>
          )}

          {review && (
            <ClassificationReviewPanel
              review={review}
              isConfirming={isConfirmingReview}
              onChangeChapter={updateReviewChapter}
              onTogglePoint={toggleReviewPoint}
              onConfirm={confirmReview}
              onUseCurrentScope={confirmCurrentScope}
              onCancel={() => setReview(null)}
            />
          )}
        </div>
      ) : (
        <p className="mt-3 text-[11px] leading-5 text-on-surface-variant/70">
          管理员登录后可以调整题集归属。
        </p>
      )}
    </div>
  );
}

function ClassificationReviewPanel({
  review,
  isConfirming,
  onChangeChapter,
  onTogglePoint,
  onConfirm,
  onUseCurrentScope,
  onCancel,
}: {
  review: ClassificationReviewState;
  isConfirming: boolean;
  onChangeChapter: (chapterId: string) => void;
  onTogglePoint: (pointId: string) => void;
  onConfirm: () => void;
  onUseCurrentScope: () => void;
  onCancel: () => void;
}) {
  const selectedChapter = getChapterOption(review.selectedChapterId);
  const selectedPointSet = new Set(review.selectedPointIds);

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            AI 审核结果
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-on-surface-variant">{review.noteTitle}</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
          aria-label="取消审核"
          title="取消审核"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {review.recommendations.length > 0 ? (
        <div className="mb-3 space-y-2">
          {review.recommendations.map((recommendation, index) => (
            <RecommendationCard
              key={recommendation.chapterId}
              recommendation={recommendation}
              index={index}
            />
          ))}
        </div>
      ) : (
        <p className="mb-3 rounded-md bg-surface-container-lowest px-3 py-2 text-xs leading-5 text-on-surface-variant">
          AI 没有返回可用章节。你可以在下方手动选择最终章节，或者仍放入当前栏。
        </p>
      )}

      <div className="space-y-2">
        <label className="block text-[11px] font-semibold text-on-surface-variant">
          人工确认最终章节
        </label>
        <select
          value={review.selectedChapterId}
          onChange={(event) => onChangeChapter(event.target.value)}
          className="h-9 w-full rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-2 text-xs text-on-surface outline-none focus:border-primary/50"
        >
          {math3KnowledgeAreas.map((area) => (
            <optgroup key={area.id} label={area.title}>
              {area.chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {selectedChapter && (
        <div className="mt-3">
          <div className="mb-2 text-[11px] font-semibold text-on-surface-variant">
            相关知识点
          </div>
          <div className="max-h-36 overflow-y-auto rounded-md bg-surface-container-lowest p-2">
            <div className="flex flex-wrap gap-1.5">
              {selectedChapter.chapter.points.map((pointItem) => (
                <button
                  key={pointItem.id}
                  type="button"
                  onClick={() => onTogglePoint(pointItem.id)}
                  aria-pressed={selectedPointSet.has(pointItem.id)}
                  className={`rounded-full border px-2 py-1 text-[11px] transition-colors ${
                    selectedPointSet.has(pointItem.id)
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-outline-variant/30 text-on-surface-variant hover:border-primary/30 hover:text-primary"
                  }`}
                >
                  {pointItem.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onUseCurrentScope}
          disabled={isConfirming}
          className="inline-flex h-8 items-center justify-center rounded-lg border border-outline-variant/30 px-3 text-xs font-medium text-on-surface-variant transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-40"
        >
          仍放入当前栏
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isConfirming || !review.selectedChapterId}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          {isConfirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          确认放入
        </button>
      </div>
    </div>
  );
}

function RecommendationCard({
  recommendation,
  index,
}: {
  recommendation: Math3ClassificationRecommendation;
  index: number;
}) {
  const chapter = getMath3ChapterById(recommendation.chapterId);
  const pointTitles = recommendation.pointIds
    .map((pointId) => getMath3PointById(pointId)?.point.title)
    .filter((title): title is string => Boolean(title));

  return (
    <div className="rounded-md bg-surface-container-lowest px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
          推荐 {index + 1}
        </span>
        <span className="text-xs font-medium text-on-surface">
          {chapter ? `${chapter.area.title} / ${chapter.chapter.title}` : recommendation.chapterId}
        </span>
        <span className="text-[11px] text-on-surface-variant">
          可信度 {getConfidenceLabel(recommendation.confidence)} · {Math.round(recommendation.confidence * 100)}%
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-5 text-on-surface-variant">{recommendation.reason}</p>
      {pointTitles.length > 0 && (
        <p className="mt-1 line-clamp-2 text-[11px] text-on-surface-variant/80">
          知识点：{pointTitles.join("、")}
        </p>
      )}
      {recommendation.evidence.length > 0 && (
        <p className="mt-1 line-clamp-2 text-[11px] text-on-surface-variant/80">
          依据：{recommendation.evidence.join("；")}
        </p>
      )}
    </div>
  );
}

function ChapterBlock({
  areaId,
  chapter,
  problemSets,
  starredSet,
  masteredSet,
  collapsed,
  isAdmin,
  isLoadingProblemSets,
  updatingScopeKey,
  onToggleStar,
  onToggleMastered,
  onToggleChapter,
  onToggleProblemSetLink,
  onStartPractice,
}: {
  areaId: Math3KnowledgeAreaId;
  chapter: VisibleChapter;
  problemSets: Note[];
  starredSet: Set<string>;
  masteredSet: Set<string>;
  collapsed: boolean;
  isAdmin: boolean;
  isLoadingProblemSets: boolean;
  updatingScopeKey: string | null;
  onToggleStar: (pointId: string) => void;
  onToggleMastered: (pointId: string) => void;
  onToggleChapter: () => void;
  onToggleProblemSetLink: (
    scope: Math3PracticeScope,
    noteId: string,
    linked: boolean,
    pointIds?: string[],
  ) => Promise<void>;
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

  return (
    <article className="overflow-hidden rounded-lg border border-outline-variant/20 bg-surface-container-lowest">
      <div className="border-b border-outline-variant/20 bg-surface-container-low px-4 py-4">
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
              {linkedSetIds.length} 题集
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
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-container-lowest">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${chapterProgressPercent}%` }}
          />
        </div>
      </div>

      {!collapsed && (
        <div className="divide-y divide-outline-variant/15">
          <div className="p-4">
            <ProblemSetLinkPanel
              scope={scope}
              title="题集子栏"
              problemSets={problemSets}
              linkedSetIds={linkedSetIds}
              isAdmin={isAdmin}
              isLoadingProblemSets={isLoadingProblemSets}
              updatingScopeKey={updatingScopeKey}
              onToggleProblemSetLink={onToggleProblemSetLink}
            />
          </div>
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
    <div className={`grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center ${mastered ? "bg-emerald-500/[0.03]" : ""}`}>
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
            <span key={tag} className="rounded-full bg-surface-container-low px-2 py-0.5 text-xs text-on-surface-variant">
              {tag}
            </span>
          ))}
        </div>
        <p className="mt-2 text-sm font-medium leading-6 text-on-surface">{pointItem.title}</p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleMastered}
          aria-pressed={mastered}
          aria-label={mastered ? "标为未掌握" : "标为已掌握"}
          title={mastered ? "标为未掌握" : "标为已掌握"}
          className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
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
          className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
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
