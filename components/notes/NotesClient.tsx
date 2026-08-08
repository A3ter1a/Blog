"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { SearchBar } from "@/components/notes/SearchBar";
import { TagFilter } from "@/components/notes/TagFilter";
import { NoteCard } from "@/components/notes/NoteCard";
import { ExportDialog } from "@/components/export/ExportDialog";
import { notesApi } from "@/lib/supabase";
import { NoteType, Subject, Note, type NoteAuthorKind } from "@/lib/types";
import { CheckSquare, Square, Download, X, Trash2, Loader2, Plus, SlidersHorizontal, ChevronDown, ChevronUp, FileText, Sparkles } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useToast } from "@/components/ui/Toast";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { clearNotesListCache, getNotesCacheKey, readNotesCache, writeNotesCache } from "@/lib/notes-list-cache";
import { NOTES_PAGE_SIZE, NOTES_SEARCH_RESULT_LIMIT } from "@/lib/notes-query";
import { collapsibleMotion, surfaceMotion, uiMotion } from "@/lib/motion";
import { CollectionCard } from "@/components/collections/CollectionCard";
import type { CollectionSummary } from "@/lib/collections-contract";
import { collectionsApi } from "@/lib/collections-api";
import { groupNotesByCollection } from "@/lib/note-collection-directory";
import { getNoteReadPath } from "@/lib/note-routes";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { getActiveAiAccountSlot } from "@/lib/auth-session-slot";
import {
  collectionListsEqual,
  readCollectionListCache,
  writeCollectionListCache,
} from "@/lib/collection-list-cache";
import {
  collectionDetailsEqual,
  readCollectionDetailCache,
  writeCollectionDetailCache,
} from "@/lib/collection-detail-cache";
import type { CollectionDetail } from "@/lib/collections-contract";

const NOTES_REQUEST_TIMEOUT_MS = 8_000;

function withNotesRequestTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("请求笔记超时，请检查网络或 Supabase 配置。"));
    }, NOTES_REQUEST_TIMEOUT_MS);

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

interface NotesClientProps {
  initialNotes?: Note[];
  initialHasMoreNotes?: boolean;
  initialLoadError?: boolean;
  initialCollections?: CollectionSummary[];
}

