"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Eye, EyeOff, Loader2, Pencil, Plus, Sparkles, Trash2, Wrench, X } from "lucide-react";
import type { Difficulty, Problem, ProblemOption, ProblemType } from "@/lib/types";
import { difficultyColorMap, difficultyMap, problemTypeMap } from "@/lib/types";
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
import { ensureChoiceOptions, normalizeProblemOptions } from "@/lib/problem-utils";

interface ProblemCardProps {
  problem: Problem;
  index: number;
  noteId?: string;
  onUpdate?: (updated: Problem) => void | Promise<void>;
}

type ReviewSuggestion = {
  field: string;
  issue: string;
  suggestion: string;
};

type ReviewResult = {
  summary: string;
  hasIssues: boolean;
  suggestions: ReviewSuggestion[];
};

type ProblemEditData = {
  type: ProblemType;
  difficulty: Difficulty;
  question: string;
  answer: string;
  options: ProblemOption[];
};

function createEditData(problem: Problem): ProblemEditData {
  return {
    type: problem.type,
    difficulty: problem.difficulty,
    question: problem.question,
    answer: problem.answer,
    options: ensureChoiceOptions(problem.options),
  };
}

function createEmptyOption(index: number): ProblemOption {
  return { label: String.fromCharCode(65 + index), content: "" };
}

function problemOptionsForSave(editData: ProblemEditData): ProblemOption[] | undefined {
  if (editData.type !== "choice") return undefined;
  return normalizeProblemOptions(editData.options);
}

