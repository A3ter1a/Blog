"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, ArrowRight, Loader2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { notesApi } from "@/lib/supabase";
import { subjectMap, typeMap } from "@/lib/types";
import type { Note } from "@/lib/types";
import { getNoteReadPath } from "@/lib/note-routes";
import { dialogMotion, overlayMotion, uiMotion } from "@/lib/motion";
import { getSiteCacheKey, readSiteCache, writeSiteCache } from "@/lib/site-cache";
import { useDialogFocus } from "@/hooks/useDialogFocus";

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchOverlay({ isOpen, onClose }: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Note[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const latestSearchId = useRef(0);

  useDialogFocus({
    isOpen,
    onClose,
    containerRef: dialogRef,
    initialFocusRef: inputRef,
  });

  // Debounced search
  const searchNotes = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      latestSearchId.current += 1;
      setResults([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    const searchId = latestSearchId.current + 1;
    latestSearchId.current = searchId;
    const cacheKey = getSiteCacheKey("note-search", searchQuery.trim().toLocaleLowerCase());
    const cached = readSiteCache<Note[]>(cacheKey, (value) => Array.isArray(value) ? value as Note[] : null, { ttlMs: 2 * 60 * 1000, maxAgeMs: 12 * 60 * 60 * 1000 });
    setSearchError(null);
    if (cached) {
      setResults(cached.value);
      setIsSearching(false);
    } else {
      setResults([]);
      setIsSearching(true);
    }
    try {
      const notes = await notesApi.searchSummaries(searchQuery, undefined, undefined, "desc", {
        limit: 8,
        includeCoverImage: false,
      });
      if (latestSearchId.current === searchId) {
        writeSiteCache(cacheKey, notes);
        setResults(notes);
      }
    } catch (error) {
      console.error("Search failed:", error);
      if (latestSearchId.current === searchId) {
        if (!cached) setResults([]);
        setSearchError("搜索暂时不可用，请检查网络后重试。");
      }
    } finally {
      if (latestSearchId.current === searchId) {
        setIsSearching(false);
      }
    }
  }, []);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      searchNotes(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, searchNotes]);

  // Discard stale query state only after the overlay closes.
  useEffect(() => {
    if (isOpen) return;
    const timer = window.setTimeout(() => {
      latestSearchId.current += 1;
      setQuery("");
      setResults([]);
      setIsSearching(false);
      setSearchError(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            ref={dialogRef}
            variants={overlayMotion}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: uiMotion.duration.fast, ease: uiMotion.ease.standard }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Search Bar */}
          <motion.div
            variants={dialogMotion}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={uiMotion.spring.panel}
            className="fixed left-1/2 top-4 z-50 w-full max-w-2xl -translate-x-1/2 px-3 sm:top-20 sm:px-4"
            role="dialog"
            aria-modal="true"
            aria-label="全局搜索"
            tabIndex={-1}
          >
            <div className="bg-surface-container-lowest rounded-2xl shadow-elevated overflow-hidden">
              {/* Input */}
              <div className="flex items-center gap-3 px-6 py-4 border-b border-outline-variant/10">
                <Search className="w-5 h-5 text-on-surface-variant/40 flex-shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索笔记标题或标签..."
                  aria-label="搜索笔记"
                  aria-busy={isSearching}
                  className="flex-1 bg-transparent outline-none text-on-surface placeholder:text-on-surface-variant/40 text-lg"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    type="button"
                    aria-label="清空搜索"
                    className="motion-ui motion-interactive flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-surface-container-high"
                  >
                    <X className="w-4 h-4 text-on-surface-variant" />
                  </button>
                )}
              </div>

              {/* Results */}
              {query.trim() && (
                <div className="max-h-80 overflow-y-auto" aria-live="polite" aria-busy={isSearching}>
                  {results.length > 0 ? (
                    <div className="py-2">
                      <div className="flex items-center justify-between gap-3 px-6 py-2 text-xs text-on-surface-variant/60">
                        <span>找到 {results.length} 条结果</span>
                        {isSearching && (
                          <span className="inline-flex items-center gap-1.5" role="status">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                            正在更新
                          </span>
                        )}
                      </div>
                      {results.map((note) => (
                        <Link
                          key={note.id}
                          href={getNoteReadPath(note)}
                          onClick={onClose}
                          className="motion-ui group flex min-h-11 items-center justify-between px-6 py-3 hover:bg-surface-container-high"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-on-surface truncate">
                              {note.title}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="px-2 py-0.5 rounded text-xs bg-surface-container text-on-surface-variant">
                                {typeMap[note.type]}
                              </span>
                              {note.subject && (
                                <span className="text-xs text-on-surface-variant/60">
                                  {subjectMap[note.subject]}
                                </span>
                              )}
                            </div>
                          </div>
                          <ArrowRight className="motion-icon-shift w-4 h-4 text-on-surface-variant/30 group-hover:translate-x-1 group-hover:text-primary flex-shrink-0 ml-4" />
                        </Link>
                      ))}
                    </div>
                  ) : isSearching ? (
                    <div className="space-y-1 py-2" role="status" aria-label="正在搜索">
                      <div className="flex items-center gap-2 px-6 py-2 text-xs text-on-surface-variant/60">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        正在搜索
                      </div>
                      {Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className="flex items-center gap-4 px-6 py-3">
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="h-4 w-3/4 animate-pulse rounded bg-surface-container-high" />
                            <div className="h-3 w-1/3 animate-pulse rounded bg-surface-container-high/70" />
                          </div>
                          <div className="h-4 w-4 animate-pulse rounded bg-surface-container-high" />
                        </div>
                      ))}
                    </div>
                  ) : searchError ? (
                    <div className="px-6 py-10 text-center" role="alert">
                      <p className="text-sm text-on-surface-variant">{searchError}</p>
                      <button
                        type="button"
                        onClick={() => void searchNotes(query)}
                        className="control-button mt-4 min-h-11 px-4 text-sm"
                      >
                        <RotateCcw className="h-4 w-4" />
                        重试
                      </button>
                    </div>
                  ) : (
                    <div className="py-12 text-center">
                      <p className="text-sm font-medium text-on-surface-variant">没有找到匹配的结果</p>
                      <p className="mt-1 text-xs text-on-surface-variant/55">尝试减少关键词，或改用文章标题中的词语。</p>
                    </div>
                  )}
                </div>
              )}

              {/* Footer Hint */}
              {!query.trim() && (
                <div className="px-6 py-3 bg-surface-container/50">
                  <p className="text-xs text-on-surface-variant/40">
                    输入关键词开始搜索，按 Esc 关闭
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
