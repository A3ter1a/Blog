"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Calendar, Tag, Edit2, Trash2, ChevronDown, ChevronUp, BookOpen, BookMarked, Loader2, Clock, Layers, MessageCircle, PanelLeftClose, PanelLeftOpen, SlidersHorizontal } from "lucide-react";
import { notesApi } from "@/lib/supabase";
import type { PublicAiProfile } from "@/lib/ai-profile";
import { chaptersApi } from "@/lib/chapters-api";
import { subjectMap, typeMap, Note, Chapter, Problem, type ProblemPracticeStatus } from "@/lib/types";
import { estimateReadingTime, getDescendantIds } from "@/lib/utils";
import { getNoteReadPath } from "@/lib/note-routes";
import { getRootChapters } from "@/lib/chapter-utils";
import { getPracticeProblemKey, getVisibleNoteTags } from "@/lib/math3-practice";
import { toPracticeStatusMap } from "@/lib/problem-practice";
import { problemPracticeApi } from "@/lib/problem-practice-api";
import { getProblemValidationIssues, normalizeProblem } from "@/lib/problem-utils";
import { Playlist } from "@/components/video/Playlist";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { AssistantDock } from "@/components/ai-assistant/AssistantDock";
import { ProblemCard } from "@/components/problems/ProblemCard";
import { ProblemList } from "@/components/problems/ProblemList";
import { ChapterFilter } from "@/components/chapters/ChapterFilter";
import { ProblemReferenceContent } from "@/components/problems/ProblemReferenceContent";
import { TableOfContents } from "@/components/ui/TableOfContents";
import { useReadingPreferences } from "@/lib/useReadingPreferences";
import { ReadingProgress } from "@/components/ui/ReadingProgress";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useToast } from "@/components/ui/Toast";
import { overlayMotion, surfaceMotion, uiMotion } from "@/lib/motion";
import { detectBookletSourceDrift, extractBookletSourceManifest, type BookletProblemSnapshot } from "@/lib/booklet-contract";

type NoteReaderClientProps = {
  noteId: string;
  initialNote: Note | null;
  initialChapters?: Chapter[];
  initialChaptersLoaded?: boolean;
  initialLoadError?: boolean;
  accessScope?: "public" | "owner";
};

type PracticeStatusLoadState = "idle" | "loading" | "ready" | "error";

const INITIAL_PROBLEM_WINDOW_SIZE = 12;
const PROBLEM_WINDOW_INCREMENT = 12;

function getProblemGroupKey(group: { chapter: Chapter | undefined }): string {
  return group.chapter?.id ?? "ungrouped";
}

function getGroupProblemWindowKey(groupKey: string): string {
  return `group:${groupKey}`;
}

function getFlatProblemWindowKey(selectedChapterId?: string): string {
  return `flat:${selectedChapterId ?? "all"}`;
}

