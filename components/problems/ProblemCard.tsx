"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Eye, EyeOff, Lightbulb, Pencil, Check, X, Sparkles, Loader2 } from "lucide-react";
import type { Problem, ProblemType, Difficulty } from "@/lib/types";
import { problemTypeMap, difficultyMap, difficultyColorMap } from "@/lib/types";
import { MarkdownContent } from "@/components/ui/MarkdownContent";

interface ProblemCardProps {
  problem: Problem;
  index: number;
  noteId?: string;
  onUpdate?: (updated: Problem) => void;
}

export function ProblemCard({ problem, index, noteId, onUpdate }: ProblemCardProps) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // AI review state
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewResult, setReviewResult] = useState<{
    summary: string;
    hasIssues: boolean;
    suggestions: { field: string; issue: string; suggestion: string }[];
  } | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

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
    setReviewResult(null);
    setReviewError(null);
  };

  const handleAIReview = async () => {
    setReviewResult(null);
    setReviewError(null);
    setIsReviewing(true);

    try {
      const raw = localStorage.getItem('ai-config');
      const config = raw ? JSON.parse(raw) : null;
      if (!config?.deepseekApiKey) {
        setReviewError('请先在设置中配置 DeepSeek API Key');
        setIsReviewing(false);
        return;
      }

      const res = await fetch('/api/ai/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem: {
            question: editData.question,
            answer: editData.answer,
            explanation: editData.explanation,
            type: editData.type,
            difficulty: editData.difficulty,
            tags: editData.tags.split(/[,，]/).map((t: string) => t.trim()).filter(Boolean),
            tips: editData.tips || undefined,
          },
          apiKey: config.deepseekApiKey,
          model: config.deepseekModel,
        }),
        signal: AbortSignal.timeout(180000),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'AI 检查失败');
      }

      const data = await res.json();
      setReviewResult(data.review);
    } catch (error: any) {
      const msg = error.name === 'AbortError' || error.name === 'TimeoutError'
        ? 'AI 检查超时，请重试'
        : (error.message || '未知错误');
      setReviewError(msg);
    } finally {
      setIsReviewing(false);
    }
  };

  const handleApplySuggestion = (suggestion: { field: string; suggestion: string }) => {
    switch (suggestion.field) {
      case 'question':
      case 'answer':
      case 'explanation':
      case 'tips':
        setEditData(prev => ({ ...prev, [suggestion.field]: suggestion.suggestion }));
        break;
      case 'type':
        if (['choice', 'fill', 'calculation', 'proof', 'proofEssay'].includes(suggestion.suggestion)) {
          setEditData(prev => ({ ...prev, type: suggestion.suggestion as ProblemType }));
        }
        break;
      case 'difficulty':
        if (['easy', 'medium', 'hard'].includes(suggestion.suggestion)) {
          setEditData(prev => ({ ...prev, difficulty: suggestion.suggestion as Difficulty }));
        }
        break;
      case 'tags':
        setEditData(prev => ({ ...prev, tags: suggestion.suggestion }));
        break;
    }
  };

  const fieldLabelMap: Record<string, string> = {
    question: '题目',
    answer: '答案',
    explanation: '解析',
    tips: '提示',
    type: '题型',
    difficulty: '难度',
    tags: '标签',
    general: '综合',
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
      {/* Header: Number + Tags + Pencil */}
      <div className="flex items-center justify-between p-4 border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <span className="flex-shrink-0 w-7 h-7 rounded-full editorial-gradient text-on-primary text-xs font-bold flex items-center justify-center">
            {index + 1}
          </span>
          <div className="flex items-center gap-2">
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
        </div>
        <div className="flex items-center gap-2">
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

          {/* AI Review + Save / Cancel */}
          <div className="space-y-3">
            {/* Save / Cancel row */}
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container text-on-surface-variant text-sm hover:bg-surface-container-high transition-colors"
              >
                <X className="w-4 h-4" />
                取消
              </button>
              <button
                onClick={handleAIReview}
                disabled={isReviewing || !editData.question.trim()}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm hover:bg-amber-100 transition-colors disabled:opacity-40"
                title="AI 智能检查"
              >
                {isReviewing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                AI 检查
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

            {/* Review Error */}
            {reviewError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs">
                {reviewError}
              </div>
            )}

            {/* Review Result */}
            {reviewResult && (
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 space-y-3">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="text-sm font-medium text-amber-800">AI 审查结果</span>
                    <p className="text-xs text-amber-600 mt-0.5">{reviewResult.summary}</p>
                  </div>
                </div>
                {reviewResult.hasIssues && reviewResult.suggestions.length > 0 && (
                  <div className="space-y-2">
                    {reviewResult.suggestions.map((s, i) => (
                      <div key={i} className="p-3 rounded-lg bg-white/60 border border-amber-100">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-amber-700">
                            [{fieldLabelMap[s.field] || s.field}]
                          </span>
                          {['question', 'answer', 'explanation', 'tips', 'type', 'difficulty', 'tags'].includes(s.field) && (
                            <button
                              onClick={() => handleApplySuggestion(s)}
                              className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                            >
                              应用建议
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-amber-600">{s.issue}</p>
                        {s.suggestion && (
                          <p className="text-xs text-green-700 mt-1 bg-green-50/50 rounded px-2 py-1">
                            建议值: {s.suggestion.length > 80 ? s.suggestion.slice(0, 80) + '...' : s.suggestion}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
    </motion.div>
  );
}
