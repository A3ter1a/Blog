"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BookOpen,
  CheckSquare,
  FileDown,
  Loader2,
  Printer,
  RotateCcw,
  Search,
  Square,
  X,
} from "lucide-react";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { useToast } from "@/components/ui/Toast";
import { flattenPracticeProblems, type PracticeProblemItem } from "@/lib/math3-practice";
import { notesApi } from "@/lib/supabase";
import type { Difficulty, Note, ProblemType, Subject } from "@/lib/types";
import { difficultyMap, problemTypeMap, subjectMap } from "@/lib/types";

type SubjectFilter = "all" | Subject;
type ProblemTypeFilter = "all" | ProblemType;
type DifficultyFilter = "all" | Difficulty;
type ExportTarget = "questions" | "answers";

const PROBLEM_SET_LIMIT = 200;

const subjectOptions: Array<{ value: SubjectFilter; label: string }> = [
  { value: "all", label: "全部科目" },
  { value: "math", label: subjectMap.math },
  { value: "english", label: subjectMap.english },
  { value: "politics", label: subjectMap.politics },
  { value: "economics", label: subjectMap.economics },
];

const typeOptions: Array<{ value: ProblemTypeFilter; label: string }> = [
  { value: "all", label: "全部题型" },
  ...Object.entries(problemTypeMap).map(([value, label]) => ({ value: value as ProblemType, label })),
];

const difficultyOptions: Array<{ value: DifficultyFilter; label: string }> = [
  { value: "all", label: "全部难度" },
  ...Object.entries(difficultyMap).map(([value, label]) => ({ value: value as Difficulty, label })),
];

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase();
}

function getSetProblemKeys(set: Note | undefined): string[] {
  return set ? flattenPracticeProblems([set]).map((problem) => problem.practiceKey) : [];
}

function getSetProblemCount(set: Note | undefined): number | undefined {
  return set ? set.problems?.length ?? 0 : undefined;
}

