"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, FileText, Tag, Loader2 } from "lucide-react";
import { ParsedNote } from "@/lib/import";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { notesApi, type NoteCreateInput } from "@/lib/supabase";
import { useState } from "react";

interface ImportPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  parsedNotes: ParsedNote[];
  onImported?: () => void;
}

function toNoteCreateInput(note: ParsedNote): NoteCreateInput {
  const type = note.type ?? (note.problems && note.problems.length > 0 ? "problem" : "note");

  return {
    type,
    title: note.title.trim() || "Untitled",
    subject: type === "essay" ? undefined : note.subject,
    tags: note.tags,
    content: note.content,
    videos: note.videos ?? [],
    problems: type === "problem" ? note.problems ?? [] : undefined,
    coverImage: note.coverImage || undefined,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    isPublished: true,
  };
}

export function ImportPreview({ isOpen, onClose, parsedNotes, onImported }: ImportPreviewProps) {
  const router = useRouter();
  const toast = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const handleEdit = (index: number) => {
    const note = parsedNotes[index];
    const draft = toNoteCreateInput(note);

    const importData = {
      title: draft.title,
      content: draft.content,
      tags: draft.tags,
      noteType: draft.type,
      subject: draft.subject,
      problems: draft.problems,
      coverImage: draft.coverImage,
      videos: draft.videos,
    };

    sessionStorage.setItem('pendingImport', JSON.stringify(importData));
    router.push('/create?import=true');
    onClose();
    toast.success('已跳转到编辑页面');
  };

  const handleSaveAll = async () => {
    if (isSaving || parsedNotes.length === 0) return;

    setIsSaving(true);
    let savedCount = 0;
    let completed = false;

    try {
      for (const note of parsedNotes) {
        await notesApi.create(toNoteCreateInput(note));
        savedCount += 1;
      }

      completed = true;
      toast.success(`已保存 ${savedCount} 篇笔记`);
      onImported?.();
      if (!onImported) onClose();
      router.push("/notes");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`批量保存失败：已保存 ${savedCount}/${parsedNotes.length} 篇。${message}`);
    } finally {
      if (!completed) setIsSaving(false);
    }
  };

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

          {/* Preview Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full max-w-lg z-50 bg-surface-container-lowest shadow-elevated flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/10 flex-shrink-0">
              <h2 className="text-xl font-bold text-on-surface font-headline">导入预览</h2>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-surface-container-high transition-colors"
              >
                <X className="w-5 h-5 text-on-surface-variant" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {parsedNotes.map((note, index) => (
                <div key={index} className="bg-surface-container-low rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <FileText className="w-5 h-5 text-primary mt-0.5" />
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-on-surface">{note.title}</h3>
                      <p className="text-xs text-on-surface-variant/60 line-clamp-2 mt-1">
                        {note.content.substring(0, 100)}...
                      </p>
                    </div>
                  </div>

                  {/* Tags */}
                  {note.tags.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Tag className="w-3 h-3 text-on-surface-variant/40" />
                      {note.tags.slice(0, 5).map((tag) => (
                        <span key={tag} className="px-2 py-0.5 rounded text-xs bg-surface-container-highest text-on-surface-variant">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-outline-variant/10 bg-surface-container-low flex-shrink-0">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-surface-container-high text-on-surface-variant text-sm font-medium hover:bg-surface-container-highest transition-colors"
              >
                取消
              </button>
              {parsedNotes.length === 1 && (
                <button
                  onClick={() => handleEdit(0)}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-lg editorial-gradient text-on-primary text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-2"
                >
                  去编辑
                </button>
              )}
              {parsedNotes.length > 1 && (
                <button
                  onClick={handleSaveAll}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-lg editorial-gradient text-on-primary text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isSaving ? "保存中" : `保存全部 (${parsedNotes.length})`}
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
