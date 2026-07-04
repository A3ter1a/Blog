"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { useToast } from "@/components/ui/Toast";
import { englishTrainingApi, type EnglishAttemptAnswerInput } from "@/lib/english-training-api";
import {
  ENGLISH_TRAINING_YEARS,
  englishPassageLabels,
  englishSectionLabels,
  englishVocabularyMasteryLabels,
  englishVocabularyPartOfSpeechLabels,
  getEnglishPassageTitle,
  isEnglishObjectiveSection,
  type EnglishAttempt,
  type EnglishPassage,
  type EnglishQuestion,
  type EnglishSection,
  type EnglishTrainingData,
  type EnglishVocabularyEntry,
  type EnglishVocabularyMasteryStatus,
  type EnglishVocabularyPartOfSpeech,
} from "@/lib/english-training";

type YearFilter = "all" | number;
type SectionFilter = "all" | EnglishSection;
type StatusFilter = "all" | "unstarted" | "in_progress" | "submitted";

const sectionOptions: Array<{ value: SectionFilter; label: string }> = [
  { value: "all", label: "全部题型" },
  { value: "reading", label: englishSectionLabels.reading },
  { value: "cloze", label: englishSectionLabels.cloze },
  { value: "new_type", label: englishSectionLabels.new_type },
  { value: "translation", label: englishSectionLabels.translation },
  { value: "writing", label: englishSectionLabels.writing },
];

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "unstarted", label: "未开始" },
  { value: "in_progress", label: "进行中" },
  { value: "submitted", label: "已提交" },
];

const partOfSpeechOptions = Object.entries(englishVocabularyPartOfSpeechLabels) as Array<[EnglishVocabularyPartOfSpeech, string]>;
const masteryOptions = Object.entries(englishVocabularyMasteryLabels) as Array<[EnglishVocabularyMasteryStatus, string]>;

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase();
}

function getStatusLabel(attempt?: EnglishAttempt): string {
  if (!attempt) return "未完成";
  if (attempt.status === "submitted") return "已提交";
  return "进行中";
}

function getAccuracy(attempt?: EnglishAttempt): number | null {
  if (!attempt || attempt.status !== "submitted" || attempt.maxScore <= 0) return null;
  return Math.round((attempt.score / attempt.maxScore) * 100);
}

function buildAnswerMap(attempt?: EnglishAttempt): EnglishAttemptAnswerInput {
  if (!attempt) return {};
  return Object.fromEntries(attempt.answers.map((answer) => [answer.questionId, answer.answer]));
}

function countPassageVocabulary(vocabulary: EnglishVocabularyEntry[], passageId: string): number {
  return vocabulary.filter((entry) => entry.passageId === passageId).length;
}

function getAttemptStatus(attempt?: EnglishAttempt): StatusFilter {
  if (!attempt) return "unstarted";
  return attempt.status;
}

function formatScore(attempt?: EnglishAttempt): string {
  if (!attempt) return "-";
  return `${attempt.score}/${attempt.maxScore}`;
}

