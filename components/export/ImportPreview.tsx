"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, FileText, Tag } from "lucide-react";
import { ParsedNote } from "@/lib/import";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

interface ImportPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  parsedNotes: ParsedNote[];
}

export function ImportPreview({ isOpen, onClose, parsedNotes }: ImportPreviewProps) {
  const router = useRouter();
  const toast = useToast();

  const handleEdit = (index: number) => {
    const note = parsedNotes[index];

    const importData = {
      title: note.title,
      content: note.content,
      tags: note.tags,
      noteType: 'note',
    };

    sessionStorage.setItem('pendingImport', JSON.stringify(importData));
    router.push('/create?import=true');
    onClose();
    toast.success('已跳转到编辑页面');
  };

  const handleSaveAll = () => {
    toast.info('直接保存功能将在连接数据库后启用');
    onClose();
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
                  className="px-4 py-2 rounded-lg editorial-gradient text-on-primary text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-2"
                >
                  去编辑
                </button>
              )}
              {parsedNotes.length > 1 && (
                <button
                  onClick={handleSaveAll}
                  className="px-4 py-2 rounded-lg editorial-gradient text-on-primary text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  保存全部 ({parsedNotes.length})
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