function previewText(problem: PracticeProblemItem): string {
  const text = [
    problem.question,
    ...(problem.options ?? []).map((option) => `${option.label}. ${option.content}`),
  ]
    .join(" ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/[`*_>#~[\](){}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text.length > 120 ? `${text.slice(0, 120)}...` : text;
}

function matchesProblem(problem: PracticeProblemItem, query: string): boolean {
  if (!query) return true;
  return [
    problem.question,
    problem.sourceNoteTitle,
    ...(problem.options ?? []).map((option) => option.content),
  ].join(" ").toLowerCase().includes(query);
}

export function ProblemBooklet() {
  const toast = useToast();
  const printCleanupRef = useRef<(() => void) | null>(null);
  const printStartTimerRef = useRef<number | null>(null);
  const [summaries, setSummaries] = useState<Note[]>([]);
  const [loadedSets, setLoadedSets] = useState<Record<string, Note>>({});
  const [selectedSetIds, setSelectedSetIds] = useState<string[]>([]);
  const [selectedProblemKeys, setSelectedProblemKeys] = useState<string[]>([]);
  const [setQuery, setSetQuery] = useState("");
  const [problemQuery, setProblemQuery] = useState("");
  const [subject, setSubject] = useState<SubjectFilter>("all");
  const [problemType, setProblemType] = useState<ProblemTypeFilter>("all");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const [loadingSummaries, setLoadingSummaries] = useState(true);
  const [loadingSets, setLoadingSets] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activePrintTarget, setActivePrintTarget] = useState<ExportTarget | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSummaries() {
      setLoadingSummaries(true);
      setLoadError(null);
      try {
        const data = await notesApi.getSummaries({
          type: "problem",
          sortOrder: "desc",
          limit: PROBLEM_SET_LIMIT,
          offset: 0,
          includeCoverImage: false,
        });
        if (!cancelled) setSummaries(data);
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误";
        if (!cancelled) {
          setLoadError(message);
          toast.error(`题集列表加载失败：${message}`);
        }
      } finally {
        if (!cancelled) setLoadingSummaries(false);
      }
    }

    void loadSummaries();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    const missingIds = selectedSetIds.filter((id) => !loadedSets[id]);
    if (missingIds.length === 0) {
      setLoadingSets(false);
      return;
    }

    let cancelled = false;
    setLoadingSets(true);

    async function loadSelectedSets() {
      try {
        const results = await Promise.all(missingIds.map((id) => notesApi.getPracticeSet(id)));
        if (cancelled) return;

        const validSets = results.filter((set): set is Note => Boolean(set));
        setLoadedSets((current) => {
          const next = { ...current };
          for (const set of validSets) next[set.id] = set;
          return next;
        });
        setSelectedProblemKeys((current) => unique([
          ...current,
          ...validSets.flatMap((set) => getSetProblemKeys(set)),
        ]));
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "未知错误";
          toast.error(`题目加载失败：${message}`);
        }
      } finally {
        if (!cancelled) setLoadingSets(false);
      }
    }

    void loadSelectedSets();
    return () => {
      cancelled = true;
    };
  }, [loadedSets, selectedSetIds, toast]);

  useEffect(() => () => {
    printCleanupRef.current?.();
  }, []);

  const selectedSetIdSet = useMemo(() => new Set(selectedSetIds), [selectedSetIds]);
  const selectedProblemKeySet = useMemo(() => new Set(selectedProblemKeys), [selectedProblemKeys]);
  const normalizedSetQuery = normalizeQuery(setQuery);
  const normalizedProblemQuery = normalizeQuery(problemQuery);

  const visibleSets = useMemo(() => summaries.filter((set) => {
    const subjectMatches = subject === "all" || set.subject === subject;
    const queryMatches = !normalizedSetQuery
      || set.title.toLowerCase().includes(normalizedSetQuery)
      || set.tags.join(" ").toLowerCase().includes(normalizedSetQuery);
    return subjectMatches && queryMatches;
  }), [normalizedSetQuery, subject, summaries]);

  const loadedProblemSets = useMemo(
    () => selectedSetIds.map((id) => loadedSets[id]).filter((set): set is Note => Boolean(set)),
    [loadedSets, selectedSetIds],
  );
  const loadedProblems = useMemo(() => flattenPracticeProblems(loadedProblemSets), [loadedProblemSets]);
  const visibleProblems = useMemo(() => loadedProblems.filter((problem) => (
    (problemType === "all" || problem.type === problemType)
    && (difficulty === "all" || problem.difficulty === difficulty)
    && matchesProblem(problem, normalizedProblemQuery)
  )), [difficulty, loadedProblems, normalizedProblemQuery, problemType]);
  const selectedProblems = useMemo(
    () => loadedProblems.filter((problem) => selectedProblemKeySet.has(problem.practiceKey)),
    [loadedProblems, selectedProblemKeySet],
  );

  const visibleSetIds = visibleSets.map((set) => set.id);
  const allVisibleSetsSelected = visibleSetIds.length > 0 && visibleSetIds.every((id) => selectedSetIdSet.has(id));
  const allVisibleProblemsSelected = visibleProblems.length > 0
    && visibleProblems.every((problem) => selectedProblemKeySet.has(problem.practiceKey));

  const toggleSet = (id: string) => {
    if (selectedSetIdSet.has(id)) {
      const problemKeys = new Set(getSetProblemKeys(loadedSets[id]));
      setSelectedSetIds((current) => current.filter((item) => item !== id));
      setSelectedProblemKeys((current) => current.filter((key) => !problemKeys.has(key)));
      return;
    }
    setSelectedSetIds((current) => unique([...current, id]));
  };

  const toggleVisibleSets = () => {
    if (visibleSetIds.length === 0) return;
    if (allVisibleSetsSelected) {
      const ids = new Set(visibleSetIds);
      const problemKeys = new Set(visibleSetIds.flatMap((id) => getSetProblemKeys(loadedSets[id])));
      setSelectedSetIds((current) => current.filter((id) => !ids.has(id)));
      setSelectedProblemKeys((current) => current.filter((key) => !problemKeys.has(key)));
      return;
    }
    setSelectedSetIds((current) => unique([...current, ...visibleSetIds]));
  };

  const toggleProblem = (key: string) => {
    setSelectedProblemKeys((current) => (
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    ));
  };

  const toggleVisibleProblems = () => {
    const keys = visibleProblems.map((problem) => problem.practiceKey);
    if (keys.length === 0) return;
    if (allVisibleProblemsSelected) {
      const keySet = new Set(keys);
      setSelectedProblemKeys((current) => current.filter((key) => !keySet.has(key)));
      return;
    }
    setSelectedProblemKeys((current) => unique([...current, ...keys]));
  };

  const resetSelection = () => {
    setSelectedSetIds([]);
    setSelectedProblemKeys([]);
    setProblemQuery("");
    setProblemType("all");
    setDifficulty("all");
  };

  const exportPdfFile = (target: ExportTarget) => {
    if (selectedProblems.length === 0) {
      toast.info("先选择要导出的题目");
      return;
    }

    printCleanupRef.current?.();

    const previousTitle = document.title;
    const previousTarget = document.body.dataset.problemBookletPrint;
    const printMediaQuery = window.matchMedia("print");
    let fallbackCleanupTimer: number | null = null;
    let cleaned = false;

    function clearFallbackCleanup() {
      if (fallbackCleanupTimer !== null) {
        window.clearTimeout(fallbackCleanupTimer);
        fallbackCleanupTimer = null;
      }
    }

    function restorePrintState() {
      if (cleaned) return;
      cleaned = true;

      if (printStartTimerRef.current !== null) {
        window.clearTimeout(printStartTimerRef.current);
        printStartTimerRef.current = null;
      }

      clearFallbackCleanup();
      if (previousTarget) {
        document.body.dataset.problemBookletPrint = previousTarget;
      } else {
        delete document.body.dataset.problemBookletPrint;
      }
      document.title = previousTitle;
      window.removeEventListener("afterprint", finishPrint);
      printMediaQuery.removeEventListener("change", handlePrintMediaChange);
      printCleanupRef.current = null;
    }

    function finishPrint() {
      restorePrintState();
      setActivePrintTarget(null);
    }

    function handlePrintMediaChange(event: MediaQueryListEvent) {
      if (!event.matches) finishPrint();
    }

    printCleanupRef.current = restorePrintState;
    setActivePrintTarget(target);
    document.body.dataset.problemBookletPrint = target;
    document.title = target === "questions"
      ? `Asteroid-题目册-${selectedProblems.length}题`
      : `Asteroid-答案册-${selectedProblems.length}题`;
    window.addEventListener("afterprint", finishPrint);
    printMediaQuery.addEventListener("change", handlePrintMediaChange);
    fallbackCleanupTimer = window.setTimeout(finishPrint, 60_000);
    printStartTimerRef.current = window.setTimeout(() => {
      printStartTimerRef.current = null;
      window.print();
    }, 250);
  };

  return (
    <>
      <div className="no-print">
        <PageHeader
          width="wide"
          title="做题本"
          description="批量选择题目，导出 iPad 横屏一题一页的题目册；答案册独立导出。"
          stats={[
            { label: "题集", value: summaries.length },
            { label: "已选题集", value: selectedSetIds.length },
            { label: "已载入", value: loadedProblems.length },
            { label: "入册题目", value: selectedProblems.length, tone: "text-primary" },
          ]}
        />
      </div>

      <PageShell width="wide" topPadding="content" className="no-print">
        <section className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <SetPanel
            sets={visibleSets}
            loadedSets={loadedSets}
            selectedIds={selectedSetIdSet}
            query={setQuery}
            subject={subject}
            loading={loadingSummaries}
            error={loadError}
            allVisibleSelected={allVisibleSetsSelected}
            onQueryChange={setSetQuery}
            onSubjectChange={setSubject}
            onToggleSet={toggleSet}
            onToggleVisible={toggleVisibleSets}
          />

          <section className="min-w-0 space-y-4">
            <div className="surface-panel p-4">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_150px_150px_auto] xl:items-center">
                <SearchBox value={problemQuery} onChange={setProblemQuery} placeholder="搜索题干、选项或来源" />
                <SelectControl value={problemType} options={typeOptions} onChange={(value) => setProblemType(value as ProblemTypeFilter)} />
                <SelectControl value={difficulty} options={difficultyOptions} onChange={(value) => setDifficulty(value as DifficultyFilter)} />
                <div className="flex flex-wrap gap-2 xl:justify-end">
                  <button type="button" onClick={toggleVisibleProblems} disabled={visibleProblems.length === 0} className="control-button h-11 px-3 text-sm">
                    {allVisibleProblemsSelected ? "取消当前题目" : "选择当前题目"}
                  </button>
                  <button type="button" onClick={resetSelection} disabled={selectedSetIds.length === 0} className="control-button h-11 px-3 text-sm" title="清空选择">
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => exportPdfFile("questions")} disabled={selectedProblems.length === 0} className="control-button control-button-primary h-11 px-3 text-sm">
                    <FileDown className="h-4 w-4" />
                    导出题目文件
                  </button>
                  <button type="button" onClick={() => exportPdfFile("answers")} disabled={selectedProblems.length === 0} className="control-button h-11 px-3 text-sm">
                    <Printer className="h-4 w-4" />
                    导出答案文件
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
                <span className="tag-chip px-2 py-0.5">{visibleProblems.length} 个结果</span>
                <span className="tag-chip px-2 py-0.5">{selectedProblems.length} 题入册</span>
                {loadingSets && <span className="inline-flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />加载题目</span>}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <ProblemPicker
                problems={visibleProblems}
                selectedKeys={selectedProblemKeySet}
                selectedCount={selectedProblems.length}
                totalCount={loadedProblems.length}
                loading={loadingSets}
                hasSelectedSets={selectedSetIds.length > 0}
                onToggle={toggleProblem}
              />
              <BookletPreview problems={selectedProblems} onPrintQuestions={() => exportPdfFile("questions")} />
            </div>
          </section>
        </section>
      </PageShell>

      {activePrintTarget && (
        <PrintDeck
          className={activePrintTarget === "questions" ? "problem-booklet-questions" : "problem-booklet-answers"}
          problems={selectedProblems}
          type={activePrintTarget}
        />
      )}
    </>
  );
}