export function NotesClient({
  initialNotes = [],
  initialHasMoreNotes = false,
  initialLoadError = false,
  initialCollections = [],
}: NotesClientProps) {
  const { isAdmin, user, loading: authLoading } = useAdminAuth();
  const toast = useToast();
  const initialRouteReadyRef = useRef(!initialLoadError);
  const [directoryKind, setDirectoryKind] = useState<NoteAuthorKind>("human");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<NoteType | "all">("all");
  const [selectedSubject, setSelectedSubject] = useState<Subject | "all">("all");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [showLibraryTools, setShowLibraryTools] = useState(false);
  
  // Data state
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [collections, setCollections] = useState<CollectionSummary[]>(initialCollections);
  const [collectionsStatus, setCollectionsStatus] = useState<"loading" | "ready" | "failed">(
    initialCollections.length > 0 ? "ready" : "loading",
  );
  const [loading, setLoading] = useState(initialLoadError);
  const [hasMoreNotes, setHasMoreNotes] = useState(initialHasMoreNotes);
  const [isRefreshingNotes, setIsRefreshingNotes] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(initialLoadError ? "暂时无法加载笔记，请检查网络或 Supabase 配置，然后重试。" : null);
  const [retryToken, setRetryToken] = useState(0);
  const [expandedCollectionId, setExpandedCollectionId] = useState<string | null>(null);
  const [expandedCollection, setExpandedCollection] = useState<CollectionDetail | null>(null);
  const [expandedCollectionLoading, setExpandedCollectionLoading] = useState(false);
  
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
  const latestCollectionsLoadId = useRef(0);
  const notesRef = useRef<Note[]>(initialNotes);
  const collectionsRef = useRef<CollectionSummary[]>(initialCollections);
  const directoryKindRef = useRef<NoteAuthorKind>(directoryKind);
  const expandedCollectionIdRef = useRef<string | null>(null);

  const setVisibleNotes = useCallback((nextNotes: Note[]) => {
    if (notesRef.current.length === nextNotes.length && notesRef.current.every((note, index) => {
      const next = nextNotes[index];
      return note.id === next?.id
        && note.title === next.title
        && note.updatedAt.getTime() === next.updatedAt.getTime()
        && note.coverImage === next.coverImage;
    })) return;
    notesRef.current = nextNotes;
    setNotes(nextNotes);
  }, []);

  const setVisibleCollections = useCallback((nextCollections: CollectionSummary[]) => {
    if (collectionListsEqual(collectionsRef.current, nextCollections)) return;
    collectionsRef.current = nextCollections;
    setCollections(nextCollections);
  }, []);

  const visibleNoteIdsKey = useMemo(() => notes.map((note) => note.id).join("|"), [notes]);

  const refreshCollections = useCallback(async () => {
    const requestDirectoryKind = directoryKind;
    const loadId = latestCollectionsLoadId.current + 1;
    latestCollectionsLoadId.current = loadId;
    // An AI directory must not be finalized while Supabase is still restoring
    // the account session. Otherwise the public (possibly empty) collection
    // query can win the race against the private AI query and briefly expose
    // every note as ungrouped.
    if (requestDirectoryKind === "ai" && authLoading) {
      setCollectionsStatus("loading");
      return;
    }
    // A server render can only preload public collections. Once the active
    // session is known, the AI directory must revalidate through the same
    // Supabase session so an admin or AI account can see its private draft
    // collections and their ordered members.
    const canReadPrivateAiCollections = requestDirectoryKind === "ai"
      && !authLoading
      && Boolean(user)
      && Boolean(getActiveAiAccountSlot());
    const cacheAllowed = requestDirectoryKind === "human" || canReadPrivateAiCollections;
    const cached = cacheAllowed ? readCollectionListCache(requestDirectoryKind) : null;
    if (cached) {
      if (directoryKindRef.current !== requestDirectoryKind) return;
      setVisibleCollections(cached.value);
      setCollectionsStatus("ready");
    } else {
      if (directoryKindRef.current !== requestDirectoryKind) return;
      setCollectionsStatus("loading");
    }

    try {
      const nextCollections = await withNotesRequestTimeout(
        canReadPrivateAiCollections
          ? collectionsApi.getAuthenticatedSummaries()
          : collectionsApi.getPublishedSummaries(),
      );
      if (latestCollectionsLoadId.current !== loadId || directoryKindRef.current !== requestDirectoryKind) return;
      if (cacheAllowed) writeCollectionListCache(requestDirectoryKind, nextCollections);
      setVisibleCollections(nextCollections);
      setCollectionsStatus("ready");
    } catch (error: unknown) {
      if (latestCollectionsLoadId.current !== loadId || directoryKindRef.current !== requestDirectoryKind) return;
      console.warn("Failed to refresh published collections:", error);
      const hasSameDirectorySnapshot = Boolean(cached)
        || collectionsRef.current.some((collection) => collection.ownerKind === requestDirectoryKind);
      setCollectionsStatus(hasSameDirectorySnapshot ? "ready" : "failed");
    }
  }, [authLoading, directoryKind, setVisibleCollections, user]);

  useEffect(() => {
    directoryKindRef.current = directoryKind;
  }, [directoryKind]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshCollections();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [refreshCollections]);

  const fetchNotesPage = useCallback(async (
    offset: number,
    append: boolean,
    loadId: number,
    showFullLoading = true,
  ) => {
    const query = searchQuery.trim();
    const typeFilter = selectedType === "all" ? undefined : selectedType;
    const subjectFilter = selectedSubject === "all" ? undefined : selectedSubject;
    const cacheKey = getNotesCacheKey(query, directoryKind, selectedType, selectedSubject, sortOrder);

    try {
      if (append) {
        setIsLoadingMore(true);
      } else if (showFullLoading) {
        setLoading(true);
      } else {
        setIsRefreshingNotes(true);
      }

      const data = await withNotesRequestTimeout(
        query
          ? notesApi.searchSummaries(query, typeFilter, subjectFilter, sortOrder, {
            limit: NOTES_SEARCH_RESULT_LIMIT,
            includeCoverImage: false,
            authorKind: directoryKind,
          })
          : notesApi.getSummaries({
            type: typeFilter,
            subject: subjectFilter,
            authorKind: directoryKind,
            sortOrder,
            limit: NOTES_PAGE_SIZE + 1,
            offset,
            includeCoverImage: false,
          }),
      );

      if (latestLoadId.current === loadId) {
        setLoadError(null);
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
        setLoadError("暂时无法加载笔记，请检查网络或 Supabase 配置，然后重试。");
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
  }, [directoryKind, searchQuery, selectedSubject, selectedType, setVisibleNotes, sortOrder]);

  useEffect(() => {
    const loadId = latestLoadId.current + 1;
    latestLoadId.current = loadId;
    let fetchTimer: number | undefined;

    const prepareTimer = window.setTimeout(() => {
      setIsLoadingMore(false);
      setSelectedNoteIds(new Set());

      const cacheKey = getNotesCacheKey(searchQuery, directoryKind, selectedType, selectedSubject, sortOrder);
      const cached = readNotesCache(cacheKey);
      const canKeepInitialRouteData = initialRouteReadyRef.current
        && !cached
        && !searchQuery.trim()
        && selectedType === "all"
        && selectedSubject === "all"
        && sortOrder === "desc"
        && directoryKind === "human";
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

      fetchTimer = window.setTimeout(() => {
        void fetchNotesPage(0, false, loadId, !cached && !canKeepInitialRouteData);
      }, searchQuery.trim() ? 250 : 0);
    }, 0);

    return () => {
      window.clearTimeout(prepareTimer);
      if (fetchTimer !== undefined) {
        window.clearTimeout(fetchTimer);
      }
    };
  }, [directoryKind, fetchNotesPage, initialHasMoreNotes, retryToken, searchQuery, selectedSubject, selectedType, sortOrder, setVisibleNotes]);

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

  const hasActiveFilters = Boolean(searchQuery.trim())
    || selectedType !== "all"
    || selectedSubject !== "all"
    || sortOrder !== "desc";
  const shouldShowLibraryTools = showLibraryTools || hasActiveFilters;
  const visibleCollections = useMemo(
    () => collections.filter((collection) => collection.ownerKind === directoryKind),
    [collections, directoryKind],
  );
  const aiDirectory = useMemo(
    () => groupNotesByCollection(filteredNotes, visibleCollections),
    [filteredNotes, visibleCollections],
  );
  const showCollectionOnlyAiDirectory = directoryKind === "ai"
    && !hasActiveFilters
    && collectionsStatus !== "failed";

  const handleDirectoryChange = (nextKind: NoteAuthorKind) => {
    if (nextKind === directoryKind) return;
    directoryKindRef.current = nextKind;
    // Invalidate any request started for the previous directory before React
    // commits the new tab. This closes the small window where a fast human
    // request could otherwise mark the AI directory as ready.
    latestCollectionsLoadId.current += 1;
    latestLoadId.current += 1;
    setDirectoryKind(nextKind);
    // Do not let the previous directory's notes coexist with a newly ready
    // collection snapshot. The next effect will synchronously use the target
    // directory's cache when available, or show its loading state otherwise.
    notesRef.current = [];
    setNotes([]);
    setHasMoreNotes(false);
    setLoading(true);
    setIsRefreshingNotes(false);
    setLoadError(null);
    collectionsRef.current = [];
    setCollections([]);
    setCollectionsStatus("loading");
    setExpandedCollectionId(null);
    expandedCollectionIdRef.current = null;
    setExpandedCollection(null);
    setSelectMode(false);
    setSelectedNoteIds(new Set());
  };

  const openAiCollection = useCallback(async (collection: CollectionSummary) => {
    if (directoryKind !== "ai") return;
    if (!getActiveAiAccountSlot()) {
      toast.error("AI 学科会话已失效，请从对应学科入口重新进入");
      return;
    }
    if (expandedCollectionId === collection.id) {
      setExpandedCollectionId(null);
      expandedCollectionIdRef.current = null;
      setExpandedCollection(null);
      return;
    }

    setExpandedCollectionId(collection.id);
    expandedCollectionIdRef.current = collection.id;
    const cached = readCollectionDetailCache(collection.id);
    if (cached) {
      setExpandedCollection(cached.value);
      setExpandedCollectionLoading(cached.stale);
    } else {
      setExpandedCollection(null);
      setExpandedCollectionLoading(true);
    }

    try {
      const response = await fetchWithAuth(`/api/collections/${encodeURIComponent(collection.id)}`, { cache: "no-store" });
      const payload: unknown = await response.json().catch(() => ({}));
      const next = payload && typeof payload === "object" && !Array.isArray(payload) && "collection" in payload
        ? (payload as { collection?: unknown }).collection
        : null;
      if (!response.ok || !next || typeof next !== "object") throw new Error("合集详情读取失败");
      const detail = next as CollectionDetail;
      writeCollectionDetailCache(detail);
      if (expandedCollectionIdRef.current === collection.id) {
        setExpandedCollection((current) => collectionDetailsEqual(current, detail) ? current : detail);
      }
    } catch (error: unknown) {
      if (!cached) toast.error(error instanceof Error ? error.message : "合集详情读取失败");
    } finally {
      setExpandedCollectionLoading(false);
    }
  }, [directoryKind, expandedCollectionId, toast]);

  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedType("all");
    setSelectedSubject("all");
    setSortOrder("desc");
  };

  const handleRetryNotes = () => {
    setLoadError(null);
    setRetryToken((value) => value + 1);
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
      clearNotesListCache();
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
    <>
      <PageHeader
        width="wide"
        template="library"
        title={directoryKind === "ai" ? "AI 文章与题集" : "文章与题集"}
        description={directoryKind === "ai" ? "阅读经过审核并已发布的 AI 学习内容。" : "搜索、阅读、整理你的学习材料。"}
        actions={(
          <div className="flex flex-col items-stretch gap-2 lg:items-end">
            <div
              className="inline-grid grid-cols-2 gap-1 rounded-xl border border-outline-variant/25 bg-surface-container-low p-1"
              role="group"
              aria-label="笔记目录来源"
            >
              <button
                type="button"
                aria-pressed={directoryKind === "human"}
                aria-controls="notes-directory-content"
                onClick={() => handleDirectoryChange("human")}
                className={`control-button min-h-10 border-transparent px-3 text-sm ${directoryKind === "human" ? "control-button-selected" : ""}`}
              >
                <FileText className="h-4 w-4" />
                我的笔记
              </button>
              <button
                type="button"
                aria-pressed={directoryKind === "ai"}
                aria-controls="notes-directory-content"
                onClick={() => handleDirectoryChange("ai")}
                className={`control-button min-h-10 border-transparent px-3 text-sm ${directoryKind === "ai" ? "control-button-selected" : ""}`}
              >
                <Sparkles className="h-4 w-4" />
                AI 笔记
              </button>
            </div>
            {isAdmin && (
              <div className="flex flex-wrap items-center justify-end gap-2">
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
                  className={`control-button px-4 text-sm ${selectMode ? "control-button-selected" : ""}`}
                >
                  <CheckSquare className="h-4 w-4" />
                  {selectMode ? "退出多选" : "批量"}
                </button>
              </div>
            )}
          </div>
        )}
      />

      <PageShell width="wide" topPadding="content" template="library">
        <div id="notes-directory-content" role="region" aria-label={directoryKind === "ai" ? "AI 笔记目录" : "我的笔记目录"}>

        {/* Batch Actions Bar (visible in select mode) */}
        {isAdmin && selectMode && (
          <motion.div
            variants={surfaceMotion}
            initial="initial"
            animate="animate"
            transition={{ duration: uiMotion.duration.standard, ease: uiMotion.ease.emphasized }}
            className="command-bar mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-4">
              <button
                onClick={handleSelectAll}
                className="motion-ui flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary"
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

        {!hasActiveFilters && visibleCollections.length > 0 && (
          <section className="mb-7" aria-labelledby="collections-heading">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow-chip w-fit px-2.5 py-1 text-[11px]">持续整理</p>
                <h2 id="collections-heading" className="mt-2 font-headline text-xl font-bold text-on-surface">合集</h2>
                <p className="mt-1 text-sm text-on-surface-variant">合集可以逐篇追加、排序和移除，不会把内容压成一篇长文。</p>
              </div>
              <Link href="/collections" className="control-button px-3 py-2 text-xs">查看全部合集</Link>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {visibleCollections.slice(0, 6).map((collection) => (
                <CollectionCard
                  key={collection.id}
                  collection={collection}
                  isExpanded={directoryKind === "ai" && expandedCollectionId === collection.id}
                  onOpen={directoryKind === "ai" ? () => void openAiCollection(collection) : undefined}
                />
              ))}
            </div>
            {directoryKind === "ai" && expandedCollectionId && (
              <section className="surface-panel mt-4 overflow-hidden border-primary/20" aria-live="polite" aria-label="展开的 AI 合集">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/15 px-5 py-4">
                  <div>
                    <p className="eyebrow-chip w-fit px-2.5 py-1 text-[11px]">原位展开</p>
                    <h3 className="mt-2 font-headline text-lg font-bold text-on-surface">{expandedCollection?.title ?? "合集内容"}</h3>
                  </div>
                  <button type="button" className="control-button px-3 py-2 text-xs" onClick={() => { setExpandedCollectionId(null); expandedCollectionIdRef.current = null; setExpandedCollection(null); }}>收起</button>
                </div>
                {expandedCollectionLoading && !expandedCollection ? (
                  <div className="flex items-center justify-center gap-2 px-5 py-8 text-sm text-on-surface-variant"><Loader2 className="h-4 w-4 animate-spin text-primary" />正在读取合集内容…</div>
                ) : expandedCollection?.items.length ? (
                  <ol className="divide-y divide-outline-variant/10">
                    {expandedCollection.items.map((item, index) => item.note ? (
                      <li key={item.id}>
                        <Link href={getNoteReadPath({ id: item.note.id, isPublished: item.note.isPublished })} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-primary/[0.04]">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{String(index + 1).padStart(2, "0")}</span>
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface">{item.note.title}</span>
                          <span className="shrink-0 text-xs text-on-surface-variant">打开 →</span>
                        </Link>
                      </li>
                    ) : null)}
                  </ol>
                ) : (
                  <p className="px-5 py-8 text-center text-sm text-on-surface-variant">这个合集暂时没有可显示的文章。</p>
                )}
              </section>
            )}
          </section>
        )}

        {/* Search & Filter Section */}
        <motion.section
          variants={surfaceMotion}
          initial="initial"
          animate="animate"
          transition={{ duration: uiMotion.duration.page, ease: uiMotion.ease.emphasized }}
          className="surface-panel mb-6 p-5"
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <SearchBar value={searchQuery} onChange={setSearchQuery} />
            <div className="flex items-center justify-between gap-3 text-xs text-on-surface-variant lg:self-center lg:justify-end">
              <span>
                {isRefreshingNotes ? "正在同步最新数据" : `共 ${filteredNotes.length} 条结果`}
              </span>
              <button
                type="button"
                onClick={() => setShowLibraryTools((value) => !value)}
                className={`control-button h-10 px-3 text-xs ${shouldShowLibraryTools ? "control-button-selected" : ""}`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                筛选
                {shouldShowLibraryTools ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="motion-ui motion-interactive rounded-lg px-2 py-1 text-primary hover:bg-primary/10"
                >
                  清除筛选
                </button>
              )}
            </div>
          </div>
          <AnimatePresence initial={false}>
            {shouldShowLibraryTools && (
              <motion.div
                variants={collapsibleMotion}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: uiMotion.duration.reveal, ease: uiMotion.ease.emphasized }}
                className="overflow-hidden"
              >
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
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        {/* Notes Grid */}
        <section>
          {!loading && isRefreshingNotes && (
            <div className="mb-4 flex items-center justify-center gap-2 text-xs text-on-surface-variant/50">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              正在刷新
            </div>
          )}
          {!loading && loadError && filteredNotes.length > 0 && (
            <div className="mb-4 flex flex-col gap-3 rounded-xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-on-surface sm:flex-row sm:items-center sm:justify-between" role="alert">
              <div>
                <p className="font-medium">暂时无法刷新笔记</p>
                <p className="mt-1 text-xs text-on-surface-variant">请检查网络或 Supabase 配置，当前仍显示上一次成功加载的内容。</p>
              </div>
              <button type="button" onClick={handleRetryNotes} className="control-button min-h-10 shrink-0 px-4 text-sm">
                重试
              </button>
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-3 text-on-surface-variant">加载笔记中...</span>
            </div>
          ) : loadError ? (
            <div className="surface-panel border border-error/20 bg-error/5 px-6 py-14 text-center" role="alert">
              <p className="text-lg font-medium text-on-surface">暂时无法加载笔记</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-on-surface-variant">请检查网络或 Supabase 配置，然后重试。若问题持续存在，可以稍后再试。</p>
              <button type="button" onClick={handleRetryNotes} className="control-button control-button-primary mt-5 min-h-11 px-5 text-sm">
                重试
              </button>
            </div>
          ) : showCollectionOnlyAiDirectory && collectionsStatus === "loading" ? (
            <div className="surface-panel flex min-h-52 flex-col items-center justify-center gap-3 border-dashed px-6 py-12 text-center" role="status">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <div>
                <p className="font-medium text-on-surface">正在整理 AI 合集目录…</p>
                <p className="mt-1 text-sm text-on-surface-variant">合集顺序确认后再显示文章，避免目录先散开再重新归类。</p>
              </div>
            </div>
          ) : directoryKind === "ai" && !hasActiveFilters && collectionsStatus === "failed" ? (
            <div className="surface-panel flex min-h-52 flex-col items-center justify-center gap-3 border border-error/20 bg-error/5 px-6 py-12 text-center" role="alert">
              <div>
                <p className="font-medium text-on-surface">AI 合集目录暂时无法确认</p>
                <p className="mt-1 text-sm text-on-surface-variant">为避免文章顺序错误，暂不展开散落文章。可以重试读取合集。</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCollectionsStatus("loading");
                  void refreshCollections();
                }}
                className="control-button control-button-primary min-h-10 px-4 text-sm"
              >
                重试合集
              </button>
            </div>
          ) : filteredNotes.length > 0 ? (
            <>
              {showCollectionOnlyAiDirectory ? (
                <div className="space-y-6" data-ai-directory-order="collection-card">
                  {aiDirectory.ungrouped.length > 0 ? (
                    <section aria-labelledby="ai-ungrouped-heading">
                      <div className="mb-3">
                        <p className="eyebrow-chip w-fit px-2.5 py-1 text-[11px]">其他内容</p>
                        <h3 id="ai-ungrouped-heading" className="mt-2 font-headline text-xl font-bold text-on-surface">未归入合集</h3>
                      </div>
                      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                        {aiDirectory.ungrouped.map((note, index) => (
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
                    </section>
                  ) : (
                    <div className="surface-panel border-dashed px-5 py-8 text-center text-sm text-on-surface-variant">
                      合集内容已收拢到上方卡片，点击合集即可按顺序阅读。
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
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
              )}
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
                {hasActiveFilters ? "没有找到匹配的笔记" : directoryKind === "ai" ? "还没有已发布的 AI 笔记" : "还没有笔记"}
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
      </PageShell>

      {/* Export Dialog */}
      <ExportDialog
        isOpen={showExportDialog}
        onClose={() => {
          setShowExportDialog(false);
          setExportNotes([]);
        }}
        notes={exportNotes}
      />

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="确认删除"
        description={<>确定要删除选中的 {selectedNoteIds.size} 条笔记吗？此操作不可撤销。</>}
        confirmLabel="确认删除"
        confirmingLabel="删除中"
        isWorking={isDeletingNotes}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleBatchDelete}
      />
    </>
  );
}
