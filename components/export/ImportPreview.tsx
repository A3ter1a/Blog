"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, FileText, Tag, BookOpen, CheckCircle2, Loader2 } from "lucide-react";
import { ParsedNote } from "@/lib/import";
import { analyzeImportedNote } from "@/lib/ai";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { subjectMap, typeMap } from "@/lib/types";

interface ImportPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  parsedNotes: ParsedNote[];
}

export function ImportPreview({ isOpen, onClose, parsedNotes }: ImportPreviewProps) {
  const router = useRouter();
  const toast = useToast();
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<Record<number, any>>({});

  useEffect(() => {
    if (isOpen && parsedNotes.length > 0) {
      runAnalysis();
    }
  }, [isOpen, parsedNotes]);

  const runAnalysis = async () => {
    setAnalyzing(true);
    const results: Record<number, any> = {};

    for (let i = 0; i < parsedNotes.length; i++) {
      const note = parsedNotes[i];
      const analysis = await analyzeImportedNote(note.title, note.content, note.tags);
      results[i] = analysis;
    }

    setAnalysisResults(results);
    setAnalyzing(false);
  };

  const handleEdit = (index: number) => {
    const note = parsedNotes[index];
    const analysis = analysisResults[index];

    const importData = {
      title: note.title,
      content: note.content,
      tags: analysis?.tags || note.tags,
      noteType: analysis?.type || 'note',
      subject: analysis?.subject,
      problems: analysis?.problems,
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
              {analyzing && (
                <div className="flex items-center gap-3 text-sm text-on-surface-variant">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  AI 正在分析笔记内容...
                </div>
              )}

              {parsedNotes.map((note, index) => {
                const analysis = analysisResults[index];
                return (
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

                    {/* AI Analysis Results */}
                    {analysis && (
                      <div className="bg-surface-container rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-2 text-xs">
                          <CheckCircle2 className="w-3 h-3 text-green-600" />
                          <span className="text-on-surface-variant">AI 分析结果</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-on-surface-variant/60">类型:</span>
                            <span className="ml-2 text-on-surface">
                              {typeMap[analysis.type as keyof typeof typeMap] || '未识别'}
                            </span>
                          </div>
                          <div>
                            <span className="text-on-surface-variant/60">科目:</span>
                            <span className="ml-2 text-on-surface">
                              {analysis.subject ? subjectMap[analysis.subject as keyof typeof subjectMap] || '未识别' : '未识别'}
                            </span>
                          </div>
                        </div>
                        {analysis.tags && analysis.tags.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-on-surface-variant/60 text-xs">建议标签:</span>
                            {analysis.tags.filter((t: string) => !note.tags.includes(t)).slice(0, 3).map((tag: string) => (
                              <span key={tag} className="px-2 py-0.5 rounded text-xs bg-primary/10 text-primary">
                                +{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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
                  disabled={analyzing}
                  className="px-4 py-2 rounded-lg editorial-gradient text-on-primary text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-2"
                >
                  <BookOpen className="w-4 h-4" />
                  去编辑
                </button>
              )}
              {parsedNotes.length > 1 && (
                <button
                  onClick={handleSaveAll}
                  disabled={analyzing}
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
