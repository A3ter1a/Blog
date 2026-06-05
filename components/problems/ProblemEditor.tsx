"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import { motion, AnimatePresence, Reorder, useDragControls } from "framer-motion";
import { AlertCircle, Plus, X, ChevronDown, ChevronUp, GripVertical, Sparkles, Scan, Copy, Trash2, Wrench, Tags, Loader2, FolderTree, CheckSquare } from "lucide-react";
import { Problem, ProblemType, Difficulty, Subject, problemTypeMap, difficultyMap, difficultyColorMap } from "@/lib/types";
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
import { math3KnowledgeAreas } from "@/lib/math3-knowledge";
import {
  getMath3ChapterById,
  getMath3ProblemChapterIds,
  getMath3PointById,
  getMath3PointIdsFromTags,
  setMath3ProblemKnowledgeTags,
} from "@/lib/math3-practice";
import { useToast } from "@/components/ui/Toast";
import { buildAuthHeaders } from "@/lib/fetch-with-auth";
import {
  AI_CONFIG_STORAGE_KEY,
  ALLOW_CLIENT_AI_KEYS,
  DEFAULT_AI_CONFIG,
  DEFAULT_DEEPSEEK_MODEL,
  normalizeAIConfig,
} from "@/lib/ai-config";
import { readJsonStorage } from "@/lib/browser-storage";

