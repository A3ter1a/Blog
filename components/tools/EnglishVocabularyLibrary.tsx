"use client";

import Link from "next/link";
import { createElement, FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpenText,
  Edit3,
  ExternalLink,
  Loader2,
  Search,
  Trash2,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { useToast } from "@/components/ui/Toast";
import {
  englishPassageLabels,
  englishSectionLabels,
  englishVocabularyEntryTypeLabels,
  englishVocabularyMasteryLabels,
  englishVocabularyPartOfSpeechLabels,
  type EnglishQuestion,
  type EnglishVocabularyEntry,
  type EnglishVocabularyEntryType,
  type EnglishVocabularyMasteryStatus,
  type EnglishVocabularyPartOfSpeech,
  type EnglishVocabularySourceArea,
} from "@/lib/english-training";
import {
  englishResultsApi,
  type EnglishResultPassage,
  type EnglishResultsData,
  type EnglishVocabularyInput,
} from "@/lib/english-results-api";

type VocabularyFilter = "all" | EnglishVocabularyEntryType;

type VocabularyEditForm = {
  passageId: string;
  entryType: EnglishVocabularyEntryType;
  word: string;
  partOfSpeech: EnglishVocabularyPartOfSpeech;
  definition: string;
  sourceArea: EnglishVocabularySourceArea;
  sourceQuestionId: string;
  sourceOptionLabel: string;
  sourceExcerpt: string;
  highlightText: string;
  masteryStatus: EnglishVocabularyMasteryStatus;
  note: string;
};

const filters: Array<{ value: VocabularyFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "word", label: "生词" },
  { value: "collocation", label: "固定搭配" },
  { value: "familiar_meaning", label: "熟词生义" },
];

const partOfSpeechOptions: EnglishVocabularyPartOfSpeech[] = ["n", "v", "adj", "adv", "prep", "conj", "phr", "other"];
const masteryOptions: EnglishVocabularyMasteryStatus[] = ["new", "learning", "mastered"];
const sourceAreaOptions: Array<{ value: EnglishVocabularySourceArea; label: string }> = [
  { value: "passage", label: "文章" },
  { value: "question", label: "题干" },
  { value: "option", label: "选项" },
];

function getPassageTitle(passage?: Pick<EnglishResultPassage, "year" | "section" | "passageNo" | "title">): string {
  if (!passage) return "未知篇章";
  const label = englishPassageLabels[passage.passageNo] ?? passage.passageNo;
  return `${passage.year} ${englishSectionLabels[passage.section]} ${label}`;
}

function createEditForm(entry: EnglishVocabularyEntry): VocabularyEditForm {
  return {
    passageId: entry.passageId,
    entryType: entry.entryType,
    word: entry.word,
    partOfSpeech: entry.partOfSpeech,
    definition: entry.definition,
    sourceArea: entry.sourceArea,
    sourceQuestionId: entry.sourceQuestionId ?? "",
    sourceOptionLabel: entry.sourceOptionLabel ?? "",
    sourceExcerpt: entry.sourceExcerpt,
    highlightText: entry.highlightText,
    masteryStatus: entry.masteryStatus,
    note: entry.note,
  };
}

function findPassageTrace(
  passage: EnglishResultPassage | undefined,
  form: Pick<VocabularyEditForm, "sourceArea" | "sourceExcerpt">,
): Pick<EnglishVocabularyInput, "sourceStart" | "sourceEnd" | "sourceParagraph"> {
  if (!passage || form.sourceArea !== "passage") return {};
  const excerpt = form.sourceExcerpt.trim();
  if (!excerpt) return {};
  const sourceStart = passage.content.indexOf(excerpt);
  if (sourceStart < 0) return {};
  const before = passage.content.slice(0, sourceStart);
  return {
    sourceStart,
    sourceEnd: sourceStart + excerpt.length,
    sourceParagraph: before.split(/\n{2,}/).length,
  };
}

function getTraceLabel(entry: EnglishVocabularyEntry, passage?: EnglishResultPassage): string {
  if (entry.sourceArea === "passage") return entry.sourceParagraph ? `第 ${entry.sourceParagraph} 段` : "文章";
  const question = passage?.questions.find((item) => item.id === entry.sourceQuestionId);
  if (entry.sourceArea === "option") return `第 ${question?.questionNo ?? "?"} 题 ${entry.sourceOptionLabel || "选项"}`;
  return `第 ${question?.questionNo ?? "?"} 题题干`;
}

