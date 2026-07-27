"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bookmark,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Eye,
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
import { flattenPracticeProblems, getPracticeProblemKey, type PracticeProblemItem } from "@/lib/math3-practice";
import {
  buildBookletNoteMarkdown,
  buildBookletSourceManifest,
  calculateBookletMarkdownSnapshotSha256,
  calculateBookletProblemSha256,
  validateBookletProblemSnapshot,
  type BookletProblemSnapshot,
} from "@/lib/booklet-contract";
import { normalizeMarkdownForWrite } from "@/lib/content-contract";
import { buildAuthHeaders } from "@/lib/fetch-with-auth";
import { problemPracticeApi } from "@/lib/problem-practice-api";
import { getPrivateNoteReadPath } from "@/lib/note-routes";
import { notesApi } from "@/lib/supabase";
import type { Difficulty, Note, ProblemPracticeStatus, ProblemType, Subject } from "@/lib/types";
import { difficultyMap, problemTypeMap, subjectMap } from "@/lib/types";

type SubjectFilter = "all" | Subject;
type ProblemTypeFilter = "all" | ProblemType;
type DifficultyFilter = "all" | Difficulty;
type ExportTarget = "questions" | "answers";

const PROBLEM_SET_LIMIT = 200;
const MARKED_SET_ID = "__asteroid_marked_problem_set__";
const MARKED_SET_DATE = new Date(0);
const BOOKLET_RULE_VERSION = "asteroid-booklet-v2";

type MarkedStatusLoadState = "idle" | "loading" | "ready" | "error";

type BookletSet = Note & {
  helperText?: string;
  isMarkedVirtualSet?: boolean;
  problemCountHint?: number;
};

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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getSetProblemKeys(set: Note | undefined): string[] {
  return set ? flattenPracticeProblems([set]).map((problem) => problem.practiceKey) : [];
}

function getSetProblemCount(set: Note | undefined): number | undefined {
  return set ? set.problems?.length ?? 0 : undefined;
}

function isMarkedSetId(id: string): boolean {
  return id === MARKED_SET_ID;
}

function getMarkedProblemKeys(statuses: ProblemPracticeStatus[]): string[] {
  return statuses
    .filter((status) => status.isMarked)
    .map((status) => getPracticeProblemKey(status.noteId, status.problemId));
}

function getProblemKeysForSetIds(
  setIds: string[],
  loadedSets: Record<string, Note>,
  markedProblemKeySet: Set<string>,
): string[] {
  return unique(setIds.flatMap((id) => (
    isMarkedSetId(id) ? Array.from(markedProblemKeySet) : getSetProblemKeys(loadedSets[id])
  )));
}

function uniqueProblemsByKey(problems: PracticeProblemItem[]): PracticeProblemItem[] {
  const seen = new Set<string>();
  return problems.filter((problem) => {
    if (seen.has(problem.practiceKey)) return false;
    seen.add(problem.practiceKey);
    return true;
  });
}

