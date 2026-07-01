"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import { motion, AnimatePresence, Reorder, useDragControls } from "framer-motion";
import { AlertCircle, Plus, X, ChevronDown, ChevronUp, GripVertical, Sparkles, Scan, Copy, Trash2, FolderTree, CheckSquare, SlidersHorizontal, Loader2 } from "lucide-react";
import { problemTypeMap, difficultyMap, difficultyColorMap } from "@/lib/types";
import type { Chapter, Difficulty, Problem, ProblemType, Subject } from "@/lib/types";
import { chaptersApi } from "@/lib/chapters-api";
import { ChapterSelector } from "@/components/chapters/ChapterSelector";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ProblemPreview } from "./ProblemPreview";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { OCRUploader } from "@/components/ai-assistant/OCRUploader";
import type { ChapterContextItem } from "@/hooks/useAIScan";
import { useMath3AutoClassify } from "@/hooks/useMath3AutoClassify";
import {
  getMath3ChapterById,
  getMath3ProblemChapterIds,
} from "@/lib/math3-practice";
import {
  ensureChoiceOptions,
  getProblemValidationIssues,
  normalizeProblem,
  normalizeProblemDraft,
} from "@/lib/problem-utils";
import { useToast } from "@/components/ui/Toast";
import { scheduleDeferredClientWork } from "@/lib/deferred-client-work";
import { collapsibleMotion, dialogMotion, uiMotion } from "@/lib/motion";

interface ProblemEditorProps {
  problems: Problem[];
  onChange: (problems: Problem[]) => void;
  noteId?: string;
  subject?: Subject;
  hasUnsavedChanges?: boolean;
  chapterRefreshKey?: number;
}

const createEmptyProblemDraft = (): Partial<Problem> => ({
  type: "calculation",
  difficulty: "medium",
  question: "",
  answer: "",
  tags: [],
});

