"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SearchBar } from "@/components/notes/SearchBar";
import { TagFilter } from "@/components/notes/TagFilter";
import { NoteCard } from "@/components/notes/NoteCard";
import { ExportDialog } from "@/components/export/ExportDialog";
import { notesApi } from "@/lib/supabase";
import { NoteType, Subject, Note } from "@/lib/types";
import { CheckSquare, Square, Download, X, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useToast } from "@/components/ui/Toast";

export default function NotesPage() {
  const { isAdmin } = useAdminAuth();
  const toast = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<NoteType | "all">("all");
  const [selectedSubject, setSelectedSubject] = useState<Subject | "all">("all");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  
  // Data state
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Selection state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportNotes, setExportNotes] = useState<Note[]>([]);
  const [isPreparingExport, setIsPreparingExport] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingNotes, setIsDeletingNotes] = useState(false);
  const latestLoadId = useRef(0);

  const loadNotes = useCallback(async () => {
    const loadId = latestLoadId.current + 1;
    latestLoadId.current = loadId;
    const query = searchQuery.trim();

    try {
      setLoading(true);
      const data = query ? await notesApi.search(query) : await notesApi.getAll();

      if (latestLoadId.current === loadId) {
        setNotes(data);
      }
    } catch (error) {
      if (latestLoadId.current === loadId) {
        console.error("Failed to load notes:", error);
      }
    } finally {
      if (latestLoadId.current === loadId) {
        setLoading(false);
      }
    }
  }, [searchQuery]);

  useEffect(() => {
    latestLoadId.current += 1;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void loadNotes();
    }, searchQuery.trim() ? 250 : 0);

    return () => window.clearTimeout(timer);
  }, [loadNotes, searchQuery]);

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
      await loadNotes();
      toast.success(`已删除 ${deletedCount} 篇笔记`);
      setSelectedNoteIds(new Set());
      setSelectMode(false);
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error("Failed to delete notes:", error);
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`批量删除失败：已删除 ${deletedCount}/${idsToDelete.length} 篇。${message}`);
      setSelectedNoteIds(new Set(idsToDelete.slice(deletedCount)));
      await loadNotes();
    } finally {
      setIsDeletingNotes(false);
    }
  };

  return (
    <main className="pt-32 pb-20 px-6 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header with Select Mode Toggle */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-on-surface font-headline">笔记列表</h1>
          <button
            hidden={!isAdmin}
            onClick={() => {
              setSelectMode(!selectMode);
              setSelectedNoteIds(new Set());
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectMode
                ? "bg-primary text-on-primary"
                : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
            }`}
          >
            {selectMode ? "退出多选" : "批量选择"}
          </button>
        </div>

        {/* Batch Actions Bar (visible in select mode) */}
        {isAdmin && selectMode && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-surface-container-low rounded-xl flex items-center justify-between"
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
                className="flex items-center gap-2 px-4 py-2 rounded-lg editorial-gradient text-on-primary text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
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
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-600 transition-colors"
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
                className="p-2 rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
          className="mb-12 space-y-6"
        >
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
          <TagFilter
            selectedType={selectedType}
            selectedSubject={selectedSubject}
            sortOrder={sortOrder}
            onTypeChange={setSelectedType}
            onSubjectChange={setSelectedSubject}
            onSortOrderChange={setSortOrder}
          />
        </motion.section>

        {/* Notes Grid */}
        <section>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-3 text-on-surface-variant">加载笔记中...</span>
            </div>
          ) : filteredNotes.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
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
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20"
            >
              <p className="text-on-surface-variant text-lg">
                没有找到匹配的笔记
              </p>
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