function getReturnHref(entry: EnglishVocabularyEntry): string {
  const params = new URLSearchParams({ passage: entry.passageId, vocab: entry.id });
  return `/tools/english-training?${params.toString()}`;
}

function getSourcePreview(entry: EnglishVocabularyEntry, passage?: EnglishResultPassage): string {
  if (entry.sourceExcerpt.trim()) return entry.sourceExcerpt;
  if (entry.sourceArea === "passage") return passage?.content.slice(0, 180) ?? "";
  const question = passage?.questions.find((item) => item.id === entry.sourceQuestionId);
  if (!question) return "";
  if (entry.sourceArea === "option") {
    return question.options.find((option) => option.label === entry.sourceOptionLabel)?.content ?? "";
  }
  return question.stem;
}

function getQuestionOptions(question?: EnglishQuestion) {
  return question?.options.map((option) => ({ value: option.label, label: option.label })) ?? [];
}

export function EnglishVocabularyLibrary() {
  const toast = useToast();
  const [data, setData] = useState<EnglishResultsData>({ passages: [], vocabulary: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<VocabularyFilter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<VocabularyEditForm | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const results = await englishResultsApi.getResultsData();
        if (cancelled) return;
        setData(results);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "未知错误";
        setLoadError(message);
        toast.error(`词汇汇总加载失败：${message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const passagesById = useMemo(
    () => new Map(data.passages.map((passage) => [passage.id, passage])),
    [data.passages],
  );

  const filteredVocabulary = useMemo(() => {
    const text = query.trim().toLowerCase();
    return data.vocabulary.filter((entry) => {
      if (filter !== "all" && entry.entryType !== filter) return false;
      if (!text) return true;
      const passage = passagesById.get(entry.passageId);
      return [
        entry.word,
        entry.definition,
        entry.sourceExcerpt,
        entry.note,
        getPassageTitle(passage),
      ].some((value) => value.toLowerCase().includes(text));
    });
  }, [data.vocabulary, filter, passagesById, query]);

  const counts = useMemo(() => {
    return {
      all: data.vocabulary.length,
      word: data.vocabulary.filter((entry) => entry.entryType === "word").length,
      collocation: data.vocabulary.filter((entry) => entry.entryType === "collocation").length,
      familiar_meaning: data.vocabulary.filter((entry) => entry.entryType === "familiar_meaning").length,
    };
  }, [data.vocabulary]);

  function startEdit(entry: EnglishVocabularyEntry) {
    setEditingId(entry.id);
    setEditForm(createEditForm(entry));
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId || !editForm) return;

    const word = editForm.word.trim();
    const sourceExcerpt = editForm.sourceExcerpt.trim();
    if (!word || !sourceExcerpt) {
      toast.error("请填写词条和原文片段");
      return;
    }

    const passage = passagesById.get(editForm.passageId);
    setSavingId(editingId);
    try {
      const saved = await englishResultsApi.updateVocabulary(editingId, {
        passageId: editForm.passageId,
        entryType: editForm.entryType,
        word,
        partOfSpeech: editForm.partOfSpeech,
        definition: editForm.definition,
        sourceArea: editForm.sourceArea,
        sourceQuestionId: editForm.sourceArea === "passage" ? undefined : editForm.sourceQuestionId,
        sourceOptionLabel: editForm.sourceArea === "option" ? editForm.sourceOptionLabel : "",
        sourceExcerpt,
        highlightText: editForm.highlightText.trim() || word,
        masteryStatus: editForm.masteryStatus,
        note: editForm.note,
        ...findPassageTrace(passage, editForm),
      });
      setData((current) => ({
        ...current,
        vocabulary: current.vocabulary.map((entry) => entry.id === saved.id ? saved : entry),
      }));
      setEditingId(null);
      setEditForm(null);
      toast.success("词条已更新");
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`更新失败：${message}`);
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await englishResultsApi.deleteVocabulary(id);
      setData((current) => ({
        ...current,
        vocabulary: current.vocabulary.filter((entry) => entry.id !== id),
      }));
      toast.success("词条已删除");
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`删除失败：${message}`);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <PageHeader
        width="workspace"
        title="词汇汇总"
        description="英语真题里的生词、固定搭配和熟词生义。"
        actions={(
          <Link href="/tools/past-papers" className="control-button h-10 px-3 text-sm">
            <ArrowLeft className="h-4 w-4" />
            返回真题中心
          </Link>
        )}
        stats={[
          { label: "全部", value: counts.all },
          { label: "生词", value: counts.word },
          { label: "固定搭配", value: counts.collocation },
          { label: "熟词生义", value: counts.familiar_meaning },
        ]}
      />

      <PageShell width="workspace" topPadding="content">
        <section className="surface-panel p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              {filters.map((item) => createElement("button", {
                key: item.value,
                type: "button",
                onClick: () => setFilter(item.value),
                className: `control-button h-10 px-3 text-sm ${filter === item.value ? "control-button-selected" : ""}`,
              }, item.label))}
            </div>
            <label className="relative block w-full md:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="field-control h-10 w-full px-9 text-sm"
                placeholder="搜索词条、篇章或原文"
              />
            </label>
          </div>
        </section>

        <section className="mt-4 grid gap-3">
          {loading ? (
            <InlineVocabularyState icon={<Loader2 className="h-5 w-5 animate-spin text-primary" />} text="正在加载词汇汇总。" />
          ) : loadError ? (
            <InlineVocabularyState text={loadError} tone="text-red-700" />
          ) : filteredVocabulary.length === 0 ? (
            <InlineVocabularyState text="暂无词条。" />
          ) : (
            filteredVocabulary.map((entry) => {
              const passage = passagesById.get(entry.passageId);
              return createElement(VocabularyLibraryCard, {
                key: entry.id,
                entry,
                passage,
                editing: editingId === entry.id,
                editForm: editingId === entry.id ? editForm : null,
                saving: savingId === entry.id,
                deleting: deletingId === entry.id,
                onStartEdit: () => startEdit(entry),
                onCancelEdit: () => {
                    setEditingId(null);
                    setEditForm(null);
                  },
                onEditFormChange: setEditForm,
                onSaveEdit: handleSaveEdit,
                onDelete: () => handleDelete(entry.id),
              });
            })
          )}
        </section>
      </PageShell>
    </>
  );
}

function VocabularyLibraryCard({
  entry,
  passage,
  editing,
  editForm,
  saving,
  deleting,
  onStartEdit,
  onCancelEdit,
  onEditFormChange,
  onSaveEdit,
  onDelete,
}: {
  entry: EnglishVocabularyEntry;
  passage?: EnglishResultPassage;
  editing: boolean;
  editForm: VocabularyEditForm | null;
  saving: boolean;
  deleting: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onEditFormChange: (form: VocabularyEditForm | null) => void;
  onSaveEdit: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: () => void;
}) {
  const sourcePreview = getSourcePreview(entry, passage);
  const selectedQuestion = editForm
    ? passage?.questions.find((question) => question.id === editForm.sourceQuestionId) ?? passage?.questions[0]
    : undefined;

  return (
    <article className="surface-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`english-vocab-chip english-vocab-chip-${entry.entryType.replace("_", "-")}`}>
              {englishVocabularyEntryTypeLabels[entry.entryType]}
            </span>
            <h2 className="text-xl font-bold text-on-surface">{entry.word}</h2>
            <span className="text-sm text-on-surface-variant">
              {englishVocabularyPartOfSpeechLabels[entry.partOfSpeech]}
            </span>
          </div>
          {entry.definition && (
            <p className="mt-2 text-sm leading-6 text-on-surface">{entry.definition}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Link href={getReturnHref(entry)} className="control-button h-9 px-3 text-sm">
            <ExternalLink className="h-4 w-4" />
            原文
          </Link>
          <button type="button" onClick={onStartEdit} className="control-button h-9 px-3 text-sm">
            <Edit3 className="h-4 w-4" />
            编辑
          </button>
          <button type="button" onClick={onDelete} disabled={deleting} className="control-button h-9 px-3 text-sm text-red-700">
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
        <span className="inline-flex items-center gap-1">
          <BookOpenText className="h-3.5 w-3.5" />
          {getPassageTitle(passage)}
        </span>
        <span>{getTraceLabel(entry, passage)}</span>
        <span>{englishVocabularyMasteryLabels[entry.masteryStatus]}</span>
      </div>

      {sourcePreview && (
        <blockquote className="mt-3 border-l-2 border-primary/40 pl-3 font-serif text-sm leading-7 text-on-surface-variant">
          {sourcePreview}
        </blockquote>
      )}

      {editing && editForm && passage && (
        <form onSubmit={onSaveEdit} className="mt-4 rounded-lg border border-outline-variant/20 bg-surface-container-low p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <LibrarySelect
              label="类型"
              value={editForm.entryType}
              options={filters.filter((item) => item.value !== "all").map((item) => ({
                value: item.value,
                label: item.label,
              }))}
              onChange={(value) => onEditFormChange({ ...editForm, entryType: value as EnglishVocabularyEntryType })}
            />
            <LibrarySelect
              label="词性"
              value={editForm.partOfSpeech}
              options={partOfSpeechOptions.map((value) => ({
                value,
                label: englishVocabularyPartOfSpeechLabels[value],
              }))}
              onChange={(value) => onEditFormChange({ ...editForm, partOfSpeech: value as EnglishVocabularyPartOfSpeech })}
            />
            <LibraryInput
              label="词条"
              value={editForm.word}
              onChange={(value) => onEditFormChange({ ...editForm, word: value })}
            />
            <LibraryInput
              label="释义"
              value={editForm.definition}
              onChange={(value) => onEditFormChange({ ...editForm, definition: value })}
            />
            <LibrarySelect
              label="来源"
              value={editForm.sourceArea}
              options={sourceAreaOptions}
              onChange={(value) => onEditFormChange({
                ...editForm,
                sourceArea: value as EnglishVocabularySourceArea,
                sourceQuestionId: value === "passage" ? "" : selectedQuestion?.id ?? "",
                sourceOptionLabel: value === "option" ? selectedQuestion?.options[0]?.label ?? "" : "",
              })}
            />
            {editForm.sourceArea !== "passage" && (
              <LibrarySelect
                label="题号"
                value={editForm.sourceQuestionId || selectedQuestion?.id || ""}
                options={passage.questions.map((question) => ({
                  value: question.id,
                  label: `第 ${question.questionNo} 题`,
                }))}
                onChange={(value) => onEditFormChange({
                  ...editForm,
                  sourceQuestionId: value,
                  sourceOptionLabel: editForm.sourceArea === "option"
                    ? passage.questions.find((question) => question.id === value)?.options[0]?.label ?? ""
                    : "",
                })}
              />
            )}
            {editForm.sourceArea === "option" && (
              <LibrarySelect
                label="选项"
                value={editForm.sourceOptionLabel || selectedQuestion?.options[0]?.label || ""}
                options={getQuestionOptions(selectedQuestion)}
                onChange={(value) => onEditFormChange({ ...editForm, sourceOptionLabel: value })}
              />
            )}
            <LibrarySelect
              label="掌握"
              value={editForm.masteryStatus}
              options={masteryOptions.map((value) => ({
                value,
                label: englishVocabularyMasteryLabels[value],
              }))}
              onChange={(value) => onEditFormChange({ ...editForm, masteryStatus: value as EnglishVocabularyMasteryStatus })}
            />
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <LibraryTextarea
              label="原文片段"
              value={editForm.sourceExcerpt}
              rows={3}
              onChange={(value) => onEditFormChange({ ...editForm, sourceExcerpt: value })}
            />
            <div className="grid gap-3">
              <LibraryInput
                label="高亮文本"
                value={editForm.highlightText}
                onChange={(value) => onEditFormChange({ ...editForm, highlightText: value })}
              />
              <LibraryTextarea
                label="备注"
                value={editForm.note}
                rows={2}
                onChange={(value) => onEditFormChange({ ...editForm, note: value })}
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={onCancelEdit} className="control-button h-9 px-3 text-sm">
              取消
            </button>
            <button type="submit" disabled={saving} className="control-button control-button-primary h-9 px-3 text-sm">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              保存
            </button>
          </div>
        </form>
      )}
    </article>
  );
}

function InlineVocabularyState({
  icon,
  text,
  tone = "text-on-surface-variant",
}: {
  icon?: React.ReactNode;
  text: string;
  tone?: string;
}) {
  return (
    <section className={`surface-panel flex min-h-[18rem] items-center justify-center gap-2 p-6 text-sm ${tone}`}>
      {icon}
      <span>{text}</span>
    </section>
  );
}

function LibraryInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-on-surface-variant">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field-control h-10 w-full px-3 text-sm"
      />
    </label>
  );
}

function LibraryTextarea({
  label,
  value,
  rows,
  onChange,
}: {
  label: string;
  value: string;
  rows: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-on-surface-variant">{label}</span>
      <textarea
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="field-control w-full resize-y px-3 py-2 text-sm leading-6"
      />
    </label>
  );
}

function LibrarySelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-on-surface-variant">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field-control h-10 w-full px-3 text-sm"
      >
        {options.map((option) => createElement("option", {
          key: option.value,
          value: option.value,
        }, option.label))}
      </select>
    </label>
  );
}