export function ProblemEditor({
  problems,
  onChange,
  noteId,
  subject = "math",
  hasUnsavedChanges = false,
  chapterRefreshKey = 0,
}: ProblemEditorProps) {
  const toast = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAIScan, setShowAIScan] = useState(false);
  const [showOrganizeTools, setShowOrganizeTools] = useState(false);
  const [newProblem, setNewProblem] = useState<Partial<Problem>>(createEmptyProblemDraft());
  const [newProblemError, setNewProblemError] = useState<string | null>(null);
  const [selectedProblemIds, setSelectedProblemIds] = useState<string[]>([]);
  const [bulkSelectEditorChapterId, setBulkSelectEditorChapterId] = useState<string | undefined>();
  const [selectedEditorChapterId, setSelectedEditorChapterId] = useState<string | undefined>();
  const [editorChapters, setEditorChapters] = useState<Chapter[]>([]);
  const [isLoadingEditorChapters, setIsLoadingEditorChapters] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const {
    isClassifyingMath3,
    math3ClassifyProgress,
    handleAutoClassifyMath3,
  } = useMath3AutoClassify({
    problems,
    subject,
    onChange,
  });

  // One shared chapter load powers OCR context and all editor chapter selectors.
  useEffect(() => {
    let cancelled = false;
    const cancelDeferredLoad = scheduleDeferredClientWork(() => {
      setIsLoadingEditorChapters(true);
      void (async () => {
        try {
          const data = noteId ? await chaptersApi.getByNoteId(noteId) : await chaptersApi.getTemplates();
          if (!cancelled) setEditorChapters(data);
        } catch {
          if (!cancelled) setEditorChapters([]);
        } finally {
          if (!cancelled) setIsLoadingEditorChapters(false);
        }
      })();
    });

    return () => {
      cancelled = true;
      cancelDeferredLoad();
    };
  }, [chapterRefreshKey, noteId]);

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
      explanation: "",
      options: normalizedDraft.type === "choice" ? normalizedDraft.options : undefined,
      tags: [],
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
    setShowBulkDeleteConfirm(true);
  };

  const confirmRemoveSelected = () => {
    if (selectedProblemIdsInList.length === 0) return;
    onChange(problems.filter((problem) => !selectedProblemIdSet.has(problem.id)));
    setSelectedProblemIds([]);
    setShowBulkDeleteConfirm(false);
    toast.success(`已从题集中移除 ${selectedProblemIdsInList.length} 道题，请保存题集后生效`);
  };

  const handleDuplicate = (problem: Problem) => {
    onChange([...problems, { ...problem, id: crypto.randomUUID() }]);
  };

  const handleUpdate = (id: string, updates: Partial<Problem>) => {
    onChange(problems.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const problemIdSet = useMemo(() => new Set(problems.map((problem) => problem.id)), [problems]);
  const selectedProblemIdsInList = selectedProblemIds.filter((id) => problemIdSet.has(id));
  const selectedProblemIdSet = new Set(selectedProblemIdsInList);
  const problemIndexById = useMemo(
    () => new Map(problems.map((problem, index) => [problem.id, index])),
    [problems],
  );
  const visibleProblems = problems;
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
    onChange(nextVisibleProblems);
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

  const classifySelectedProblemsToMath3Catalog = () => {
    void handleAutoClassifyMath3({
      problemIds: selectedProblemIdsInList,
      scopeLabel: "选中题目",
    });
  };

  const clearSelectedProblemSelection = () => {
    setSelectedProblemIds([]);
  };

  const handleAcceptAI = (newProblems: Problem[]) => {
    onChange([...problems, ...newProblems.map(normalizeProblem)]);
  };

  const chapterContext = useMemo<ChapterContextItem[]>(
    () => editorChapters.map((chapter) => ({ id: chapter.id, name: chapter.name })),
    [editorChapters],
  );
  const newProblemOptions = newProblem.type === "choice" ? ensureChoiceOptions(newProblem.options) : [];
  const editorModeLabel = showOrganizeTools ? "批量编辑" : showAddForm ? "新增题目" : "浏览题目";
  const math3ClassifyLabel = math3ClassifyProgress
    ? `归类 ${math3ClassifyProgress.completed}/${math3ClassifyProgress.total}`
    : "AI 归入大纲";

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
                批量编辑
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
            {subject === "math" && problems.length > 0 && (
              <button
                type="button"
                onClick={() => void handleAutoClassifyMath3()}
                disabled={isClassifyingMath3}
                className="control-button px-3 text-xs disabled:opacity-50"
              >
                {isClassifyingMath3 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {isClassifyingMath3 ? math3ClassifyLabel : "AI 归入大纲"}
              </button>
            )}
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
        {math3ClassifyProgress && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-primary/15 bg-primary/[0.06] px-3 py-1.5 text-xs text-on-surface-variant">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span>
              正在分批归入大纲：已处理 {math3ClassifyProgress.completed}/{math3ClassifyProgress.total}
              {math3ClassifyProgress.failed > 0 ? `，${math3ClassifyProgress.failed} 题待人工检查` : ""}
            </span>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showOrganizeTools && problems.length > 0 && (
          <motion.div
            variants={collapsibleMotion}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: uiMotion.duration.reveal, ease: uiMotion.ease.emphasized }}
            className="overflow-hidden"
          >
            <ProblemOrganizerPanel
              totalCount={problems.length}
              visibleCount={visibleProblems.length}
              selectedCount={selectedProblemIdsInList.length}
              allVisibleSelected={allVisibleProblemsSelected}
              noteId={noteId}
              chapters={editorChapters}
              isLoadingChapters={isLoadingEditorChapters}
              selectedChapterId={bulkSelectEditorChapterId}
              selectedChapterProblemCount={bulkSelectEditorChapterProblemIds.length}
              unassignedChapterCount={unassignedEditorChapterProblemIds.length}
              onToggleVisible={toggleAllProblemSelection}
              onChangeChapter={setBulkSelectEditorChapterId}
              onSelectChapter={selectProblemsByEditorChapter}
              onSelectUnassignedChapter={selectProblemsWithoutEditorChapter}
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
                    chapters={editorChapters}
                    isLoadingChapters={isLoadingEditorChapters}
                    selected={selectedProblemIdSet.has(problem.id)}
                    showSelectionTools={showOrganizeTools || selectedProblemIdSet.size > 0}
                    organizeMode={showOrganizeTools}
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
            variants={collapsibleMotion}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: uiMotion.duration.reveal, ease: uiMotion.ease.emphasized }}
            className="surface-panel space-y-3 overflow-hidden p-4"
          >
            {/* Chapter Selector */}
            <div>
              <label className="text-xs text-on-surface-variant/60 mb-1 block">章节分类</label>
              <ChapterSelector
                noteId={noteId}
                chapters={editorChapters}
                isLoading={isLoadingEditorChapters}
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
                placeholder="输入简短答案..."
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
        noteId={noteId}
        chapters={editorChapters}
        isLoadingChapters={isLoadingEditorChapters}
        selectedEditorChapterId={selectedEditorChapterId}
        canClassifyMath3={subject === "math"}
        isClassifyingMath3={isClassifyingMath3}
        math3ClassifyLabel={math3ClassifyLabel}
        onClearSelection={clearSelectedProblemSelection}
        onChangeEditorChapter={setSelectedEditorChapterId}
        onApplyEditorChapter={applyEditorChapterToSelected}
        onClassifySelectedMath3={classifySelectedProblemsToMath3Catalog}
        onRemoveSelected={handleRemoveSelected}
      />

      <ConfirmDialog
        isOpen={showBulkDeleteConfirm}
        title="确认移除题目"
        description={<>确定从当前题集中移除选中的 {selectedProblemIdsInList.length} 道题吗？保存题集后才会正式生效。</>}
        confirmLabel="确认移除"
        onClose={() => setShowBulkDeleteConfirm(false)}
        onConfirm={confirmRemoveSelected}
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
  chapters,
  isLoadingChapters,
  selectedChapterId,
  selectedChapterProblemCount,
  unassignedChapterCount,
  onToggleVisible,
  onChangeChapter,
  onSelectChapter,
  onSelectUnassignedChapter,
}: {
  totalCount: number;
  visibleCount: number;
  selectedCount: number;
  allVisibleSelected: boolean;
  noteId?: string;
  chapters: Chapter[];
  isLoadingChapters: boolean;
  selectedChapterId?: string;
  selectedChapterProblemCount: number;
  unassignedChapterCount: number;
  onToggleVisible: () => void;
  onChangeChapter: (chapterId: string | undefined) => void;
  onSelectChapter: () => void;
  onSelectUnassignedChapter: () => void;
}) {
  return (
    <section className="surface-panel p-3">
      <div className="mb-3 flex flex-col gap-3 border-b border-outline-variant/10 pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-on-surface">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            批量编辑
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

      <div className="grid gap-3">
        <div className="surface-muted p-2">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
            <CheckSquare className="h-3.5 w-3.5" />
            按题集章节选题
          </div>
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
            <ChapterSelector
              noteId={noteId}
              chapters={chapters}
              isLoading={isLoadingChapters}
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

      </div>
    </section>
  );
}

