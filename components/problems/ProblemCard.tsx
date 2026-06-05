"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Eye, EyeOff, Info, Lightbulb, Pencil, Check, X, Sparkles, Loader2, Wrench } from "lucide-react";
import type { Problem, ProblemType, Difficulty } from "@/lib/types";
import { problemTypeMap, difficultyMap, difficultyColorMap } from "@/lib/types";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { repairMarkdown } from "@/lib/markdown";
import { buildAuthHeaders } from "@/lib/fetch-with-auth";
import {
  AI_CONFIG_STORAGE_KEY,
  ALLOW_CLIENT_AI_KEYS,
  DEFAULT_AI_CONFIG,
  DEFAULT_DEEPSEEK_MODEL,
  normalizeAIConfig,
} from "@/lib/ai-config";
import { readJsonStorage } from "@/lib/browser-storage";

interface ProblemCardProps {
  problem: Problem;
  index: number;
  noteId?: string;
  onUpdate?: (updated: Problem) => void | Promise<void>;
}

export function ProblemCard({ problem, index, onUpdate }: ProblemCardProps) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    setSaveError(null);
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

  const handleSave = async () => {
    if (!onUpdate || isSaving) return;
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

    setIsSaving(true);
    setSaveError(null);
    try {
      await onUpdate(updated);
      setIsEditing(false);
      setReviewResult(null);
      setReviewError(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "保存失败，请稍后重试";
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (isSaving) return;
    setIsEditing(false);
    setReviewResult(null);
    setReviewError(null);
    setSaveError(null);
  };

  const handleAIReview = async () => {
    setReviewResult(null);
    setReviewError(null);
    setIsReviewing(true);

    try {
      const config = readJsonStorage(AI_CONFIG_STORAGE_KEY, DEFAULT_AI_CONFIG, normalizeAIConfig);
      if (ALLOW_CLIENT_AI_KEYS && !config.deepseekApiKey) {
        setReviewError('请先在设置中配置 DeepSeek API Key');
        setIsReviewing(false);
        return;
      }

      const res = await fetch('/api/ai/review', {
        method: 'POST',
        headers: await buildAuthHeaders({ 'Content-Type': 'application/json' }),
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
          apiKey: ALLOW_CLIENT_AI_KEYS ? config.deepseekApiKey : undefined,
          model: config.deepseekModel || DEFAULT_DEEPSEEK_MODEL,
        }),
        signal: AbortSignal.timeout(180000),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'AI 检查失败');
      }

      const data = await res.json();
      setReviewResult(data.review);
    } catch (error: unknown) {
      const errorName = error instanceof Error ? error.name : '';
      const errorMessage = error instanceof Error ? error.message : '';
      const msg = errorName === 'AbortError' || errorName === 'TimeoutError'
        ? 'AI 检查超时，请重试'
        : (errorMessage || '未知错误');
      setReviewError(msg);
    } finally {
      setIsReviewing(false);
    }
  };

  const handleRepairEditData = () => {
    setEditData(prev => ({
      ...prev,
      question: repairMarkdown(prev.question),
      answer: repairMarkdown(prev.answer),
      explanation: repairMarkdown(prev.explanation),
      tips: repairMarkdown(prev.tips),
    }));
    setReviewResult(null);
    setReviewError(null);
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

  const fieldBaseClass = "w-full rounded-lg border border-outline-variant/15 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/40 focus:border-primary/35 focus:bg-surface-container-lowest";
  const inputClass = `${fieldBaseClass} h-10`;
  const textareaClass = `${fieldBaseClass} resize-y leading-6`;
  const selectClass = "h-10 rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 text-sm text-on-surface outline-none transition-colors focus:border-primary/35 focus:bg-surface-container-lowest";
  const labelClass = "text-xs text-on-surface-variant/50 mb-1 block";
  const hasExtraInfo = Boolean(problem.tips) || problem.tags.length > 0;
  const handleToggleAnswer = () => {
    setShowAnswer((current) => {
      if (current) setShowExplanation(false);
      return !current;
    });
  };

  return (
    <motion.div
      id={`problem-${problem.id}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.24) }}
      className="scroll-mt-24 overflow-hidden rounded-lg border border-outline-variant/20 bg-surface-container-lowest"
    >
      {/* Header: Number + core actions */}
      <div className="flex items-center justify-between gap-3 px-4 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 min-w-8 flex-shrink-0 items-center justify-center rounded-md border border-outline-variant/20 bg-surface-container-low px-2 text-xs font-bold text-on-surface">
            {index + 1}
          </span>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {problemTypeMap[problem.type]}
            </span>
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${difficultyColorMap[problem.difficulty]}`}>
              {difficultyMap[problem.difficulty]}
            </span>
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
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm sm:p-6"
          onClick={handleCancel}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-elevated"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-col gap-3 border-b border-outline-variant/15 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="text-xs font-medium text-on-surface-variant">编辑小题</div>
                <h3 className="mt-0.5 font-headline text-xl font-bold text-on-surface">
                  第 {index + 1} 题
                </h3>
              </div>
              <div className="grid gap-2 sm:grid-cols-[180px_150px_auto] sm:items-center">
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
                <button
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-outline-variant/30 px-3 text-sm font-medium text-on-surface-variant transition-colors hover:border-primary/35 hover:text-primary disabled:opacity-40"
                  title="关闭编辑窗口"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                <section className="space-y-4">
                  <div>
                    <label className={labelClass}>题目内容</label>
                    <textarea
                      value={editData.question}
                      onChange={(e) => setEditData(prev => ({ ...prev, question: e.target.value }))}
                      placeholder="输入题目内容，支持 Markdown / LaTeX..."
                      rows={10}
                      className={`${textareaClass} min-h-[240px]`}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>解析</label>
                    <textarea
                      value={editData.explanation}
                      onChange={(e) => setEditData(prev => ({ ...prev, explanation: e.target.value }))}
                      placeholder="输入解析..."
                      rows={12}
                      className={`${textareaClass} min-h-[300px]`}
                    />
                  </div>
                </section>

                <section className="space-y-4">
                  <div>
                    <label className={labelClass}>答案</label>
                    <textarea
                      value={editData.answer}
                      onChange={(e) => setEditData(prev => ({ ...prev, answer: e.target.value }))}
                      placeholder="输入答案..."
                      rows={8}
                      className={`${textareaClass} min-h-[200px]`}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>提示（可选）</label>
                    <textarea
                      value={editData.tips}
                      onChange={(e) => setEditData(prev => ({ ...prev, tips: e.target.value }))}
                      placeholder="解题提示..."
                      rows={5}
                      className={`${textareaClass} min-h-[140px]`}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>标签（逗号分隔）</label>
                    <input
                      type="text"
                      value={editData.tags}
                      onChange={(e) => setEditData(prev => ({ ...prev, tags: e.target.value }))}
                      placeholder="例如：函数, 导数, 极限"
                      className={inputClass}
                    />
                  </div>

                  {(saveError || reviewError) && (
                    <div className="space-y-2">
                      {saveError && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600">
                          {saveError}
                        </div>
                      )}
                      {reviewError && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600">
                          {reviewError}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </div>

              {reviewResult && (
                <div className="mt-4 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                    <div>
                      <span className="text-sm font-medium text-amber-800">AI 审查结果</span>
                      <p className="mt-0.5 text-xs text-amber-600">{reviewResult.summary}</p>
                    </div>
                  </div>
                  {reviewResult.hasIssues && reviewResult.suggestions.length > 0 && (
                    <div className="grid gap-2 lg:grid-cols-2">
                      {reviewResult.suggestions.map((s, i) => (
                        <div key={i} className="rounded-lg border border-amber-100 bg-white/60 p-3">
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-amber-700">
                              [{fieldLabelMap[s.field] || s.field}]
                            </span>
                            {['question', 'answer', 'explanation', 'tips', 'type', 'difficulty', 'tags'].includes(s.field) && (
                              <button
                                onClick={() => handleApplySuggestion(s)}
                                className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
                              >
                                应用建议
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-amber-600">{s.issue}</p>
                          {s.suggestion && (
                            <p className="mt-1 rounded bg-green-50/50 px-2 py-1 text-xs text-green-700">
                              建议值：{s.suggestion.length > 80 ? s.suggestion.slice(0, 80) + "..." : s.suggestion}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-outline-variant/15 bg-surface-container-low px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-5">
              <button
                onClick={handleAIReview}
                disabled={isReviewing || isSaving || !editData.question.trim()}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 text-sm text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-40"
                title="AI 智能检查"
              >
                {isReviewing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                AI 检查
              </button>
              <button
                onClick={handleRepairEditData}
                disabled={isSaving || (!editData.question.trim() && !editData.answer.trim() && !editData.explanation.trim() && !editData.tips.trim())}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-primary/15 bg-primary/10 px-3 text-sm text-primary transition-colors hover:bg-primary/15 disabled:opacity-40"
                title="修正题干、答案、解析和提示里的 Markdown / LaTeX 格式"
              >
                <Wrench className="h-4 w-4" />
                一键修正
              </button>
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-outline-variant/30 px-3 text-sm font-medium text-on-surface-variant transition-colors hover:border-primary/35 hover:text-primary disabled:opacity-40"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !editData.question.trim()}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-40"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {isSaving ? "保存中" : "保存"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : (
        <>
          {/* Question */}
          <div className="px-4 pb-4 pt-3">
            <div className="text-[15px] leading-8 text-on-surface sm:text-base">
              <MarkdownContent content={problem.question} />
            </div>

            {/* Options (for choice questions) */}
            {problem.options && problem.options.length > 0 && (
              <div className="mt-4 space-y-2">
                {problem.options.map((opt) => (
                  <div
                    key={opt.label}
                    className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3 rounded-lg bg-surface-container-low p-3"
                  >
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {opt.label}
                    </span>
                    <div className="min-w-0 text-on-surface-variant">
                      <MarkdownContent content={opt.content} compact />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 px-4 pb-4">
            <button
              onClick={handleToggleAnswer}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary/10 px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
            >
              {showAnswer ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showAnswer ? "隐藏答案" : "查看答案"}
            </button>
            {showAnswer && problem.explanation.trim() && (
              <button
                onClick={() => setShowExplanation(!showExplanation)}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-surface-container-high px-3 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container-highest"
              >
                {showExplanation ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {showExplanation ? "收起解析" : "查看解析"}
              </button>
            )}
          </div>

          {/* Answer */}
          <AnimatePresence>
            {showAnswer && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                <div className="px-4 pb-4">
                  <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                    <span className="text-sm font-bold text-green-700">答案：</span>
                    <div className="text-green-600 mt-2">
                      <MarkdownContent content={problem.answer || "暂无答案"} compact />
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
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                <div className="px-4 pb-4">
                  <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                    <span className="text-sm font-bold text-blue-700">解析：</span>
                    <div className="text-blue-600 mt-2">
                      <MarkdownContent content={problem.explanation} compact />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {hasExtraInfo && (
            <details className="mx-4 mb-4 rounded-lg border border-outline-variant/15 bg-surface-container-low">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-medium text-on-surface-variant transition-colors hover:text-primary">
                <span className="inline-flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5" />
                  题目信息
                </span>
                <ChevronDown className="h-3.5 w-3.5" />
              </summary>
              <div className="space-y-3 border-t border-outline-variant/10 px-3 py-3">
                {problem.tips && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                    <div className="text-sm leading-relaxed text-amber-700">
                      <MarkdownContent content={problem.tips} compact />
                    </div>
                  </div>
                )}

                {problem.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {problem.tags.map((tag) => (
                      <span
                        key={tag}
                        className="tag-chip px-2 py-1 text-xs"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </details>
          )}
        </>
      )}
    </motion.div>
  );
}
