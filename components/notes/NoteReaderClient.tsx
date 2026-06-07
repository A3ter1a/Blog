"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Calendar, Tag, Edit2, Trash2, AlertTriangle, ChevronDown, ChevronUp, BookOpen, BookMarked, Loader2, Clock, Layers, SlidersHorizontal } from "lucide-react";
import { notesApi } from "@/lib/supabase";
import { chaptersApi } from "@/lib/chapters-api";
import { subjectMap, typeMap, Note, Chapter, Problem } from "@/lib/types";
import { estimateReadingTime, getDescendantIds } from "@/lib/utils";
import { getRootChapters } from "@/lib/chapter-utils";
import { getVisibleNoteTags } from "@/lib/math3-practice";
import { getProblemValidationIssues, normalizeProblem } from "@/lib/problem-utils";
import { Playlist } from "@/components/video/Playlist";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { ProblemCard } from "@/components/problems/ProblemCard";
import { ProblemList } from "@/components/problems/ProblemList";
import { ChapterFilter } from "@/components/chapters/ChapterFilter";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { TableOfContents } from "@/components/ui/TableOfContents";
import { useReadingPreferences } from "@/lib/useReadingPreferences";
import { ReadingProgress } from "@/components/ui/ReadingProgress";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useToast } from "@/components/ui/Toast";

type NoteReaderClientProps = {
  noteId: string;
  initialNote: Note | null;
  initialChapters?: Chapter[];
  initialChaptersLoaded?: boolean;
  initialLoadError?: boolean;
};

