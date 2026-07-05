"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpenText,
  CheckCircle2,
  Loader2,
  Plus,
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
  type EnglishSection,
  type EnglishVocabularyEntry,
  type EnglishVocabularyEntryType,
  type EnglishVocabularyMasteryStatus,
  type EnglishVocabularyPartOfSpeech,
} from "@/lib/english-training";
import {
  englishResultsApi,
  type EnglishResultPassage,
  type EnglishResultsData,
  type EnglishVocabularyInput,
} from "@/lib/english-results-api";

type ResultTab = "english" | "math" | "vocabulary";

const objectiveSections: EnglishSection[] = ["reading", "cloze", "new_type"];
const sectionOrder: EnglishSection[] = ["reading", "cloze", "new_type", "translation", "writing"];

const partOfSpeechOptions: EnglishVocabularyPartOfSpeech[] = ["n", "v", "adj", "adv", "prep", "conj", "phr", "other"];
const masteryOptions: EnglishVocabularyMasteryStatus[] = ["new", "learning", "mastered"];

const initialVocabularyForm = {
  passageId: "",
  entryType: "word" as EnglishVocabularyEntryType,
  word: "",
  partOfSpeech: "other" as EnglishVocabularyPartOfSpeech,
  definition: "",
  exampleSentence: "",
  sourceExcerpt: "",
  note: "",
  masteryStatus: "new" as EnglishVocabularyMasteryStatus,
};

function isSubmitted(passage: EnglishResultPassage): boolean {
  return passage.attempt?.status === "submitted";
}

function getObjectivePassages(passages: EnglishResultPassage[]): EnglishResultPassage[] {
  return passages.filter((passage) => objectiveSections.includes(passage.section));
}

function getPassageTitle(passage?: Pick<EnglishResultPassage, "year" | "section" | "passageNo" | "title">): string {
  if (!passage) return "未知篇章";
  const label = englishPassageLabels[passage.passageNo] ?? passage.passageNo;
  return `${passage.year} ${englishSectionLabels[passage.section]} ${label}`;
}