export function EnglishTraining() {
  const toast = useToast();
  const [data, setData] = useState<EnglishTrainingData>({
    papers: [],
    passages: [],
    questions: [],
    attempts: [],
    vocabulary: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState<YearFilter>("all");
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [activePassageId, setActivePassageId] = useState<string | null>(null);
  const [draftAnswersByPassageId, setDraftAnswersByPassageId] = useState<Record<string, EnglishAttemptAnswerInput>>({});
  const [saving, setSaving] = useState<"save" | "submit" | null>(null);
  const [vocabSaving, setVocabSaving] = useState(false);
  const [vocabForm, setVocabForm] = useState({
    word: "",
    partOfSpeech: "other" as EnglishVocabularyPartOfSpeech,
    definition: "",
    exampleSentence: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function loadTrainingData() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const trainingData = await englishTrainingApi.getTrainingData();
        if (cancelled) return;
        setData(trainingData);
        setActivePassageId((current) => current ?? trainingData.passages[0]?.id ?? null);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "未知错误";
        setLoadError(message);
        toast.error(`英语真题加载失败：${message}`);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadTrainingData();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const attemptsByPassageId = useMemo(
    () => new Map(data.attempts.map((attempt) => [attempt.passageId, attempt])),
    [data.attempts],
  );
  const questionsByPassageId = useMemo(() => {
    const map = new Map<string, EnglishQuestion[]>();
    for (const question of data.questions) {
      const current = map.get(question.passageId) ?? [];
      current.push(question);
      map.set(question.passageId, current);
    }
    for (const list of map.values()) {
      list.sort((left, right) => left.sortOrder - right.sortOrder || left.questionNo.localeCompare(right.questionNo));
    }
    return map;
  }, [data.questions]);

  const normalizedQuery = normalizeQuery(query);
  const visiblePassages = useMemo(() => data.passages.filter((passage) => {
    const attempt = attemptsByPassageId.get(passage.id);
    const status = getAttemptStatus(attempt);
    const matchesQuery = !normalizedQuery
      || getEnglishPassageTitle(passage).toLowerCase().includes(normalizedQuery)
      || passage.content.toLowerCase().includes(normalizedQuery);

    return (yearFilter === "all" || passage.year === yearFilter)
      && (sectionFilter === "all" || passage.section === sectionFilter)
      && (statusFilter === "all" || status === statusFilter)
      && matchesQuery;
  }), [attemptsByPassageId, data.passages, normalizedQuery, sectionFilter, statusFilter, yearFilter]);

  const activePassage = useMemo(
    () => visiblePassages.find((passage) => passage.id === activePassageId) ?? visiblePassages[0] ?? null,
    [activePassageId, visiblePassages],
  );
  const activeAttempt = activePassage ? attemptsByPassageId.get(activePassage.id) : undefined;
  const activeQuestions = activePassage ? questionsByPassageId.get(activePassage.id) ?? [] : [];
  const activeVocabulary = activePassage
    ? data.vocabulary.filter((entry) => entry.passageId === activePassage.id)
    : [];
  const activeAnswers = activePassage
    ? draftAnswersByPassageId[activePassage.id] ?? buildAnswerMap(activeAttempt)
    : {};

  const stats = useMemo(() => {
    const submitted = data.attempts.filter((attempt) => attempt.status === "submitted");
    const score = submitted.reduce((sum, attempt) => sum + attempt.score, 0);
    const maxScore = submitted.reduce((sum, attempt) => sum + attempt.maxScore, 0);
    const accuracy = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    return {
      total: data.passages.length,
      submitted: submitted.length,
      inProgress: data.attempts.filter((attempt) => attempt.status === "in_progress").length,
      vocabulary: data.vocabulary.length,
      accuracy,
    };
  }, [data.attempts, data.passages.length, data.vocabulary.length]);

  const sectionStats = useMemo(() => {
    return (Object.keys(englishSectionLabels) as EnglishSection[]).map((section) => {
      const passages = data.passages.filter((passage) => passage.section === section);
      const submitted = passages
        .map((passage) => attemptsByPassageId.get(passage.id))
        .filter((attempt): attempt is EnglishAttempt => attempt?.status === "submitted");
      const score = submitted.reduce((sum, attempt) => sum + attempt.score, 0);
      const maxScore = submitted.reduce((sum, attempt) => sum + attempt.maxScore, 0);
      return {
        section,
        total: passages.length,
        submitted: submitted.length,
        accuracy: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
      };
    });
  }, [attemptsByPassageId, data.passages]);

  const handleSelectPassage = (passageId: string) => {
    setActivePassageId(passageId);
  };

  const handleSaveAttempt = async (submitted: boolean) => {
    if (!activePassage || saving) return;
    setSaving(submitted ? "submit" : "save");
    try {
      const saved = await englishTrainingApi.saveAttempt({
        passage: activePassage,
        questions: activeQuestions,
        answers: activeAnswers,
        submitted,
        currentAttempt: activeAttempt,
      });
      setData((current) => ({
        ...current,
        attempts: [saved, ...current.attempts.filter((attempt) => attempt.id !== saved.id && attempt.passageId !== saved.passageId)],
      }));
      toast.success(submitted ? "已提交本篇训练" : "已保存作答进度");
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`${submitted ? "提交" : "保存"}失败：${message}`);
    } finally {
      setSaving(null);
    }
  };

  const handleAddVocabulary = async () => {
    if (!activePassage || vocabSaving) return;
    if (!vocabForm.word.trim()) {
      toast.info("先填写单词");
      return;
    }
    setVocabSaving(true);
    try {
      const saved = await englishTrainingApi.addVocabulary({
        passageId: activePassage.id,
        word: vocabForm.word,
        partOfSpeech: vocabForm.partOfSpeech,
        definition: vocabForm.definition,
        exampleSentence: vocabForm.exampleSentence,
      });
      setData((current) => ({
        ...current,
        vocabulary: [saved, ...current.vocabulary],
      }));
      setVocabForm({ word: "", partOfSpeech: "other", definition: "", exampleSentence: "" });
      toast.success("生词已记录");
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`生词保存失败：${message}`);
    } finally {
      setVocabSaving(false);
    }
  };

  const handleUpdateMastery = async (entry: EnglishVocabularyEntry, masteryStatus: EnglishVocabularyMasteryStatus) => {
    try {
      const saved = await englishTrainingApi.updateVocabularyMastery(entry.id, masteryStatus);
      setData((current) => ({
        ...current,
        vocabulary: current.vocabulary.map((item) => item.id === saved.id ? saved : item),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`生词状态保存失败：${message}`);
    }
  };

  const resetFilters = () => {
    setYearFilter("all");
    setSectionFilter("all");
    setStatusFilter("all");
    setQuery("");
  };

  return (
    <>
      <PageHeader
        width="workspace"
        eyebrow="英语一"
        icon={<BookOpen className="h-4 w-4" />}
        title="英语真题训练"
        description="2007-2026 英语一真题训练工作台。"
        stats={[
          { label: "篇章", value: stats.total },
          { label: "已提交", value: stats.submitted, tone: "text-green-600" },
          { label: "正确率", value: `${stats.accuracy}%` },
          { label: "生词", value: stats.vocabulary, tone: "text-amber-600" },
        ]}
      />

      <PageShell width="workspace" topPadding="content">
        <section className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)] 2xl:grid-cols-[24rem_minmax(0,1fr)]">
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <FilterPanel
              query={query}
              yearFilter={yearFilter}
              sectionFilter={sectionFilter}
              statusFilter={statusFilter}
              onQueryChange={setQuery}
              onYearChange={setYearFilter}
              onSectionChange={setSectionFilter}
              onStatusChange={setStatusFilter}
              onReset={resetFilters}
            />
            <PassageList
              passages={visiblePassages}
              attemptsByPassageId={attemptsByPassageId}
              vocabulary={data.vocabulary}
              activePassageId={activePassage?.id ?? null}
              loading={isLoading}
              error={loadError}
              onSelect={handleSelectPassage}
            />
            <StatsPanel stats={sectionStats} />
          </aside>

          <section className="min-w-0 space-y-4">
            <TrainingPanel
              passage={activePassage}
              questions={activeQuestions}
              attempt={activeAttempt}
              answers={activeAnswers}
              saving={saving}
              loading={isLoading}
              hasAnyPassage={data.passages.length > 0}
              onAnswerChange={(questionId, answer) => {
                if (!activePassage) return;
                setDraftAnswersByPassageId((current) => ({
                  ...current,
                  [activePassage.id]: {
                    ...(current[activePassage.id] ?? buildAnswerMap(activeAttempt)),
                    [questionId]: answer,
                  },
                }));
              }}
              onSave={() => handleSaveAttempt(false)}
              onSubmit={() => handleSaveAttempt(true)}
            />
            <VocabularyPanel
              passage={activePassage}
              vocabulary={activeVocabulary}
              form={vocabForm}
              saving={vocabSaving}
              onFormChange={setVocabForm}
              onSave={handleAddVocabulary}
              onUpdateMastery={handleUpdateMastery}
            />
          </section>
        </section>
      </PageShell>
    </>
  );
}

function FilterPanel({
  query,
  yearFilter,
  sectionFilter,
  statusFilter,
  onQueryChange,
  onYearChange,
  onSectionChange,
  onStatusChange,
  onReset,
}: {
  query: string;
  yearFilter: YearFilter;
  sectionFilter: SectionFilter;
  statusFilter: StatusFilter;
  onQueryChange: (value: string) => void;
  onYearChange: (value: YearFilter) => void;
  onSectionChange: (value: SectionFilter) => void;
  onStatusChange: (value: StatusFilter) => void;
  onReset: () => void;
}) {
  return (
    <section className="surface-panel p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-on-surface">筛选</h2>
        <button type="button" onClick={onReset} className="control-button h-9 px-2 text-xs" title="恢复默认">
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant/50" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索篇章或原文"
            className="field-control h-10 w-full px-9 text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
              aria-label="清空搜索"
              title="清空搜索"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <select
          value={yearFilter}
          onChange={(event) => onYearChange(event.target.value === "all" ? "all" : Number(event.target.value))}
          className="field-control h-10 w-full px-3 text-sm"
        >
          <option value="all">全部年份</option>
          {ENGLISH_TRAINING_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
        <select
          value={sectionFilter}
          onChange={(event) => onSectionChange(event.target.value as SectionFilter)}
          className="field-control h-10 w-full px-3 text-sm"
        >
          {sectionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => onStatusChange(event.target.value as StatusFilter)}
          className="field-control h-10 w-full px-3 text-sm"
        >
          {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
    </section>
  );
}

function PassageList({
  passages,
  attemptsByPassageId,
  vocabulary,
  activePassageId,
  loading,
  error,
  onSelect,
}: {
  passages: EnglishPassage[];
  attemptsByPassageId: Map<string, EnglishAttempt>;
  vocabulary: EnglishVocabularyEntry[];
  activePassageId: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (passageId: string) => void;
}) {
  return (
    <section className="surface-panel p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-on-surface">真题篇章</h2>
        <span className="tag-chip px-2 py-0.5 text-xs">{passages.length} 篇</span>
      </div>
      <div className="max-h-[38rem] space-y-2 overflow-y-auto pr-1">
        {loading ? (
          <InlineState icon={<Loader2 className="h-4 w-4 animate-spin text-primary" />} text="加载英语真题..." />
        ) : error ? (
          <InlineState text={error} tone="text-red-600" />
        ) : passages.length === 0 ? (
          <InlineState text="当前还没有可训练的英语真题篇章。" />
        ) : passages.map((passage) => {
          const attempt = attemptsByPassageId.get(passage.id);
          const accuracy = getAccuracy(attempt);
          const active = passage.id === activePassageId;
          return (
            <button
              key={passage.id}
              type="button"
              onClick={() => onSelect(passage.id)}
              className={`w-full rounded-md border px-3 py-3 text-left transition-all ${
                active
                  ? "border-primary/40 bg-primary/[0.07] ring-1 ring-primary/15"
                  : "border-outline-variant/20 bg-surface-container-low/70 hover:border-primary/25 hover:bg-surface-container-lowest"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="line-clamp-2 text-sm font-semibold text-on-surface">
                    {getEnglishPassageTitle(passage)}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-on-surface-variant">
                    <span>{passage.totalScore || "-"} 分</span>
                    <span>{getStatusLabel(attempt)}</span>
                    <span>生词 {countPassageVocabulary(vocabulary, passage.id)}</span>
                    {accuracy !== null && <span>正确率 {accuracy}%</span>}
                  </div>
                </div>
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-on-surface-variant/50" />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function TrainingPanel({
  passage,
  questions,
  attempt,
  answers,
  saving,
  loading,
  hasAnyPassage,
  onAnswerChange,
  onSave,
  onSubmit,
}: {
  passage: EnglishPassage | null;
  questions: EnglishQuestion[];
  attempt?: EnglishAttempt;
  answers: EnglishAttemptAnswerInput;
  saving: "save" | "submit" | null;
  loading: boolean;
  hasAnyPassage: boolean;
  onAnswerChange: (questionId: string, answer: string) => void;
  onSave: () => void;
  onSubmit: () => void;
}) {
  if (loading) {
    return <EmptyWorkspace icon={<Loader2 className="h-6 w-6 animate-spin text-primary" />} text="正在加载英语真题训练。" />;
  }

  if (!hasAnyPassage) {
    return (
      <EmptyWorkspace
        icon={<Sparkles className="h-8 w-8 text-primary" />}
        text="英语一 2007-2026 真题库还未导入。"
      />
    );
  }

  if (!passage) {
    return <EmptyWorkspace text="当前筛选下没有篇章。" />;
  }

  const submitted = attempt?.status === "submitted";
  const objective = isEnglishObjectiveSection(passage.section);

  return (
    <section className="surface-panel overflow-hidden">
      <div className="border-b border-outline-variant/15 bg-surface-container-low px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="tag-chip px-2 py-0.5">{englishSectionLabels[passage.section]}</span>
              <span className="tag-chip px-2 py-0.5">{englishPassageLabels[passage.passageNo]}</span>
              <span className="tag-chip px-2 py-0.5">{getStatusLabel(attempt)}</span>
              {submitted && <span className="tag-chip px-2 py-0.5 text-green-700">{formatScore(attempt)}</span>}
            </div>
            <h2 className="font-headline text-xl font-bold text-on-surface">{getEnglishPassageTitle(passage)}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onSave} disabled={Boolean(saving) || submitted} className="control-button h-10 px-3 text-sm">
              {saving === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存
            </button>
            <button type="button" onClick={onSubmit} disabled={Boolean(saving) || questions.length === 0} className="control-button control-button-primary h-10 px-3 text-sm">
              {saving === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              提交本篇
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)]">
        <article className="min-h-[36rem] border-b border-outline-variant/15 bg-surface-container-lowest p-5 xl:border-b-0 xl:border-r sm:p-6">
          {passage.content ? (
            <MarkdownContent content={passage.content} className="text-[15px] leading-8 text-on-surface sm:text-base" />
          ) : (
            <div className="flex min-h-[28rem] items-center justify-center rounded-lg border border-dashed border-outline-variant/30 text-sm text-on-surface-variant">
              这篇真题原文还未导入。
            </div>
          )}
        </article>
        <aside className="min-h-[36rem] bg-surface-container-low p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-on-surface">题目</h3>
            <span className="tag-chip px-2 py-0.5 text-xs">{questions.length} 题</span>
          </div>
          {questions.length === 0 ? (
            <InlineState text="这篇的题目还未导入。" />
          ) : (
            <div className="space-y-4">
              {questions.map((question) => {
                const savedAnswer = attempt?.answers.find((answer) => answer.questionId === question.id);
                return (
                  <QuestionBlock
                    key={question.id}
                    question={question}
                    value={answers[question.id] ?? ""}
                    savedAnswer={savedAnswer}
                    submitted={submitted}
                    objective={objective}
                    onChange={(answer) => onAnswerChange(question.id, answer)}
                  />
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function QuestionBlock({
  question,
  value,
  savedAnswer,
  submitted,
  objective,
  onChange,
}: {
  question: EnglishQuestion;
  value: string;
  savedAnswer?: { isCorrect?: boolean; score: number };
  submitted: boolean;
  objective: boolean;
  onChange: (value: string) => void;
}) {
  const correct = submitted && savedAnswer?.isCorrect === true;
  const wrong = submitted && savedAnswer?.isCorrect === false;

  return (
    <div className="rounded-lg border border-outline-variant/15 bg-surface-container-lowest p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary">第 {question.questionNo} 题</span>
        <span className="rounded-full bg-surface-container-high px-2.5 py-1 text-on-surface-variant">{question.score} 分</span>
        {correct && <span className="rounded-full bg-green-50 px-2.5 py-1 font-medium text-green-700">正确</span>}
        {wrong && <span className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700">错误</span>}
      </div>
      <MarkdownContent content={question.stem || "题干未导入"} compact className="text-sm text-on-surface" />

      {question.options.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {question.options.map((option) => {
            const selected = value === option.label;
            return (
              <button
                key={`${question.id}-${option.label}`}
                type="button"
                onClick={() => onChange(option.label)}
                className={`grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  selected
                    ? "border-primary/35 bg-primary/10"
                    : "border-outline-variant/15 bg-surface-container-low hover:border-primary/25"
                }`}
              >
                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  selected ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-primary"
                }`}>
                  {option.label}
                </span>
                <MarkdownContent content={option.content} compact className="min-w-0 text-on-surface" />
              </button>
            );
          })}
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={objective ? 2 : 6}
          className="field-control mt-3 w-full resize-y px-3 py-2 text-sm leading-6"
          placeholder={objective ? "填写答案" : "记录你的作答"}
        />
      )}

      {submitted && objective && (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
          <span className="font-semibold">标准答案：</span>
          {question.standardAnswer || "未导入"}
        </div>
      )}
    </div>
  );
}

function VocabularyPanel({
  passage,
  vocabulary,
  form,
  saving,
  onFormChange,
  onSave,
  onUpdateMastery,
}: {
  passage: EnglishPassage | null;
  vocabulary: EnglishVocabularyEntry[];
  form: {
    word: string;
    partOfSpeech: EnglishVocabularyPartOfSpeech;
    definition: string;
    exampleSentence: string;
  };
  saving: boolean;
  onFormChange: (form: { word: string; partOfSpeech: EnglishVocabularyPartOfSpeech; definition: string; exampleSentence: string }) => void;
  onSave: () => void;
  onUpdateMastery: (entry: EnglishVocabularyEntry, masteryStatus: EnglishVocabularyMasteryStatus) => void;
}) {
  return (
    <section className="surface-panel p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
          <BookOpen className="h-4 w-4 text-primary" />
          生词
        </h2>
        <span className="tag-chip px-2 py-0.5 text-xs">{vocabulary.length} 个</span>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
        <input
          value={form.word}
          onChange={(event) => onFormChange({ ...form, word: event.target.value })}
          disabled={!passage}
          placeholder="单词"
          className="field-control h-10 px-3 text-sm"
        />
        <select
          value={form.partOfSpeech}
          onChange={(event) => onFormChange({ ...form, partOfSpeech: event.target.value as EnglishVocabularyPartOfSpeech })}
          disabled={!passage}
          className="field-control h-10 px-3 text-sm"
        >
          {partOfSpeechOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input
          value={form.definition}
          onChange={(event) => onFormChange({ ...form, definition: event.target.value })}
          disabled={!passage}
          placeholder="释义"
          className="field-control h-10 px-3 text-sm xl:col-span-2"
        />
        <input
          value={form.exampleSentence}
          onChange={(event) => onFormChange({ ...form, exampleSentence: event.target.value })}
          disabled={!passage}
          placeholder="原句"
          className="field-control h-10 px-3 text-sm xl:col-span-2"
        />
        <button type="button" onClick={onSave} disabled={!passage || saving} className="control-button control-button-primary h-10 px-3 text-sm xl:col-span-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          记录生词
        </button>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {vocabulary.length === 0 ? (
          <p className="py-4 text-sm text-on-surface-variant md:col-span-2">当前篇章还没有生词。</p>
        ) : vocabulary.map((entry) => (
          <div key={entry.id} className="rounded-lg border border-outline-variant/15 bg-surface-container-low px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-on-surface">{entry.word}</div>
              <span className="tag-chip px-2 py-0.5 text-xs">{englishVocabularyPartOfSpeechLabels[entry.partOfSpeech]}</span>
            </div>
            {entry.definition && <p className="mt-1 text-sm text-on-surface-variant">{entry.definition}</p>}
            {entry.exampleSentence && <p className="mt-2 line-clamp-2 text-xs leading-5 text-on-surface-variant">{entry.exampleSentence}</p>}
            <select
              value={entry.masteryStatus}
              onChange={(event) => onUpdateMastery(entry, event.target.value as EnglishVocabularyMasteryStatus)}
              className="field-control mt-3 h-9 w-full px-2 text-xs"
            >
              {masteryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatsPanel({ stats }: { stats: Array<{ section: EnglishSection; total: number; submitted: number; accuracy: number }> }) {
  return (
    <section className="surface-panel p-4">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-on-surface">统计</h2>
      </div>
      <div className="space-y-2">
        {stats.map((item) => (
          <div key={item.section} className="rounded-lg bg-surface-container-low px-3 py-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-on-surface">{englishSectionLabels[item.section]}</span>
              <span className="text-primary">{item.accuracy}%</span>
            </div>
            <div className="mt-1 text-xs text-on-surface-variant">
              已提交 {item.submitted}/{item.total}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-container-high">
              <div className="h-full rounded-full bg-primary" style={{ width: `${item.accuracy}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EmptyWorkspace({ icon, text }: { icon?: ReactNode; text: string }) {
  return (
    <section className="surface-panel flex min-h-[36rem] flex-col items-center justify-center gap-3 p-6 text-center text-sm text-on-surface-variant">
      {icon ?? <ClipboardCheck className="h-8 w-8 opacity-50" />}
      <p>{text}</p>
    </section>
  );
}

function InlineState({
  icon,
  text,
  tone = "text-on-surface-variant",
}: {
  icon?: ReactNode;
  text: string;
  tone?: string;
}) {
  return (
    <div className={`flex items-center gap-2 py-4 text-sm ${tone}`}>
      {icon ?? <Circle className="h-3 w-3 opacity-50" />}
      <span>{text}</span>
    </div>
  );
}