export function NoteReaderClient({
  noteId,
  initialNote,
  initialChapters = [],
  initialChaptersLoaded = false,
  initialLoadError = false,
}: NoteReaderClientProps) {
  const router = useRouter();
  const { preferences } = useReadingPreferences();
  const { isAdmin } = useAdminAuth();
  const toast = useToast();
  const [note, setNote] = useState<Note | null>(initialNote);
  const [loading, setLoading] = useState(initialLoadError || !initialNote);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingNote, setIsDeletingNote] = useState(false);
  const [isCoverExpanded, setIsCoverExpanded] = useState(Boolean(initialNote?.coverImage));
  const [isImmersiveMode, setIsImmersiveMode] = useState(false);
  const [inlineVideoIndex, setInlineVideoIndex] = useState<number | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);
  const [selectedChapterId, setSelectedChapterId] = useState<string | undefined>(undefined);
  const [showProblemTools, setShowProblemTools] = useState(false);
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
      skipInitialChapterFetchRef.current = initialChaptersLoaded;
    }, 0);

    return () => window.clearTimeout(timer);
  }, [initialChapters, initialChaptersLoaded, initialLoadError, initialNote, noteId]);

  const loadNote = useCallback(async () => {
    try {
      setLoading(true);
      const data = await notesApi.getPublishedById(noteId);
      setNote(data);
      setIsCoverExpanded(Boolean(data?.coverImage));
    } catch (error) {
      console.error("Failed to load note:", error);
    } finally {
      setLoading(false);
    }
  }, [noteId]);

  useEffect(() => {
    if (initialNote && !initialLoadError) return;
    const timer = window.setTimeout(() => {
      void loadNote();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialLoadError, initialNote, loadNote]);

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
  const visibleTags = useMemo(() => getVisibleNoteTags(note?.tags ?? []), [note?.tags]);
  const unassignedProblemCount = useMemo(
    () => allProblems.filter((problem) => !problem.chapterId).length,
    [allProblems],
  );

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
      window.clearTimeout(timer);
      window.clearTimeout(lateTimer);
    };
  }, [allProblems.length, note?.content, note?.id]);

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
      const savedNote = await notesApi.updateLight(previousNote.id, { problems: updatedProblems });
      setNote(current => current?.id === previousNote.id
        ? { ...current, updatedAt: savedNote.updatedAt }
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

  if (loading) {
    return (
      <main className="pt-32 pb-20 px-6 min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-on-surface-variant">加载笔记中...</span>
        </div>
      </main>
    );
  }

  if (!note) {
    return (
      <main className="pt-32 pb-20 px-6 min-h-screen flex items-center justify-center">
        <div className="text-center">
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
  const showReaderSidebar = isProblem ? showProblemTools : preferences.tocPosition !== "hidden";
  const contentColumnClass = showReaderSidebar ? "lg:col-span-9" : "lg:col-span-12";

  return (
    <main className="min-h-screen pb-20 pt-20">
      {/* Reading Progress Bar */}
      {preferences.showProgressBar && <ReadingProgress />}

      {/* Top Bar with Breadcrumb and Immersive Mode Button */}
      <div className="sticky top-16 z-30 border-b border-outline-variant/20 bg-surface/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/notes"
            className="control-button h-9 px-3 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </Link>

          <div className="flex items-center gap-2">
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
        <div className="max-w-7xl mx-auto px-6 mb-6">
          <motion.div
            initial={false}
            animate={{ height: isCoverExpanded ? "auto" : 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl overflow-hidden shadow-elevated">
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
            className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary transition-colors mt-2"
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

      {/* Main Layout: Content + Sidebar */}
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 sm:px-6 lg:grid-cols-12">
        {/* Article Content */}
        <div className={contentColumnClass}>
          {/* Article Header */}
          <motion.header
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="surface-panel p-5 sm:p-6"
          >
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
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
            </div>

            <h1 className="mb-4 font-headline text-3xl font-bold leading-tight text-on-surface md:text-4xl">
              {note.title}
            </h1>

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

          {/* Delete Confirmation Modal */}
          <AnimatePresence>
            {showDeleteConfirm && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                onClick={() => {
                  if (!isDeletingNote) setShowDeleteConfirm(false);
                }}
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-surface-container-lowest rounded-xl shadow-elevated p-6 max-w-sm w-full mx-4"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                    </div>
                    <h3 className="text-lg font-bold text-on-surface">确认删除</h3>
                  </div>
                  <p className="text-sm text-on-surface-variant mb-6">
                    确定要删除「{note.title}」吗？此操作不可撤销。
                  </p>
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={isDeletingNote}
                      className="px-4 py-2 rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={isDeletingNote}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isDeletingNote && <Loader2 className="w-4 h-4 animate-spin" />}
                      {isDeletingNote ? "删除中" : "确认删除"}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Inline Video Player (shown when clicking play in sidebar) */}
          <AnimatePresence>
            {inlineVideoIndex !== null && note.videos && note.videos[inlineVideoIndex] && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className={`py-8 ${isProblem ? "" : "max-w-[78ch]"}`}
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
                    {chapterGroups.map(group => (
                      <section key={group.chapter?.id || 'ungrouped'}>
                        <div className="mb-4 flex items-center gap-3 border-b border-outline-variant/10 pb-2">
                          <Layers className="h-5 w-5 text-primary" />
                          <h3 className="font-headline text-lg font-bold text-on-surface">
                            {group.chapter?.name ?? "未归章节"}
                          </h3>
                          <span className="tag-chip px-2 py-0.5 text-xs">
                            {group.problems.length} 题
                          </span>
                        </div>
                        <div className="space-y-6">
                          {group.problems.map((problem) => (
                            <ProblemCard
                              key={problem.id}
                              problem={problem}
                              index={allProblems.indexOf(problem)}
                              noteId={note?.id}
                              onUpdate={isAdmin ? handleUpdateProblem : undefined}
                            />
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  filteredProblems.length > 0 ? (
                    <div className="space-y-6">
                      {filteredProblems.map((problem) => (
                        <ProblemCard
                          key={problem.id}
                          problem={problem}
                          index={allProblems.indexOf(problem)}
                          noteId={note?.id}
                          onUpdate={isAdmin ? handleUpdateProblem : undefined}
                        />
                      ))}
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
                <MarkdownContent 
                  content={note.content} 
                  className="text-on-surface-variant" 
                  style={{ fontSize: `${preferences.fontSize}px` }}
                />
              </>
            )}
          </motion.article>
        </div>

        {/* Sidebar: Video Player + TOC (hidden when TOC is hidden) */}
        {showReaderSidebar && (
          <aside className="min-w-[280px] space-y-4 lg:col-span-3">
            <AnimatePresence>
              {note.videos && note.videos.length > 0 && (
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: 0.3, duration: 0.5 }}
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
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: 0.35, duration: 0.5 }}
                className="surface-panel p-4 lg:sticky lg:top-28 lg:flex lg:max-h-[calc(100vh-8rem)] lg:flex-col"
              >
                {isProblem && allProblems.length > 0 ? (
                  <div className="overflow-y-scroll flex-1 min-h-0 -mr-2 pr-2 space-y-4">
                    <ChapterFilter
                      chapters={chapters}
                      selectedId={selectedChapterId}
                      onSelect={setSelectedChapterId}
                    />
                    <ProblemList problems={filteredProblems} />
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

      {/* Immersive Reading Mode */}
      <AnimatePresence>
        {isImmersiveMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-[100] bg-surface-container-lowest overflow-y-auto"
            onClick={() => setIsImmersiveMode(false)}
          >
            {/* Immersive Header */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="sticky top-0 bg-surface-container-lowest/80 backdrop-blur-xl border-b border-outline-variant/10 z-10"
            >
              <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
                <button
                  onClick={() => setIsImmersiveMode(false)}
                  className="inline-flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors duration-300"
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
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
              className="max-w-3xl mx-auto px-6 py-12"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Title */}
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className="text-4xl md:text-5xl font-bold text-on-surface mb-8 font-headline leading-tight"
              >
                {note.title}
              </motion.h1>

              {/* Meta Info */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.4 }}
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
                transition={{ delay: 0.6, duration: 0.6 }}
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
                    {filteredProblems.map((problem) => (
                      <ProblemCard key={problem.id} problem={problem} index={allProblems.indexOf(problem)} noteId={note?.id} onUpdate={isAdmin ? handleUpdateProblem : undefined} />
                    ))}
                  </div>
                ) : (
                  <MarkdownContent 
                    content={note.content} 
                    className="text-on-surface leading-relaxed text-lg" 
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
