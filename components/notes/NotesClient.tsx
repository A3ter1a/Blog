"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { SearchBar } from "@/components/notes/SearchBar";
import { TagFilter } from "@/components/notes/TagFilter";
import { NoteCard } from "@/components/notes/NoteCard";
import { ExportDialog } from "@/components/export/ExportDialog";
import { notesApi } from "@/lib/supabase";
import { NoteType, Subject, Note } from "@/lib/types";
import { CheckSquare, Square, Download, X, Trash2, AlertTriangle, Loader2, Plus, LibraryBig } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useToast } from "@/components/ui/Toast";
import { getNotesCacheKey, readNotesCache, writeNotesCache } from "@/lib/notes-list-cache";
import { NOTES_PAGE_SIZE, NOTES_SEARCH_RESULT_LIMIT } from "@/lib/notes-query";

interface NotesClientProps {
  initialNotes?: Note[];
  initialHasMoreNotes?: boolean;
  initialLoadError?: boolean;
}

export function NotesClient({
  initialNotes = [],
  initialHasMoreNotes = false,
  initialLoadError = false,
}: NotesClientProps) {
  const { isAdmin } = useAdminAuth();
  const toast = useToast();
  const initialRouteReadyRef = useRef(!initialLoadError);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<NoteType | "all">("all");
  const [selectedSubject, setSelectedSubject] = useState<Subject | "all">("all");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  
  // Data state
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [loading, setLoading] = useState(initialLoadError);
  const [hasMoreNotes, setHasMoreNotes] = useState(initialHasMoreNotes);
  const [isRefreshingNotes, setIsRefreshingNotes] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  // Selection state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportNotes, setExportNotes] = useState<Note[]>([]);
  const [isPreparingExport, setIsPreparingExport] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingNotes, setIsDeletingNotes] = useState(false);
  const latestLoadId = useRef(0);
  const latestCoverLoadId = useRef(0);
  const notesRef = useRef<Note[]>(initialNotes);

  const setVisibleNotes = useCallback((nextNotes: Note[]) => {
    notesRef.current = nextNotes;
    setNotes(nextNotes);
  }, []);

  const visibleNoteIdsKey = useMemo(() => notes.map((note) => note.id).join("|"), [notes]);

  const fetchNotesPage = useCallback(async (
    offset: number,
    append: boolean,
    loadId: number,
    showFullLoading = true,
  ) => {
    const query = searchQuery.trim();
    const typeFilter = selectedType === "all" ? undefined : selectedType;
    const subjectFilter = selectedSubject === "all" ? undefined : selectedSubject;
    const cacheKey = getNotesCacheKey(query, selectedType, selectedSubject, sortOrder);

    try {
      if (append) {
        setIsLoadingMore(true);
      } else if (showFullLoading) {
        setLoading(true);
      } else {
        setIsRefreshingNotes(true);
      }

      const data = query
        ? await notesApi.searchSummaries(query, typeFilter, subjectFilter, sortOrder, {
          limit: NOTES_SEARCH_RESULT_LIMIT,
          includeCoverImage: false,
        })
        : await notesApi.getSummaries({
          type: typeFilter,
          subject: subjectFilter,
          sortOrder,
          limit: NOTES_PAGE_SIZE + 1,
          offset,
          includeCoverImage: false,
        });

      if (latestLoadId.current === loadId) {
        if (query) {
          setVisibleNotes(data);
          setHasMoreNotes(false);
        } else {
          const pageItems = data.slice(0, NOTES_PAGE_SIZE);
          const nextHasMoreNotes = data.length > NOTES_PAGE_SIZE;
          const nextNotes = append ? [...notesRef.current, ...pageItems] : pageItems;
          setVisibleNotes(nextNotes);
          setHasMoreNotes(nextHasMoreNotes);
          writeNotesCache(cacheKey, nextNotes, nextHasMoreNotes);
        }
      }
    } catch (error) {
      if (latestLoadId.current === loadId) {
        console.error("Failed to load notes:", error);
      }
    } finally {
      if (latestLoadId.current === loadId) {
        if (append) {
          setIsLoadingMore(false);
        } else if (showFullLoading) {
          setLoading(false);
        } else {
          setIsRefreshingNotes(false);
        }
      }
    }
  }, [searchQuery, selectedSubject, selectedType, setVisibleNotes, sortOrder]);

  useEffect(() => {
    const loadId = latestLoadId.current + 1;
    latestLoadId.current = loadId;
    setIsLoadingMore(false);
    setSelectedNoteIds(new Set());

    const cacheKey = getNotesCacheKey(searchQuery, selectedType, selectedSubject, sortOrder);
    const cached = readNotesCache(cacheKey);
    const canKeepInitialRouteData = initialRouteReadyRef.current
      && !cached
      && !searchQuery.trim()
      && selectedType === "all"
      && selectedSubject === "all"
      && sortOrder === "desc";
    initialRouteReadyRef.current = false;

    if (cached) {
      setVisibleNotes(cached.notes);
      setHasMoreNotes(cached.hasMoreNotes);
      setLoading(false);
    } else if (canKeepInitialRouteData) {
      setLoading(false);
      setIsRefreshingNotes(false);
      writeNotesCache(cacheKey, notesRef.current, initialHasMoreNotes);
      return;
    } else {
      setVisibleNotes([]);
      setHasMoreNotes(false);
      setLoading(true);
    }

    const timer = window.setTimeout(() => {
      void fetchNotesPage(0, false, loadId, !cached && !canKeepInitialRouteData);
    }, searchQuery.trim() ? 250 : 0);

    return () => window.clearTimeout(timer);
  }, [fetchNotesPage, initialHasMoreNotes, searchQuery, selectedSubject, selectedType, sortOrder, setVisibleNotes]);

  useEffect(() => {
    const ids = visibleNoteIdsKey ? visibleNoteIdsKey.split("|") : [];
    if (ids.length === 0) return;

    const loadId = latestCoverLoadId.current + 1;
    latestCoverLoadId.current = loadId;

    void notesApi.getSummaryCoverImages(ids)
      .then((coverImages) => {
        if (latestCoverLoadId.current !== loadId) return;

        setVisibleNotes(
          notesRef.current.map((note) => {
            const coverImage = coverImages[note.id];
            if (!coverImage || coverImage === note.coverImage) return note;
            return { ...note, coverImage };
          }),
        );
      })
      .catch((error) => {
        if (latestCoverLoadId.current === loadId) {
          console.warn("Failed to load note covers:", error);
        }
      });
  }, [setVisibleNotes, visibleNoteIdsKey]);

  const handleLoadMore = useCallback(() => {
    if (loading || isLoadingMore || !hasMoreNotes || searchQuery.trim()) return;
    const loadId = latestLoadId.current + 1;
    latestLoadId.current = loadId;
    void fetchNotesPage(notes.length, true, loadId);
  }, [fetchNotesPage, hasMoreNotes, isLoadingMore, loading, notes.length, searchQuery]);

  const filteredNotes = useMemo(() => {
    let result = notes.filter((note) => {
      const matchesType = selectedType === "all" || note.type === selectedType;
      const matchesSubject = selectedSubject === "all" || note.subject === selectedSubject || note.type === "essay";

      return matchesType && matchesSubject;
    });

    // Sort by date
    result = [...result].sort((a, b) => {
      const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
      const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
      return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [selectedType, selectedSubject, sortOrder, notes]);

  const noteCounts = useMemo(() => {
    return notes.reduce(
      (counts, note) => {
        counts.total += 1;
        counts[note.type] += 1;
        return counts;
      },
      { total: 0, note: 0, problem: 0, essay: 0 },
    );
  }, [notes]);

  const hasActiveFilters = Boolean(searchQuery.trim())
    || selectedType !== "all"
    || selectedSubject !== "all"
    || sortOrder !== "desc";

  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedType("all");
    setSelectedSubject("all");
    setSortOrder("desc");
  };

  const handleToggleSelect = (noteId: string) => {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedNoteIds.size === filteredNotes.length) {
      setSelectedNoteIds(new Set());
    } else {
      setSelectedNoteIds(new Set(filteredNotes.map((n) => n.id)));
    }
  };

  const handleExportSelected = async () => {
    if (selectedNoteIds.size === 0 || isPreparingExport) return;

    setIsPreparingExport(true);
    try {
      const idsToExport = Array.from(selectedNoteIds);
      const fullNotes = await Promise.all(idsToExport.map((id) => notesApi.getById(id)));
      const readyNotes = fullNotes.filter((note): note is Note => Boolean(note));

      if (readyNotes.length === 0) {
        toast.error("没有可导出的笔记");
        return;
      }

      const skippedCount = idsToExport.length - readyNotes.length;
      if (skippedCount > 0) {
        toast.info(`有 ${skippedCount} 篇笔记不可访问，已跳过`);
      }

      setExportNotes(readyNotes);
      setShowExportDialog(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`准备导出失败：${message}`);
    } finally {
      setIsPreparingExport(false);
    }
  };

  const handleBatchDelete = async () => {
    if (!isAdmin || isDeletingNotes) return;
    const idsToDelete = Array.from(selectedNoteIds);
    if (idsToDelete.length === 0) return;

    setIsDeletingNotes(true);
    let deletedCount = 0;

    try {
      for (const id of idsToDelete) {
        await notesApi.delete(id);
        deletedCount += 1;
      }
      const loadId = latestLoadId.current + 1;
      latestLoadId.current = loadId;
      await fetchNotesPage(0, false, loadId);
      toast.success(`已删除 ${deletedCount} 篇笔记`);
      setSelectedNoteIds(new Set());
      setSelectMode(false);
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error("Failed to delete notes:", error);
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`批量删除失败：已删除 ${deletedCount}/${idsToDelete.length} 篇。${message}`);
      setSelectedNoteIds(new Set(idsToDelete.slice(deletedCount)));
      const loadId = latestLoadId.current + 1;
      latestLoadId.current = loadId;
      await fetchNotesPage(0, false, loadId);
    } finally {
      setIsDeletingNotes(false);
    }
  };

  return (
    <main className="min-h-screen pb-20 pt-24">
      <section className="border-b border-outline-variant/20 bg-surface-container-low/70">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="eyebrow-chip mb-2 px-2.5 py-1 text-xs">
                <LibraryBig className="h-3.5 w-3.5 text-primary" />
                Asteroid 资料库
              </div>
              <h1 className="font-headline text-3xl font-bold text-on-surface">文章与题集</h1>
              <p className="mt-1 text-sm text-on-surface-variant">
                搜索、阅读、整理你的学习材料；题集作为刷题和复盘的入口。
              </p>
            </div>

            {isAdmin && (
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/create"
                  className="control-button control-button-primary px-4 text-sm"
                >
                  <Plus className="h-4 w-4" />
                  新建
                </Link>
                <button
                  onClick={() => {
                    setSelectMode(!selectMode);
                    setSelectedNoteIds(new Set());
                  }}
                  className={`control-button px-4 text-sm ${
                    selectMode
                      ? "control-button-selected"
                      : ""
                  }`}
                >
                  <CheckSquare className="h-4 w-4" />
                  {selectMode ? "退出多选" : "批量"}
                </button>
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-4">
            <LibraryStat label="当前显示" value={filteredNotes.length} />
            <LibraryStat label="笔记" value={noteCounts.note} />
            <LibraryStat label="题集" value={noteCounts.problem} />
            <LibraryStat label="随笔" value={noteCounts.essay} />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">

        {/* Batch Actions Bar (visible in select mode) */}
        {isAdmin && selectMode && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="command-bar mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-4">
              <button
                onClick={handleSelectAll}
                className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary transition-colors"
              >
                {selectedNoteIds.size === filteredNotes.length ? (
                  <>
                    <CheckSquare className="w-4 h-4" />
                    取消全选
                  </>
                ) : (
                  <>
                    <Square className="w-4 h-4" />
                    全选
                  </>
                )}
              </button>
              <span className="text-sm text-on-surface-variant">
                已选择 {selectedNoteIds.size} / {filteredNotes.length} 条
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExportSelected}
                disabled={selectedNoteIds.size === 0 || isPreparingExport}
                className="control-button control-button-primary px-4 text-sm disabled:cursor-not-allowed"
              >
                {isPreparingExport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {isPreparingExport ? "准备中" : "导出选中"}
              </button>
              <button
                onClick={() => {
                  if (selectedNoteIds.size > 0) {
                    setShowDeleteConfirm(true);
                  }
                }}
                disabled={selectedNoteIds.size === 0 || isDeletingNotes}
                className="control-button control-button-danger px-4 text-sm disabled:cursor-not-allowed"
              >
                {isDeletingNotes ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {isDeletingNotes ? "删除中" : "删除选中"}
              </button>
              <button
                onClick={() => {
                  setSelectMode(false);
                  setSelectedNoteIds(new Set());
                }}
                disabled={isDeletingNotes}
                className="control-button h-10 w-10 p-0 disabled:cursor-not-allowed"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Search & Filter Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="surface-panel mb-6 p-4"
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <SearchBar value={searchQuery} onChange={setSearchQuery} />
            <div className="flex items-center justify-between gap-3 text-xs text-on-surface-variant lg:justify-end">
              <span>
                {isRefreshingNotes ? "正在同步最新数据" : `共 ${filteredNotes.length} 条结果`}
              </span>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="rounded-md px-2 py-1 text-primary transition-colors hover:bg-primary/10"
                >
                  清除筛选
                </button>
              )}
            </div>
          </div>
          <div className="mt-4 border-t border-outline-variant/10 pt-4">
            <TagFilter
              selectedType={selectedType}
              selectedSubject={selectedSubject}
              sortOrder={sortOrder}
              onTypeChange={setSelectedType}
              onSubjectChange={setSelectedSubject}
              onSortOrderChange={setSortOrder}
            />
          </div>
        </motion.section>

        {/* Notes Grid */}
        <section>
          {!loading && isRefreshingNotes && (
            <div className="mb-4 flex items-center justify-center gap-2 text-xs text-on-surface-variant/50">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              正在刷新
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-3 text-on-surface-variant">加载笔记中...</span>
            </div>
          ) : filteredNotes.length > 0 ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredNotes.map((note, index) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    index={index}
                    isSelected={selectedNoteIds.has(note.id)}
                    onToggleSelect={selectMode ? handleToggleSelect : undefined}
                    selectMode={selectMode}
                  />
                ))}
              </div>
              {hasMoreNotes && !searchQuery.trim() && (
                <div className="flex justify-center pt-10">
                  <button
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                    className="control-button px-5 py-2.5 text-sm disabled:cursor-not-allowed"
                  >
                    {isLoadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isLoadingMore ? "加载中..." : "加载更多"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="surface-panel border-dashed py-16 text-center"
            >
              <p className="text-lg text-on-surface-variant">
                没有找到匹配的笔记
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary/90"
                >
                  清除筛选
                </button>
              )}
            </motion.div>
          )}
        </section>
      </div>

      {/* Export Dialog */}
      <ExportDialog
        isOpen={showExportDialog}
        onClose={() => {
          setShowExportDialog(false);
          setExportNotes([]);
        }}
        notes={exportNotes}
      />

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => {
              if (!isDeletingNotes) setShowDeleteConfirm(false);
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
                确定要删除选中的 {selectedNoteIds.size} 条笔记吗？此操作不可撤销。
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeletingNotes}
                  className="px-4 py-2 rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  取消
                </button>
                <button
                  onClick={handleBatchDelete}
                  disabled={isDeletingNotes}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isDeletingNotes && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isDeletingNotes ? "删除中" : "确认删除"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function LibraryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface-muted px-4 py-3">
      <div className="text-lg font-bold text-primary">{value}</div>
      <div className="text-xs text-on-surface-variant">{label}</div>
    </div>
  );
}
