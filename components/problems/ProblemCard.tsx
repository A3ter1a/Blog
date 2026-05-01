"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Eye, EyeOff, Lightbulb, Pencil, Check, X } from "lucide-react";
import type { Problem, ProblemType, Difficulty } from "@/lib/types";
import { problemTypeMap, difficultyMap, difficultyColorMap } from "@/lib/types";
import { MarkdownContent } from "@/components/ui/MarkdownContent";

interface ProblemCardProps {
  problem: Problem;
  index: number;
  noteId?: string;
  onUpdate?: (updated: Problem) => void;
  /** 紧凑模式：仅显示 header 行，隐藏题目正文/答案/解析等所有展开内容 */
  compact?: boolean;
}

export function ProblemCard({ problem, index, noteId, onUpdate, compact = false }: ProblemCardProps) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Edit form state
  const [editData, setEditData] = useState({
    type: problem.type,
    difficulty: problem.difficulty,
    question: problem.question,
    answer: problem.answer,
    explanation: problem.explanation,
    tips: problem.tips || "",
    tags: problem.tags.join(", "),
  });

  const handleStartEdit = () => {
    setEditData({
      type: problem.type,
      difficulty: problem.difficulty,
      question: problem.question,
      answer: problem.answer,
      explanation: problem.explanation,
      tips: problem.tips || "",
      tags: problem.tags.join(", "),
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    if (!onUpdate) return;
    const updated: Problem = {
      ...problem,
      type: editData.type,
      difficulty: editData.difficulty,
      question: editData.question,
      answer: editData.answer,
      explanation: editData.explanation,
      tips: editData.tips || undefined,
      tags: editData.tags.split(/[,，]/).map(t => t.trim()).filter(Boolean),
    };
    onUpdate(updated);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const inputClass = "w-full px-3 py-2 bg-surface-container rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 resize-none placeholder:text-on-surface-variant/40";
  const selectClass = "px-2 py-1.5 bg-surface-container rounded-lg text-xs text-on-surface outline-none focus:ring-2 focus:ring-primary/20";
  const labelClass = "text-xs text-on-surface-variant/50 mb-1 block";

  return (
    <motion.div
      id={`problem-${problem.id}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="bg-surface-container-lowest rounded-xl shadow-ambient overflow-hidden scroll-mt-24"
    >
      {/* Header: Number + Question preview + Tags + Pencil */}
      <div className={`flex items-center gap-3 p-4 ${compact && !isEditing ? "" : "border-b border-outline-variant/10"}`}>
        <span className="flex-shrink-0 w-7 h-7 rounded-full editorial-gradient text-on-primary text-xs font-bold flex items-center justify-center">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0 text-sm text-on-surface truncate">
          {problem.question.replace(/[$#*`_\[\]()~>\\]/g, '').substring(0, 60)}
          {problem.question.length > 60 ? '...' : ''}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isEditing ? (
            <>
              <select
                value={editData.type}
                onChange={(e) => setEditData(prev => ({ ...prev, type: e.target.value as ProblemType }))}
                className={selectClass}
              >
                {(Object.entries(problemTypeMap) as [ProblemType, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <select
                value={editData.difficulty}
                onChange={(e) => setEditData(prev => ({ ...prev, difficulty: e.target.value as Difficulty }))}
                className={selectClass}
              >
                {(Object.entries(difficultyMap) as [Difficulty, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </>
          ) : (
            <>
              <span className="px-2 py-0.5 rounded bg-primary-container/20 text-primary-container text-xs font-medium whitespace-nowrap">
                {problemTypeMap[problem.type]}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${difficultyColorMap[problem.difficulty]}`}>
                {difficultyMap[problem.difficulty]}
              </span>
              {problem.tags.length > 0 && (
                <span className="text-xs text-on-surface-variant/60 whitespace-nowrap">
                  {problem.tags.slice(0, 2).join(' · ')}
                  {problem.tags.length > 2 ? '...' : ''}
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {onUpdate && !isEditing && (
            <button
              onClick={handleStartEdit}
              className="p-1.5 rounded-lg hover:bg-surface-container-highest text-on-surface-variant/40 hover:text-primary transition-colors"
              title="编辑题目"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Compact mode: stop here, hide everything below */}
      {compact && !isEditing ? null : (
        <>
          {/* Edit Mode */}
          {isEditing ? (
            <div className="p-4 space-y-4">
              {/* Question — full width */}
              <div>
                <label className={labelClass}>题目内容</label>
                <textarea
                  value={editData.question}
                  onChange={(e) => setEditData(prev => ({ ...prev, question: e.target.value }))}
                  placeholder="输入题目内容，支持 Markdown / LaTeX..."
                  rows={2}
                  className={inputClass}
                />
              </div>

              {/* Answer + Explanation — 2 columns */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>答案</label>
                  <textarea
                    value={editData.answer}
                    onChange={(e) => setEditData(prev => ({ ...prev, answer: e.target.value }))}
                    placeholder="输入答案..."
                    rows={4}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>解析</label>
                  <textarea
                    value={editData.explanation}
                    onChange={(e) => setEditData(prev => ({ ...prev, explanation: e.target.value }))}
                    placeholder="输入解析..."
                    rows={4}
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Tips + Tags — 2 columns */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>提示 (可选)</label>
                  <textarea
                    value={editData.tips}
                    onChange={(e) => setEditData(prev => ({ ...prev, tips: e.target.value }))}
                    placeholder="解题提示..."
                    rows={2}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>标签 (逗号分隔)</label>
                  <input
                    type="text"
                    value={editData.tags}
                    onChange={(e) => setEditData(prev => ({ ...prev, tags: e.target.value }))}
                    placeholder="例如: 函数, 导数, 高考"
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Save / Cancel */}
              <div className="flex gap-2">
                <button
                  onClick={handleCancel}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container text-on-surface-variant text-sm hover:bg-surface-container-high transition-colors"
                >
                  <X className="w-4 h-4" />
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={!editData.question.trim()}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg editorial-gradient text-on-primary text-sm font-medium disabled:opacity-40 transition-all"
                >
                  <Check className="w-4 h-4" />
                  保存
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Question */}
              <div className="p-4">
                <div className="text-on-surface leading-relaxed">
                  <MarkdownContent content={problem.question} />
                </div>

                {/* Options (for choice questions) */}
                {problem.options && problem.options.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {problem.options.map((opt) => (
                      <div
                        key={opt.label}
                        className="flex gap-3 p-3 rounded-lg bg-surface-container-low"
                      >
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                          {opt.label}
                        </span>
                        <span className="text-on-surface-variant">
                          <MarkdownContent content={opt.content} />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 px-4 pb-4">
                <button
                  onClick={() => setShowAnswer(!showAnswer)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors duration-200"
                >
                  {showAnswer ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {showAnswer ? "隐藏答案" : "查看答案"}
                </button>
                <button
                  onClick={() => setShowExplanation(!showExplanation)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-container-high text-on-surface-variant text-sm font-medium hover:bg-surface-container-highest transition-colors duration-200"
                >
                  {showExplanation ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {showExplanation ? "收起解析" : "查看解析"}
                </button>
              </div>

              {/* Answer */}
              <AnimatePresence>
                {showAnswer && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4">
                      <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                        <span className="text-sm font-bold text-green-700">答案：</span>
                        <div className="text-green-600 mt-2">
                          <MarkdownContent content={problem.answer} />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Explanation */}
              <AnimatePresence>
                {showExplanation && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4">
                      <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                        <span className="text-sm font-bold text-blue-700">解析：</span>
                        <div className="text-blue-600 mt-2">
                          <MarkdownContent content={problem.explanation} />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Tips */}
              {problem.tips && (
                <div className="px-4 pb-2">
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <Lightbulb className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div className="text-amber-700 text-sm leading-relaxed">
                      <MarkdownContent content={problem.tips} />
                    </div>
                  </div>
                </div>
              )}

              {/* Tags */}
              {problem.tags.length > 0 && (
                <div className="px-4 pb-4 flex flex-wrap gap-2">
                  {problem.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 rounded-md bg-surface-container text-on-surface-variant text-xs"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </motion.div>
  );
}
