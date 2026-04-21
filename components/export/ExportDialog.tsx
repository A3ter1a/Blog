"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, FileJson, FileText, BookOpen } from "lucide-react";
import { Note } from "@/lib/types";
import { exportAsJSON, exportAsMarkdown, exportAsObsidian } from "@/lib/export";

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  notes: Note[];
}

export function ExportDialog({ isOpen, onClose, notes }: ExportDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<string>("json");

  const formats = [
    {
      value: "json",
      label: "JSON 格式",
      description: "完整数据结构，支持导入还原",
      icon: FileJson,
    },
    {
      value: "markdown",
      label: "Markdown 格式",
      description: "标准 Markdown，包含元数据",
      icon: FileText,
    },
    {
      value: "obsidian",
      label: "Obsidian 格式",
      description: "YAML front matter + [[链接]] 格式",
      icon: BookOpen,
    },
  ];

  const handleExport = async () => {
    switch (selectedFormat) {
      case "json":
        exportAsJSON(notes);
        break;
      case "markdown":
        await exportAsMarkdown(notes);
        break;
      case "obsidian":
        await exportAsObsidian(notes);
        break;
    }
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

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={onClose}
          >
            <div
              className="bg-surface-container-lowest rounded-2xl shadow-elevated max-w-md w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/10">
                <h2 className="text-xl font-bold text-on-surface font-headline">选择导出格式</h2>
                <button
                  onClick={onClose}
                  className="p-2 rounded-full hover:bg-surface-container-high transition-colors"
                >
                  <X className="w-5 h-5 text-on-surface-variant" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-3">
                {formats.map((format) => {
                  const Icon = format.icon;
                  return (
                    <button
                      key={format.value}
                      onClick={() => setSelectedFormat(format.value)}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-200 ${
                        selectedFormat === format.value
                          ? "bg-primary/10 ring-2 ring-primary"
                          : "bg-surface-container-low hover:bg-surface-container-high"
                      }`}
                    >
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                          selectedFormat === format.value
                            ? "bg-primary text-on-primary"
                            : "bg-surface-container-highest text-primary"
                        }`}
                      >
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="text-left flex-1">
                        <div className="text-sm font-medium text-on-surface">{format.label}</div>
                        <div className="text-xs text-on-surface-variant/60">{format.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-outline-variant/10 bg-surface-container-low">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-surface-container-high text-on-surface-variant text-sm font-medium hover:bg-surface-container-highest transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleExport}
                  className="px-4 py-2 rounded-lg editorial-gradient text-on-primary text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  导出 {notes.length} 条笔记
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
