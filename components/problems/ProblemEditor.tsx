"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import { motion, AnimatePresence, Reorder, useDragControls } from "framer-motion";
import { AlertCircle, Plus, X, ChevronDown, ChevronUp, GripVertical, Sparkles, Scan, Copy, Trash2, Wrench, Tags } from "lucide-react";
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
  getMath3PointById,
  getMath3PointIdsFromTags,
  setMath3ProblemPointTags,
} from "@/lib/math3-practice";

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

export function ProblemEditor({ problems, onChange, noteId, subject, hasUnsavedChanges = false }: ProblemEditorProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAIScan, setShowAIScan] = useState(false);
  const [newProblem, setNewProblem] = useState<Partial<Problem>>(createEmptyProblemDraft());
  const [newProblemError, setNewProblemError] = useState<string | null>(null);
  const [selectedProblemIds, setSelectedProblemIds] = useState<string[]>([]);
  const [selectedMath3ChapterId, setSelectedMath3ChapterId] = useState<string>(() => getDefaultMath3ChapterId());
  const [selectedMath3PointIds, setSelectedMath3PointIds] = useState<string[]>([]);

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
      setSelectedMath3PointIds([]);
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
  const allProblemsSelected = problems.length > 0 && selectedProblemIdsInList.length === problems.length;
  const selectedMath3Chapter = useMemo(
    () => getMath3ChapterById(selectedMath3ChapterId),
    [selectedMath3ChapterId],
  );
  const selectedMath3PointSet = useMemo(
    () => new Set(selectedMath3PointIds),
    [selectedMath3PointIds],
  );
  const math3PointTitlesByProblemId = useMemo(
    () => Object.fromEntries(
      problems.map((problem) => [problem.id, getProblemMath3PointTitles(problem)])
    ),
    [problems],
  );

  const toggleProblemSelection = (id: string) => {
    setSelectedProblemIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const toggleAllProblemSelection = () => {
    setSelectedProblemIds(allProblemsSelected ? [] : problems.map((problem) => problem.id));
  };

  const handleChangeMath3Chapter = (chapterId: string) => {
    setSelectedMath3ChapterId(chapterId);
    setSelectedMath3PointIds([]);
  };

  const toggleMath3Point = (pointId: string) => {
    setSelectedMath3PointIds((current) =>
      current.includes(pointId) ? current.filter((id) => id !== pointId) : [...current, pointId]
    );
  };

  const selectAllMath3PointsInChapter = () => {
    setSelectedMath3PointIds(selectedMath3Chapter?.chapter.points.map((pointItem) => pointItem.id) ?? []);
  };

  const applyMath3PointsToSelected = () => {
    if (selectedProblemIdsInList.length === 0 || selectedMath3PointIds.length === 0) return;

    onChange(problems.map((problem) => (
      selectedProblemIdSet.has(problem.id)
        ? { ...problem, tags: setMath3ProblemPointTags(problem.tags, selectedMath3PointIds) }
        : problem
    )));
  };

  const clearMath3PointsFromSelected = () => {
    if (selectedProblemIdsInList.length === 0) return;

    onChange(problems.map((problem) => (
      selectedProblemIdSet.has(problem.id)
        ? { ...problem, tags: setMath3ProblemPointTags(problem.tags, []) }
        : problem
    )));
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
        <>
          {showMath3Assignment && (
            <Math3AssignmentPanel
              totalCount={problems.length}
              selectedCount={selectedProblemIdsInList.length}
              allSelected={allProblemsSelected}
              selectedChapterId={selectedMath3ChapterId}
              selectedPointIds={selectedMath3PointIds}
              selectedPointSet={selectedMath3PointSet}
              onToggleAll={toggleAllProblemSelection}
              onChangeChapter={handleChangeMath3Chapter}
              onTogglePoint={toggleMath3Point}
              onSelectAllPoints={selectAllMath3PointsInChapter}
              onClearSelectedPoints={() => setSelectedMath3PointIds([])}
              onApply={applyMath3PointsToSelected}
              onClearProblems={clearMath3PointsFromSelected}
            />
          )}
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
                    selected={selectedProblemIdSet.has(problem.id)}
                    showMath3Tools={showMath3Assignment}
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

function Math3AssignmentPanel({
  totalCount,
  selectedCount,
  allSelected,
  selectedChapterId,
  selectedPointIds,
  selectedPointSet,
  onToggleAll,
  onChangeChapter,
  onTogglePoint,
  onSelectAllPoints,
  onClearSelectedPoints,
  onApply,
  onClearProblems,
}: {
  totalCount: number;
  selectedCount: number;
  allSelected: boolean;
  selectedChapterId: string;
  selectedPointIds: string[];
  selectedPointSet: Set<string>;
  onToggleAll: () => void;
  onChangeChapter: (chapterId: string) => void;
  onTogglePoint: (pointId: string) => void;
  onSelectAllPoints: () => void;
  onClearSelectedPoints: () => void;
  onApply: () => void;
  onClearProblems: () => void;
}) {
  const selectedChapter = getMath3ChapterById(selectedChapterId);

  return (
    <section className="rounded-xl border border-primary/15 bg-primary/5 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
            <Tags className="h-4 w-4" />
            数三知识点分配
          </div>
          <p className="mt-1 text-xs leading-5 text-on-surface-variant">
            给选中的小题批量分配大纲知识点，保存题集后目录页会自动按小题归属显示。
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleAll}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-3 text-xs font-medium text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary"
        >
          {allSelected ? "取消全选" : "全选题目"} · {selectedCount}/{totalCount}
        </button>
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
            <label className="block text-xs font-medium text-on-surface-variant">知识点</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onSelectAllPoints}
                className="text-xs text-primary hover:text-primary/80"
              >
                选本章全部
              </button>
              <button
                type="button"
                onClick={onClearSelectedPoints}
                className="text-xs text-on-surface-variant hover:text-primary"
              >
                清空选择
              </button>
            </div>
          </div>

          <div className="max-h-36 overflow-y-auto rounded-lg bg-surface-container-lowest p-2">
            {selectedChapter ? (
              <div className="flex flex-wrap gap-2">
                {selectedChapter.chapter.points.map((pointItem) => (
                  <button
                    key={pointItem.id}
                    type="button"
                    onClick={() => onTogglePoint(pointItem.id)}
                    aria-pressed={selectedPointSet.has(pointItem.id)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      selectedPointSet.has(pointItem.id)
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-outline-variant/30 text-on-surface-variant hover:border-primary/30 hover:text-primary"
                    }`}
                  >
                    {pointItem.title}
                  </button>
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
          已选 {selectedCount} 道题，待应用 {selectedPointIds.length} 个知识点
        </span>
        <button
          type="button"
          onClick={onClearProblems}
          disabled={selectedCount === 0}
          className="h-9 rounded-lg border border-outline-variant/30 px-3 text-xs font-medium text-on-surface-variant transition-colors hover:border-red-300 hover:text-red-600 disabled:opacity-40"
        >
          清除所选题归属
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={selectedCount === 0 || selectedPointIds.length === 0}
          className="h-9 rounded-lg bg-primary px-3 text-xs font-medium text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          应用到所选题
        </button>
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
  showMath3Tools,
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
  showMath3Tools: boolean;
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
        {showMath3Tools && (
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
              math3PointTitles.length > 0 ? (
                <span
                  className="max-w-full rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-700 line-clamp-1"
                  title={math3PointTitles.join("、")}
                >
                  {math3PointTitles.slice(0, 2).join("、")}
                  {math3PointTitles.length > 2 ? ` +${math3PointTitles.length - 2}` : ""}
                </span>
              ) : (
                <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-xs text-on-surface-variant/70">
                  未分配数三知识点
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
