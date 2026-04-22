"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { notesApi } from "@/lib/supabase";
import { subjectMap, typeMap } from "@/lib/types";
import type { Note } from "@/lib/types";

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchOverlay({ isOpen, onClose }: SearchOverlayProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Note[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search
  const searchNotes = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const notes = await notesApi.search(searchQuery);
      setResults(notes);
    } catch (error) {
      console.error("Search failed:", error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      searchNotes(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, searchNotes]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    if (!isOpen) {
      setQuery("");
      setResults([]);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Search Bar */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4"
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
                  placeholder="搜索笔记标题、内容或标签..."
                  className="flex-1 bg-transparent outline-none text-on-surface placeholder:text-on-surface-variant/40 text-lg"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="p-1 rounded-full hover:bg-surface-container-high transition-colors"
                  >
                    <X className="w-4 h-4 text-on-surface-variant" />
                  </button>
                )}
              </div>

              {/* Results */}
              {query.trim() && (
                <div className="max-h-80 overflow-y-auto">
                  {isSearching ? (
                    <div className="py-12 text-center">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                      <p className="text-sm text-on-surface-variant/60">搜索中...</p>
                    </div>
                  ) : results.length > 0 ? (
                    <div className="py-2">
                      <p className="px-6 py-2 text-xs text-on-surface-variant/60">
                        找到 {results.length} 条结果
                      </p>
                      {results.map((note) => (
                        <Link
                          key={note.id}
                          href={`/notes/${note.id}`}
                          onClick={onClose}
                          className="flex items-center justify-between px-6 py-3 hover:bg-surface-container-high transition-colors group"
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
                          <ArrowRight className="w-4 h-4 text-on-surface-variant/30 group-hover:text-primary transition-colors flex-shrink-0 ml-4" />
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="py-12 text-center">
                      <p className="text-sm text-on-surface-variant/40">
                        没有找到匹配的结果
                      </p>
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