function getAccuracy(score: number, maxScore: number): number {
  return maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function findExcerptPosition(content: string, excerpt: string): Pick<EnglishVocabularyInput, "sourceStart" | "sourceEnd" | "sourceParagraph"> {
  const cleanExcerpt = excerpt.trim();
  if (!cleanExcerpt) return {};
  const sourceStart = content.indexOf(cleanExcerpt);
  if (sourceStart < 0) return {};
  const before = content.slice(0, sourceStart);
  const sourceParagraph = before.split(/\n{2,}/).length;
  return {
    sourceStart,
    sourceEnd: sourceStart + cleanExcerpt.length,
    sourceParagraph,
  };
}

function splitPassageParagraphs(content: string): string[] {
  return content
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function getSourceContext(
  passage: EnglishResultPassage | undefined,
  entry: EnglishVocabularyEntry,
): { paragraphNo?: number; text: string } | null {
  if (!passage?.content) return null;
  const paragraphs = splitPassageParagraphs(passage.content);
  if (paragraphs.length === 0) return null;

  if (entry.sourceParagraph && paragraphs[entry.sourceParagraph - 1]) {
    return {
      paragraphNo: entry.sourceParagraph,
      text: paragraphs[entry.sourceParagraph - 1],
    };
  }

  const excerpt = entry.sourceExcerpt.trim();
  if (!excerpt) return null;
  const paragraphIndex = paragraphs.findIndex((paragraph) => paragraph.includes(excerpt));
  if (paragraphIndex < 0) return null;
  return {
    paragraphNo: paragraphIndex + 1,
    text: paragraphs[paragraphIndex],
  };
}

function renderHighlightedContext(text: string, excerpt: string): React.ReactNode {
  const cleanExcerpt = excerpt.trim();
  const start = cleanExcerpt ? text.indexOf(cleanExcerpt) : -1;
  if (start < 0) return text;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded bg-primary/10 px-1 text-primary">{cleanExcerpt}</mark>
      {text.slice(start + cleanExcerpt.length)}
    </>
  );
}

export function PastPaperResults() {
  const toast = useToast();
  const [data, setData] = useState<EnglishResultsData>({ passages: [], vocabulary: [] });
  const [activeTab, setActiveTab] = useState<ResultTab>("english");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingVocabulary, setSavingVocabulary] = useState(false);
  const [deletingVocabularyId, setDeletingVocabularyId] = useState<string | null>(null);
  const [vocabularyQuery, setVocabularyQuery] = useState("");
  const [form, setForm] = useState(initialVocabularyForm);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const results = await englishResultsApi.getResultsData();
        if (cancelled) return;
        setData(results);
        const firstPassage = results.passages[0];
        if (firstPassage) {
          setForm((current) => ({ ...current, passageId: current.passageId || firstPassage.id }));
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "未知错误";
        setLoadError(message);
        toast.error(`真题训练结果加载失败：${message}`);
      } finally {
        if (!cancelled) setIsLoading(false);
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

  const stats = useMemo(() => {
    const objectivePassages = getObjectivePassages(data.passages);
    const submitted = objectivePassages.filter(isSubmitted);
    const score = submitted.reduce((sum, passage) => sum + (passage.attempt?.score ?? 0), 0);
    const maxScore = submitted.reduce((sum, passage) => sum + (passage.attempt?.maxScore ?? 0), 0);
    const lost = Math.max(maxScore - score, 0);
    return {
      objectiveTotal: objectivePassages.length,
      submittedTotal: submitted.length,
      score,
      maxScore,
      lost,
      accuracy: getAccuracy(score, maxScore),
    };
  }, [data.passages]);

  const sectionStats = useMemo(() => {
    return sectionOrder.map((section) => {
      const sectionPassages = data.passages.filter((passage) => passage.section === section);
      const submitted = sectionPassages.filter(isSubmitted);
      const score = submitted.reduce((sum, passage) => sum + (passage.attempt?.score ?? 0), 0);
      const maxScore = submitted.reduce((sum, passage) => sum + (passage.attempt?.maxScore ?? 0), 0);
      return {
        section,
        total: sectionPassages.length,
        submitted: submitted.length,
        score,
        maxScore,
        lost: Math.max(maxScore - score, 0),
        accuracy: getAccuracy(score, maxScore),
      };
    });
  }, [data.passages]);

  const submittedPassages = useMemo(
    () => getObjectivePassages(data.passages)
      .filter(isSubmitted)
      .sort((left, right) => right.year - left.year || left.sortOrder - right.sortOrder),
    [data.passages],
  );

  const filteredVocabulary = useMemo(() => {
    const query = vocabularyQuery.trim().toLowerCase();
    if (!query) return data.vocabulary;
    return data.vocabulary.filter((entry) => {
      const passage = passagesById.get(entry.passageId);
      return [
        entry.word,
        entry.definition,
        entry.sourceExcerpt,
        entry.note,
        getPassageTitle(passage),
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [data.vocabulary, passagesById, vocabularyQuery]);

  const selectedPassage = passagesById.get(form.passageId);

  async function handleSubmitVocabulary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const word = form.word.trim();
    if (!word || !form.passageId) {
      toast.error("请先填写词条并选择原文篇章");
      return;
    }

    setSavingVocabulary(true);
    try {
      const trace = selectedPassage ? findExcerptPosition(selectedPassage.content, form.sourceExcerpt) : {};
      const saved = await englishResultsApi.saveVocabulary({
        passageId: form.passageId,
        entryType: form.entryType,
        word,
        partOfSpeech: form.partOfSpeech,
        definition: form.definition,
        exampleSentence: form.exampleSentence,
        sourceExcerpt: form.sourceExcerpt,
        masteryStatus: form.masteryStatus,
        note: form.note,
        ...trace,
      });
      setData((current) => ({
        ...current,
        vocabulary: [saved, ...current.vocabulary],
      }));
      setForm((current) => ({
        ...initialVocabularyForm,
        passageId: current.passageId,
        entryType: current.entryType,
      }));
      toast.success("已加入真题词句库");
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`保存失败：${message}`);
    } finally {
      setSavingVocabulary(false);
    }
  }

  async function handleDeleteVocabulary(id: string) {
    setDeletingVocabularyId(id);
    try {
      await englishResultsApi.deleteVocabulary(id);
      setData((current) => ({
        ...current,
        vocabulary: current.vocabulary.filter((entry) => entry.id !== id),
      }));
      toast.success("已删除词条");
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`删除失败：${message}`);
    } finally {
      setDeletingVocabularyId(null);
    }
  }

  return (
    <>
      <PageHeader
        width="workspace"
        title="真题训练结果"
        description="统计英语真题训练表现，并整理可追溯到原文的生词和固定搭配。"
        actions={(
          <Link href="/tools/past-papers" className="control-button h-10 px-3 text-sm">
            <ArrowLeft className="h-4 w-4" />
            返回真题中心
          </Link>
        )}
        stats={[
          { label: "已提交", value: stats.submittedTotal },
          { label: "正确率", value: `${stats.accuracy}%`, tone: "text-green-600" },
          { label: "得分", value: `${formatScore(stats.score)}/${formatScore(stats.maxScore)}` },
          { label: "词句", value: data.vocabulary.length },
        ]}
      />

      <PageShell width="workspace" topPadding="content">
        <div className="mb-4 flex flex-wrap gap-2">
          <TabButton active={activeTab === "english"} onClick={() => setActiveTab("english")}>
            英语结果
          </TabButton>
          <TabButton active={activeTab === "vocabulary"} onClick={() => setActiveTab("vocabulary")}>
            词句库
          </TabButton>
          <TabButton active={activeTab === "math"} onClick={() => setActiveTab("math")}>
            数学结果
          </TabButton>
        </div>

        {isLoading ? (
          <InlinePanel>
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span>正在加载真题训练结果。</span>
          </InlinePanel>
        ) : loadError ? (
          <InlinePanel tone="text-red-700">{loadError}</InlinePanel>
        ) : activeTab === "english" ? (
          <EnglishResultPanel
            stats={stats}
            sectionStats={sectionStats}
            submittedPassages={submittedPassages}
          />
        ) : activeTab === "vocabulary" ? (
          <VocabularyPanel
            passages={data.passages}
            vocabulary={filteredVocabulary}
            selectedPassage={selectedPassage}
            form={form}
            query={vocabularyQuery}
            saving={savingVocabulary}
            deletingId={deletingVocabularyId}
            onQueryChange={setVocabularyQuery}
            onFormChange={setForm}
            onSubmit={handleSubmitVocabulary}
            onDelete={handleDeleteVocabulary}
          />
        ) : (
          <MathResultPlaceholder />
        )}
      </PageShell>
    </>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`control-button h-10 px-4 text-sm ${active ? "control-button-selected" : ""}`}
    >
      {children}
    </button>
  );
}

function InlinePanel({
  children,
  tone = "text-on-surface-variant",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <section className={`surface-panel flex min-h-[18rem] items-center justify-center gap-2 p-6 text-sm ${tone}`}>
      {children}
    </section>
  );
}

function EnglishResultPanel({
  stats,
  sectionStats,
  submittedPassages,
}: {
  stats: {
    objectiveTotal: number;
    submittedTotal: number;
    score: number;
    maxScore: number;
    lost: number;
    accuracy: number;
  };
  sectionStats: Array<{
    section: EnglishSection;
    total: number;
    submitted: number;
    score: number;
    maxScore: number;
    lost: number;
    accuracy: number;
  }>;
  submittedPassages: EnglishResultPassage[];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="surface-panel p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-headline text-xl font-bold text-on-surface">英语一总览</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              只统计阅读、完形和新题型的客观题提交结果。
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-primary">{stats.accuracy}%</div>
            <div className="text-xs text-on-surface-variant">
              {formatScore(stats.score)} / {formatScore(stats.maxScore)}
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <MetricCard label="已完成题组" value={`${stats.submittedTotal}/${stats.objectiveTotal}`} />
          <MetricCard label="得分" value={formatScore(stats.score)} />
          <MetricCard label="丢分" value={formatScore(stats.lost)} tone="text-red-600" />
        </div>

        <div className="mt-5 space-y-3">
          {sectionStats.map((item) => (
            <SectionDistribution key={item.section} item={item} />
          ))}
        </div>
      </section>

      <section className="surface-panel p-4">
        <h2 className="font-headline text-base font-bold text-on-surface">最近提交</h2>
        {submittedPassages.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-outline-variant/30 px-3 py-8 text-center text-sm text-on-surface-variant">
            还没有提交过客观题。
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {submittedPassages.slice(0, 12).map((passage) => {
              const attempt = passage.attempt;
              const score = attempt?.score ?? 0;
              const maxScore = attempt?.maxScore ?? 0;
              return (
                <div key={passage.id} className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-on-surface">{passage.displayTitle}</div>
                      <div className="mt-1 text-xs text-on-surface-variant">
                        {attempt?.submittedAt ? attempt.submittedAt.toLocaleDateString("zh-CN") : "已提交"}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-primary">
                      {formatScore(score)}/{formatScore(maxScore)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({ label, value, tone = "text-primary" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-4">
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      <div className="mt-1 text-xs text-on-surface-variant">{label}</div>
    </div>
  );
}

function SectionDistribution({
  item,
}: {
  item: {
    section: EnglishSection;
    total: number;
    submitted: number;
    score: number;
    maxScore: number;
    lost: number;
    accuracy: number;
  };
}) {
  const width = item.maxScore > 0 ? Math.max(item.accuracy, 4) : 0;
  return (
    <div className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold text-on-surface">{englishSectionLabels[item.section]}</div>
        <div className="text-sm text-on-surface-variant">
          {item.submitted}/{item.total} · {formatScore(item.score)}/{formatScore(item.maxScore)} · 丢 {formatScore(item.lost)}
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function VocabularyPanel({
  passages,
  vocabulary,
  selectedPassage,
  form,
  query,
  saving,
  deletingId,
  onQueryChange,
  onFormChange,
  onSubmit,
  onDelete,
}: {
  passages: EnglishResultPassage[];
  vocabulary: EnglishVocabularyEntry[];
  selectedPassage?: EnglishResultPassage;
  form: typeof initialVocabularyForm;
  query: string;
  saving: boolean;
  deletingId: string | null;
  onQueryChange: (value: string) => void;
  onFormChange: (value: typeof initialVocabularyForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
      <section className="surface-panel p-4">
        <h2 className="font-headline text-lg font-bold text-on-surface">新增词句</h2>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-on-surface-variant">篇章</span>
            <select
              value={form.passageId}
              onChange={(event) => onFormChange({ ...form, passageId: event.target.value })}
              className="field-control h-10 w-full px-3 text-sm"
            >
              {passages.map((passage) => (
                <option key={passage.id} value={passage.id}>
                  {passage.displayTitle}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <SelectField
              label="类型"
              value={form.entryType}
              options={[
                { value: "word", label: "生词" },
                { value: "collocation", label: "固定搭配" },
              ]}
              onChange={(value) => onFormChange({ ...form, entryType: value as EnglishVocabularyEntryType })}
            />
            <SelectField
              label="词性"
              value={form.partOfSpeech}
              options={partOfSpeechOptions.map((value) => ({
                value,
                label: englishVocabularyPartOfSpeechLabels[value],
              }))}
              onChange={(value) => onFormChange({ ...form, partOfSpeech: value as EnglishVocabularyPartOfSpeech })}
            />
          </div>

          <TextField
            label="词条"
            value={form.word}
            onChange={(value) => onFormChange({ ...form, word: value })}
            placeholder="单词或固定搭配"
          />
          <TextField
            label="释义"
            value={form.definition}
            onChange={(value) => onFormChange({ ...form, definition: value })}
            placeholder="你的理解"
          />
          <TextAreaField
            label="原文片段"
            value={form.sourceExcerpt}
            onChange={(value) => onFormChange({ ...form, sourceExcerpt: value })}
            placeholder="粘贴原文中的一句或一小段"
            rows={3}
          />
          <TextAreaField
            label="例句/备注"
            value={form.note}
            onChange={(value) => onFormChange({ ...form, note: value })}
            placeholder="记忆提示、搭配用法或自己的备注"
            rows={3}
          />
          <SelectField
            label="掌握状态"
            value={form.masteryStatus}
            options={masteryOptions.map((value) => ({
              value,
              label: englishVocabularyMasteryLabels[value],
            }))}
            onChange={(value) => onFormChange({ ...form, masteryStatus: value as EnglishVocabularyMasteryStatus })}
          />

          {selectedPassage && (
            <div className="rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-xs leading-5 text-on-surface-variant">
              追溯到：{getPassageTitle(selectedPassage)}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="control-button control-button-primary h-10 w-full px-4 text-sm"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            保存词句
          </button>
        </form>
      </section>

      <section className="surface-panel p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-headline text-lg font-bold text-on-surface">词句库</h2>
          <label className="relative block w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              className="field-control h-10 w-full px-9 text-sm"
              placeholder="搜索词条、原文或篇章"
            />
          </label>
        </div>

        {vocabulary.length === 0 ? (
          <div className="rounded-lg border border-dashed border-outline-variant/30 px-3 py-12 text-center text-sm text-on-surface-variant">
            暂无词句记录。
          </div>
        ) : (
          <div className="grid gap-3">
            {vocabulary.map((entry) => (
              <VocabularyCard
                key={entry.id}
                entry={entry}
                passage={passages.find((passage) => passage.id === entry.passageId)}
                deleting={deletingId === entry.id}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function VocabularyCard({
  entry,
  passage,
  deleting,
  onDelete,
}: {
  entry: EnglishVocabularyEntry;
  passage?: EnglishResultPassage;
  deleting: boolean;
  onDelete: (id: string) => void;
}) {
  const sourceContext = getSourceContext(passage, entry);

  return (
    <article className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold text-on-surface">{entry.word}</h3>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {englishVocabularyEntryTypeLabels[entry.entryType]}
            </span>
            <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-xs text-on-surface-variant">
              {englishVocabularyPartOfSpeechLabels[entry.partOfSpeech]}
            </span>
          </div>
          {entry.definition && (
            <p className="mt-1 text-sm leading-6 text-on-surface">{entry.definition}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDelete(entry.id)}
          disabled={deleting}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-error"
          aria-label="删除词条"
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>

      {entry.sourceExcerpt && (
        <blockquote className="mt-3 border-l-2 border-primary/40 pl-3 font-serif text-sm leading-7 text-on-surface-variant">
          {entry.sourceExcerpt}
        </blockquote>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
        <span className="inline-flex items-center gap-1">
          <BookOpenText className="h-3.5 w-3.5" />
          {getPassageTitle(passage)}
        </span>
        {entry.sourceParagraph && <span>第 {entry.sourceParagraph} 段</span>}
        <span>{englishVocabularyMasteryLabels[entry.masteryStatus]}</span>
      </div>

      {sourceContext && (
        <details className="mt-3 rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold text-primary">
            查看原文上下文{sourceContext.paragraphNo ? ` · 第 ${sourceContext.paragraphNo} 段` : ""}
          </summary>
          <p className="mt-2 font-serif text-sm leading-7 text-on-surface-variant">
            {renderHighlightedContext(sourceContext.text, entry.sourceExcerpt)}
          </p>
        </details>
      )}

      {entry.note && (
        <p className="mt-2 rounded-lg bg-surface-container-low px-3 py-2 text-sm leading-6 text-on-surface-variant">
          {entry.note}
        </p>
      )}
    </article>
  );
}

function MathResultPlaceholder() {
  return (
    <section className="surface-panel flex min-h-[22rem] flex-col items-center justify-center gap-3 p-6 text-center">
      <CheckCircle2 className="h-9 w-9 text-primary" />
      <h2 className="font-headline text-xl font-bold text-on-surface">数学真题结果待接入</h2>
      <p className="max-w-md text-sm leading-6 text-on-surface-variant">
        当前先接入英语真题训练结果。数学真题训练稳定后，再把数学正确率、得分和丢分分布合并到这里。
      </p>
    </section>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-on-surface-variant">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field-control h-10 w-full px-3 text-sm"
        placeholder={placeholder}
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  placeholder,
  rows,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  rows: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-on-surface-variant">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="field-control w-full resize-y px-3 py-2 text-sm leading-6"
        placeholder={placeholder}
      />
    </label>
  );
}

function SelectField({
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
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