interface ProblemEditorProps {
  problems: Problem[];
  onChange: (problems: Problem[]) => void;
  noteId?: string;
  subject?: Subject;
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

function getDefaultMath3ChapterId(): string {
  return math3KnowledgeAreas[0]?.chapters[0]?.id ?? "";
}

function getProblemMath3PointTitles(problem: Problem): string[] {
  return getMath3PointIdsFromTags(problem.tags)
    .map((pointId) => getMath3PointById(pointId)?.point.title)
    .filter((title): title is string => Boolean(title));
}

function getProblemMath3ChapterTitle(problem: Problem): string | null {
  const chapterId = getMath3ProblemChapterIds(problem)[0];
  return chapterId ? getMath3ChapterById(chapterId)?.chapter.title ?? null : null;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function ProblemEditor({ problems, onChange, noteId, subject, hasUnsavedChanges = false }: ProblemEditorProps) {
  const toast = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAIScan, setShowAIScan] = useState(false);
  const [newProblem, setNewProblem] = useState<Partial<Problem>>(createEmptyProblemDraft());
  const [newProblemError, setNewProblemError] = useState<string | null>(null);
  const [selectedProblemIds, setSelectedProblemIds] = useState<string[]>([]);
  const [selectedEditorChapterId, setSelectedEditorChapterId] = useState<string | undefined>();
  const [selectedMath3ChapterId, setSelectedMath3ChapterId] = useState<string>(() => getDefaultMath3ChapterId());
  const [onlyShowUnassignedMath3Problems, setOnlyShowUnassignedMath3Problems] = useState(false);
  const [isClassifyingMath3Points, setIsClassifyingMath3Points] = useState(false);

  // Load chapter context for AI auto-classification
  const [chapterContext, setChapterContext] = useState<ChapterContextItem[]>([]);
  useEffect(() => {
    if (noteId) {
      chaptersApi.getByNoteId(noteId).then(chapters => {
        setChapterContext(chapters.map(c => ({ id: c.id, name: c.name })));
      }).catch(() => {});
    }
  }, [noteId]);

  const showMath3Assignment = subject === "math";

  useEffect(() => {
    if (!showMath3Assignment) {
      setSelectedProblemIds([]);
      setOnlyShowUnassignedMath3Problems(false);
      setIsClassifyingMath3Points(false);
    }
  }, [showMath3Assignment]);

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

  const handleRemoveSelected = () => {
    if (selectedProblemIdsInList.length === 0) return;

    const confirmed = window.confirm(`确定删除已选的 ${selectedProblemIdsInList.length} 道题吗？保存题集后删除才会正式生效。`);
    if (!confirmed) return;

    onChange(problems.filter((problem) => !selectedProblemIdSet.has(problem.id)));
    setSelectedProblemIds([]);
    toast.success(`已从题集中移除 ${selectedProblemIdsInList.length} 道题，请保存题集后生效`);
  };

  const handleDuplicate = (problem: Problem) => {
    onChange([...problems, { ...problem, id: crypto.randomUUID() }]);
  };

  const handleUpdate = (id: string, updates: Partial<Problem>) => {
    onChange(problems.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const problemIdSet = useMemo(() => new Set(problems.map((problem) => problem.id)), [problems]);
  const selectedProblemIdsInList = useMemo(
    () => selectedProblemIds.filter((id) => problemIdSet.has(id)),
    [problemIdSet, selectedProblemIds],
  );
  const selectedProblemIdSet = useMemo(
    () => new Set(selectedProblemIdsInList),
    [selectedProblemIdsInList],
  );
  const selectedMath3Chapter = useMemo(
    () => getMath3ChapterById(selectedMath3ChapterId),
    [selectedMath3ChapterId],
  );
  const problemIndexById = useMemo(
    () => new Map(problems.map((problem, index) => [problem.id, index])),
    [problems],
  );
  const math3ChapterTitleByProblemId = useMemo(
    () => Object.fromEntries(
      problems.map((problem) => [problem.id, getProblemMath3ChapterTitle(problem)])
    ),
    [problems],
  );
  const math3PointTitlesByProblemId = useMemo(
    () => Object.fromEntries(
      problems.map((problem) => [problem.id, getProblemMath3PointTitles(problem)])
    ),
    [problems],
  );
  const unassignedMath3ProblemIds = useMemo(
    () => problems
      .filter((problem) => getMath3ProblemChapterIds(problem).length === 0)
      .map((problem) => problem.id),
    [problems],
  );
  const unassignedMath3ProblemIdSet = useMemo(
    () => new Set(unassignedMath3ProblemIds),
    [unassignedMath3ProblemIds],
  );
  const visibleProblems = useMemo(
    () => showMath3Assignment && onlyShowUnassignedMath3Problems
      ? problems.filter((problem) => unassignedMath3ProblemIdSet.has(problem.id))
      : problems,
    [onlyShowUnassignedMath3Problems, problems, showMath3Assignment, unassignedMath3ProblemIdSet],
  );
  const visibleProblemIds = useMemo(
    () => visibleProblems.map((problem) => problem.id),
    [visibleProblems],
  );
  const allVisibleProblemsSelected = visibleProblemIds.length > 0
    && visibleProblemIds.every((id) => selectedProblemIdSet.has(id));

  const toggleProblemSelection = (id: string) => {
    setSelectedProblemIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const toggleAllProblemSelection = () => {
    const visibleIdSet = new Set(visibleProblemIds);
    setSelectedProblemIds((current) => {
      const isAllVisibleSelected = visibleProblemIds.length > 0
        && visibleProblemIds.every((id) => current.includes(id));

      if (isAllVisibleSelected) {
        return current.filter((id) => !visibleIdSet.has(id));
      }

      return Array.from(new Set([...current, ...visibleProblemIds]));
    });
  };

  const selectUnassignedMath3Problems = () => {
    setSelectedProblemIds((current) => Array.from(new Set([...current, ...unassignedMath3ProblemIds])));
  };

  const handleProblemReorder = (nextVisibleProblems: Problem[]) => {
    if (!showMath3Assignment || !onlyShowUnassignedMath3Problems) {
      onChange(nextVisibleProblems);
      return;
    }

    const visibleIdSet = new Set(nextVisibleProblems.map((problem) => problem.id));
    const reorderedQueue = [...nextVisibleProblems];
    onChange(problems.map((problem) => (
      visibleIdSet.has(problem.id) ? reorderedQueue.shift() ?? problem : problem
    )));
  };

  const handleChangeMath3Chapter = (chapterId: string) => {
    setSelectedMath3ChapterId(chapterId);
  };

  const applyMath3ChapterToSelected = () => {
    if (selectedProblemIdsInList.length === 0 || !selectedMath3Chapter) return;

    onChange(problems.map((problem) => (
      selectedProblemIdSet.has(problem.id)
        ? {
            ...problem,
            tags: setMath3ProblemKnowledgeTags(
              problem.tags,
              selectedMath3Chapter.chapter.id,
              getMath3PointIdsFromTags(problem.tags),
            ),
          }
        : problem
    )));
  };

  const applyEditorChapterToSelected = () => {
    if (selectedProblemIdsInList.length === 0 || !selectedEditorChapterId) return;

    onChange(problems.map((problem) => (
      selectedProblemIdSet.has(problem.id)
        ? { ...problem, chapterId: selectedEditorChapterId }
        : problem
    )));

    toast.success(`已给 ${selectedProblemIdsInList.length} 道题设置题集章节，请保存题集后生效`);
  };

  const classifyMath3PointsForSelected = async () => {
    if (selectedProblemIdsInList.length === 0 || !selectedMath3Chapter || isClassifyingMath3Points) return;

    const selectedProblems = problems
      .filter((problem) => selectedProblemIdSet.has(problem.id))
      .map((problem) => ({
        id: problem.id,
        type: problem.type,
        difficulty: problem.difficulty,
        question: problem.question,
        answer: problem.answer,
        explanation: problem.explanation,
      }));

    setIsClassifyingMath3Points(true);
    try {
      const config = readJsonStorage(AI_CONFIG_STORAGE_KEY, DEFAULT_AI_CONFIG, normalizeAIConfig);
      const classifications: Array<{ id?: unknown; pointIds?: unknown }> = [];

      for (const chunk of chunkArray(selectedProblems, 20)) {
        const response = await fetch("/api/ai/math3-classify", {
          method: "POST",
          headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            chapterId: selectedMath3Chapter.chapter.id,
            problems: chunk,
            apiKey: ALLOW_CLIENT_AI_KEYS ? config.deepseekApiKey : undefined,
            model: config.deepseekModel || DEFAULT_DEEPSEEK_MODEL,
          }),
          signal: AbortSignal.timeout(120000),
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "AI 知识点标记失败");
        }

        if (Array.isArray(data.classifications)) {
          classifications.push(...data.classifications);
        }
      }

      const pointIdsByProblemId = new Map<string, string[]>(
        classifications.map((item: { id?: unknown; pointIds?: unknown }) => [
          typeof item.id === "string" ? item.id : "",
          Array.isArray(item.pointIds) ? item.pointIds.filter((pointId): pointId is string => typeof pointId === "string") : [],
        ])
      );

      onChange(problems.map((problem) => (
        selectedProblemIdSet.has(problem.id)
          ? {
              ...problem,
              tags: setMath3ProblemKnowledgeTags(
                problem.tags,
                selectedMath3Chapter.chapter.id,
                pointIdsByProblemId.get(problem.id) ?? [],
              ),
            }
          : problem
      )));

      toast.success(`已用 AI 标记 ${selectedProblems.length} 道题的知识点，请保存题集后生效`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`AI 知识点标记失败：${message}`);
    } finally {
      setIsClassifyingMath3Points(false);
    }
  };

  const clearMath3KnowledgeFromSelected = () => {
    if (selectedProblemIdsInList.length === 0) return;

    onChange(problems.map((problem) => (
      selectedProblemIdSet.has(problem.id)
        ? { ...problem, tags: setMath3ProblemKnowledgeTags(problem.tags) }
        : problem
    )));
  };

  const clearSelectedProblemSelection = () => {
    setSelectedProblemIds([]);
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
    <div className={`space-y-4 ${selectedProblemIdsInList.length > 0 ? "pb-28" : ""}`}>
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
        <>
          {showMath3Assignment && (
            <Math3AssignmentPanel
              totalCount={problems.length}
              visibleCount={visibleProblems.length}
              unassignedCount={unassignedMath3ProblemIds.length}
              selectedCount={selectedProblemIdsInList.length}
              allSelected={allVisibleProblemsSelected}
              onlyUnassigned={onlyShowUnassignedMath3Problems}
              selectedChapterId={selectedMath3ChapterId}
              onToggleAll={toggleAllProblemSelection}
              onToggleOnlyUnassigned={() => setOnlyShowUnassignedMath3Problems((value) => !value)}
              onSelectUnassigned={selectUnassignedMath3Problems}
              onChangeChapter={handleChangeMath3Chapter}
            />
          )}
          <Reorder.Group
            axis="y"
            values={visibleProblems}
            onReorder={handleProblemReorder}
            className="space-y-3"
          >
            {visibleProblems.map((problem, index) => (
              <EditableProblemItem key={problem.id} problem={problem}>
                {(dragControls) => (
                  <ProblemCard
                    problem={problem}
                    index={problemIndexById.get(problem.id) ?? index}
                    noteId={noteId}
                    selected={selectedProblemIdSet.has(problem.id)}
                    showSelectionTools={true}
                    showMath3Tools={showMath3Assignment}
                    math3ChapterTitle={math3ChapterTitleByProblemId[problem.id] ?? null}
                    math3PointTitles={math3PointTitlesByProblemId[problem.id] ?? []}
                    onToggleSelect={() => toggleProblemSelection(problem.id)}
                    onRemove={() => handleRemove(problem.id)}
                    onDuplicate={() => handleDuplicate(problem)}
                    onUpdate={(updates) => handleUpdate(problem.id, updates)}
                    dragControls={dragControls}
                  />
                )}
              </EditableProblemItem>
            ))}
          </Reorder.Group>
          {visibleProblems.length === 0 && (
            <div className="rounded-xl border border-dashed border-outline-variant/30 bg-surface-container-low px-4 py-8 text-center text-sm text-on-surface-variant">
              当前没有未分配数三章节的题目。
            </div>
          )}
        </>
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

      <BulkProblemActionBar
        isOpen={selectedProblemIdsInList.length > 0}
        selectedCount={selectedProblemIdsInList.length}
        totalCount={problems.length}
        allSelected={allVisibleProblemsSelected}
        visibleCount={visibleProblems.length}
        noteId={noteId}
        selectedEditorChapterId={selectedEditorChapterId}
        showMath3Tools={showMath3Assignment}
        selectedMath3ChapterId={selectedMath3ChapterId}
        selectedMath3Chapter={selectedMath3Chapter}
        isClassifying={isClassifyingMath3Points}
        onToggleAll={toggleAllProblemSelection}
        onClearSelection={clearSelectedProblemSelection}
        onChangeEditorChapter={setSelectedEditorChapterId}
        onApplyEditorChapter={applyEditorChapterToSelected}
        onChangeMath3Chapter={handleChangeMath3Chapter}
        onApplyMath3Chapter={applyMath3ChapterToSelected}
        onClassifyKnowledge={classifyMath3PointsForSelected}
        onClearMath3Knowledge={clearMath3KnowledgeFromSelected}
        onRemoveSelected={handleRemoveSelected}
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

function BulkProblemActionBar({
  isOpen,
  selectedCount,
  totalCount,
  allSelected,
  visibleCount,
  noteId,
  selectedEditorChapterId,
  showMath3Tools,
  selectedMath3ChapterId,
  selectedMath3Chapter,
  isClassifying,
  onToggleAll,
  onClearSelection,
  onChangeEditorChapter,
  onApplyEditorChapter,
  onChangeMath3Chapter,
  onApplyMath3Chapter,
  onClassifyKnowledge,
  onClearMath3Knowledge,
  onRemoveSelected,
}: {
  isOpen: boolean;
  selectedCount: number;
  totalCount: number;
  allSelected: boolean;
  visibleCount: number;
  noteId?: string;
  selectedEditorChapterId?: string;
  showMath3Tools: boolean;
  selectedMath3ChapterId: string;
  selectedMath3Chapter: ReturnType<typeof getMath3ChapterById>;
  isClassifying: boolean;
  onToggleAll: () => void;
  onClearSelection: () => void;
  onChangeEditorChapter: (chapterId: string | undefined) => void;
  onApplyEditorChapter: () => void;
  onChangeMath3Chapter: (chapterId: string) => void;
  onApplyMath3Chapter: () => void;
  onClassifyKnowledge: () => void;
  onClearMath3Knowledge: () => void;
  onRemoveSelected: () => void;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-x-0 bottom-4 z-50 px-3 sm:px-6 pointer-events-none"
        >
          <div className="pointer-events-auto mx-auto max-w-6xl rounded-xl border border-outline-variant/20 bg-surface-container-lowest/95 p-3 shadow-elevated backdrop-blur">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="flex items-center gap-2 text-sm font-medium text-on-surface">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <CheckSquare className="h-4 w-4" />
                </span>
                <span>已选 {selectedCount} 道题</span>
                <span className="hidden text-xs text-on-surface-variant sm:inline">
                  当前显示 {visibleCount}/{totalCount}
                </span>
              </div>

              <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[minmax(180px,1fr)_auto] lg:grid-cols-[minmax(190px,1fr)_auto_minmax(220px,1fr)_auto]">
                <div className="min-w-0">
                  <ChapterSelector
                    noteId={noteId}
                    value={selectedEditorChapterId}
                    onChange={onChangeEditorChapter}
                    className="w-full"
                  />
                </div>
                <button
                  type="button"
                  onClick={onApplyEditorChapter}
                  disabled={!selectedEditorChapterId || isClassifying}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-outline-variant/30 px-3 text-xs font-medium text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-40"
                >
                  <FolderTree className="h-3.5 w-3.5" />
                  应用题集章节
                </button>

                {showMath3Tools && (
                  <>
                    <select
                      value={selectedMath3ChapterId}
                      onChange={(event) => onChangeMath3Chapter(event.target.value)}
                      disabled={isClassifying}
                      className="h-10 min-w-0 rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-3 text-sm text-on-surface outline-none transition-colors focus:border-primary/50 disabled:opacity-40"
                    >
                      {math3KnowledgeAreas.map((area) => (
                        <optgroup key={area.id} label={area.title}>
                          {area.chapters.map((chapter) => (
                            <option key={chapter.id} value={chapter.id}>
                              {chapter.title}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={onApplyMath3Chapter}
                        disabled={!selectedMath3Chapter || isClassifying}
                        className="inline-flex h-10 items-center justify-center rounded-lg border border-primary/30 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-40"
                      >
                        归入数三章节
                      </button>
                      <button
                        type="button"
                        onClick={onClassifyKnowledge}
                        disabled={!selectedMath3Chapter || isClassifying}
                        className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-3 text-xs font-medium text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-40"
                      >
                        {isClassifying ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            AI 标记中
                          </span>
                        ) : (
                          "AI 标记"
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={onClearMath3Knowledge}
                        disabled={isClassifying}
                        className="inline-flex h-10 items-center justify-center rounded-lg border border-outline-variant/30 px-3 text-xs font-medium text-on-surface-variant transition-colors hover:border-red-300 hover:text-red-600 disabled:opacity-40"
                      >
                        清除归属
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onToggleAll}
                  disabled={visibleCount === 0 || isClassifying}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-outline-variant/30 px-3 text-xs font-medium text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-40"
                >
                  {allSelected ? "取消当前显示" : "全选当前显示"}
                </button>
                <button
                  type="button"
                  onClick={onRemoveSelected}
                  disabled={isClassifying}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </button>
                <button
                  type="button"
                  onClick={onClearSelection}
                  disabled={isClassifying}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-outline-variant/30 text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-40"
                  title="取消选择"
                  aria-label="取消选择"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Math3AssignmentPanel({
  totalCount,
  visibleCount,
  unassignedCount,
  selectedCount,
  allSelected,
  onlyUnassigned,
  selectedChapterId,
  onToggleAll,
  onToggleOnlyUnassigned,
  onSelectUnassigned,
  onChangeChapter,
}: {
  totalCount: number;
  visibleCount: number;
  unassignedCount: number;
  selectedCount: number;
  allSelected: boolean;
  onlyUnassigned: boolean;
  selectedChapterId: string;
  onToggleAll: () => void;
  onToggleOnlyUnassigned: () => void;
  onSelectUnassigned: () => void;
  onChangeChapter: (chapterId: string) => void;
}) {
  const selectedChapter = getMath3ChapterById(selectedChapterId);

  return (
    <section className="rounded-xl border border-primary/15 bg-primary/5 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
            <Tags className="h-4 w-4" />
            数三章节归类
          </div>
          <p className="mt-1 text-xs leading-5 text-on-surface-variant">
            先把题目放入大纲章节；细知识点由 AI 在本章范围内标记，只作为复盘参考，不再拆分刷题队列。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleOnlyUnassigned}
            aria-pressed={onlyUnassigned}
            className={`inline-flex h-9 items-center justify-center rounded-lg border px-3 text-xs font-medium transition-colors ${
              onlyUnassigned
                ? "border-primary/30 bg-surface-container-lowest text-primary"
                : "border-outline-variant/30 bg-surface-container-lowest text-on-surface-variant hover:border-primary/40 hover:text-primary"
            }`}
          >
            {onlyUnassigned ? "显示全部题目" : "只看未归章节"}
          </button>
          <button
            type="button"
            onClick={onSelectUnassigned}
            disabled={unassignedCount === 0}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-3 text-xs font-medium text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-40"
          >
            选择未归章节 · {unassignedCount}
          </button>
          <button
            type="button"
            onClick={onToggleAll}
            disabled={visibleCount === 0}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-3 text-xs font-medium text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-40"
          >
            {allSelected ? "取消当前选择" : "选择当前显示"} · {visibleCount}/{totalCount}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[260px_1fr]">
        <div>
          <label className="mb-1 block text-xs font-medium text-on-surface-variant">大纲章节</label>
          <select
            value={selectedChapterId}
            onChange={(event) => onChangeChapter(event.target.value)}
            className="h-10 w-full rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-3 text-sm text-on-surface outline-none focus:border-primary/50"
          >
            {math3KnowledgeAreas.map((area) => (
              <optgroup key={area.id} label={area.title}>
                {area.chapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between gap-3">
            <label className="block text-xs font-medium text-on-surface-variant">AI 可标记的本章知识点</label>
            <span className="text-xs text-on-surface-variant">人工只审核结果</span>
          </div>

          <div className="max-h-36 overflow-y-auto rounded-lg bg-surface-container-lowest p-2">
            {selectedChapter ? (
              <div className="flex flex-wrap gap-2">
                {selectedChapter.chapter.points.map((pointItem) => (
                  <span
                    key={pointItem.id}
                    className="rounded-full border border-outline-variant/30 px-2.5 py-1 text-xs text-on-surface-variant"
                  >
                    {pointItem.title}
                  </span>
                ))}
              </div>
            ) : (
              <p className="py-3 text-xs text-on-surface-variant">没有可用知识点。</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-xs text-on-surface-variant">
          已选 {selectedCount} 道题
          {onlyUnassigned ? `，当前只显示未归章节 ${visibleCount} 道` : ""}
        </span>
        <span className="text-xs text-on-surface-variant">
          勾选题目后在底部批量操作栏处理分类、AI 标记和删除。
        </span>
      </div>
    </section>
  );
}

// Internal ProblemCard for editor (with drag handle + chapter + AI status)
function ProblemCard({
  problem,
  index,
  noteId,
  selected,
  showSelectionTools,
  showMath3Tools,
  math3ChapterTitle,
  math3PointTitles,
  onToggleSelect,
  onRemove,
  onDuplicate,
  onUpdate,
  dragControls
}: {
  problem: Problem;
  index: number;
  noteId?: string;
  selected: boolean;
  showSelectionTools: boolean;
  showMath3Tools: boolean;
  math3ChapterTitle: string | null;
  math3PointTitles: string[];
  onToggleSelect: () => void;
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
        {showSelectionTools && (
          <label
            className="flex px-3 py-3"
            onClick={(event) => event.stopPropagation()}
            title={selected ? "取消选择题目" : "选择题目"}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary/30"
              aria-label={`选择第 ${index + 1} 题`}
            />
          </label>
        )}

        {/* Drag Handle */}
        <div
          onPointerDown={(event) => dragControls.start(event)}
          className="py-3 cursor-grab active:cursor-grabbing text-on-surface-variant/20 hover:text-on-surface-variant/50 transition-colors"
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
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="w-7 h-7 rounded-full editorial-gradient text-on-primary text-xs font-bold flex items-center justify-center flex-shrink-0">
              {index + 1}
            </span>
            <span className="min-w-[160px] flex-1 text-sm font-medium text-on-surface line-clamp-1">
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
            {showMath3Tools && (
              math3ChapterTitle ? (
                <>
                  <span
                    className="max-w-full rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary line-clamp-1"
                    title={math3ChapterTitle}
                  >
                    {math3ChapterTitle}
                  </span>
                  {math3PointTitles.length > 0 ? (
                    <span
                      className="max-w-full rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-700 line-clamp-1"
                      title={math3PointTitles.join("、")}
                    >
                      {math3PointTitles.slice(0, 2).join("、")}
                      {math3PointTitles.length > 2 ? ` +${math3PointTitles.length - 2}` : ""}
                    </span>
                  ) : (
                    <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-xs text-on-surface-variant/70">
                      待 AI 标记知识点
                    </span>
                  )}
                </>
              ) : (
                <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-xs text-on-surface-variant/70">
                  未分配数三章节
                </span>
              )
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