export function NoteReaderClient({
  noteId,
  initialNote,
  initialChapters = [],
  initialChaptersLoaded = false,
  initialLoadError = false,
  accessScope = "public",
}: NoteReaderClientProps) {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const { isAdmin } = useAdminAuth();
  const toast = useToast();
  const [note, setNote] = useState<Note | null>(initialNote);
  const [authorProfile, setAuthorProfile] = useState<PublicAiProfile | null>(null);
  const [loading, setLoading] = useState(initialLoadError || !initialNote);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingNote, setIsDeletingNote] = useState(false);
  const [isCoverExpanded, setIsCoverExpanded] = useState(Boolean(initialNote?.coverImage));
  const [isImmersiveMode, setIsImmersiveMode] = useState(false);
  const [inlineVideoIndex, setInlineVideoIndex] = useState<number | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);
  const [selectedChapterId, setSelectedChapterId] = useState<string | undefined>(undefined);
  const [showProblemTools, setShowProblemTools] = useState(false);
  const [practiceStatusMap, setPracticeStatusMap] = useState<Record<string, ProblemPracticeStatus>>({});
  const [practiceStatusLoadState, setPracticeStatusLoadState] = useState<PracticeStatusLoadState>("idle");
  const [markingProblemKey, setMarkingProblemKey] = useState<string | null>(null);
  const [problemGroupExpansion, setProblemGroupExpansion] = useState<Record<string, boolean>>({});
  const [visibleProblemCounts, setVisibleProblemCounts] = useState<Record<string, number>>({});
  const [visibleProblemStarts, setVisibleProblemStarts] = useState<Record<string, number>>({});
  const [bookletDriftCount, setBookletDriftCount] = useState<number | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantQuotedText, setAssistantQuotedText] = useState("");
  const [readerDirectoriesHidden, setReaderDirectoriesHidden] = useState(false);
  const readerDirectoriesBeforeAssistantRef = useRef(false);
  const skipInitialChapterFetchRef = useRef(initialChaptersLoaded);
  const lastHashScrollRef = useRef("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setNote(initialNote);
      setLoading(initialLoadError || !initialNote);
      setChapters(initialChapters);
      setSelectedChapterId(undefined);
      setIsCoverExpanded(Boolean(initialNote?.coverImage));
      setShowProblemTools(false);
      setPracticeStatusMap({});
      setPracticeStatusLoadState("idle");
      setMarkingProblemKey(null);
      setProblemGroupExpansion({});
       setVisibleProblemCounts({});
       setVisibleProblemStarts({});
        setAssistantOpen(false);
        setAssistantQuotedText("");
        setReaderDirectoriesHidden(false);
       skipInitialChapterFetchRef.current = initialChaptersLoaded;
    }, 0);

    return () => window.clearTimeout(timer);
  }, [accessScope, initialChapters, initialChaptersLoaded, initialLoadError, initialNote, noteId]);

  const loadNote = useCallback(async () => {
    try {
      setLoading(true);
      const data = accessScope === "owner"
        ? await notesApi.getEditableById(noteId)
        : await notesApi.getPublishedById(noteId);
      setNote(data);
      setIsCoverExpanded(Boolean(data?.coverImage));
    } catch (error) {
      console.error("Failed to load note:", error);
    } finally {
      setLoading(false);
    }
  }, [accessScope, noteId]);

  useEffect(() => {
    if (initialNote && !initialLoadError) return;
    const timer = window.setTimeout(() => {
      void loadNote();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialLoadError, initialNote, loadNote]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!note?.id || accessScope !== "public") {
        setAuthorProfile(null);
        return;
      }
      void notesApi.getAiAuthorProfile(note.id)
        .then(setAuthorProfile)
        .catch(() => setAuthorProfile(null));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [accessScope, note?.id]);

  // Load chapters for problem notes
  useEffect(() => {
    if (note?.type !== "problem") {
      const timer = window.setTimeout(() => {
        setChapters([]);
      }, 0);

      return () => window.clearTimeout(timer);
    }

    if (skipInitialChapterFetchRef.current) {
      skipInitialChapterFetchRef.current = false;
      return;
    }

    chaptersApi.getByNoteId(noteId)
      .then(setChapters)
      .catch(() => setChapters([]));
  }, [note?.type, noteId]);

  useEffect(() => {
    const manifest = extractBookletSourceManifest(note?.content ?? "");
    if (!isAdmin || manifest.length === 0) {
      queueMicrotask(() => setBookletDriftCount(null));
      return;
    }

    let cancelled = false;
    const sourceNoteIds = [...new Set(manifest.map((entry) => entry.sourceNoteId))];
    Promise.all(sourceNoteIds.map((id) => notesApi.getById(id)))
      .then((sourceNotes) => {
        if (cancelled) return;
        const byId = new Map(sourceNotes.filter((item): item is Note => Boolean(item)).map((item) => [item.id, item]));
        const currentSnapshots = manifest.flatMap((entry): BookletProblemSnapshot[] => {
          const sourceNote = byId.get(entry.sourceNoteId);
          const problem = sourceNote?.problems?.find((item) => item.id === entry.sourceProblemId);
          return problem ? [{
            sourceNoteId: entry.sourceNoteId,
            sourceProblemId: entry.sourceProblemId,
            sourceLabel: sourceNote?.title ?? "源题",
            question: problem.question,
            standardAnswer: problem.answer,
            explanation: problem.explanation ?? "",
            methodSummary: problem.tips ?? "",
          }] : [];
        });
        setBookletDriftCount(detectBookletSourceDrift(manifest, currentSnapshots).length);
      })
      .catch(() => {
        if (!cancelled) setBookletDriftCount(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isAdmin, note?.content]);

  // Derive filtered & grouped problems for chapter support
  const allProblems = useMemo(() => note?.problems || [], [note?.problems]);
  const filteredProblems = useMemo(() => {
    if (!selectedChapterId) return allProblems;
    const descendantIds = getDescendantIds(selectedChapterId, chapters);
    return allProblems.filter(p => p.chapterId && descendantIds.has(p.chapterId));
  }, [allProblems, chapters, selectedChapterId]);
  const selectedChapter = chapters.find(c => c.id === selectedChapterId);

  // Group problems by top-level chapter hierarchy when no filter is active
  const chapterGroups = useMemo(() => {
    if (selectedChapterId || chapters.length === 0) return null;
    const groups: { chapter: Chapter | undefined; problems: Problem[] }[] = [];
    const assignedProblemIds = new Set<string>();

    // First group by top-level chapters (with descendant problems)
    const topLevel = getRootChapters(chapters);
    topLevel.forEach(chapter => {
      const descendantIds = getDescendantIds(chapter.id, chapters);
      const chapterProblems = allProblems.filter(p => {
        if (!p.chapterId || !descendantIds.has(p.chapterId)) return false;
        assignedProblemIds.add(p.id);
        return true;
      });
      if (chapterProblems.length > 0) {
        groups.push({ chapter, problems: chapterProblems });
      }
    });

    // Ungrouped problems (no chapterId or chapter not in hierarchy)
    const ungrouped = allProblems.filter(p => !assignedProblemIds.has(p.id));
    if (ungrouped.length > 0) {
      groups.push({ chapter: undefined, problems: ungrouped });
    }

    return groups.length > 1 ? groups : null;
  }, [allProblems, chapters, selectedChapterId]);

  const expandProblemGroupForProblem = useCallback((problemId: string) => {
    if (!chapterGroups) return;
    const group = chapterGroups.find((candidate) => candidate.problems.some((problem) => problem.id === problemId));
    if (!group) return;
    const groupKey = getProblemGroupKey(group);
    setProblemGroupExpansion((current) => current[groupKey] === true
      ? current
      : { ...current, [groupKey]: true });
  }, [chapterGroups]);

  const ensureProblemRendered = useCallback((problemId: string) => {
    const group = chapterGroups?.find((candidate) => candidate.problems.some((problem) => problem.id === problemId));
    if (group) {
      const groupKey = getProblemGroupKey(group);
      const windowKey = getGroupProblemWindowKey(groupKey);
      const index = group.problems.findIndex((problem) => problem.id === problemId);
      const windowStart = Math.floor(index / INITIAL_PROBLEM_WINDOW_SIZE) * INITIAL_PROBLEM_WINDOW_SIZE;
      setProblemGroupExpansion(Object.fromEntries(
        (chapterGroups ?? []).map((candidate) => [getProblemGroupKey(candidate), getProblemGroupKey(candidate) === groupKey]),
      ));
      setVisibleProblemStarts((current) => ({ ...current, [windowKey]: windowStart }));
      setVisibleProblemCounts((current) => ({
        ...current,
        [windowKey]: Math.min(group.problems.length, windowStart + INITIAL_PROBLEM_WINDOW_SIZE),
      }));
      return;
    }

    const index = filteredProblems.findIndex((problem) => problem.id === problemId);
    if (index < 0) return;
    const windowKey = getFlatProblemWindowKey(selectedChapterId);
    const windowStart = Math.floor(index / INITIAL_PROBLEM_WINDOW_SIZE) * INITIAL_PROBLEM_WINDOW_SIZE;
    setVisibleProblemStarts((current) => ({ ...current, [windowKey]: windowStart }));
    setVisibleProblemCounts((current) => ({
      ...current,
      [windowKey]: Math.min(filteredProblems.length, windowStart + INITIAL_PROBLEM_WINDOW_SIZE),
    }));
  }, [chapterGroups, filteredProblems, selectedChapterId]);

  const loadMoreProblems = useCallback((windowKey: string, total: number) => {
    setVisibleProblemCounts((current) => ({
      ...current,
      [windowKey]: Math.min(
        total,
        (current[windowKey] ?? INITIAL_PROBLEM_WINDOW_SIZE) + PROBLEM_WINDOW_INCREMENT,
      ),
    }));
  }, []);

  const resetProblemWindow = useCallback((windowKey: string) => {
    setVisibleProblemStarts((current) => ({ ...current, [windowKey]: 0 }));
    setVisibleProblemCounts((current) => ({
      ...current,
      [windowKey]: INITIAL_PROBLEM_WINDOW_SIZE,
    }));
  }, []);

  const toggleProblemGroup = useCallback((groupKey: string, isExpanded: boolean) => {
    if (isExpanded) {
      setProblemGroupExpansion((current) => ({ ...current, [groupKey]: false }));
      return;
    }
    setProblemGroupExpansion(Object.fromEntries(
      (chapterGroups ?? []).map((candidate) => [getProblemGroupKey(candidate), getProblemGroupKey(candidate) === groupKey]),
    ));
  }, [chapterGroups]);
  const visibleTags = useMemo(() => getVisibleNoteTags(note?.tags ?? []), [note?.tags]);
  const unassignedProblemCount = useMemo(
    () => allProblems.filter((problem) => !problem.chapterId).length,
    [allProblems],
  );
  const problemStatusNoteId = isAdmin && note?.type === "problem" ? note.id : "";

  useEffect(() => {
    if (!problemStatusNoteId || allProblems.length === 0) {
      const timer = window.setTimeout(() => {
        setPracticeStatusMap({});
        setPracticeStatusLoadState("idle");
        setMarkingProblemKey(null);
      }, 0);

      return () => window.clearTimeout(timer);
    }

    let cancelled = false;

    const loadingTimer = window.setTimeout(() => {
      if (!cancelled) setPracticeStatusLoadState("loading");
    }, 0);

    problemPracticeApi.getByNoteId(problemStatusNoteId)
      .then((statuses) => {
        if (cancelled) return;
        setPracticeStatusMap(toPracticeStatusMap(statuses));
        setPracticeStatusLoadState("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "未知错误";
        setPracticeStatusMap({});
        setPracticeStatusLoadState("error");
        toast.error(`题目标记状态加载失败：${message}`);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(loadingTimer);
    };
  }, [allProblems.length, problemStatusNoteId, toast]);

  useEffect(() => {
    if (!note?.id) return;

    const rawHash = window.location.hash.slice(1);
    if (!rawHash) return;

    let targetId = rawHash;
    try {
      targetId = decodeURIComponent(rawHash);
    } catch {
      targetId = rawHash;
    }

    const scrollKey = `${note.id}:${targetId}`;
    if (lastHashScrollRef.current === scrollKey) return;

    const expansionTimer = targetId.startsWith("problem-")
      ? window.setTimeout(() => ensureProblemRendered(targetId.slice("problem-".length)), 0)
      : null;

    const scrollToTarget = () => {
      const target = document.getElementById(targetId);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      lastHashScrollRef.current = scrollKey;
    };

    const frame = window.requestAnimationFrame(scrollToTarget);
    const timer = window.setTimeout(scrollToTarget, 180);
    const lateTimer = window.setTimeout(scrollToTarget, 520);

    return () => {
      window.cancelAnimationFrame(frame);
      if (expansionTimer !== null) window.clearTimeout(expansionTimer);
      window.clearTimeout(timer);
      window.clearTimeout(lateTimer);
    };
  }, [allProblems.length, ensureProblemRendered, note?.content, note?.id]);

  const handleDelete = async () => {
    if (!isAdmin || isDeletingNote) return;
    setIsDeletingNote(true);
    try {
      await notesApi.delete(noteId);
      setShowDeleteConfirm(false);
      toast.success("笔记已删除");
      router.push("/notes");
    } catch (error: unknown) {
      console.error("Failed to delete note:", error);
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`删除失败：${message}`);
      setIsDeletingNote(false);
    }
  };

  const handleUpdateProblem = async (updatedProblem: Problem) => {
    if (!isAdmin) throw new Error("需要管理员登录后才能保存题目");
    if (!note) throw new Error("笔记尚未加载完成");

    const normalizedProblem = normalizeProblem(updatedProblem);
    const validationIssues = getProblemValidationIssues(normalizedProblem);
    if (validationIssues.length > 0) {
      const message = validationIssues[0];
      toast.error(message);
      throw new Error(message);
    }

    const previousNote = note;
    const updatedProblems = (previousNote.problems || []).map(p =>
      p.id === normalizedProblem.id ? normalizedProblem : p
    );

    // Optimistic update
    setNote({ ...previousNote, problems: updatedProblems });
    try {
      const savedNote = await notesApi.updateLight(
        previousNote.id,
        { problems: updatedProblems },
      );
      setNote(current => current?.id === previousNote.id
        ? { ...current, updatedAt: savedNote.updatedAt, contentVersion: savedNote.contentVersion }
        : current
      );
      toast.success("题目已保存");
    } catch (error: unknown) {
      console.error("Failed to update problem:", error);
      // Revert on failure
      setNote(current => current?.id === previousNote.id ? previousNote : current);
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`题目保存失败：${message}`);
      throw error;
    }
  };

  const handleToggleProblemMarked = async (problem: Problem) => {
    if (!isAdmin || practiceStatusLoadState !== "ready" || !note?.id || markingProblemKey) return;

    const statusKey = getPracticeProblemKey(note.id, problem.id);
    const currentStatus = practiceStatusMap[statusKey];
    const nextMarked = !currentStatus?.isMarked;
    setMarkingProblemKey(statusKey);

    try {
      const saved = await problemPracticeApi.setMarked(
        note.id,
        problem.id,
        nextMarked,
        currentStatus,
      );

      setPracticeStatusMap((current) => {
        const next = { ...current };
        if (saved) {
          next[getPracticeProblemKey(saved.noteId, saved.problemId)] = saved;
        } else {
          delete next[statusKey];
        }
        return next;
      });
      toast.success(nextMarked ? "已加入三刷收集" : "已取消标记");
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`标记保存失败：${message}`);
    } finally {
      setMarkingProblemKey((current) => current === statusKey ? null : current);
    }
  };

  const handleAssistantOpenChange = useCallback((nextOpen: boolean) => {
    setAssistantOpen(nextOpen);
    if (nextOpen) {
      if (!assistantOpen) readerDirectoriesBeforeAssistantRef.current = readerDirectoriesHidden;
      setReaderDirectoriesHidden(true);
      return;
    }
    setReaderDirectoriesHidden(readerDirectoriesBeforeAssistantRef.current);
  }, [assistantOpen, readerDirectoriesHidden]);

  const captureAssistantSelection = useCallback(() => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().replace(/\s+/g, " ").trim() ?? "";
    const anchorElement = selection?.anchorNode instanceof Element
      ? selection.anchorNode
      : selection?.anchorNode?.parentElement;
    if (!selectedText || !anchorElement?.closest("[data-note-reader-content]")) {
      setAssistantQuotedText("");
      return;
    }
    setAssistantQuotedText(selectedText.slice(0, 1_600));
  }, []);

  const handleAssistantQuotedTextConsumed = useCallback(() => {
    setAssistantQuotedText("");
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface px-4 pb-20 pt-24 sm:px-6">
        <div className="flex items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-on-surface-variant">加载笔记中...</span>
        </div>
      </main>
    );
  }

  if (!note) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface px-4 pb-20 pt-24 sm:px-6">
        <div className="surface-panel p-6 text-center">
          <h1 className="text-2xl font-bold text-on-surface mb-4">笔记不存在</h1>
          <Link
            href="/notes"
            className="text-primary hover:underline font-medium"
          >
            返回笔记列表
          </Link>
        </div>
      </main>
    );
  }

  const isProblem = note.type === "problem";
  const isEssay = note.type === "essay";
  const enableEconomicsTerms = note.subject === "economics";
  const enableEconomicsGraphs = note.subject === "economics" && !isProblem;
  const showReaderSidebar = !readerDirectoriesHidden && (isProblem ? showProblemTools : preferences.tocPosition !== "hidden");
  const readerWidthClass = preferences.contentWidth === "narrow"
    ? "mx-auto max-w-3xl"
    : preferences.contentWidth === "wide"
      ? "mx-auto max-w-5xl"
      : "mx-auto max-w-4xl";
  const contentColumnClass = showReaderSidebar ? "min-w-0 lg:col-span-9" : "min-w-0 lg:col-span-12";
  const contentOrderClass = !isProblem && preferences.tocPosition === "left" ? "lg:order-last" : "";
  const sidebarOrderClass = !isProblem && preferences.tocPosition === "left" ? "lg:order-first" : "";
  const markDisabledTitle = practiceStatusLoadState === "loading"
    ? "正在加载题目标记状态"
    : practiceStatusLoadState === "error"
      ? "题目标记状态加载失败，刷新后重试"
      : "登录管理员后可以标记题目";
  const getProblemPracticeProps = (problem: Problem) => {
    const statusKey = getPracticeProblemKey(note.id, problem.id);

    return {
      practiceStatus: practiceStatusMap[statusKey],
      isMarking: markingProblemKey === statusKey,
      canMark: isAdmin && practiceStatusLoadState === "ready",
      markDisabledTitle,
      onToggleMarked: isAdmin ? () => handleToggleProblemMarked(problem) : undefined,
    };
  };

  return (
    <main className={`page-template-reader min-h-screen pb-20 pt-20 ${assistantOpen ? "note-reader-assistant-open" : ""}`} data-page-template="reader" data-assistant-open={assistantOpen || undefined}>
      {/* Reading Progress Bar */}
      {preferences.showProgressBar && <ReadingProgress />}

      {/* Top Bar with Breadcrumb and Immersive Mode Button */}
      <div className="sticky top-20 z-30 border-b border-outline-variant/20 bg-surface/80 backdrop-blur-xl" data-print-hide>
        <div className="page-frame page-frame--wide flex flex-wrap items-center justify-between gap-3 py-3">
          <Link
            href="/notes"
            className="control-button h-9 px-3 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </Link>

          {readerDirectoriesHidden && !assistantOpen && (
            <button
              type="button"
              onClick={() => setReaderDirectoriesHidden(false)}
              className="note-reader-directory-reveal"
              title="显示目录栏"
              aria-label="显示目录栏"
            >
              <PanelLeftOpen className="h-4 w-4" />
              <span>目录</span>
            </button>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {isAdmin && (
              <button
                type="button"
                onMouseDown={captureAssistantSelection}
                onClick={() => handleAssistantOpenChange(true)}
                className={`control-button h-9 px-3 text-sm ${assistantOpen ? "control-button-selected" : ""}`}
                title="询问当前笔记的助手"
                aria-expanded={assistantOpen}
                aria-controls="assistant-dock"
              >
                <MessageCircle className="h-4 w-4" />
                <span className="hidden sm:inline">问助手</span>
              </button>
            )}
            {showReaderSidebar && !assistantOpen && (
              <button
                type="button"
                onClick={() => setReaderDirectoriesHidden(true)}
                className="control-button h-9 px-3 text-sm"
                title="隐藏目录栏"
                aria-label="隐藏目录栏"
              >
                <PanelLeftClose className="h-4 w-4" />
                <span className="hidden sm:inline">隐藏目录</span>
              </button>
            )}
            {isProblem && allProblems.length > 0 && (
              <button
                onClick={() => setShowProblemTools((value) => !value)}
                className={`control-button h-9 px-3 text-sm ${showProblemTools ? "control-button-selected" : ""}`}
                title="题集导航"
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">题集导航</span>
              </button>
            )}
            {/* Immersive Reading Button - Only for notes and essays */}
            {!isProblem && (
              <button
                onClick={() => setIsImmersiveMode(true)}
                className="control-button h-9 px-3 text-sm"
                title="沉浸阅读模式"
              >
                <BookMarked className="h-4 w-4" />
                <span className="hidden sm:inline">沉浸</span>
              </button>
            )}
            {isAdmin && (
              <>
                <Link
                  href={`/create?edit=${note.id}`}
                  className="control-button h-9 px-3 text-sm"
                >
                  <Edit2 className="h-4 w-4" />
                  编辑
                </Link>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isDeletingNote}
                  className="control-button control-button-danger h-9 px-3 text-sm"
                  title="删除笔记"
                  aria-label="删除笔记"
                >
                  {isDeletingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Cover Image (Collapsible) */}
      {note.coverImage && (
        <div className="page-frame page-frame--wide mb-6">
          <motion.div
            initial={false}
            animate={{ height: isCoverExpanded ? "auto" : 0 }}
            transition={{ duration: uiMotion.duration.reveal, ease: uiMotion.ease.emphasized }}
            className="overflow-hidden"
          >
            <div className="overflow-hidden rounded-2xl shadow-elevated">
              {/* eslint-disable-next-line @next/next/no-img-element -- Saved cover images can be data URLs or arbitrary user-provided URLs. */}
              <img
                src={note.coverImage}
                alt={note.title}
                className="w-full object-cover max-h-[480px]"
              />
            </div>
          </motion.div>
          <button
            onClick={() => setIsCoverExpanded(!isCoverExpanded)}
            className="motion-ui motion-interactive mt-2 flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-on-surface-variant hover:bg-primary/10 hover:text-primary"
          >
            {isCoverExpanded ? (
              <>
                <ChevronUp className="w-3 h-3" />
                收起封面
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                展开封面
              </>
            )}
          </button>
        </div>
      )}

      {bookletDriftCount !== null && bookletDriftCount > 0 && (
        <div className="page-frame page-frame--wide mb-4">
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-semibold">检测到 {bookletDriftCount} 道源题已变化或不存在</div>
              <p className="mt-1 leading-6">当前三刷笔记仍保留生成时快照，不会自动覆盖。需要更新时，请回到做题本重新预览并生成新的私人笔记。</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Layout: Content + Sidebar */}
      <div className="page-frame page-frame--wide grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        {/* Article Content */}
        <div className={`${contentColumnClass} ${contentOrderClass}`}>
          {/* Article Header */}
          <motion.header
            variants={surfaceMotion}
            initial="initial"
            animate="animate"
            transition={{ duration: uiMotion.duration.page, ease: uiMotion.ease.emphasized }}
            className={`surface-panel reader-title-block p-6 sm:p-8 ${isProblem ? "" : readerWidthClass}`}
          >
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                  isProblem
                    ? "border-primary/20 bg-primary text-on-primary"
                    : isEssay
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-outline-variant/30 bg-surface-container-low text-on-surface"
                }`}
              >
                {typeMap[note.type]}
              </span>
              {note.subject && (
                <span className="tag-chip px-2.5 py-1 text-xs font-medium">
                  {subjectMap[note.subject]}
                </span>
              )}
              {!note.isPublished && (
                <span className="rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  私人内容 · 仅登录可见
                </span>
              )}
            </div>

            <h1 className="mb-4 font-headline text-2xl font-bold leading-tight text-on-surface sm:text-3xl md:text-4xl">
              {note.title}
            </h1>

            {authorProfile && preferences.showRoleplay && (
              <Link
                href={`/ai-profiles/${authorProfile.id}`}
                className="mb-4 inline-flex min-h-11 items-center gap-3 rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 transition duration-200 hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
              >
                <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {authorProfile.avatar_url ? <img src={authorProfile.avatar_url} alt="" className="h-full w-full object-cover" /> : authorProfile.display_name.slice(0, 1)}
                </span>
                <span className="text-left">
                  <strong className="block text-sm text-on-surface">{authorProfile.display_name}</strong>
                  <span className="block text-xs text-on-surface-variant">{subjectMap[authorProfile.subject]} · 查看资料</span>
                </span>
              </Link>
            )}

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-on-surface-variant">
              <span className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {note.createdAt.toLocaleDateString("zh-CN")}
              </span>
              {!isProblem && (
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  预计阅读 {estimateReadingTime(note.content)} 分钟
                </span>
              )}
              {visibleTags.length > 0 && (
                <span className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  <div className="flex flex-wrap items-center gap-2">
                  {visibleTags.map((tag) => (
                    <span
                      key={tag}
                      className="tag-chip px-2 py-1 text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                  </div>
                </span>
              )}
            </div>

            {isProblem && allProblems.length > 0 && (
              <div className="compact-meta-row mt-4 border-t border-outline-variant/10 pt-4">
                <span>当前 {filteredProblems.length} 题</span>
                <span>{selectedChapter?.name ?? "全部章节"}</span>
                {unassignedProblemCount > 0 && <span>未归章节 {unassignedProblemCount} 题</span>}
              </div>
            )}
          </motion.header>

          <ConfirmDialog
            isOpen={showDeleteConfirm}
            title="确认删除"
            description={<>确定要删除「{note.title}」吗？此操作不可撤销。</>}
            confirmLabel="确认删除"
            confirmingLabel="删除中"
            isWorking={isDeletingNote}
            onClose={() => setShowDeleteConfirm(false)}
            onConfirm={handleDelete}
          />

          {/* Inline Video Player (shown when clicking play in sidebar) */}
          <AnimatePresence>
            {inlineVideoIndex !== null && note.videos && note.videos[inlineVideoIndex] && (
              <motion.section
                variants={surfaceMotion}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: uiMotion.duration.page, ease: uiMotion.ease.emphasized }}
                className="mb-8"
              >
                <VideoPlayer 
                  video={note.videos[inlineVideoIndex]} 
                  autoPlay={true}
                  inlineMode={true}
                  onExitInline={() => setInlineVideoIndex(null)}
                />
              </motion.section>
            )}
          </AnimatePresence>

          {/* Article Content */}
          <motion.article
            data-note-reader-content
            variants={surfaceMotion}
            initial="initial"
            animate="animate"
            transition={{ delay: 0.06, duration: uiMotion.duration.page, ease: uiMotion.ease.emphasized }}
            className={`py-8 ${isProblem ? "" : readerWidthClass}`}
          >
            {isProblem && allProblems.length > 0 ? (
              <>
                {selectedChapter && (
                  <div className="mb-5 inline-flex items-center gap-2 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-sm font-medium text-primary">
                    <Layers className="h-4 w-4" />
                    {selectedChapter.name} · {filteredProblems.length} 题
                  </div>
                )}

                {/* Problem Cards - grouped by chapter or flat */}
                {chapterGroups && !selectedChapterId ? (
                  <div className="space-y-10">
                    {chapterGroups.map((group, groupIndex) => {
                      const groupKey = getProblemGroupKey(group);
                      const windowKey = getGroupProblemWindowKey(groupKey);
                      const isExpanded = problemGroupExpansion[groupKey]
                        ?? (Object.keys(problemGroupExpansion).length === 0 && groupIndex === 0);
                      const visibleStart = Math.min(
                        group.problems.length,
                        visibleProblemStarts[windowKey] ?? 0,
                      );
                      const visibleCount = Math.min(
                        group.problems.length,
                        visibleProblemCounts[windowKey] ?? INITIAL_PROBLEM_WINDOW_SIZE,
                      );

                      return (
                        <section key={groupKey} className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest/45">
                          <button
                            type="button"
                            onClick={() => toggleProblemGroup(groupKey, isExpanded)}
                            className="flex w-full items-center gap-3 px-4 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                            aria-expanded={isExpanded}
                            aria-controls={`problem-group-${groupKey}`}
                          >
                            <Layers className="h-5 w-5 shrink-0 text-primary" />
                            <span className="min-w-0 flex-1 font-headline text-lg font-bold text-on-surface">
                              {group.chapter?.name ?? "未归章节"}
                            </span>
                            <span className="text-xs font-semibold text-on-surface-variant">
                              {group.problems.length} 题
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 shrink-0 text-on-surface-variant" />
                            ) : (
                              <ChevronDown className="h-4 w-4 shrink-0 text-on-surface-variant" />
                            )}
                          </button>
                          {isExpanded ? (
                            <div id={`problem-group-${groupKey}`} className="space-y-6 border-t border-outline-variant/10 px-4 py-5">
                              {visibleStart > 0 && (
                                <button
                                  type="button"
                                  onClick={() => resetProblemWindow(windowKey)}
                                  className="control-button w-full border-dashed py-3 text-sm"
                                >
                                  返回本章开头 · 当前显示 {visibleStart + 1}–{visibleCount}/{group.problems.length}
                                </button>
                              )}
                              {group.problems.slice(visibleStart, visibleCount).map((problem) => (
                                <ProblemCard
                                  key={problem.id}
                                  problem={problem}
                                  index={allProblems.indexOf(problem)}
                                  noteId={note?.id}
                                  onUpdate={isAdmin ? handleUpdateProblem : undefined}
                                  {...getProblemPracticeProps(problem)}
                                />
                              ))}
                              {visibleCount < group.problems.length && (
                                <button
                                  type="button"
                                  onClick={() => loadMoreProblems(windowKey, group.problems.length)}
                                  className="control-button w-full border-dashed py-3 text-sm"
                                >
                                  继续加载 · 已显示 {visibleCount}/{group.problems.length}
                                </button>
                              )}
                            </div>
                          ) : null}
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  filteredProblems.length > 0 ? (
                    <div className="space-y-6">
                      {filteredProblems.slice(
                        Math.min(
                          filteredProblems.length,
                          visibleProblemStarts[getFlatProblemWindowKey(selectedChapterId)] ?? 0,
                        ),
                        Math.min(
                          filteredProblems.length,
                          visibleProblemCounts[getFlatProblemWindowKey(selectedChapterId)] ?? INITIAL_PROBLEM_WINDOW_SIZE,
                        ),
                      ).map((problem) => (
                        <ProblemCard
                          key={problem.id}
                          problem={problem}
                          index={allProblems.indexOf(problem)}
                          noteId={note?.id}
                          onUpdate={isAdmin ? handleUpdateProblem : undefined}
                          {...getProblemPracticeProps(problem)}
                        />
                      ))}
                      {(visibleProblemStarts[getFlatProblemWindowKey(selectedChapterId)] ?? 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => resetProblemWindow(getFlatProblemWindowKey(selectedChapterId))}
                          className="control-button w-full border-dashed py-3 text-sm"
                        >
                          返回当前章节开头
                        </button>
                      )}
                      {(visibleProblemCounts[getFlatProblemWindowKey(selectedChapterId)] ?? INITIAL_PROBLEM_WINDOW_SIZE) < filteredProblems.length && (
                        <button
                          type="button"
                          onClick={() => loadMoreProblems(getFlatProblemWindowKey(selectedChapterId), filteredProblems.length)}
                          className="control-button w-full border-dashed py-3 text-sm"
                        >
                          继续加载 · 已显示 {Math.min(
                            visibleProblemCounts[getFlatProblemWindowKey(selectedChapterId)] ?? INITIAL_PROBLEM_WINDOW_SIZE,
                            filteredProblems.length,
                          )}/{filteredProblems.length}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="surface-panel border-dashed px-4 py-12 text-center text-sm text-on-surface-variant">
                      当前章节暂时没有题目。
                    </div>
                  )
                )}
              </>
            ) : (
              <>
                <ProblemReferenceContent
                  content={note.content}
                  className="reader-content text-on-surface"
                  style={{
                    fontSize: `${preferences.fontSize}px`,
                    lineHeight: preferences.lineHeight,
                  }}
                  enableEconomicsTerms={enableEconomicsTerms}
                  enableEconomicsGraphs={enableEconomicsGraphs}
                />
              </>
            )}
          </motion.article>
        </div>

        {/* Sidebar: Video Player + TOC (hidden when TOC is hidden) */}
        {showReaderSidebar && (
          <aside className={`min-w-[280px] space-y-4 lg:col-span-3 ${sidebarOrderClass}`}>
            <AnimatePresence>
              {note.videos && note.videos.length > 0 && (
                <motion.section
                  variants={surfaceMotion}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ delay: 0.08, duration: uiMotion.duration.page, ease: uiMotion.ease.emphasized }}
                  className="surface-panel p-4 overscroll-contain lg:sticky lg:top-28"
                >
                  <Playlist 
                    videos={note.videos} 
                    editable={false}
                    onPlay={(index) => setInlineVideoIndex(index)}
                  />
                </motion.section>
              )}
            </AnimatePresence>

            {/* Table of Contents for notes/essays, or Problem Stats for problems */}
            <AnimatePresence>
              <motion.section
                variants={surfaceMotion}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ delay: 0.1, duration: uiMotion.duration.page, ease: uiMotion.ease.emphasized }}
                className="surface-panel p-4 lg:sticky lg:top-28 lg:flex lg:max-h-[calc(100vh-8rem)] lg:flex-col"
              >
                {isProblem && allProblems.length > 0 ? (
                  <div className="overflow-y-scroll flex-1 min-h-0 -mr-2 pr-2 space-y-4">
                    <ChapterFilter
                      chapters={chapters}
                      selectedId={selectedChapterId}
                      onSelect={setSelectedChapterId}
                    />
                    <ProblemList
                      problems={filteredProblems}
                      noteId={note.id}
                      statusMap={practiceStatusMap}
                      onProblemNavigate={ensureProblemRendered}
                    />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-outline-variant/10 shrink-0">
                      <BookOpen className="w-4 h-4 text-on-surface-variant" />
                      <h3 className="text-sm font-bold text-on-surface">目录</h3>
                    </div>
                    <div className="overflow-y-scroll flex-1 min-h-0 -mr-2 pr-2">
                      <TableOfContents content={note.content} />
                    </div>
                  </>
                )}
              </motion.section>
            </AnimatePresence>
          </aside>
        )}
      </div>

      <AssistantDock
        noteId={note.id}
        noteTitle={note.title}
        sourcePath={getNoteReadPath(note)}
        open={assistantOpen}
        onOpenChange={handleAssistantOpenChange}
        quotedText={assistantQuotedText}
        onQuotedTextConsumed={handleAssistantQuotedTextConsumed}
      />

      {/* Immersive Reading Mode */}
      <AnimatePresence>
        {isImmersiveMode && (
          <motion.div
            variants={overlayMotion}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: uiMotion.duration.page, ease: uiMotion.ease.standard }}
            className="fixed inset-0 z-[100] bg-surface-container-lowest overflow-y-auto"
            onClick={() => setIsImmersiveMode(false)}
          >
            {/* Immersive Header */}
            <motion.div
              variants={surfaceMotion}
              initial="initial"
              animate="animate"
              transition={{ duration: uiMotion.duration.page, ease: uiMotion.ease.emphasized }}
              className="sticky top-0 bg-surface-container-lowest/80 backdrop-blur-xl border-b border-outline-variant/10 z-10"
            >
              <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
                <button
                  onClick={() => setIsImmersiveMode(false)}
                  className="motion-ui inline-flex items-center gap-2 text-on-surface-variant hover:text-primary"
                >
                  <ArrowLeft className="w-4 h-4" />
                  退出沉浸模式
                </button>
                <div className="flex items-center gap-3 text-xs text-on-surface-variant">
                  <span className="px-2 py-1 rounded-md bg-surface-container-high">
                    {typeMap[note.type]}
                  </span>
                  {note.subject && (
                    <span>{subjectMap[note.subject]}</span>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Immersive Content */}
            <motion.div
              variants={surfaceMotion}
              initial="initial"
              animate="animate"
              transition={{ delay: 0.06, duration: uiMotion.duration.page, ease: uiMotion.ease.emphasized }}
              className={`${readerWidthClass} px-6 py-12`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Title */}
              <motion.h1
                variants={surfaceMotion}
                initial="initial"
                animate="animate"
                transition={{ delay: 0.1, duration: uiMotion.duration.page, ease: uiMotion.ease.emphasized }}
                className="text-4xl md:text-5xl font-bold text-on-surface mb-8 font-headline leading-tight"
              >
                {note.title}
              </motion.h1>

              {/* Meta Info */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12, duration: uiMotion.duration.page, ease: uiMotion.ease.emphasized }}
                className="flex items-center gap-4 text-sm text-on-surface-variant mb-12 pb-8 border-b border-outline-variant/10"
              >
                <span className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {note.createdAt.toLocaleDateString("zh-CN")}
                </span>
                {!isProblem && (
                  <>
                    <span className="text-on-surface-variant/30">·</span>
                    <span className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      预计阅读 {estimateReadingTime(note.content)} 分钟
                    </span>
                  </>
                )}
                {visibleTags.length > 0 && (
                  <>
                    <span className="text-on-surface-variant/30">·</span>
                    <span className="flex items-center gap-2">
                      <Tag className="w-4 h-4" />
                      {visibleTags.join("、")}
                    </span>
                  </>
                )}
              </motion.div>

              {/* Content */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.14, duration: uiMotion.duration.page, ease: uiMotion.ease.standard }}
                className="prose prose-lg max-w-none"
              >
                {isProblem && allProblems.length > 0 ? (
                  <div className="space-y-8">
                    {/* Chapter indicator in immersive mode */}
                    {selectedChapter && (
                      <div className="flex items-center gap-2 text-sm text-on-surface-variant mb-2">
                        <Layers className="w-4 h-4" />
                        <span>{selectedChapter.name}</span>
                      </div>
                    )}
                    {filteredProblems.slice(
                      Math.min(
                        filteredProblems.length,
                        visibleProblemStarts[getFlatProblemWindowKey(selectedChapterId)] ?? 0,
                      ),
                      Math.min(
                        filteredProblems.length,
                        visibleProblemCounts[getFlatProblemWindowKey(selectedChapterId)] ?? INITIAL_PROBLEM_WINDOW_SIZE,
                      ),
                    ).map((problem) => (
                      <ProblemCard
                        key={problem.id}
                        problem={problem}
                        index={allProblems.indexOf(problem)}
                        noteId={note?.id}
                        onUpdate={isAdmin ? handleUpdateProblem : undefined}
                        {...getProblemPracticeProps(problem)}
                      />
                    ))}
                  </div>
                ) : (
                  <ProblemReferenceContent
                    content={note.content}
                    className="reader-content text-on-surface"
                    style={{
                      fontSize: `${preferences.fontSize}px`,
                      lineHeight: preferences.lineHeight,
                    }}
                    enableEconomicsTerms={enableEconomicsTerms}
                    enableEconomicsGraphs={enableEconomicsGraphs}
                  />
                )}
              </motion.div>

              {/* Bottom spacer */}
              <div className="h-32" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
