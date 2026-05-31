"use client";

import { useState, useEffect, type ReactNode } from "react";
import { motion, AnimatePresence, Reorder, useDragControls } from "framer-motion";
import { AlertCircle, Plus, X, ChevronDown, ChevronUp, GripVertical, Sparkles, Scan, Copy, Trash2, Wrench } from "lucide-react";
import { Problem, ProblemType, Difficulty, problemTypeMap, difficultyMap, difficultyColorMap } from "@/lib/types";
import { chaptersApi } from "@/lib/chapters-api";
import { ChapterSelector } from "@/components/chapters/ChapterSelector";
import { ProblemCompare } from "./ProblemCompare";
import { ProblemPreview } from "./ProblemPreview";
import { OCRUploader } from "@/components/ai-assistant/OCRUploader";
import type { ChapterContextItem } from "@/hooks/useAIScan";
import { repairProblemMarkdownFields } from "@/lib/markdown";
import {
  ensureChoiceOptions,
  getProblemValidationIssues,
  normalizeProblem,
  normalizeProblemDraft,
} from "@/lib/problem-utils";

interface ProblemEditorProps {
  problems: Problem[];
  onChange: (problems: Problem[]) => void;
  noteId?: string;
  hasUnsavedChanges?: boolean;
}

const createEmptyProblemDraft = (): Partial<Problem> => ({
  type: "calculation",
  difficulty: "medium",
  question: "",
  answer: "",
  explanation: "",
  tags: [],
});

