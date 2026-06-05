"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import { motion, AnimatePresence, Reorder, useDragControls } from "framer-motion";
import { AlertCircle, Plus, X, ChevronDown, ChevronUp, GripVertical, Sparkles, Scan, Copy, Trash2, Wrench, Tags, Loader2, FolderTree, CheckSquare, SlidersHorizontal } from "lucide-react";
import { Problem, ProblemType, Difficulty, Subject, problemTypeMap, difficultyMap, difficultyColorMap } from "@/lib/types";
import { chaptersApi } from "@/lib/chapters-api";
import { ChapterSelector } from "@/components/chapters/ChapterSelector";
import { ProblemCompare } from "./ProblemCompare";
import { ProblemPreview } from "./ProblemPreview";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
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
  const [showOrganizeTools, setShowOrganizeTools] = useState(false);
  const [newProblem, setNewProblem] = useState<Partial<Problem>>(createEmptyProblemDraft());
  const [newProblemError, setNewProblemError] = useState<string | null>(null);
  const [selectedProblemIds, setSelectedProblemIds] = useState<string[]>([]);
  const [bulkSelectEditorChapterId, setBulkSelectEditorChapterId] = useState<string | undefined>();
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
  const bulkSelectEditorChapterProblemIds = useMemo(
    () => bulkSelectEditorChapterId
      ? problems
          .filter((problem) => problem.chapterId === bulkSelectEditorChapterId)
          .map((problem) => problem.id)
      : [],
    [bulkSelectEditorChapterId, problems],
  );
  const unassignedEditorChapterProblemIds = useMemo(
    () => problems
      .filter((problem) => !problem.chapterId)
      .map((problem) => problem.id),
    [problems],
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

  const selectProblemsByEditorChapter = () => {
    if (!bulkSelectEditorChapterId) return;

    if (bulkSelectEditorChapterProblemIds.length === 0) {
      toast.info("这个题集章节下暂时没有题目");
      return;
    }

    setSelectedProblemIds((current) => Array.from(new Set([...current, ...bulkSelectEditorChapterProblemIds])));
    toast.success(`已选择该题集章节下 ${bulkSelectEditorChapterProblemIds.length} 道题`);
  };

  const selectProblemsWithoutEditorChapter = () => {
    if (unassignedEditorChapterProblemIds.length === 0) {
      toast.info("当前没有未分配题集章节的题目");
      return;
    }

    setSelectedProblemIds((current) => Array.from(new Set([...current, ...unassignedEditorChapterProblemIds])));
    toast.success(`已选择未分配题集章节的 ${unassignedEditorChapterProblemIds.length} 道题`);
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
  const editorModeLabel = showOrganizeTools ? "整理模式" : showAddForm ? "新增题目" : "浏览题目";

  return (
    <div className={`space-y-4 ${selectedProblemIdsInList.length > 0 ? "pb-28" : ""}`}>
      {/* Toolbar */}
      <div className="surface-toolbar p-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-on-surface">题集编辑</h3>
              <span className="tag-chip tag-chip-primary px-2 py-0.5 text-xs">{editorModeLabel}</span>
              <span className="tag-chip px-2 py-0.5 text-xs">{problems.length} 题</span>
              {selectedProblemIdsInList.length > 0 && (
                <span className="tag-chip tag-chip-primary px-2 py-0.5 text-xs">{selectedProblemIdsInList.length} 已选</span>
              )}
              {showMath3Assignment && showOrganizeTools && (
                <span className="tag-chip px-2 py-0.5 text-xs">{unassignedMath3ProblemIds.length} 未归数三</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {problems.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setShowOrganizeTools((value) => !value);
                  setShowAddForm(false);
                  setNewProblemError(null);
                }}
                className={`control-button px-3 text-xs ${showOrganizeTools ? "control-button-selected" : ""}`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                整理工具
                {showOrganizeTools ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            )}
            <button
              onClick={() => {
                setShowAIScan(true);
                setShowOrganizeTools(false);
              }}
              className="control-button px-3 text-xs"
            >
              <Scan className="h-3.5 w-3.5" />
              AI 扫描
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddForm((value) => !value);
                setShowOrganizeTools(false);
                setNewProblemError(null);
              }}
              className="control-button control-button-primary px-3 text-xs"
            >
              {showAddForm ? <ChevronUp className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {showAddForm ? "收起新增" : "新增题目"}
            </button>
          </div>
        </div>
        {hasUnsavedChanges && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
            <AlertCircle className="h-3.5 w-3.5" />
            题目修改未更新
          </div>
        )}
      </div>

      <AnimatePresence>
        {showOrganizeTools && problems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <ProblemOrganizerPanel
              totalCount={problems.length}
              visibleCount={visibleProblems.length}
              selectedCount={selectedProblemIdsInList.length}
              allVisibleSelected={allVisibleProblemsSelected}
              noteId={noteId}
              selectedChapterId={bulkSelectEditorChapterId}
              selectedChapterProblemCount={bulkSelectEditorChapterProblemIds.length}
              unassignedChapterCount={unassignedEditorChapterProblemIds.length}
              onToggleVisible={toggleAllProblemSelection}
              onChangeChapter={setBulkSelectEditorChapterId}
              onSelectChapter={selectProblemsByEditorChapter}
              onSelectUnassignedChapter={selectProblemsWithoutEditorChapter}
              showMath3Tools={showMath3Assignment}
              unassignedMath3Count={unassignedMath3ProblemIds.length}
              onlyUnassignedMath3={onlyShowUnassignedMath3Problems}
              selectedMath3ChapterId={selectedMath3ChapterId}
              selectedMath3Chapter={selectedMath3Chapter}
              onToggleOnlyUnassignedMath3={() => setOnlyShowUnassignedMath3Problems((value) => !value)}
              onSelectUnassignedMath3={selectUnassignedMath3Problems}
              onChangeMath3Chapter={handleChangeMath3Chapter}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Existing Problems (drag-and-drop) */}
      {problems.length > 0 && (
        <>
          <Reorder.Group
            axis="y"
            values={visibleProblems}
            onReorder={handleProblemReorder}
            className="space-y-2"
          >
            {visibleProblems.map((problem, index) => (
              <EditableProblemItem key={problem.id} problem={problem}>
                {(dragControls) => (
                  <ProblemCard
                    problem={problem}
                    index={problemIndexById.get(problem.id) ?? index}
                    noteId={noteId}
                    selected={selectedProblemIdSet.has(problem.id)}
                    showSelectionTools={showOrganizeTools || selectedProblemIdSet.size > 0}
                    organizeMode={showOrganizeTools}
                    showMath3Tools={showMath3Assignment && showOrganizeTools}
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
            <div className="surface-panel border-dashed px-4 py-8 text-center text-sm text-on-surface-variant">
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
            className="surface-panel space-y-3 overflow-hidden p-4"
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
                  className="field-control w-full px-3 py-2 text-sm"
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
                  className="field-control w-full px-3 py-2 text-sm"
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
                className="field-control w-full resize-none px-3 py-2 text-sm placeholder:text-on-surface-variant/40"
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
                      className="field-control w-full px-2 py-2 text-sm"
                      placeholder="A"
                    />
                    <textarea
                      value={option.content}
                      onChange={(e) => updateNewProblemOption(optionIndex, "content", e.target.value)}
                      rows={1}
                      className="field-control min-h-9 w-full resize-y px-3 py-2 text-sm placeholder:text-on-surface-variant/40"
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
                className="field-control w-full resize-none px-3 py-2 text-sm placeholder:text-on-surface-variant/40"
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
                className="field-control w-full resize-none px-3 py-2 text-sm placeholder:text-on-surface-variant/40"
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
                className="control-button px-3 py-2 text-sm disabled:opacity-40"
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
                className="control-button flex-1 px-3 py-2 text-sm"
              >
                取消
              </button>
              <button
                onClick={handleAdd}
                disabled={!newProblem.question?.trim()}
                className="control-button control-button-primary flex-1 px-3 py-2 text-sm disabled:opacity-40"
              >
                添加题目
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Button */}
      {!showAddForm && problems.length === 0 && (
        <button
          onClick={() => {
            setShowAddForm(true);
            setNewProblemError(null);
          }}
          className="control-button w-full border-dashed px-4 py-3 text-sm"
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

function ProblemOrganizerPanel({
  totalCount,
  visibleCount,
  selectedCount,
  allVisibleSelected,
  noteId,
  selectedChapterId,
  selectedChapterProblemCount,
  unassignedChapterCount,
  onToggleVisible,
  onChangeChapter,
  onSelectChapter,
  onSelectUnassignedChapter,
  showMath3Tools,
  unassignedMath3Count,
  onlyUnassignedMath3,
  selectedMath3ChapterId,
  selectedMath3Chapter,
  onToggleOnlyUnassignedMath3,
  onSelectUnassignedMath3,
  onChangeMath3Chapter,
}: {
  totalCount: number;
  visibleCount: number;
  selectedCount: number;
  allVisibleSelected: boolean;
  noteId?: string;
  selectedChapterId?: string;
  selectedChapterProblemCount: number;
  unassignedChapterCount: number;
  onToggleVisible: () => void;
  onChangeChapter: (chapterId: string | undefined) => void;
  onSelectChapter: () => void;
  onSelectUnassignedChapter: () => void;
  showMath3Tools: boolean;
  unassignedMath3Count: number;
  onlyUnassignedMath3: boolean;
  selectedMath3ChapterId: string;
  selectedMath3Chapter: ReturnType<typeof getMath3ChapterById>;
  onToggleOnlyUnassignedMath3: () => void;
  onSelectUnassignedMath3: () => void;
  onChangeMath3Chapter: (chapterId: string) => void;
}) {
  return (
    <section className="surface-panel p-3">
      <div className="mb-3 flex flex-col gap-3 border-b border-outline-variant/10 pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-on-surface">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            整理模式
          </div>
          <p className="mt-1 text-xs leading-5 text-on-surface-variant">
            先勾选题目；选中后，页面底部会出现批量修改栏。
          </p>
          <div className="compact-meta-row mt-2">
            <span>已选 {selectedCount}</span>
            <span>显示 {visibleCount}/{totalCount}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleVisible}
            disabled={visibleCount === 0}
            className="control-button px-3 text-xs"
          >
            {allVisibleSelected ? "取消当前显示" : "选择当前显示"} · {visibleCount}/{totalCount}
          </button>
          <button
            type="button"
            onClick={onSelectUnassignedChapter}
            disabled={unassignedChapterCount === 0}
            className="control-button px-3 text-xs"
          >
            选择未分题集章节 · {unassignedChapterCount}
          </button>
        </div>
      </div>

      <div className={`grid gap-3 ${showMath3Tools ? "xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]" : ""}`}>
        <div className="surface-muted p-2">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
            <CheckSquare className="h-3.5 w-3.5" />
            按题集章节选题
          </div>
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
            <ChapterSelector
              noteId={noteId}
              value={selectedChapterId}
              onChange={onChangeChapter}
              className="w-full"
            />
            <button
              type="button"
              onClick={onSelectChapter}
              disabled={!selectedChapterId || selectedChapterProblemCount === 0}
              className="control-button px-3 text-xs"
            >
              <FolderTree className="h-3.5 w-3.5" />
              选择该章节 · {selectedChapterProblemCount}
            </button>
          </div>
          <div className="mt-2 text-xs text-on-surface-variant">
            未分题集章节 {unassignedChapterCount} 题
          </div>
        </div>

        {showMath3Tools && (
          <div className="surface-muted p-2">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
                <Tags className="h-3.5 w-3.5" />
                数三归类辅助
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onToggleOnlyUnassignedMath3}
                  className={`control-button min-h-0 px-2 py-1 text-xs ${onlyUnassignedMath3 ? "control-button-selected" : ""}`}
                >
                  {onlyUnassignedMath3 ? "显示全部" : "只看未归"}
                </button>
                <button
                  type="button"
                  onClick={onSelectUnassignedMath3}
                  disabled={unassignedMath3Count === 0}
                  className="control-button min-h-0 px-2 py-1 text-xs"
                >
                  选择未归 · {unassignedMath3Count}
                </button>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-[260px_minmax(0,1fr)]">
              <select
                value={selectedMath3ChapterId}
                onChange={(event) => onChangeMath3Chapter(event.target.value)}
                className="field-control h-10 w-full px-3 text-sm"
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
              <div className="flex min-w-0 flex-wrap gap-1.5 overflow-hidden">
                {selectedMath3Chapter?.chapter.points.slice(0, 5).map((pointItem) => (
                  <span key={pointItem.id} className="tag-chip px-2 py-0.5 text-xs">
                    {pointItem.title}
                  </span>
                ))}
                {(selectedMath3Chapter?.chapter.points.length ?? 0) > 5 && (
                  <span className="tag-chip px-2 py-0.5 text-xs">
                    +{(selectedMath3Chapter?.chapter.points.length ?? 0) - 5}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
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
  const [showBulkDetails, setShowBulkDetails] = useState(false);

  useEffect(() => {
    if (!isOpen) setShowBulkDetails(false);
  }, [isOpen]);

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
          <div className="command-bar pointer-events-auto mx-auto max-w-5xl p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 rounded-lg bg-primary/[0.08] px-3 py-2 text-sm font-semibold text-on-surface">
                  <CheckSquare className="h-4 w-4 text-primary" />
                  已选 {selectedCount} / {totalCount} 道
                </div>
                <button
                  type="button"
                  onClick={onToggleAll}
                  disabled={visibleCount === 0 || isClassifying}
                  className="control-button h-9 min-h-0 px-3 text-xs"
                >
                  {allSelected ? "取消当前显示" : "全选当前显示"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowBulkDetails((value) => !value)}
                  disabled={isClassifying}
                  className={`control-button h-9 min-h-0 px-3 text-xs ${showBulkDetails ? "control-button-selected" : ""}`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  批量修改
                  {showBulkDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              </div>

              <div className="flex shrink-0 items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onRemoveSelected}
                  disabled={isClassifying}
                  className="control-button control-button-danger h-9 min-h-0 px-3 text-xs"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </button>
                <button
                  type="button"
                  onClick={onClearSelection}
                  disabled={isClassifying}
                  className="control-button h-9 min-h-0 w-9 p-0"
                  title="取消选择"
                  aria-label="取消选择"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <AnimatePresence>
              {showBulkDetails && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.16 }}
                  className="overflow-hidden"
                >
                  <div className={`mt-2 grid gap-2 ${showMath3Tools ? "lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]" : ""}`}>
                    <div className="surface-muted grid gap-2 p-2 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
                      <div className="text-xs font-semibold text-on-surface-variant">题集章节</div>
                      <ChapterSelector
                        noteId={noteId}
                        value={selectedEditorChapterId}
                        onChange={onChangeEditorChapter}
                        className="w-full"
                        placement="top"
                      />
                      <button
                        type="button"
                        onClick={onApplyEditorChapter}
                        disabled={!selectedEditorChapterId || isClassifying}
                        className="control-button h-10 px-3 text-xs"
                      >
                        <FolderTree className="h-3.5 w-3.5" />
                        应用
                      </button>
                    </div>

                    {showMath3Tools && (
                      <div className="surface-muted grid gap-2 p-2 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
                        <div className="text-xs font-semibold text-on-surface-variant">数三归类</div>
                        <select
                          value={selectedMath3ChapterId}
                          onChange={(event) => onChangeMath3Chapter(event.target.value)}
                          disabled={isClassifying}
                          className="field-control h-10 min-w-0 px-3 text-sm disabled:opacity-40"
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
                            className="control-button h-10 px-3 text-xs"
                          >
                            归章
                          </button>
                          <button
                            type="button"
                            onClick={onClassifyKnowledge}
                            disabled={!selectedMath3Chapter || isClassifying}
                            className="control-button control-button-primary h-10 px-3 text-xs"
                          >
                            {isClassifying ? (
                              <span className="inline-flex items-center gap-1.5">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                标记中
                              </span>
                            ) : (
                              "AI 标记"
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={onClearMath3Knowledge}
                            disabled={isClassifying}
                            className="control-button h-10 px-3 text-xs"
                          >
                            清除
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Internal ProblemCard for editor (with drag handle + chapter + AI status)
function ProblemCard({
  problem,
  index,
  noteId,
  selected,
  showSelectionTools,
  organizeMode,
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
  organizeMode: boolean;
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
    <div className={`surface-card group overflow-hidden ${
      selected ? "border-primary/45 bg-primary/[0.045] ring-1 ring-primary/15" : ""
    }`}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-4">
        <div className="flex items-start gap-2 sm:block">
          {showSelectionTools && (
            <label
              className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-low"
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

          {organizeMode && (
            <div
              onPointerDown={(event) => dragControls.start(event)}
              className="mt-0.5 hidden h-8 w-8 cursor-grab items-center justify-center rounded-lg text-on-surface-variant/25 transition-colors hover:bg-surface-container-low hover:text-on-surface-variant/60 active:cursor-grabbing sm:flex"
              title="拖拽排序"
            >
              <GripVertical className="h-4 w-4" />
            </div>
          )}

          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-on-primary sm:mt-2">
            {index + 1}
          </div>
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
          className="min-w-0 rounded-lg px-1 py-0.5 transition-colors hover:bg-surface-container-low/70"
        >
          <div className="mb-2 flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="tag-chip tag-chip-primary px-2 py-0.5 text-xs font-medium">
              {problemTypeMap[problem.type]}
            </span>
            <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${difficultyColorMap[problem.difficulty]}`}>
              {difficultyMap[problem.difficulty]}
            </span>
            {problem.aiStatus === 'complete' && (
              <span className="tag-chip tag-chip-warning px-2 py-0.5 text-xs">
                <Sparkles className="h-3 w-3" /> AI
              </span>
            )}
            {validationIssues.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                <AlertCircle className="h-3 w-3" /> 需检查
              </span>
            )}
          </div>

          <MarkdownContent
            content={problem.question || "(无题目内容)"}
            compact
            className="problem-card-preview text-sm font-semibold leading-6 text-on-surface sm:text-[15px]"
          />

          {showMath3Tools && (
            <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5">
              {math3ChapterTitle ? (
                <>
                  <span
                    className="tag-chip tag-chip-primary max-w-full px-2 py-0.5 text-xs font-medium"
                    title={math3ChapterTitle}
                  >
                    {math3ChapterTitle}
                  </span>
                  {math3PointTitles.length > 0 ? (
                    <span
                      className="tag-chip tag-chip-info max-w-full px-2 py-0.5 text-xs"
                      title={math3PointTitles.join("、")}
                    >
                      {math3PointTitles.slice(0, 2).join("、")}
                      {math3PointTitles.length > 2 ? ` +${math3PointTitles.length - 2}` : ""}
                    </span>
                  ) : (
                    <span className="tag-chip px-2 py-0.5 text-xs">
                      待 AI 标知识点
                    </span>
                  )}
                </>
              ) : (
                <span className="tag-chip px-2 py-0.5 text-xs">
                  未分配数三章节
                </span>
              )}
            </div>
          )}
        </div>

        <div className="col-span-2 flex items-center justify-end gap-1 border-t border-outline-variant/10 pt-2 sm:col-span-1 sm:block sm:border-t-0 sm:pt-0">
          {(organizeMode || expanded) && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                className="control-button h-8 min-h-0 w-8 p-0 opacity-70 sm:flex"
                title="复制题目"
                aria-label="复制题目"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="control-button control-button-danger h-8 min-h-0 w-8 p-0 opacity-70 sm:mt-2 sm:flex"
                title="删除题目"
                aria-label="删除题目"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="control-button h-8 min-h-0 w-8 p-0 sm:mt-2"
            title={expanded ? "收起编辑" : "展开编辑"}
            aria-label={expanded ? "收起编辑" : "展开编辑"}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
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
                    className="field-control w-full px-3 py-2 text-sm"
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
                    className="field-control w-full px-3 py-2 text-sm"
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
                className="field-control min-h-24 w-full resize-y px-3 py-2 text-sm placeholder:text-on-surface-variant/40"
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
                      className="field-control w-full px-2 py-2 text-sm"
                      placeholder="A"
                    />
                    <textarea
                      value={option.content}
                      onChange={(e) => updateOption(optionIndex, "content", e.target.value)}
                      rows={1}
                      className="field-control min-h-9 w-full resize-y px-3 py-2 text-sm placeholder:text-on-surface-variant/40"
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
                  className="field-control min-h-20 w-full resize-y px-3 py-2 text-sm placeholder:text-on-surface-variant/40"
                  placeholder="输入答案..."
                />
              </div>
              <div>
                <label className="text-xs text-on-surface-variant/60 mb-1 block">提示</label>
                <textarea
                  value={problem.tips || ""}
                  onChange={(e) => onUpdate({ tips: e.target.value || undefined })}
                  rows={3}
                  className="field-control min-h-20 w-full resize-y px-3 py-2 text-sm placeholder:text-on-surface-variant/40"
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
                className="field-control min-h-28 w-full resize-y px-3 py-2 text-sm placeholder:text-on-surface-variant/40"
                placeholder="输入解析，支持 Markdown 和 LaTeX..."
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleRepairProblem}
                className="control-button px-3 py-2 text-sm"
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