export function ProblemCard({ problem, index, onUpdate }: ProblemCardProps) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [editData, setEditData] = useState<ProblemEditData>(() => createEditData(problem));

  const hasOptions = problem.type === "choice" && Array.isArray(problem.options) && problem.options.length > 0;
  const fieldBaseClass = "w-full rounded-lg border border-outline-variant/15 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/40 focus:border-primary/35 focus:bg-surface-container-lowest";
  const textareaClass = `${fieldBaseClass} resize-y leading-6`;
  const inputClass = `${fieldBaseClass} h-10`;
  const selectClass = "h-10 rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 text-sm text-on-surface outline-none transition-colors focus:border-primary/35 focus:bg-surface-container-lowest";
  const labelClass = "mb-1 block text-xs text-on-surface-variant/55";

  const handleStartEdit = () => {
    setSaveError(null);
    setReviewResult(null);
    setReviewError(null);
    setEditData(createEditData(problem));
    setIsEditing(true);
  };

  const handleCancel = () => {
    if (isSaving) return;
    setIsEditing(false);
    setReviewResult(null);
    setReviewError(null);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!onUpdate || isSaving) return;

    const updated: Problem = {
      ...problem,
      type: editData.type,
      difficulty: editData.difficulty,
      question: editData.question,
      answer: editData.answer,
      explanation: "",
      tips: undefined,
      tags: [],
      options: problemOptionsForSave(editData),
    };

    setIsSaving(true);
    setSaveError(null);
    try {
      await onUpdate(updated);
      setIsEditing(false);
      setReviewResult(null);
      setReviewError(null);
    } catch (error: unknown) {
      setSaveError(error instanceof Error ? error.message : "保存失败，请稍后重试");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAIReview = async () => {
    setReviewResult(null);
    setReviewError(null);
    setIsReviewing(true);

    try {
      const config = readJsonStorage(AI_CONFIG_STORAGE_KEY, DEFAULT_AI_CONFIG, normalizeAIConfig);
      if (ALLOW_CLIENT_AI_KEYS && !config.deepseekApiKey) {
        setReviewError("请先在设置中配置 DeepSeek API Key");
        return;
      }

      const res = await fetch("/api/ai/review", {
        method: "POST",
        headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          problem: {
            question: editData.question,
            answer: editData.answer,
            options: problemOptionsForSave(editData),
            type: editData.type,
            difficulty: editData.difficulty,
          },
          apiKey: ALLOW_CLIENT_AI_KEYS ? config.deepseekApiKey : undefined,
          model: config.deepseekModel || DEFAULT_DEEPSEEK_MODEL,
        }),
        signal: AbortSignal.timeout(180000),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.error === "string" ? err.error : "AI 检查失败");
      }

      const data = await res.json();
      setReviewResult(data.review);
    } catch (error: unknown) {
      const errorName = error instanceof Error ? error.name : "";
      const errorMessage = error instanceof Error ? error.message : "";
      setReviewError(
        errorName === "AbortError" || errorName === "TimeoutError"
          ? "AI 检查超时，请重试"
          : errorMessage || "未知错误",
      );
    } finally {
      setIsReviewing(false);
    }
  };

  const handleRepairEditData = () => {
    setEditData((current) => ({
      ...current,
      question: repairMarkdown(current.question),
      answer: repairMarkdown(current.answer),
      options: current.options.map((option) => ({
        ...option,
        content: repairMarkdown(option.content),
      })),
    }));
    setReviewResult(null);
    setReviewError(null);
  };

  const handleApplySuggestion = (suggestion: ReviewSuggestion) => {
    switch (suggestion.field) {
      case "question":
      case "answer":
        setEditData((current) => ({ ...current, [suggestion.field]: suggestion.suggestion }));
        break;
      case "type":
        if (["choice", "fill", "calculation", "proof", "proofEssay"].includes(suggestion.suggestion)) {
          setEditData((current) => ({
            ...current,
            type: suggestion.suggestion as ProblemType,
            options: suggestion.suggestion === "choice" ? ensureChoiceOptions(current.options) : current.options,
          }));
        }
        break;
      case "difficulty":
        if (["easy", "medium", "hard"].includes(suggestion.suggestion)) {
          setEditData((current) => ({ ...current, difficulty: suggestion.suggestion as Difficulty }));
        }
        break;
    }
  };

  const updateOption = (optionIndex: number, field: "label" | "content", value: string) => {
    setEditData((current) => {
      const options = [...current.options];
      const option = options[optionIndex] || createEmptyOption(optionIndex);
      options[optionIndex] = { ...option, [field]: value };
      return { ...current, options };
    });
  };

  const fieldLabelMap: Record<string, string> = {
    question: "题干",
    answer: "答案",
    type: "题型",
    difficulty: "难度",
    general: "综合",
  };

  return (
    <motion.div
      id={`problem-${problem.id}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.24) }}
      className="scroll-mt-24 overflow-hidden rounded-lg border border-outline-variant/20 bg-surface-container-lowest"
    >
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

        {onUpdate && !isEditing && (
          <button
            onClick={handleStartEdit}
            className="rounded-lg p-1.5 text-on-surface-variant/40 transition-colors hover:bg-surface-container-highest hover:text-primary"
            title="编辑题目"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>

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
                  onChange={(event) => {
                    const nextType = event.target.value as ProblemType;
                    setEditData((current) => ({
                      ...current,
                      type: nextType,
                      options: nextType === "choice" ? ensureChoiceOptions(current.options) : current.options,
                    }));
                  }}
                  className={selectClass}
                >
                  {(Object.entries(problemTypeMap) as [ProblemType, string][]).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <select
                  value={editData.difficulty}
                  onChange={(event) => setEditData((current) => ({ ...current, difficulty: event.target.value as Difficulty }))}
                  className={selectClass}
                >
                  {(Object.entries(difficultyMap) as [Difficulty, string][]).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
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
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.18fr)_minmax(320px,0.82fr)]">
                <section className="space-y-4">
                  <div>
                    <label className={labelClass}>题干</label>
                    <textarea
                      value={editData.question}
                      onChange={(event) => setEditData((current) => ({ ...current, question: event.target.value }))}
                      placeholder="输入题干，支持 Markdown / LaTeX..."
                      rows={12}
                      className={`${textareaClass} min-h-[320px]`}
                    />
                  </div>

                  {editData.type === "choice" && (
                    <div className="rounded-lg border border-outline-variant/10 bg-surface-container-low/60 p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <label className="text-xs font-medium text-on-surface-variant">选择题选项</label>
                        <button
                          type="button"
                          onClick={() => setEditData((current) => ({
                            ...current,
                            options: [...current.options, createEmptyOption(current.options.length)],
                          }))}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          添加选项
                        </button>
                      </div>
                      <div className="space-y-2">
                        {editData.options.map((option, optionIndex) => (
                          <div
                            key={`${option.label}-${optionIndex}`}
                            className="grid grid-cols-[56px_minmax(0,1fr)_32px] items-start gap-2"
                          >
                            <input
                              value={option.label}
                              onChange={(event) => updateOption(optionIndex, "label", event.target.value)}
                              className={`${inputClass} px-2 text-center font-semibold`}
                              placeholder="A"
                            />
                            <textarea
                              value={option.content}
                              onChange={(event) => updateOption(optionIndex, "content", event.target.value)}
                              rows={2}
                              className={`${textareaClass} min-h-12`}
                              placeholder="选项内容"
                            />
                            <button
                              type="button"
                              onClick={() => setEditData((current) => ({
                                ...current,
                                options: current.options.filter((_, indexValue) => indexValue !== optionIndex),
                              }))}
                              className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant/45 transition-colors hover:bg-red-50 hover:text-red-500"
                              title="删除选项"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                <section className="space-y-4">
                  <div>
                    <label className={labelClass}>答案</label>
                    <textarea
                      value={editData.answer}
                      onChange={(event) => setEditData((current) => ({ ...current, answer: event.target.value }))}
                      placeholder="输入简短答案..."
                      rows={10}
                      className={`${textareaClass} min-h-[260px]`}
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

                  {reviewResult && (
                    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <div className="flex items-start gap-2">
                        <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                        <div>
                          <span className="text-sm font-medium text-amber-800">AI 检查结果</span>
                          <p className="mt-0.5 text-xs text-amber-600">{reviewResult.summary}</p>
                        </div>
                      </div>
                      {reviewResult.hasIssues && reviewResult.suggestions.length > 0 && (
                        <div className="grid gap-2">
                          {reviewResult.suggestions.map((suggestion, suggestionIndex) => (
                            <div key={suggestionIndex} className="rounded-lg border border-amber-100 bg-white/60 p-3">
                              <div className="mb-1 flex items-center justify-between gap-3">
                                <span className="text-xs font-medium text-amber-700">
                                  [{fieldLabelMap[suggestion.field] || suggestion.field}]
                                </span>
                                {["question", "answer", "type", "difficulty"].includes(suggestion.field) && (
                                  <button
                                    onClick={() => handleApplySuggestion(suggestion)}
                                    className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
                                  >
                                    应用建议
                                  </button>
                                )}
                              </div>
                              <p className="text-xs text-amber-600">{suggestion.issue}</p>
                              {suggestion.suggestion && (
                                <p className="mt-1 rounded bg-green-50/50 px-2 py-1 text-xs text-green-700">
                                  建议值：{suggestion.suggestion.length > 80 ? `${suggestion.suggestion.slice(0, 80)}...` : suggestion.suggestion}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-outline-variant/15 bg-surface-container-low px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-5">
              <button
                onClick={handleAIReview}
                disabled={isReviewing || isSaving || !editData.question.trim()}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 text-sm text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-40"
                title="检查题干和答案"
              >
                {isReviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                AI 检查
              </button>
              <button
                onClick={handleRepairEditData}
                disabled={isSaving || (!editData.question.trim() && !editData.answer.trim())}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-primary/15 bg-primary/10 px-3 text-sm text-primary transition-colors hover:bg-primary/15 disabled:opacity-40"
                title="修正题干和答案里的 Markdown / LaTeX 格式"
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
          <div className="px-4 pb-4 pt-3">
            <div className="text-[15px] leading-8 text-on-surface sm:text-base">
              <MarkdownContent content={problem.question} />
            </div>

            {hasOptions && (
              <div className="mt-4 space-y-2">
                {problem.options?.map((option) => (
                  <div
                    key={option.label}
                    className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3 rounded-lg bg-surface-container-low p-3"
                  >
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {option.label}
                    </span>
                    <div className="min-w-0 text-on-surface-variant">
                      <MarkdownContent content={option.content} compact />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 px-4 pb-4">
            <button
              onClick={() => setShowAnswer((current) => !current)}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary/10 px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
            >
              {showAnswer ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showAnswer ? "隐藏答案" : "查看答案"}
            </button>
          </div>

          <AnimatePresence>
            {showAnswer && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                <div className="px-4 pb-4">
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                    <span className="text-sm font-bold text-green-700">答案：</span>
                    <div className="mt-2 text-green-700">
                      <MarkdownContent content={problem.answer || "暂无答案"} compact />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
}
