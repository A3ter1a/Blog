"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SearchBar } from "@/components/notes/SearchBar";
import { TagFilter } from "@/components/notes/TagFilter";
import { NoteCard } from "@/components/notes/NoteCard";
import { ExportDialog } from "@/components/export/ExportDialog";
import { mockNotes } from "@/lib/mock-data";
import { NoteType, Subject, Difficulty, ProblemType, Note } from "@/lib/types";
import { CheckSquare, Square, Download, X, Trash2, AlertTriangle } from "lucide-react";

export default function NotesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<NoteType | "all">("all");
  const [selectedSubject, setSelectedSubject] = useState<Subject | "all">("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty | "all">("all");
  const [selectedProblemType, setSelectedProblemType] = useState<ProblemType | "all">("all");
  
  // Selection state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const filteredNotes = useMemo(() => {
    return mockNotes.filter((note) => {
      const matchesSearch =
        searchQuery === "" ||
        note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.content.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = selectedType === "all" || note.type === selectedType;
      const matchesSubject = selectedSubject === "all" || note.subject === selectedSubject || note.type === "essay";

      // Problem-specific filters
      let matchesDifficulty = true;
      let matchesProblemType = true;
      if (note.type === "problem" && note.problems && note.problems.length > 0) {
        if (selectedDifficulty !== "all") {
          matchesDifficulty = note.problems.some((p) => p.difficulty === selectedDifficulty);
        }
        if (selectedProblemType !== "all") {
          matchesProblemType = note.problems.some((p) => p.type === selectedProblemType);
        }
      }

      return matchesSearch && matchesType && matchesSubject && matchesDifficulty && matchesProblemType;
    });
  }, [searchQuery, selectedType, selectedSubject, selectedDifficulty, selectedProblemType]);

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

  const handleExportSelected = () => {
    if (selectedNoteIds.size > 0) {
      setShowExportDialog(true);
    }
  };

  const handleBatchDelete = () => {
    const idsToDelete = Array.from(selectedNoteIds);
    for (const id of idsToDelete) {
      const idx = mockNotes.findIndex((n) => n.id === id);
      if (idx !== -1) {
        mockNotes.splice(idx, 1);
      }
    }
    setSelectedNoteIds(new Set());
    setSelectMode(false);
    setShowDeleteConfirm(false);
  };

  const selectedNotes = useMemo(() => {
    return mockNotes.filter((n) => selectedNoteIds.has(n.id));
  }, [selectedNoteIds]);

  return (
    <main className="pt-32 pb-20 px-6 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header with Select Mode Toggle */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-on-surface font-headline">笔记列表</h1>
          <button
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
        {selectMode && (
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
                disabled={selectedNoteIds.size === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg editorial-gradient text-on-primary text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                <Download className="w-4 h-4" />
                导出选中
              </button>
              <button
                onClick={() => {
                  if (selectedNoteIds.size > 0) {
                    setShowDeleteConfirm(true);
                  }
                }}
                disabled={selectedNoteIds.size === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-600 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                删除选中
              </button>
              <button
                onClick={() => {
                  setSelectMode(false);
                  setSelectedNoteIds(new Set());
                }}
                className="p-2 rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest transition-colors"
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
            selectedDifficulty={selectedDifficulty}
            selectedProblemType={selectedProblemType}
            onTypeChange={setSelectedType}
            onSubjectChange={setSelectedSubject}
            onDifficultyChange={setSelectedDifficulty}
            onProblemTypeChange={setSelectedProblemType}
          />
        </motion.section>

        {/* Notes Grid */}
        <section>
          {filteredNotes.length > 0 ? (
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
        onClose={() => setShowExportDialog(false)}
        notes={selectedNotes}
      />

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setShowDeleteConfirm(false)}
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
                  className="px-4 py-2 rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest transition-colors text-sm font-medium"
                >
                  取消
                </button>
                <button
                  onClick={handleBatchDelete}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors text-sm font-medium"
                >
                  确认删除
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
