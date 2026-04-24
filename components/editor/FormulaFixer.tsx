"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Sparkles, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import {
  FormulaIssue,
  analyzeFormulas,
  applyFixes,
  renderPreview,
} from "@/lib/formula-fixer";
import { useToast } from "@/components/ui/Toast";
import "katex/dist/katex.min.css";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FormulaFixerProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Called when the user closes the dialog */
  onClose: () => void;
  /** The current markdown content to analyze */
  content: string;
  /** Called with the fixed content when user applies selected fixes */
  onApplyFixes: (fixedContent: string) => void;
}

// ---------------------------------------------------------------------------
// Badge config
// ---------------------------------------------------------------------------

const typeLabel: Record<FormulaIssue["type"], string> = {
  unescaped_brackets: "方括号未转义",
  spaces_in_delimiters: "定界符空格",
  latex_delimiters: "定界符转换",
  bare_environment: "环境包裹",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FormulaFixer({
  isOpen,
  onClose,
  content,
  onApplyFixes,
}: FormulaFixerProps) {
  const toast = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Analyze content when dialog opens
  const issues = useMemo(() => {
    if (!isOpen || !content) return [];
    return analyzeFormulas(content);
  }, [isOpen, content]);

  // Pre-compute rendered previews for all issues
  const previews = useMemo(() => {
    const map = new Map<string, ReturnType<typeof renderPreview>>();
    for (const issue of issues) {
      map.set(issue.id, renderPreview(issue));
    }
    return map;
  }, [issues]);

  // Auto-select all issues when dialog opens / issues change
  useEffect(() => {
    if (issues.length === 0) return;
    setSelectedIds(new Set(issues.map((i) => i.id)));
    setExpandedIds(new Set(issues.slice(0, 3).map((i) => i.id)));
  }, [issues]);

  const toggleIssue = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(issues.map((i) => i.id)));
  const deselectAll = () => setSelectedIds(new Set());

  const handleApply = () => {
    const selectedIssues = issues.filter((i) => selectedIds.has(i.id));
    if (selectedIssues.length === 0) {
      toast.info("未选择任何修复项");
      return;
    }
    const fixed = applyFixes(content, selectedIssues);
    onApplyFixes(fixed);
    toast.success(`已应用 ${selectedIssues.length} 处修复`);
    onClose();
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

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
              className="bg-surface-container-lowest rounded-2xl shadow-elevated max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/10">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <h2 className="text-xl font-bold text-on-surface font-headline">
                    公式格式修正
                  </h2>
                  {issues.length > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                      {issues.length} 处
                    </span>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-full hover:bg-surface-container-high transition-colors"
                >
                  <X className="w-5 h-5 text-on-surface-variant" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {issues.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Check className="w-12 h-12 text-green-500 mb-3" />
                    <p className="text-on-surface font-medium">未发现需要修正的公式</p>
                    <p className="text-sm text-on-surface-variant/60 mt-1">
                      当前内容中的公式格式均符合渲染规范
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Select-all bar */}
                    <div className="flex items-center justify-between pb-2 border-b border-outline-variant/10">
                      <span className="text-sm text-on-surface-variant">
                        已选 {selectedIds.size} / {issues.length}
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={selectAll}
                          className="text-xs px-3 py-1 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant transition-colors"
                        >
                          全选
                        </button>
                        <button
                          onClick={deselectAll}
                          className="text-xs px-3 py-1 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant transition-colors"
                        >
                          取消全选
                        </button>
                      </div>
                    </div>

                    {/* Issue list */}
                    {issues.map((issue) => {
                      const isSelected = selectedIds.has(issue.id);
                      const isExpanded = expandedIds.has(issue.id);
                      const preview = previews.get(issue.id)!;

                      return (
                        <div
                          key={issue.id}
                          className={`rounded-xl border transition-all ${
                            isSelected
                              ? "border-primary/30 bg-primary/[0.02]"
                              : "border-outline-variant/10 bg-surface-container-low"
                          }`}
                        >
                          {/* Issue header (always visible) */}
                          <div className="flex items-center gap-3 px-4 py-3">
                            {/* Checkbox */}
                            <button
                              onClick={() => toggleIssue(issue.id)}
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                isSelected
                                  ? "bg-primary border-primary text-on-primary"
                                  : "border-outline-variant/40 hover:border-primary/40"
                              }`}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5" />}
                            </button>

                            {/* Type badge */}
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 flex-shrink-0">
                              {typeLabel[issue.type]}
                            </span>

                            {/* Description */}
                            <p className="text-sm text-on-surface flex-1 min-w-0 truncate">
                              {issue.description}
                            </p>

                            {/* Expand toggle */}
                            <button
                              onClick={() => toggleExpand(issue.id)}
                              className="p-1 rounded-lg hover:bg-surface-container-high transition-colors flex-shrink-0"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-on-surface-variant" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-on-surface-variant" />
                              )}
                            </button>
                          </div>

                          {/* Expanded preview */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="px-4 pb-4 space-y-3 border-t border-outline-variant/5 pt-3">
                                  {/* Source diff */}
                                  <div className="grid grid-cols-2 gap-3">
                                    {/* Original */}
                                    <div>
                                      <div className="text-xs text-amber-600 font-medium mb-1 flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" />
                                        修改前
                                      </div>
                                      <div className="text-xs font-mono bg-red-50 border border-red-200 rounded-lg p-2.5 text-red-800 break-all">
                                        {issue.originalText}
                                      </div>
                                    </div>
                                    {/* Fixed */}
                                    <div>
                                      <div className="text-xs text-green-600 font-medium mb-1 flex items-center gap-1">
                                        <Check className="w-3 h-3" />
                                        修改后
                                      </div>
                                      <div className="text-xs font-mono bg-green-50 border border-green-200 rounded-lg p-2.5 text-green-800 break-all">
                                        {issue.fixedText}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Rendered preview */}
                                  {(preview.beforeHtml !== issue.originalText ||
                                    preview.afterHtml !== issue.fixedText) && (
                                    <div>
                                      <div className="text-xs text-on-surface-variant/60 font-medium mb-1">
                                        渲染效果对比
                                      </div>
                                      <div className="grid grid-cols-2 gap-3">
                                        {/* Before render */}
                                        <div className="bg-surface-container-low rounded-lg p-3 min-h-[2rem]">
                                          <div
                                            className="text-sm prose prose-sm max-w-none katex-preview"
                                            dangerouslySetInnerHTML={{
                                              __html: preview.beforeHtml,
                                            }}
                                          />
                                        </div>
                                        {/* After render */}
                                        <div className="bg-surface-container-low rounded-lg p-3 min-h-[2rem]">
                                          <div
                                            className="text-sm prose prose-sm max-w-none katex-preview"
                                            dangerouslySetInnerHTML={{
                                              __html: preview.afterHtml,
                                            }}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-outline-variant/10 bg-surface-container-low">
                <p className="text-xs text-on-surface-variant/60">
                  仅修正公式格式，不会修改数学内容
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg bg-surface-container-high text-on-surface-variant text-sm font-medium hover:bg-surface-container-highest transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleApply}
                    disabled={selectedIds.size === 0}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      selectedIds.size > 0
                        ? "editorial-gradient text-on-primary hover:opacity-90"
                        : "bg-surface-container-highest text-on-surface-variant/40 cursor-not-allowed"
                    }`}
                  >
                    应用 {selectedIds.size > 0 ? `${selectedIds.size} 处修复` : ""}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