export function ProblemEditor({ problems, onChange, noteId, hasUnsavedChanges = false }: ProblemEditorProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAIScan, setShowAIScan] = useState(false);
  const [newProblem, setNewProblem] = useState<Partial<Problem>>(createEmptyProblemDraft());
  const [newProblemError, setNewProblemError] = useState<string | null>(null);

  // Load chapter context for AI auto-classification
  const [chapterContext, setChapterContext] = useState<ChapterContextItem[]>([]);
  useEffect(() => {
    if (noteId) {
      chaptersApi.getByNoteId(noteId).then(chapters => {
        setChapterContext(chapters.map(c => ({ id: c.id, name: c.name })));
      }).catch(() => {});
    }
  }, [noteId]);

  const updateNewProblemType = (type: ProblemType) => {
    setNewProblem((current) => ({
      ...current,
      type,
      options: type === "choice" ? ensureChoiceOptions(current.options) : undefined,
    }));
    setNewProblemError(null);
  };

  const updateNewProblemOption = (optionIndex: number, field: "label" | "content", value: string) => {
    setNewProblem((current) => {
      const options = ensureChoiceOptions(current.options);
      options[optionIndex] = { ...options[optionIndex], [field]: value };
      return { ...current, options };
    });
    setNewProblemError(null);
  };

  const handleAdd = () => {
    const normalizedDraft = normalizeProblemDraft(newProblem);
    const validationIssues = getProblemValidationIssues(normalizedDraft);

    if (validationIssues.length > 0) {
      setNewProblemError(validationIssues[0]);
      return;
    }

    const problem: Problem = {
      id: crypto.randomUUID(),
      type: (normalizedDraft.type as ProblemType) || "calculation",
      difficulty: (normalizedDraft.difficulty as Difficulty) || "medium",
      question: normalizedDraft.question || "",
      answer: normalizedDraft.answer || "",
      explanation: normalizedDraft.explanation || "",
      tips: normalizedDraft.tips || undefined,
      options: normalizedDraft.type === "choice" ? normalizedDraft.options : undefined,
      tags: normalizedDraft.tags || [],
      chapterId: normalizedDraft.chapterId,
      aiStatus: normalizedDraft.aiStatus,
      aiResult: normalizedDraft.aiResult,
    };

    onChange([...problems, problem]);
    setNewProblem(createEmptyProblemDraft());
    setNewProblemError(null);
    setShowAddForm(false);
  };

  const handleRemove = (id: string) => {
    onChange(problems.filter(p => p.id !== id));
  };

  const handleDuplicate = (problem: Problem) => {
    onChange([...problems, { ...problem, id: crypto.randomUUID() }]);
  };

  const handleUpdate = (id: string, updates: Partial<Problem>) => {
    onChange(problems.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const handleAcceptAI = (newProblems: Problem[]) => {
    onChange([...problems, ...newProblems.map(normalizeProblem)]);
  };

  const handleRepairNewProblem = () => {
    setNewProblem(repairProblemMarkdownFields(newProblem));
    setNewProblemError(null);
  };

  const newProblemOptions = newProblem.type === "choice" ? ensureChoiceOptions(newProblem.options) : [];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAIScan(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium
              bg-gradient-to-r from-violet-500/10 to-primary/10 border border-violet-200/20
              text-primary hover:border-violet-300/40 transition-all"
          >
            <Scan className="w-3.5 h-3.5" />
            AI 扫描
          </button>
        </div>
        {hasUnsavedChanges && (
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
            <AlertCircle className="w-3.5 h-3.5" />
            题目修改未更新
          </div>
        )}
      </div>

      {/* Existing Problems (drag-and-drop) */}
      {problems.length > 0 && (
        <Reorder.Group
          axis="y"
          values={problems}
          onReorder={onChange}
          className="space-y-3"
        >
          {problems.map((problem, index) => (
            <EditableProblemItem key={problem.id} problem={problem}>
              {(dragControls) => (
                <ProblemCard
                  problem={problem}
                  index={index}
                  noteId={noteId}
                  onRemove={() => handleRemove(problem.id)}
                  onDuplicate={() => handleDuplicate(problem)}
                  onUpdate={(updates) => handleUpdate(problem.id, updates)}
                  dragControls={dragControls}
                />
              )}
            </EditableProblemItem>
          ))}
        </Reorder.Group>
      )}

      {/* Add Form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-surface-container-low rounded-xl p-4 space-y-3 overflow-hidden"
          >
            {/* Chapter Selector */}
            <div>
              <label className="text-xs text-on-surface-variant/60 mb-1 block">章节分类</label>
              <ChapterSelector
                noteId={noteId}
                value={newProblem.chapterId}
                onChange={(chapterId) => setNewProblem({ ...newProblem, chapterId })}
              />
            </div>

            {/* Type and Difficulty */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-on-surface-variant/60 mb-1 block">题型</label>
                <select
                  value={newProblem.type}
                  onChange={(e) => updateNewProblemType(e.target.value as ProblemType)}
                  className="w-full px-3 py-2 bg-surface-container rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {(Object.entries(problemTypeMap) as [ProblemType, string][]).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-on-surface-variant/60 mb-1 block">难度</label>
                <select
                  value={newProblem.difficulty}
                  onChange={(e) => setNewProblem({ ...newProblem, difficulty: e.target.value as Difficulty })}
                  className="w-full px-3 py-2 bg-surface-container rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {(Object.entries(difficultyMap) as [Difficulty, string][]).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Question */}
            <div>
              <label className="text-xs text-on-surface-variant/60 mb-1 block">题目内容</label>
              <textarea
                value={newProblem.question}
                onChange={(e) => {
                  setNewProblem({ ...newProblem, question: e.target.value });
                  setNewProblemError(null);
                }}
                placeholder="输入题目内容，支持 LaTeX 公式..."
                rows={3}
                className="w-full px-3 py-2 bg-surface-container rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 resize-none placeholder:text-on-surface-variant/40"
              />
            </div>

            {newProblem.type === "choice" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-on-surface-variant/60 block">选项</label>
                  <button
                    type="button"
                    onClick={() => {
                      setNewProblem({
                        ...newProblem,
                        options: [
                          ...newProblemOptions,
                          { label: String.fromCharCode(65 + newProblemOptions.length), content: "" },
                        ],
                      });
                      setNewProblemError(null);
                    }}
                    className="text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    添加选项
                  </button>
                </div>
                {newProblemOptions.map((option, optionIndex) => (
                  <div key={`${option.label}-${optionIndex}`} className="grid grid-cols-[56px_1fr_28px] gap-2 items-start">
                    <input
                      value={option.label}
                      onChange={(e) => updateNewProblemOption(optionIndex, "label", e.target.value)}
                      className="w-full px-2 py-2 bg-surface-container rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="A"
                    />
                    <textarea
                      value={option.content}
                      onChange={(e) => updateNewProblemOption(optionIndex, "content", e.target.value)}
                      rows={1}
                      className="w-full px-3 py-2 bg-surface-container rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 resize-y min-h-9 placeholder:text-on-surface-variant/40"
                      placeholder="选项内容"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setNewProblem({
                          ...newProblem,
                          options: newProblemOptions.filter((_, i) => i !== optionIndex),
                        });
                        setNewProblemError(null);
                      }}
                      className="mt-1 p-1 rounded hover:bg-surface-container-highest transition-colors"
                      title="删除选项"
                    >
                      <X className="w-4 h-4 text-on-surface-variant/40 hover:text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Answer */}
            <div>
              <label className="text-xs text-on-surface-variant/60 mb-1 block">答案</label>
              <textarea
                value={newProblem.answer}
                onChange={(e) => {
                  setNewProblem({ ...newProblem, answer: e.target.value });
                  setNewProblemError(null);
                }}
                placeholder="输入答案..."
                rows={2}
                className="w-full px-3 py-2 bg-surface-container rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 resize-none placeholder:text-on-surface-variant/40"
              />
            </div>

            {/* Explanation */}
            <div>
              <label className="text-xs text-on-surface-variant/60 mb-1 block">解析</label>
              <textarea
                value={newProblem.explanation}
                onChange={(e) => {
                  setNewProblem({ ...newProblem, explanation: e.target.value });
                  setNewProblemError(null);
                }}
                placeholder="输入解析..."
                rows={2}
                className="w-full px-3 py-2 bg-surface-container rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 resize-none placeholder:text-on-surface-variant/40"
              />
            </div>

            {/* Preview */}
            <ProblemPreview problem={normalizeProblemDraft(newProblem)} />

            {newProblemError && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>{newProblemError}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={handleRepairNewProblem}
                disabled={!newProblem.question && !newProblem.answer && !newProblem.explanation && !newProblem.tips}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/15 disabled:opacity-40 transition-colors"
              >
                <Wrench className="w-4 h-4" />
                一键修正
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewProblem(createEmptyProblemDraft());
                  setNewProblemError(null);
                }}
                className="flex-1 px-3 py-2 rounded-lg bg-surface-container text-on-surface-variant text-sm hover:bg-surface-container-high transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAdd}
                disabled={!newProblem.question?.trim()}
                className="flex-1 px-3 py-2 rounded-lg editorial-gradient text-on-primary text-sm font-medium disabled:opacity-40 transition-all"
              >
                添加题目
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Button */}
      {!showAddForm && (
        <button
          onClick={() => {
            setShowAddForm(true);
            setNewProblemError(null);
          }}
          className="w-full px-4 py-3 rounded-xl border-2 border-dashed border-outline-variant/30 text-on-surface-variant hover:border-primary/50 hover:text-primary transition-all duration-200 flex items-center justify-center gap-2 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          添加题目
        </button>
      )}

      {/* AI Scan Modal */}
      <OCRUploader
        isOpen={showAIScan}
        onClose={() => setShowAIScan(false)}
        onAccept={handleAcceptAI}
        chapterContext={chapterContext}
      />
    </div>
  );
}

function EditableProblemItem({
  problem,
  children,
}: {
  problem: Problem;
  children: (dragControls: ReturnType<typeof useDragControls>) => ReactNode;
}) {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={problem}
      dragListener={false}
      dragControls={dragControls}
    >
      {children(dragControls)}
    </Reorder.Item>
  );
}

// Internal ProblemCard for editor (with drag handle + chapter + AI status)
function ProblemCard({
  problem, index, noteId, onRemove, onDuplicate, onUpdate, dragControls
}: {
  problem: Problem;
  index: number;
  noteId?: string;
  onRemove: () => void;
  onDuplicate: () => void;
  onUpdate: (updates: Partial<Problem>) => void;
  dragControls: ReturnType<typeof useDragControls>;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasOptions = problem.type === "choice";
  const choiceOptions = hasOptions ? ensureChoiceOptions(problem.options) : [];
  const validationIssues = getProblemValidationIssues(hasOptions ? { ...problem, options: choiceOptions } : problem);

  const updateOption = (optionIndex: number, field: "label" | "content", value: string) => {
    const options = [...choiceOptions];
    const current = options[optionIndex] || { label: "", content: "" };
    options[optionIndex] = { ...current, [field]: value };
    onUpdate({ options });
  };

  const handleRepairProblem = () => {
    onUpdate(normalizeProblemDraft(repairProblemMarkdownFields(problem)));
  };

  return (
    <div className="bg-surface-container-low rounded-xl overflow-hidden group">
      <div className="flex items-center">
        {/* Drag Handle */}
        <div
          onPointerDown={(event) => dragControls.start(event)}
          className="pl-3 py-3 cursor-grab active:cursor-grabbing text-on-surface-variant/20 hover:text-on-surface-variant/50 transition-colors"
          title="拖拽排序"
        >
          <GripVertical className="w-4 h-4" />
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded(!expanded)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setExpanded(!expanded);
            }
          }}
          className="flex-1 flex items-center justify-between pr-4 py-3 hover:bg-surface-container-high transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-full editorial-gradient text-on-primary text-xs font-bold flex items-center justify-center flex-shrink-0">
              {index + 1}
            </span>
            <span className="text-sm font-medium text-on-surface line-clamp-1">
              {problem.question || '(无题目内容)'}
            </span>
            <span className="px-2 py-0.5 rounded bg-primary-container/20 text-primary-container text-xs font-medium whitespace-nowrap">
              {problemTypeMap[problem.type]}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${difficultyColorMap[problem.difficulty]}`}>
              {difficultyMap[problem.difficulty]}
            </span>
            {problem.aiStatus === 'complete' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> AI
              </span>
            )}
            {validationIssues.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> 需检查
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="p-1 rounded hover:bg-surface-container-highest transition-colors"
              title="删除题目"
            >
              <Trash2 className="w-4 h-4 text-on-surface-variant/40 hover:text-red-500" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
              className="p-1 rounded hover:bg-surface-container-highest transition-colors"
              title="复制题目"
            >
              <Copy className="w-4 h-4 text-on-surface-variant/40 hover:text-primary" />
            </button>
            {expanded ? <ChevronUp className="w-4 h-4 text-on-surface-variant" /> : <ChevronDown className="w-4 h-4 text-on-surface-variant" />}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 pb-4 space-y-2 overflow-hidden"
          >
            <div className="grid gap-3 pt-2 md:grid-cols-[1fr_220px]">
              <div>
                <label className="text-xs text-on-surface-variant/60 mb-1 block">章节分类</label>
                <ChapterSelector
                  noteId={noteId}
                  value={problem.chapterId}
                  onChange={(chapterId) => onUpdate({ chapterId })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-on-surface-variant/60 mb-1 block">题型</label>
                  <select
                    value={problem.type}
                    onChange={(e) => {
                      const nextType = e.target.value as ProblemType;
                      onUpdate({
                        type: nextType,
                        options: nextType === "choice" ? ensureChoiceOptions(problem.options) : undefined,
                      });
                    }}
                    className="w-full px-3 py-2 bg-surface-container rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    {(Object.entries(problemTypeMap) as [ProblemType, string][]).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-on-surface-variant/60 mb-1 block">难度</label>
                  <select
                    value={problem.difficulty}
                    onChange={(e) => onUpdate({ difficulty: e.target.value as Difficulty })}
                    className="w-full px-3 py-2 bg-surface-container rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    {(Object.entries(difficultyMap) as [Difficulty, string][]).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {validationIssues.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>{validationIssues[0]}</span>
              </div>
            )}

            <div>
              <label className="text-xs text-on-surface-variant/60 mb-1 block">题目内容</label>
              <textarea
                value={problem.question}
                onChange={(e) => onUpdate({ question: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 bg-surface-container rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 resize-y min-h-24 placeholder:text-on-surface-variant/40"
                placeholder="输入题目内容，支持 LaTeX 公式..."
              />
            </div>

            {hasOptions && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-on-surface-variant/60 block">选项</label>
                  <button
                    onClick={() => onUpdate({
                      options: [
                        ...choiceOptions,
                        { label: String.fromCharCode(65 + choiceOptions.length), content: "" },
                      ],
                    })}
                    className="text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    添加选项
                  </button>
                </div>
                {choiceOptions.map((option, optionIndex) => (
                  <div key={`${option.label}-${optionIndex}`} className="grid grid-cols-[56px_1fr_28px] gap-2 items-start">
                    <input
                      value={option.label}
                      onChange={(e) => updateOption(optionIndex, "label", e.target.value)}
                      className="w-full px-2 py-2 bg-surface-container rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="A"
                    />
                    <textarea
                      value={option.content}
                      onChange={(e) => updateOption(optionIndex, "content", e.target.value)}
                      rows={1}
                      className="w-full px-3 py-2 bg-surface-container rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 resize-y min-h-9 placeholder:text-on-surface-variant/40"
                      placeholder="选项内容"
                    />
                    <button
                      onClick={() => onUpdate({ options: choiceOptions.filter((_, i) => i !== optionIndex) })}
                      className="mt-1 p-1 rounded hover:bg-surface-container-highest transition-colors"
                      title="删除选项"
                    >
                      <X className="w-4 h-4 text-on-surface-variant/40 hover:text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs text-on-surface-variant/60 mb-1 block">答案</label>
                <textarea
                  value={problem.answer}
                  onChange={(e) => onUpdate({ answer: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 bg-surface-container rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 resize-y min-h-20 placeholder:text-on-surface-variant/40"
                  placeholder="输入答案..."
                />
              </div>
              <div>
                <label className="text-xs text-on-surface-variant/60 mb-1 block">提示</label>
                <textarea
                  value={problem.tips || ""}
                  onChange={(e) => onUpdate({ tips: e.target.value || undefined })}
                  rows={3}
                  className="w-full px-3 py-2 bg-surface-container rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 resize-y min-h-20 placeholder:text-on-surface-variant/40"
                  placeholder="可选提示..."
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-on-surface-variant/60 mb-1 block">解析</label>
              <textarea
                value={problem.explanation}
                onChange={(e) => onUpdate({ explanation: e.target.value })}
                rows={5}
                className="w-full px-3 py-2 bg-surface-container rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 resize-y min-h-28 placeholder:text-on-surface-variant/40"
                placeholder="输入解析，支持 Markdown 和 LaTeX..."
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleRepairProblem}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/15 transition-colors"
              >
                <Wrench className="w-4 h-4" />
                一键修正题目 Markdown
              </button>
            </div>

            {/* AI comparison */}
            {problem.aiResult && (
              <ProblemCompare original={{
                id: '', type: problem.type, difficulty: problem.difficulty,
                question: problem.aiResult.rawQuestion,
                answer: problem.aiResult.rawAnswer,
                explanation: problem.aiResult.rawExplanation,
                tags: [],
              }} current={problem} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
