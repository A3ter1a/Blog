"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Copy } from "lucide-react";

interface DiffViewerProps {
  isOpen: boolean;
  onClose: () => void;
  original: string;
  polished: string;
  onApply: () => void;
}

// 简单的行级 diff 算法
function computeLineDiff(original: string, polished: string) {
  const origLines = original.split("\n");
  const newLines = polished.split("\n");
  const result: { type: "same" | "added" | "removed"; content: string }[] = [];

  // 使用简单的 LCS 算法找出差异
  const m = origLines.length;
  const n = newLines.length;

  // 构建 DP 表
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // 回溯找出差异
  let i = m;
  let j = n;
  const changes: { type: "same" | "added" | "removed"; line: string; origIdx: number; newIdx: number }[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origLines[i - 1] === newLines[j - 1]) {
      changes.unshift({ type: "same", line: origLines[i - 1], origIdx: i - 1, newIdx: j - 1 });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      changes.unshift({ type: "added", line: newLines[j - 1], origIdx: -1, newIdx: j - 1 });
      j--;
    } else {
      changes.unshift({ type: "removed", line: origLines[i - 1], origIdx: i - 1, newIdx: -1 });
      i--;
    }
  }

  return changes;
}

export function DiffViewer({ isOpen, onClose, original, polished, onApply }: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<"split" | "unified">("split");
  const [copied, setCopied] = useState(false);

  const diff = computeLineDiff(original, polished);

  const addedCount = diff.filter((d) => d.type === "added").length;
  const removedCount = diff.filter((d) => d.type === "removed").length;
  const changedCount = Math.max(addedCount, removedCount);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(polished);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-surface-container-lowest rounded-2xl shadow-elevated w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/10">
            <div className="flex items-center gap-4">
              <h3 className="text-lg font-bold text-on-surface">润色对比</h3>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-1 rounded-md bg-red-500/10 text-red-400">
                  -{removedCount} 删除
                </span>
                <span className="px-2 py-1 rounded-md bg-green-500/10 text-green-400">
                  +{addedCount} 新增
                </span>
                <span className="text-on-surface-variant/40">·</span>
                <span className="text-on-surface-variant">共 {changedCount} 处修改</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* View Mode Toggle */}
              <div className="flex bg-surface-container rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode("split")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    viewMode === "split"
                      ? "bg-primary/20 text-primary"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  并排
                </button>
                <button
                  onClick={() => setViewMode("unified")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    viewMode === "unified"
                      ? "bg-primary/20 text-primary"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  合并
                </button>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-surface-container-high text-on-surface-variant transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Diff Content */}
          <div className="flex-1 overflow-auto p-6">
            {viewMode === "split" ? (
              <div className="grid grid-cols-2 gap-4">
                {/* Original */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-on-surface-variant">原文</span>
                  </div>
                  <div className="bg-surface-container rounded-xl p-4 font-mono text-sm leading-relaxed max-h-[60vh] overflow-auto">
                    {original.split("\n").map((line, i) => {
                      const isRemoved = diff.some(
                        (d) => d.type === "removed" && d.line === line
                      );
                      return (
                        <div
                          key={i}
                          className={`px-2 py-0.5 rounded ${
                            isRemoved ? "bg-red-500/10 text-red-500" : "text-on-surface-variant"
                          }`}
                        >
                          <span className="inline-block w-6 text-right mr-3 text-on-surface-variant/30 select-none">
                            {i + 1}
                          </span>
                          {line || "\u00A0"}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Polished */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-on-surface-variant">润色后</span>
                  </div>
                  <div className="bg-surface-container rounded-xl p-4 font-mono text-sm leading-relaxed max-h-[60vh] overflow-auto">
                    {polished.split("\n").map((line, i) => {
                      const isAdded = diff.some(
                        (d) => d.type === "added" && d.line === line
                      );
                      return (
                        <div
                          key={i}
                          className={`px-2 py-0.5 rounded ${
                            isAdded ? "bg-green-500/10 text-green-500" : "text-on-surface-variant"
                          }`}
                        >
                          <span className="inline-block w-6 text-right mr-3 text-on-surface-variant/30 select-none">
                            {i + 1}
                          </span>
                          {line || "\u00A0"}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              /* Unified View */
              <div className="bg-surface-container rounded-xl p-4 font-mono text-sm leading-relaxed max-h-[60vh] overflow-auto">
                {diff.map((item, i) => (
                  <div
                    key={i}
                    className={`px-2 py-0.5 rounded flex ${
                      item.type === "removed"
                        ? "bg-red-500/10"
                        : item.type === "added"
                        ? "bg-green-500/10"
                        : ""
                    }`}
                  >
                    <span className="w-6 text-right mr-2 text-on-surface-variant/30 select-none flex-shrink-0">
                      {item.type === "added"
                        ? "+"
                        : item.type === "removed"
                        ? "-"
                        : " "}
                    </span>
                    <span
                      className={
                        item.type === "removed"
                          ? "text-red-500 line-through"
                          : item.type === "added"
                          ? "text-green-500"
                          : "text-on-surface-variant"
                      }
                    >
                      {item.line || "\u00A0"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-outline-variant/10">
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest transition-colors text-sm"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              {copied ? "已复制" : "复制全文"}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest transition-colors text-sm"
            >
              取消
            </button>
            <button
              onClick={onApply}
              className="px-6 py-2 rounded-xl editorial-gradient text-on-primary font-medium hover:opacity-90 active:scale-[0.98] transition-all duration-200 text-sm"
            >
              应用更改
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