function BulkProblemActionBar({
  isOpen,
  selectedCount,
  totalCount,
  noteId,
  chapters,
  isLoadingChapters,
  selectedEditorChapterId,
  canClassifyMath3,
  isClassifyingMath3,
  math3ClassifyLabel,
  onClearSelection,
  onChangeEditorChapter,
  onApplyEditorChapter,
  onClassifySelectedMath3,
  onRemoveSelected,
}: {
  isOpen: boolean;
  selectedCount: number;
  totalCount: number;
  noteId?: string;
  chapters: Chapter[];
  isLoadingChapters: boolean;
  selectedEditorChapterId?: string;
  canClassifyMath3: boolean;
  isClassifyingMath3: boolean;
  math3ClassifyLabel: string;
  onClearSelection: () => void;
  onChangeEditorChapter: (chapterId: string | undefined) => void;
  onApplyEditorChapter: () => void;
  onClassifySelectedMath3: () => void;
  onRemoveSelected: () => void;
}) {
  const [showBulkDetails, setShowBulkDetails] = useState(false);

  useEffect(() => {
    if (isOpen) return;

    const timer = window.setTimeout(() => {
      setShowBulkDetails(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          variants={dialogMotion}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={uiMotion.spring.gentle}
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
                  onClick={onClearSelection}
                  className="control-button h-9 min-h-0 px-3 text-xs"
                >
                  <X className="h-3.5 w-3.5" />
                  取消勾选
                </button>
                <button
                  type="button"
                  onClick={() => setShowBulkDetails((value) => !value)}
                  className={`control-button h-9 min-h-0 px-3 text-xs ${showBulkDetails ? "control-button-selected" : ""}`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  批量归类
                  {showBulkDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              </div>

              <div className="flex shrink-0 items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onRemoveSelected}
                  className="control-button control-button-danger h-9 min-h-0 px-3 text-xs"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </button>
              </div>
            </div>

            <AnimatePresence>
              {showBulkDetails && (
                <motion.div
                  variants={collapsibleMotion}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: uiMotion.duration.reveal, ease: uiMotion.ease.emphasized }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 grid gap-2">
                    <div className="surface-muted grid gap-2 p-2 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
                      <div className="text-xs font-semibold text-on-surface-variant">题集章节</div>
                      <ChapterSelector
                        noteId={noteId}
                        chapters={chapters}
                        isLoading={isLoadingChapters}
                        value={selectedEditorChapterId}
                        onChange={onChangeEditorChapter}
                        className="w-full"
                      />
                      <button
                        type="button"
                        onClick={onApplyEditorChapter}
                        disabled={!selectedEditorChapterId}
                        className="control-button h-10 px-3 text-xs"
                      >
                        <FolderTree className="h-3.5 w-3.5" />
                        应用
                      </button>
                    </div>
                    {canClassifyMath3 && (
                      <div className="surface-muted grid gap-2 p-2 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
                        <div className="text-xs font-semibold text-on-surface-variant">知识目录</div>
                        <div className="text-xs text-on-surface-variant">
                          已选 {selectedCount} 道题
                        </div>
                        <button
                          type="button"
                          onClick={onClassifySelectedMath3}
                          disabled={isClassifyingMath3}
                          className="control-button h-10 px-3 text-xs disabled:opacity-50"
                        >
                          {isClassifyingMath3 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                          {isClassifyingMath3 ? math3ClassifyLabel : "AI 归入知识目录"}
                        </button>
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
  chapters,
  isLoadingChapters,
  selected,
  showSelectionTools,
  organizeMode,
  onToggleSelect,
  onRemove,
  onDuplicate,
  onUpdate,
  dragControls
}: {
  problem: Problem;
  index: number;
  noteId?: string;
  chapters: Chapter[];
  isLoadingChapters: boolean;
  selected: boolean;
  showSelectionTools: boolean;
  organizeMode: boolean;
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
  const math3ChapterTitle = getMath3ProblemChapterIds(problem)
    .map((chapterId) => getMath3ChapterById(chapterId)?.chapter.title)
    .find(Boolean);

  const updateOption = (optionIndex: number, field: "label" | "content", value: string) => {
    const options = [...choiceOptions];
    const current = options[optionIndex] || { label: "", content: "" };
    options[optionIndex] = { ...current, [field]: value };
    onUpdate({ options });
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
            {math3ChapterTitle && (
              <span className="tag-chip px-2 py-0.5 text-xs">
                <FolderTree className="h-3 w-3" /> {math3ChapterTitle}
              </span>
            )}
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
            variants={collapsibleMotion}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: uiMotion.duration.reveal, ease: uiMotion.ease.emphasized }}
            className="px-4 pb-4 space-y-2 overflow-hidden"
          >
            <div className="grid gap-3 pt-2 md:grid-cols-[1fr_220px]">
              <div>
                <label className="text-xs text-on-surface-variant/60 mb-1 block">章节分类</label>
                <ChapterSelector
                  noteId={noteId}
                  chapters={chapters}
                  isLoading={isLoadingChapters}
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
                rows={6}
                className="field-control min-h-36 w-full resize-y px-3 py-2 text-sm placeholder:text-on-surface-variant/40"
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

            <div>
              <label className="text-xs text-on-surface-variant/60 mb-1 block">答案</label>
              <textarea
                value={problem.answer}
                onChange={(e) => onUpdate({ answer: e.target.value })}
                rows={4}
                className="field-control min-h-28 w-full resize-y px-3 py-2 text-sm placeholder:text-on-surface-variant/40"
                placeholder="输入简短答案..."
              />
            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