function SetPanel({
  sets,
  loadedSets,
  selectedIds,
  query,
  subject,
  loading,
  error,
  allVisibleSelected,
  onQueryChange,
  onSubjectChange,
  onToggleSet,
  onToggleVisible,
}: {
  sets: Note[];
  loadedSets: Record<string, Note>;
  selectedIds: Set<string>;
  query: string;
  subject: SubjectFilter;
  loading: boolean;
  error: string | null;
  allVisibleSelected: boolean;
  onQueryChange: (value: string) => void;
  onSubjectChange: (value: SubjectFilter) => void;
  onToggleSet: (id: string) => void;
  onToggleVisible: () => void;
}) {
  return (
    <aside className="surface-panel h-fit p-4 lg:sticky lg:top-24">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-on-surface">题集</h2>
        <span className="tag-chip px-2 py-0.5 text-xs">{sets.length} 个</span>
      </div>
      <div className="space-y-3">
        <SearchBox value={query} onChange={onQueryChange} placeholder="搜索题集" compact />
        <SelectControl value={subject} options={subjectOptions} onChange={(value) => onSubjectChange(value as SubjectFilter)} compact />
        <button type="button" onClick={onToggleVisible} disabled={sets.length === 0} className="control-button h-10 w-full px-3 text-sm">
          {allVisibleSelected ? "取消当前题集" : "选择当前题集"}
        </button>
      </div>
      <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
        {loading ? (
          <LoadingText text="加载题集..." />
        ) : error ? (
          <p className="py-4 text-sm text-red-600">{error}</p>
        ) : sets.length === 0 ? (
          <p className="py-4 text-sm text-on-surface-variant">没有匹配的题集。</p>
        ) : sets.map((set) => {
          const selected = selectedIds.has(set.id);
          const count = getSetProblemCount(loadedSets[set.id]);
          return (
            <button
              key={set.id}
              type="button"
              onClick={() => onToggleSet(set.id)}
              className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${selected ? "border-primary/30 bg-primary/[0.06]" : "border-outline-variant/20 bg-surface-container-low hover:border-primary/25"}`}
            >
              <div className="flex items-start gap-2">
                <SelectionIcon selected={selected} />
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-sm font-medium text-on-surface">{set.title || "未命名题集"}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-on-surface-variant">
                    {set.subject && <span>{subjectMap[set.subject]}</span>}
                    {count !== undefined && <span>{count} 题</span>}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function ProblemPicker({
  problems,
  selectedKeys,
  selectedCount,
  totalCount,
  loading,
  hasSelectedSets,
  onToggle,
}: {
  problems: PracticeProblemItem[];
  selectedKeys: Set<string>;
  selectedCount: number;
  totalCount: number;
  loading: boolean;
  hasSelectedSets: boolean;
  onToggle: (key: string) => void;
}) {
  return (
    <section className="surface-panel h-fit p-4 xl:sticky xl:top-24">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-on-surface">题目</h2>
        <span className="text-xs text-on-surface-variant">{selectedCount}/{totalCount}</span>
      </div>
      <div className="max-h-[640px] space-y-2 overflow-y-auto pr-1">
        {!hasSelectedSets ? (
          <EmptyPanel icon={<BookOpen className="h-8 w-8 opacity-50" />} text="先选择题集。" />
        ) : loading && totalCount === 0 ? (
          <EmptyPanel icon={<Loader2 className="h-6 w-6 animate-spin text-primary" />} text="加载题目..." />
        ) : problems.length === 0 ? (
          <EmptyPanel text="当前筛选下没有题目。" />
        ) : problems.map((problem) => {
          const selected = selectedKeys.has(problem.practiceKey);
          return (
            <button
              key={problem.practiceKey}
              type="button"
              onClick={() => onToggle(problem.practiceKey)}
              className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${selected ? "border-primary/30 bg-primary/[0.06]" : "border-outline-variant/20 bg-surface-container-low hover:border-primary/25"}`}
            >
              <div className="flex items-start gap-2">
                <SelectionIcon selected={selected} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-on-surface-variant">
                    <span className="font-semibold text-primary">#{problem.sourceProblemIndex + 1}</span>
                    <span>{problemTypeMap[problem.type]}</span>
                    <span>{difficultyMap[problem.difficulty]}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface">{previewText(problem) || "空题干"}</p>
                  <p className="mt-1 line-clamp-1 text-[11px] text-on-surface-variant">{problem.sourceNoteTitle}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function BookletPreview({ problems, onPrintQuestions }: { problems: PracticeProblemItem[]; onPrintQuestions: () => void }) {
  if (problems.length === 0) {
    return <EmptyPanel className="min-h-[520px]" icon={<BookOpen className="h-10 w-10 opacity-45" />} text="选择题目后预览题目册。" />;
  }

  return (
    <section className="min-w-0 space-y-3">
      <div className="surface-panel flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="text-sm font-semibold text-on-surface">{problems.length} 页题目册</div>
        <button type="button" onClick={onPrintQuestions} className="control-button h-10 px-3 text-sm">
          <Printer className="h-4 w-4" />
          打印题目
        </button>
      </div>
      <div className="space-y-4">
        {problems.map((problem, index) => (
          <QuestionPage key={problem.practiceKey} problem={problem} pageIndex={index} total={problems.length} />
        ))}
      </div>
    </section>
  );
}

function PrintDeck({ className, problems, type }: { className: string; problems: PracticeProblemItem[]; type: ExportTarget }) {
  return (
    <div className={`problem-booklet-print ${className}`}>
      {problems.map((problem, index) => (
        type === "questions" ? (
          <QuestionPage key={problem.practiceKey} problem={problem} pageIndex={index} total={problems.length} />
        ) : (
          <AnswerPage key={problem.practiceKey} problem={problem} pageIndex={index} total={problems.length} />
        )
      ))}
    </div>
  );
}

function QuestionPage({ problem, pageIndex, total }: { problem: PracticeProblemItem; pageIndex: number; total: number }) {
  const hasOptions = problem.type === "choice" && Array.isArray(problem.options) && problem.options.length > 0;
  return (
    <article className="booklet-page flex min-h-[420px] flex-col overflow-hidden rounded-lg border border-outline-variant/25 bg-white p-5 text-neutral-950 shadow-ambient sm:aspect-[4/3] sm:p-6">
      <BookletHeader problem={problem} pageIndex={pageIndex} total={total} label="题目" />
      <section className="booklet-question mt-5">
        <MarkdownContent content={problem.question || "空题干"} className="booklet-markdown text-[15px] leading-8 text-neutral-950" />
      </section>
      {hasOptions && (
        <section className="booklet-options mt-5 grid gap-3 sm:grid-cols-2">
          {problem.options?.map((option) => (
            <div key={`${option.label}-${option.content}`} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm font-semibold text-neutral-800 ring-1 ring-neutral-200">{option.label}</span>
              <MarkdownContent content={option.content} className="booklet-markdown min-w-0 text-neutral-950" compact />
            </div>
          ))}
        </section>
      )}
      <div className="booklet-answer-space mt-6 min-h-28 flex-1 rounded-lg border border-dashed border-neutral-300" />
    </article>
  );
}

function AnswerPage({ problem, pageIndex, total }: { problem: PracticeProblemItem; pageIndex: number; total: number }) {
  return (
    <article className="booklet-page flex min-h-[420px] flex-col overflow-hidden rounded-lg border border-outline-variant/25 bg-white p-5 text-neutral-950 shadow-ambient sm:aspect-[4/3] sm:p-6">
      <BookletHeader problem={problem} pageIndex={pageIndex} total={total} label="答案" />
      <section className="mt-5 rounded-lg border border-green-200 bg-green-50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-green-800">答案</h3>
        <MarkdownContent content={problem.answer || "暂无答案"} className="booklet-markdown text-green-950" />
      </section>
      {problem.explanation?.trim() && (
        <section className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-neutral-800">解析</h3>
          <MarkdownContent content={problem.explanation} className="booklet-markdown text-neutral-950" />
        </section>
      )}
    </article>
  );
}

function BookletHeader({ problem, pageIndex, total, label }: { problem: PracticeProblemItem; pageIndex: number; total: number; label: string }) {
  return (
    <header className="booklet-page-header flex flex-wrap items-start justify-between gap-3 border-b border-neutral-200 pb-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-neutral-600">
          <span className="rounded-md bg-neutral-100 px-2 py-1 text-neutral-900">第 {pageIndex + 1} 题</span>
          <span>{label}</span>
          <span>{problemTypeMap[problem.type]}</span>
          <span>{difficultyMap[problem.difficulty]}</span>
        </div>
        <p className="mt-2 line-clamp-1 text-xs text-neutral-500">
          {problem.sourceNoteTitle} · 原题集第 {problem.sourceProblemIndex + 1} 题
        </p>
      </div>
      <span className="shrink-0 text-xs text-neutral-400">{pageIndex + 1} / {total}</span>
    </header>
  );
}

function SearchBox({ value, onChange, placeholder, compact = false }: { value: string; onChange: (value: string) => void; placeholder: string; compact?: boolean }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant/50" />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={`field-control w-full px-9 text-sm ${compact ? "h-10" : "h-11"}`} />
      {value && (
        <button type="button" onClick={() => onChange("")} className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high" aria-label="清空搜索" title="清空搜索">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function SelectControl({ value, options, onChange, compact = false }: { value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; compact?: boolean }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className={`field-control w-full px-3 text-sm ${compact ? "h-10" : "h-11"}`}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function SelectionIcon({ selected }: { selected: boolean }) {
  return selected
    ? <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
    : <Square className="mt-0.5 h-4 w-4 shrink-0 text-on-surface-variant/50" />;
}

function LoadingText({ text }: { text: string }) {
  return <div className="flex items-center gap-2 py-4 text-sm text-on-surface-variant"><Loader2 className="h-4 w-4 animate-spin text-primary" />{text}</div>;
}

function EmptyPanel({ icon, text, className = "" }: { icon?: ReactNode; text: string; className?: string }) {
  return (
    <div className={`flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-outline-variant/30 p-6 text-center text-sm text-on-surface-variant ${className}`}>
      {icon}
      <p>{text}</p>
    </div>
  );
}