function createMarkedSetSummary(count: number, loadState: MarkedStatusLoadState): BookletSet {
  return {
    id: MARKED_SET_ID,
    type: "problem",
    title: "已标记题目",
    content: "",
    tags: ["三刷标记", "已标记", "收藏"],
    problems: [],
    createdAt: MARKED_SET_DATE,
    updatedAt: MARKED_SET_DATE,
    isPublished: false,
    contentVersion: 1,
    helperText: loadState === "loading" ? "正在同步三刷标记" : "三刷收集",
    isMarkedVirtualSet: true,
    problemCountHint: loadState === "loading" ? undefined : count,
  };
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activePrintTarget, setActivePrintTarget] = useState<ExportTarget | null>(null);
  const [creatingNote, setCreatingNote] = useState(false);
  const [preparingBookletPreview, setPreparingBookletPreview] = useState(false);
  const [bookletSnapshots, setBookletSnapshots] = useState<BookletProblemSnapshot[]>([]);
  const [bookletReviewed, setBookletReviewed] = useState<boolean[]>([]);
  const [activeBookletReviewIndex, setActiveBookletReviewIndex] = useState(0);
  const [bookletReviewOpen, setBookletReviewOpen] = useState(false);
  const [markedStatuses, setMarkedStatuses] = useState<ProblemPracticeStatus[]>([]);
  const [markedStatusLoadState, setMarkedStatusLoadState] = useState<MarkedStatusLoadState>("idle");

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

  const selectedSetIdSet = useMemo(() => new Set(selectedSetIds), [selectedSetIds]);
  const selectedActualSetIds = useMemo(
    () => selectedSetIds.filter((id) => !isMarkedSetId(id)),
    [selectedSetIds],
  );
  const markedSetSelected = selectedSetIdSet.has(MARKED_SET_ID);
  const markedProblemKeys = useMemo(() => getMarkedProblemKeys(markedStatuses), [markedStatuses]);
  const markedProblemKeySet = useMemo(() => new Set(markedProblemKeys), [markedProblemKeys]);
  const markedSourceNoteIds = useMemo(
    () => unique(markedStatuses.map((status) => status.noteId)),
    [markedStatuses],
  );
  const requiredSetIds = useMemo(
    () => unique([
      ...selectedActualSetIds,
      ...(markedSetSelected ? markedSourceNoteIds : []),
    ]),
    [markedSetSelected, markedSourceNoteIds, selectedActualSetIds],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadMarkedStatuses() {
      setMarkedStatusLoadState("loading");
      try {
        const statuses = await problemPracticeApi.getMarked();
        if (cancelled) return;

        setMarkedStatuses(statuses);
        setMarkedStatusLoadState("ready");
      } catch (error) {
        if (cancelled) return;

        const message = error instanceof Error ? error.message : "未知错误";
        setMarkedStatuses([]);
        setMarkedStatusLoadState("error");
        toast.error(`已标记题目加载失败：${message}`);
      }
    }

    void loadMarkedStatuses();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    const missingIds = requiredSetIds.filter((id) => !loadedSets[id]);
    if (missingIds.length === 0) return;

    let cancelled = false;

    async function loadSelectedSets() {
      try {
        const validSets = await notesApi.getPracticeSets(missingIds);
        if (cancelled) return;

        const validIds = new Set(validSets.map((set) => set.id));
        const invalidIds = missingIds.filter((id) => !validIds.has(id));
        const selectedActualIdSet = new Set(selectedActualSetIds);

        if (validSets.length > 0) {
          setLoadedSets((current) => {
            const next = { ...current };
            for (const set of validSets) next[set.id] = set;
            return next;
          });
          setSelectedProblemKeys((current) => unique([
            ...current,
            ...validSets.flatMap((set) => {
              const problemKeys = getSetProblemKeys(set);
              return [
                ...(selectedActualIdSet.has(set.id) ? problemKeys : []),
                ...(markedSetSelected ? problemKeys.filter((key) => markedProblemKeySet.has(key)) : []),
              ];
            }),
          ]));
        }

        if (invalidIds.length > 0) {
          const invalidIdSet = new Set(invalidIds);
          setSelectedSetIds((current) => current.filter((id) => !invalidIdSet.has(id)));
          setMarkedStatuses((current) => current.filter((status) => !invalidIdSet.has(status.noteId)));
          toast.error("部分题集无法读取，已从做题本选择中移除。");
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "未知错误";
          const failedIdSet = new Set(missingIds);
          const failedMarkedSource = markedSourceNoteIds.some((id) => failedIdSet.has(id));
          setSelectedSetIds((current) => current.filter((id) => (
            !failedIdSet.has(id) && (!failedMarkedSource || !isMarkedSetId(id))
          )));
          toast.error(`题目加载失败：${message}`);
        }
      }
    }

    void loadSelectedSets();
    return () => {
      cancelled = true;
    };
  }, [loadedSets, markedProblemKeySet, markedSetSelected, markedSourceNoteIds, requiredSetIds, selectedActualSetIds, toast]);

  useEffect(() => () => {
    printCleanupRef.current?.();
  }, []);

  const selectedProblemKeySet = useMemo(() => new Set(selectedProblemKeys), [selectedProblemKeys]);
  const normalizedSetQuery = normalizeQuery(setQuery);
  const normalizedProblemQuery = normalizeQuery(problemQuery);

  const markedSetSummary = useMemo(
    () => createMarkedSetSummary(markedProblemKeys.length, markedStatusLoadState),
    [markedProblemKeys.length, markedStatusLoadState],
  );

  const visibleSets = useMemo<BookletSet[]>(() => {
    const queryMatches = (set: Note) => !normalizedSetQuery
      || set.title.toLowerCase().includes(normalizedSetQuery)
      || set.tags.join(" ").toLowerCase().includes(normalizedSetQuery);
    const subjectMatches = (set: Note) => subject === "all" || set.subject === subject;

    const regularSets = summaries.filter((set) => subjectMatches(set) && queryMatches(set));
    const shouldShowMarkedSet = markedSetSelected
      || markedStatusLoadState === "loading"
      || markedProblemKeys.length > 0;

    if (shouldShowMarkedSet && queryMatches(markedSetSummary)) {
      return [markedSetSummary, ...regularSets];
    }

    return regularSets;
  }, [
    markedProblemKeys.length,
    markedSetSelected,
    markedSetSummary,
    markedStatusLoadState,
    normalizedSetQuery,
    subject,
    summaries,
  ]);

  const selectedActualProblemSets = useMemo(
    () => selectedActualSetIds.map((id) => loadedSets[id]).filter((set): set is Note => Boolean(set)),
    [loadedSets, selectedActualSetIds],
  );
  const markedProblemSourceSets = useMemo(
    () => markedSetSelected
      ? markedSourceNoteIds.map((id) => loadedSets[id]).filter((set): set is Note => Boolean(set))
      : [],
    [loadedSets, markedSetSelected, markedSourceNoteIds],
  );
  const loadingSets = requiredSetIds.some((id) => !loadedSets[id])
    || (markedSetSelected && markedStatusLoadState === "loading");
  const loadedProblems = useMemo(() => uniqueProblemsByKey([
    ...flattenPracticeProblems(selectedActualProblemSets),
    ...flattenPracticeProblems(markedProblemSourceSets).filter((problem) => markedProblemKeySet.has(problem.practiceKey)),
  ]), [markedProblemKeySet, markedProblemSourceSets, selectedActualProblemSets]);
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

  const removeSetIdsFromSelection = (idsToRemove: string[]) => {
    const idSet = new Set(idsToRemove);
    const remainingSetIds = selectedSetIds.filter((id) => !idSet.has(id));
    const removedProblemKeys = new Set(getProblemKeysForSetIds(idsToRemove, loadedSets, markedProblemKeySet));
    const remainingProblemKeys = new Set(getProblemKeysForSetIds(remainingSetIds, loadedSets, markedProblemKeySet));

    setSelectedSetIds(remainingSetIds);
    setSelectedProblemKeys((current) => current.filter((key) => (
      !removedProblemKeys.has(key) || remainingProblemKeys.has(key)
    )));
  };

  const toggleSet = (id: string) => {
    if (selectedSetIdSet.has(id)) {
      removeSetIdsFromSelection([id]);
      return;
    }
    setSelectedSetIds((current) => unique([...current, id]));
    setSelectedProblemKeys((current) => unique([
      ...current,
      ...getProblemKeysForSetIds([id], loadedSets, markedProblemKeySet),
    ]));
  };

  const toggleVisibleSets = () => {
    if (visibleSetIds.length === 0) return;
    if (allVisibleSetsSelected) {
      removeSetIdsFromSelection(visibleSetIds);
      return;
    }
    setSelectedSetIds((current) => unique([...current, ...visibleSetIds]));
    setSelectedProblemKeys((current) => unique([
      ...current,
      ...getProblemKeysForSetIds(visibleSetIds, loadedSets, markedProblemKeySet),
    ]));
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

  const openPrivateBookletReview = async () => {
    if (selectedProblems.length === 0 || preparingBookletPreview) {
      if (selectedProblems.length === 0) toast.info("先选择要放入笔记的题目");
      return;
    }
    setPreparingBookletPreview(true);
    try {
      const snapshots = await Promise.all(selectedProblems.map(async (problem): Promise<BookletProblemSnapshot> => {
        const snapshot: BookletProblemSnapshot = {
          sourceNoteId: problem.sourceNoteId,
          sourceProblemId: problem.id,
          sourceContentVersion: problem.sourceContentVersion,
          sourceLabel: `${problem.sourceNoteTitle} · 原题集第 ${problem.sourceProblemIndex + 1} 题`,
          question: problem.question,
          standardAnswer: problem.answer,
          explanation: problem.explanation ?? "",
          methodSummary: problem.tips ?? "",
        };
        return { ...snapshot, sourceChecksum: await calculateBookletProblemSha256(snapshot) };
      }));
      setBookletSnapshots(snapshots);
      setBookletReviewed(snapshots.map(() => false));
      setActiveBookletReviewIndex(0);
      setBookletReviewOpen(true);
    } catch (error) {
      toast.error(`做题本预览准备失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setPreparingBookletPreview(false);
    }
  };

  const createPrivateBookletNote = async () => {
    if (bookletSnapshots.length === 0 || creatingNote) return;
    const invalidIndex = bookletSnapshots.findIndex((snapshot) => !validateBookletProblemSnapshot(snapshot).valid);
    if (invalidIndex >= 0) {
      const missing = validateBookletProblemSnapshot(bookletSnapshots[invalidIndex]).missingFields;
      const labels = {
        question: "题目",
        standardAnswer: "标准答案",
        explanation: "详细解析",
        methodSummary: "方法总结",
      };
      toast.error(`第 ${invalidIndex + 1} 题缺少${missing.map((field) => labels[field]).join("、")}，补齐后才能生成正式三刷笔记。`);
      setActiveBookletReviewIndex(invalidIndex);
      return;
    }
    const unreviewedIndex = bookletReviewed.findIndex((reviewed) => !reviewed);
    if (unreviewedIndex >= 0 || bookletReviewed.length !== bookletSnapshots.length) {
      toast.error(`请逐题核对方法总结；第 ${Math.max(0, unreviewedIndex) + 1} 题尚未确认。`);
      setActiveBookletReviewIndex(Math.max(0, unreviewedIndex));
      return;
    }

    setCreatingNote(true);
    try {
      const dateLabel = new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const title = `三刷做题本 · ${dateLabel}`;
      const content = normalizeMarkdownForWrite(buildBookletNoteMarkdown(bookletSnapshots), "editor");
      const snapshotChecksum = await calculateBookletMarkdownSnapshotSha256(content);
      const sourceRefs = buildBookletSourceManifest(bookletSnapshots);
      const response = await fetch("/api/booklets", {
        method: "POST",
        headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          title,
          content,
          sourceRefs,
          ruleVersion: BOOKLET_RULE_VERSION,
          snapshotChecksum,
          methodSummaryConfirmed: true,
        }),
      });
      const payload = asRecord(await response.json().catch(() => ({})));
      let noteId = "";
      if (response.ok) {
        const result = asRecord(payload.result);
        noteId = typeof result.noteId === "string" ? result.noteId : "";
        if (!noteId) throw new Error("数据库没有返回做题本笔记 ID");
      } else if (response.status === 409) {
        const note = await notesApi.create({
          type: "note",
          title,
          content,
          subject: "math",
          tags: ["三刷做题本", "错题复盘", "自动快照"],
          isPublished: false,
        });
        noteId = note.id;
      } else {
        throw new Error(typeof payload.error === "string" ? payload.error : "做题本原子创建失败");
      }
      setBookletReviewOpen(false);
      toast.success("三刷做题本已保存到私人笔记");
      window.location.assign(getPrivateNoteReadPath(noteId));
    } catch (error) {
      toast.error(`生成私人笔记失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setCreatingNote(false);
    }
  };

  return (
    <>
      <div className="no-print">
        <PageHeader
          width="workspace"
          title="做题本"
          description="批量选择题目，导出 iPad 横屏一题一页的题目册；答案册独立导出。"
          stats={[
            { label: "题集", value: summaries.length },
            { label: "已标记", value: markedStatusLoadState === "loading" ? "..." : markedProblemKeys.length, tone: "text-amber-600" },
            { label: "已选题集", value: selectedSetIds.length },
            { label: "入册题目", value: selectedProblems.length, tone: "text-primary" },
          ]}
        />
      </div>

      <PageShell width="workspace" topPadding="content" className="no-print">
        <section className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[19rem_minmax(0,1fr)] 2xl:grid-cols-[20rem_minmax(0,1fr)]">
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
            <div className="command-bar p-3 sm:p-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_minmax(9.5rem,11rem)_minmax(9.5rem,11rem)] 2xl:grid-cols-[minmax(20rem,1fr)_10rem_10rem_auto] 2xl:items-center">
                <SearchBox value={problemQuery} onChange={setProblemQuery} placeholder="搜索题干、选项或来源" />
                <SelectControl value={problemType} options={typeOptions} onChange={(value) => setProblemType(value as ProblemTypeFilter)} />
                <SelectControl value={difficulty} options={difficultyOptions} onChange={(value) => setDifficulty(value as DifficultyFilter)} />
                <div className="flex flex-wrap gap-2 lg:col-span-3 2xl:col-span-1 2xl:justify-end">
                  <button type="button" onClick={toggleVisibleProblems} disabled={visibleProblems.length === 0} className="control-button h-11 whitespace-nowrap px-3 text-sm max-sm:flex-1">
                    {allVisibleProblemsSelected ? "取消当前题目" : "选择当前题目"}
                  </button>
                  <button type="button" onClick={resetSelection} disabled={selectedSetIds.length === 0} className="control-button h-11 w-11 p-0 text-sm" title="重置选择" aria-label="重置选择">
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => exportPdfFile("questions")} disabled={selectedProblems.length === 0} className="control-button control-button-primary h-11 whitespace-nowrap px-3 text-sm max-sm:flex-1">
                    <FileDown className="h-4 w-4" />
                    导出题目册
                  </button>
                  <button type="button" onClick={() => exportPdfFile("answers")} disabled={selectedProblems.length === 0} className="control-button h-11 whitespace-nowrap px-3 text-sm max-sm:flex-1">
                    <Printer className="h-4 w-4" />
                    导出答案册
                  </button>
                  <button type="button" onClick={openPrivateBookletReview} disabled={selectedProblems.length === 0 || preparingBookletPreview} className="control-button h-11 whitespace-nowrap px-3 text-sm max-sm:flex-1">
                    {preparingBookletPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                    预览并确认入笔记
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
                <span className="tag-chip px-2 py-0.5">{visibleProblems.length} 个结果</span>
                <span className="tag-chip px-2 py-0.5">{selectedProblems.length} 题入册</span>
                <span>生成笔记前会强制检查题目、答案、详细解析与方法总结。</span>
                {loadingSets && <span className="inline-flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />加载题目</span>}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] 2xl:grid-cols-[minmax(22rem,24rem)_minmax(0,1fr)]">
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

      {bookletReviewOpen && (
        <BookletNoteReviewDialog
          snapshots={bookletSnapshots}
          reviewed={bookletReviewed}
          activeIndex={activeBookletReviewIndex}
          creating={creatingNote}
          onActiveIndexChange={setActiveBookletReviewIndex}
          onSnapshotChange={(index, next) => {
            setBookletSnapshots((current) => current.map((snapshot, snapshotIndex) => snapshotIndex === index ? next : snapshot));
            setBookletReviewed((current) => current.map((value, snapshotIndex) => snapshotIndex === index ? false : value));
          }}
          onReviewedChange={(index, value) => setBookletReviewed((current) => current.map((reviewed, snapshotIndex) => snapshotIndex === index ? value : reviewed))}
          onClose={() => { if (!creatingNote) setBookletReviewOpen(false); }}
          onConfirm={() => { void createPrivateBookletNote(); }}
        />
      )}

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

function BookletNoteReviewDialog({
  snapshots,
  reviewed,
  activeIndex,
  creating,
  onActiveIndexChange,
  onSnapshotChange,
  onReviewedChange,
  onClose,
  onConfirm,
}: {
  snapshots: BookletProblemSnapshot[];
  reviewed: boolean[];
  activeIndex: number;
  creating: boolean;
  onActiveIndexChange: (index: number) => void;
  onSnapshotChange: (index: number, snapshot: BookletProblemSnapshot) => void;
  onReviewedChange: (index: number, value: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const snapshot = snapshots[activeIndex];
  if (!snapshot) return null;
  const validation = validateBookletProblemSnapshot(snapshot);
  const reviewedCount = reviewed.filter(Boolean).length;
  const allReady = reviewedCount === snapshots.length
    && snapshots.every((item) => validateBookletProblemSnapshot(item).valid);
  const updateField = (field: "question" | "standardAnswer" | "explanation" | "methodSummary", value: string) => {
    onSnapshotChange(activeIndex, { ...snapshot, [field]: value });
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-3 sm:p-6" role="presentation" onClick={onClose}>
      <section className="surface-panel flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden" role="dialog" aria-modal="true" aria-label="三刷做题本入笔记预览" onClick={(event) => event.stopPropagation()}>
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant/20 p-4 sm:p-5">
          <div>
            <div className="text-xs font-semibold text-primary">入笔记前人工确认</div>
            <h2 className="mt-1 text-lg font-semibold text-on-surface">逐题核对四段快照</h2>
            <p className="mt-1 text-sm text-on-surface-variant">题目、答案、详细解析、方法总结都会直接显示在私人笔记；方法总结必须逐题确认。</p>
          </div>
          <button type="button" onClick={onClose} disabled={creating} className="control-button h-9 w-9 p-0" aria-label="关闭预览"><X className="h-4 w-4" /></button>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <aside className="overflow-y-auto border-b border-outline-variant/20 p-3 lg:border-b-0 lg:border-r">
            <div className="mb-3 text-xs text-on-surface-variant">已确认 {reviewedCount}/{snapshots.length} 题</div>
            <div className="grid grid-cols-5 gap-2 lg:grid-cols-3">
              {snapshots.map((item, index) => (
                <button
                  key={`${item.sourceNoteId}-${item.sourceProblemId}-${index}`}
                  type="button"
                  onClick={() => onActiveIndexChange(index)}
                  className={`control-button h-9 px-2 text-xs ${index === activeIndex ? "control-button-primary" : ""}`}
                  aria-label={`查看第 ${index + 1} 题`}
                >
                  {reviewed[index] ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                  {index + 1}
                </button>
              ))}
            </div>
          </aside>

          <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs text-on-surface-variant">第 {activeIndex + 1}/{snapshots.length} 题</div>
                <div className="mt-1 text-sm font-semibold text-on-surface">{snapshot.sourceLabel}</div>
              </div>
              {!validation.valid && <span className="text-xs text-red-600">仍缺少 {validation.missingFields.length} 项</span>}
            </div>

            <div className="mt-4 grid gap-4">
              <ReviewTextarea label="题目" value={snapshot.question} onChange={(value) => updateField("question", value)} rows={5} />
              <ReviewTextarea label="标准答案" value={snapshot.standardAnswer} onChange={(value) => updateField("standardAnswer", value)} rows={4} />
              <ReviewTextarea label="详细解析" value={snapshot.explanation} onChange={(value) => updateField("explanation", value)} rows={6} />
              <ReviewTextarea label="方法总结" value={snapshot.methodSummary} onChange={(value) => updateField("methodSummary", value)} rows={5} emphasis />
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-primary/25 bg-primary/[0.05] p-3 text-sm text-on-surface">
              <input
                type="checkbox"
                checked={Boolean(reviewed[activeIndex])}
                disabled={!validation.valid}
                onChange={(event) => onReviewedChange(activeIndex, event.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>我已对照本题内容，确认方法总结准确、可复用，并同意把这四段内容写入不可变快照区。</span>
            </label>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/20 p-4">
          <div className="flex gap-2">
            <button type="button" onClick={() => onActiveIndexChange(Math.max(0, activeIndex - 1))} disabled={activeIndex === 0 || creating} className="control-button h-10 px-3 text-sm"><ChevronLeft className="h-4 w-4" />上一题</button>
            <button type="button" onClick={() => onActiveIndexChange(Math.min(snapshots.length - 1, activeIndex + 1))} disabled={activeIndex === snapshots.length - 1 || creating} className="control-button h-10 px-3 text-sm">下一题<ChevronRight className="h-4 w-4" /></button>
          </div>
          <button type="button" onClick={onConfirm} disabled={!allReady || creating} className="control-button control-button-primary h-11 px-4 text-sm">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
            {allReady ? "确认快照并保存到私人笔记" : `还需确认 ${snapshots.length - reviewedCount} 题`}
          </button>
        </footer>
      </section>
    </div>
  );
}

function ReviewTextarea({ label, value, onChange, rows, emphasis = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  emphasis?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-xs text-on-surface-variant">
      <span className={emphasis ? "font-semibold text-primary" : "font-semibold text-on-surface"}>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} className="field-control resize-y px-3 py-2 text-sm leading-6 text-on-surface" />
    </label>
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
  sets: BookletSet[];
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
    <aside className="surface-panel flex flex-col p-3 sm:p-4 lg:sticky lg:top-24 lg:h-[calc(100vh-7rem)]">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-on-surface">题集</h2>
        <span className="tag-chip px-2 py-0.5 text-xs">{sets.length} 个</span>
      </div>
      <div className="shrink-0 space-y-3">
        <SearchBox value={query} onChange={onQueryChange} placeholder="搜索题集" compact />
        <SelectControl value={subject} options={subjectOptions} onChange={(value) => onSubjectChange(value as SubjectFilter)} compact />
        <button type="button" onClick={onToggleVisible} disabled={sets.length === 0} className="control-button h-10 w-full px-3 text-sm">
          {allVisibleSelected ? "取消当前题集" : "选择当前题集"}
        </button>
      </div>
      <div className="mt-4 min-h-[18rem] flex-1 space-y-2 overflow-y-auto pr-1 lg:min-h-0">
        {loading ? (
          <LoadingText text="加载题集..." />
        ) : error ? (
          <p className="py-4 text-sm text-red-600">{error}</p>
        ) : sets.length === 0 ? (
          <p className="py-4 text-sm text-on-surface-variant">没有匹配的题集。</p>
        ) : sets.map((set) => {
          const selected = selectedIds.has(set.id);
          const count = set.problemCountHint ?? getSetProblemCount(loadedSets[set.id]);
          const idleClass = set.isMarkedVirtualSet
            ? "border-amber-200/70 bg-amber-50/70 hover:border-amber-300/80 hover:bg-amber-50"
            : "border-outline-variant/20 bg-surface-container-low/70 hover:border-primary/25 hover:bg-surface-container-lowest";
          return (
            <button
              key={set.id}
              type="button"
              onClick={() => onToggleSet(set.id)}
              className={`w-full rounded-md border px-3 py-2.5 text-left transition-all ${selected ? "border-primary/40 bg-primary/[0.07] ring-1 ring-primary/15" : idleClass}`}
            >
              <div className="flex items-start gap-2">
                <SelectionIcon selected={selected} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {set.isMarkedVirtualSet && <Bookmark className="h-3.5 w-3.5 shrink-0 fill-amber-500 text-amber-500" />}
                    <div className="line-clamp-2 text-sm font-medium text-on-surface">{set.title || "未命名题集"}</div>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-on-surface-variant">
                    {set.subject && <span>{subjectMap[set.subject]}</span>}
                    {set.helperText && <span>{set.helperText}</span>}
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
    <section className="surface-panel flex flex-col p-3 sm:p-4 xl:sticky xl:top-24 xl:h-[calc(100vh-7rem)]">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-on-surface">题目</h2>
        <span className="tag-chip px-2 py-0.5 text-xs">{selectedCount}/{totalCount}</span>
      </div>
      <div className="min-h-[22rem] flex-1 space-y-2 overflow-y-auto pr-1 xl:min-h-0">
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
              className={`w-full rounded-md border px-3 py-2.5 text-left transition-all ${selected ? "border-primary/40 bg-primary/[0.07] ring-1 ring-primary/15" : "border-outline-variant/20 bg-surface-container-low/70 hover:border-primary/25 hover:bg-surface-container-lowest"}`}
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
    return <EmptyPanel className="min-h-[520px] bg-surface-container-lowest" icon={<BookOpen className="h-10 w-10 opacity-45" />} text="选择题目后预览题目册。" />;
  }

  return (
    <section className="min-w-0 space-y-3">
      <div className="surface-panel flex flex-wrap items-center justify-between gap-3 p-3 xl:sticky xl:top-24 xl:z-10">
        <div className="text-sm font-semibold text-on-surface">{problems.length} 页题目册</div>
        <button type="button" onClick={onPrintQuestions} className="control-button h-10 px-3 text-sm">
          <Printer className="h-4 w-4" />
          打印题目册
        </button>
      </div>
      <div className="space-y-4 rounded-lg bg-surface-container-low/45 p-3 sm:p-4">
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
      <section className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-neutral-800">详细解析</h3>
        <MarkdownContent
          content={problem.explanation?.trim() || "暂无解析；生成正式做题本前必须补充并确认。"}
          className="booklet-markdown text-neutral-950"
        />
      </section>
      <section className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-sky-900">方法总结</h3>
        <MarkdownContent
          content={problem.tips?.trim() || "暂无方法总结；生成正式做题本前必须补充并确认。"}
          className="booklet-markdown text-sky-950"
        />
      </section>
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
    <div className="relative min-w-0">
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
    <select value={value} onChange={(event) => onChange(event.target.value)} className={`field-control min-w-0 w-full px-3 text-sm ${compact ? "h-10" : "h-11"}`}>
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
