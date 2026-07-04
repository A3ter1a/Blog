"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Circle,
  ClipboardCheck,
  FileText,
  Loader2,
  PenLine,
  Save,
  Sparkles,
} from "lucide-react";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { useToast } from "@/components/ui/Toast";
import { englishTrainingApi, type EnglishAttemptAnswerInput } from "@/lib/english-training-api";
import {
  englishPassageLabels,
  englishSectionLabels,
  getEnglishPassageTitle,
  isEnglishObjectiveSection,
  type EnglishAttempt,
  type EnglishPassage,
  type EnglishQuestion,
  type EnglishSection,
  type EnglishTrainingData,
} from "@/lib/english-training";

type TrainingStage = "types" | "sets" | "practice";
type TrainingCategoryId = "reading" | "minor" | "writing";
type StatusFilter = "all" | "unstarted" | "in_progress" | "submitted";

type TrainingCategory = {
  id: TrainingCategoryId;
  title: string;
  subtitle: string;
  sections: EnglishSection[];
  icon: ReactNode;
};

type EnglishTrainingStats = {
  total: number;
  submitted: number;
  inProgress: number;
  accuracy: number;
};

const TRAINING_CATEGORIES: TrainingCategory[] = [
  {
    id: "reading",
    title: "阅读",
    subtitle: "Text 1-4",
    sections: ["reading"],
    icon: <BookOpen className="h-5 w-5" />,
  },
  {
    id: "minor",
    title: "三小门",
    subtitle: "完形 / 新题型 / 翻译",
    sections: ["cloze", "new_type", "translation"],
    icon: <FileText className="h-5 w-5" />,
  },
  {
    id: "writing",
    title: "写作",
    subtitle: "小作文 / 大作文",
    sections: ["writing"],
    icon: <PenLine className="h-5 w-5" />,
  },
];

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "unstarted", label: "未开始" },
  { value: "in_progress", label: "进行中" },
  { value: "submitted", label: "已提交" },
];

function getCategoryForPassage(passage: EnglishPassage): TrainingCategoryId {
  if (passage.section === "reading") return "reading";
  if (passage.section === "writing") return "writing";
  return "minor";
}

function getStatusLabel(attempt?: EnglishAttempt): string {
  if (!attempt) return "未完成";
  if (attempt.status === "submitted") return "已提交";
  return "进行中";
}

function getAttemptStatus(attempt?: EnglishAttempt): StatusFilter {
  if (!attempt) return "unstarted";
  return attempt.status;
}

function getAccuracy(attempt?: EnglishAttempt): number | null {
  if (!attempt || attempt.status !== "submitted" || attempt.maxScore <= 0) return null;
  return Math.round((attempt.score / attempt.maxScore) * 100);
}

function formatScore(attempt?: EnglishAttempt): string {
  if (!attempt) return "-";
  return `${attempt.score}/${attempt.maxScore}`;
}

function buildAnswerMap(attempt?: EnglishAttempt): EnglishAttemptAnswerInput {
  if (!attempt) return {};
  return Object.fromEntries(attempt.answers.map((answer) => [answer.questionId, answer.answer]));
}

function shouldStartDisplayParagraph(current: string, next: string): boolean {
  const currentText = current.trim();
  const nextText = next.trim();
  if (!currentText || !nextText) return false;
  if (currentText.length < 220) return false;
  return /[.!?]["')\]]?$/.test(currentText) && /^[A-Z0-9"“]/.test(nextText);
}

function normalizePassageParagraphs(content: string): string[] {
  const blocks = content
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (blocks.length <= 1) return blocks.length === 0 ? [] : [content.replace(/\s+/g, " ").trim()];

  const paragraphs: string[] = [];
  let current = "";
  for (const block of blocks) {
    if (!current) {
      current = block;
      continue;
    }
    if (shouldStartDisplayParagraph(current, block)) {
      paragraphs.push(current);
      current = block;
      continue;
    }
    current = `${current} ${block}`;
  }
  if (current) paragraphs.push(current);
  return paragraphs;
}

function countWords(text: string): number {
  return text.match(/[A-Za-z]+(?:[-'][A-Za-z]+)?|\d+/g)?.length ?? 0;
}

function splitParagraphIntoChunks(paragraph: string, targetWords: number): string[] {
  const words = paragraph.split(/\s+/).filter(Boolean);
  if (words.length <= targetWords) return [paragraph];
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += targetWords) {
    chunks.push(words.slice(index, index + targetWords).join(" "));
  }
  return chunks;
}

function paginatePassageContent(content: string, targetWords = 520): string[] {
  const paragraphs = normalizePassageParagraphs(content);
  if (paragraphs.length === 0) return [];

  const pages: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const paragraph of paragraphs) {
    const paragraphWords = countWords(paragraph);
    const pieces = paragraphWords > targetWords + 120
      ? splitParagraphIntoChunks(paragraph, targetWords)
      : [paragraph];

    for (const piece of pieces) {
      const pieceWords = countWords(piece);
      if (current.length > 0 && currentWords + pieceWords > targetWords) {
        pages.push(current.join("\n\n"));
        current = [];
        currentWords = 0;
      }
      current.push(piece);
      currentWords += pieceWords;
    }
  }

  if (current.length > 0) pages.push(current.join("\n\n"));
  return pages;
}

function renderClozeParagraph(content: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(?<!\w)(\d{1,2})(?!\w)/g;
  let lastIndex = 0;

  for (const match of content.matchAll(pattern)) {
    const index = match.index ?? 0;
    const blankNo = match[1];
    const fullMatch = match[0];
    const value = Number(blankNo);
    const nextText = content.slice(index + fullMatch.length).trimStart().toLowerCase();
    const shouldUnderline = value >= 1 && value <= 20 && !nextText.startsWith("point");

    if (index > lastIndex) {
      nodes.push(content.slice(lastIndex, index));
    }
    nodes.push(shouldUnderline
      ? <span key={`${index}-${blankNo}`} className="cloze-blank">{blankNo}</span>
      : fullMatch);
    lastIndex = index + fullMatch.length;
  }

  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex));
  }

  return nodes;
}

function PassagePageContent({
  content,
  cloze,
}: {
  content: string;
  cloze: boolean;
}) {
  const paragraphs = content.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);

  return (
    <div className="english-passage-content text-on-surface">
      {paragraphs.map((paragraph, index) => (
        <p key={`${index}-${paragraph.slice(0, 12)}`}>
          {cloze ? renderClozeParagraph(paragraph) : paragraph}
        </p>
      ))}
    </div>
  );
}

function getQuestionTitle(question: EnglishQuestion, passage: EnglishPassage): string {
  if (passage.section === "cloze") return `Blank ${question.questionNo}`;
  return question.stem || `第 ${question.questionNo} 题`;
}

function sortPassagesOldestFirst(left: EnglishPassage, right: EnglishPassage): number {
  return left.year - right.year
    || left.sortOrder - right.sortOrder
    || left.passageNo.localeCompare(right.passageNo);
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
  const [stage, setStage] = useState<TrainingStage>("types");
  const [activeCategoryId, setActiveCategoryId] = useState<TrainingCategoryId | null>(null);
  const [activePassageId, setActivePassageId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [draftAnswersByPassageId, setDraftAnswersByPassageId] = useState<Record<string, EnglishAttemptAnswerInput>>({});
  const [saving, setSaving] = useState<"save" | "submit" | null>(null);
  const [articlePage, setArticlePage] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadTrainingData() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const trainingData = await englishTrainingApi.getTrainingData();
        if (cancelled) return;
        setData(trainingData);
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

  const passagesByCategory = useMemo(() => {
    const map = new Map<TrainingCategoryId, EnglishPassage[]>();
    for (const category of TRAINING_CATEGORIES) {
      map.set(category.id, []);
    }
    for (const passage of data.passages) {
      const categoryId = getCategoryForPassage(passage);
      map.get(categoryId)?.push(passage);
    }
    for (const passages of map.values()) {
      passages.sort(sortPassagesOldestFirst);
    }
    return map;
  }, [data.passages]);

  const stats = useMemo(() => {
    const submitted = data.attempts.filter((attempt) => attempt.status === "submitted");
    const score = submitted.reduce((sum, attempt) => sum + attempt.score, 0);
    const maxScore = submitted.reduce((sum, attempt) => sum + attempt.maxScore, 0);
    return {
      total: data.passages.length,
      submitted: submitted.length,
      inProgress: data.attempts.filter((attempt) => attempt.status === "in_progress").length,
      accuracy: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
    };
  }, [data.attempts, data.passages.length]);

  const activeCategory = useMemo(
    () => TRAINING_CATEGORIES.find((category) => category.id === activeCategoryId) ?? null,
    [activeCategoryId],
  );

  const categoryPassages = activeCategoryId ? passagesByCategory.get(activeCategoryId) ?? [] : [];
  const visiblePassages = categoryPassages.filter((passage) => {
    const status = getAttemptStatus(attemptsByPassageId.get(passage.id));
    return statusFilter === "all" || status === statusFilter;
  });
  const activePassage = activePassageId
    ? data.passages.find((passage) => passage.id === activePassageId) ?? null
    : null;
  const activeAttempt = activePassage ? attemptsByPassageId.get(activePassage.id) : undefined;
  const activeQuestions = activePassage ? questionsByPassageId.get(activePassage.id) ?? [] : [];
  const activeAnswers = activePassage
    ? draftAnswersByPassageId[activePassage.id] ?? buildAnswerMap(activeAttempt)
    : {};

  const handleSelectCategory = (categoryId: TrainingCategoryId) => {
    setActiveCategoryId(categoryId);
    setStatusFilter("all");
    setStage("sets");
  };

  const handleOpenPassage = (passageId: string) => {
    setActivePassageId(passageId);
    setArticlePage(0);
    setStage("practice");
  };

  const handleBack = () => {
    if (stage === "practice") {
      setStage("sets");
      setArticlePage(0);
      return;
    }
    if (stage === "sets") {
      setStage("types");
      setActiveCategoryId(null);
      setStatusFilter("all");
    }
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

  const workspace = (
    <section className="min-w-0">
      {stage === "types" && (
        <TrainingTypeSelect
          loading={isLoading}
          error={loadError}
          stats={stats}
          passagesByCategory={passagesByCategory}
          attemptsByPassageId={attemptsByPassageId}
          onSelect={handleSelectCategory}
        />
      )}
      {stage === "sets" && activeCategory && (
        <TrainingSetList
          category={activeCategory}
          passages={visiblePassages}
          allPassageCount={categoryPassages.length}
          attemptsByPassageId={attemptsByPassageId}
          questionsByPassageId={questionsByPassageId}
          statusFilter={statusFilter}
          loading={isLoading}
          error={loadError}
          onStatusChange={setStatusFilter}
          onBack={handleBack}
          onSelect={handleOpenPassage}
        />
      )}
      {stage === "practice" && (
        <PracticeWorkspace
          passage={activePassage}
          questions={activeQuestions}
          attempt={activeAttempt}
          answers={activeAnswers}
          saving={saving}
          loading={isLoading}
          articlePage={articlePage}
          onArticlePageChange={setArticlePage}
          onBack={handleBack}
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
      )}
    </section>
  );

  return (
    <>
      <PageHeader
        width="workspace"
        eyebrow="英语一"
        icon={<BookOpen className="h-4 w-4" />}
        title="英语真题训练"
        description="按阅读、三小门和写作整理 2007-2026 英语一真题。"
        stats={[
          { label: "题组", value: stats.total },
          { label: "已提交", value: stats.submitted, tone: "text-green-600" },
          { label: "进行中", value: stats.inProgress },
          { label: "正确率", value: `${stats.accuracy}%` },
        ]}
      />
      <PageShell width="workspace" topPadding="content">
        {workspace}
      </PageShell>
    </>
  );
}

function TrainingTypeSelect({
  loading,
  error,
  stats,
  passagesByCategory,
  attemptsByPassageId,
  onSelect,
}: {
  loading: boolean;
  error: string | null;
  stats: EnglishTrainingStats;
  passagesByCategory: Map<TrainingCategoryId, EnglishPassage[]>;
  attemptsByPassageId: Map<string, EnglishAttempt>;
  onSelect: (categoryId: TrainingCategoryId) => void;
}) {
  if (loading) {
    return <EmptyWorkspace icon={<Loader2 className="h-6 w-6 animate-spin text-primary" />} text="正在加载英语真题训练。" />;
  }

  if (error) {
    return <EmptyWorkspace text={error} />;
  }

  if (stats.total === 0) {
    return <EmptyWorkspace icon={<Sparkles className="h-8 w-8 text-primary" />} text="英语一真题库还未导入。" />;
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {TRAINING_CATEGORIES.map((category) => {
          const passages = passagesByCategory.get(category.id) ?? [];
          const submitted = passages.filter((passage) => attemptsByPassageId.get(passage.id)?.status === "submitted").length;
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onSelect(category.id)}
              className="surface-card group min-h-56 p-5 text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {category.icon}
                </span>
                <ChevronRight className="h-5 w-5 text-on-surface-variant/60 transition-transform group-hover:translate-x-1" />
              </div>
              <h2 className="mt-5 text-xl font-bold text-on-surface">{category.title}</h2>
              <p className="mt-2 text-sm leading-6 text-on-surface-variant">{category.subtitle}</p>
              <div className="mt-6 flex flex-wrap gap-2 text-xs text-on-surface-variant">
                <span className="tag-chip px-2 py-0.5">{passages.length} 组</span>
                <span className="tag-chip px-2 py-0.5">已提交 {submitted}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function TrainingSetList({
  category,
  passages,
  allPassageCount,
  attemptsByPassageId,
  questionsByPassageId,
  statusFilter,
  loading,
  error,
  onStatusChange,
  onBack,
  onSelect,
}: {
  category: TrainingCategory;
  passages: EnglishPassage[];
  allPassageCount: number;
  attemptsByPassageId: Map<string, EnglishAttempt>;
  questionsByPassageId: Map<string, EnglishQuestion[]>;
  statusFilter: StatusFilter;
  loading: boolean;
  error: string | null;
  onStatusChange: (value: StatusFilter) => void;
  onBack: () => void;
  onSelect: (passageId: string) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="surface-panel p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <button type="button" onClick={onBack} className="control-button mb-4 h-9 px-3 text-sm">
              <ArrowLeft className="h-4 w-4" />
              返回题型
            </button>
            <h2 className="text-2xl font-bold text-on-surface">{category.title}</h2>
            <p className="mt-2 text-sm text-on-surface-variant">
              共 {allPassageCount} 个题组，按 2007 到 2026 排列。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onStatusChange(option.value)}
                className={`control-button h-9 min-h-0 px-3 text-sm ${statusFilter === option.value ? "control-button-selected" : ""}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="surface-panel p-4 sm:p-5">
        {loading ? (
          <InlineState icon={<Loader2 className="h-4 w-4 animate-spin text-primary" />} text="加载题组..." />
        ) : error ? (
          <InlineState text={error} tone="text-red-600" />
        ) : passages.length === 0 ? (
          <InlineState text="当前状态下没有题组。" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {passages.map((passage) => {
              const attempt = attemptsByPassageId.get(passage.id);
              const accuracy = getAccuracy(attempt);
              const questions = questionsByPassageId.get(passage.id) ?? [];
              return (
                <button
                  key={passage.id}
                  type="button"
                  onClick={() => onSelect(passage.id)}
                  className="rounded-lg border border-outline-variant/20 bg-surface-container-low/70 px-4 py-4 text-left transition-colors hover:border-primary/25 hover:bg-surface-container-lowest"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-base font-semibold text-on-surface">
                        {getEnglishPassageTitle(passage)}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-on-surface-variant">
                        <span className="tag-chip px-2 py-0.5">{englishSectionLabels[passage.section]}</span>
                        <span className="tag-chip px-2 py-0.5">{englishPassageLabels[passage.passageNo]}</span>
                        <span className="tag-chip px-2 py-0.5">{questions.length} 题</span>
                        <span className="tag-chip px-2 py-0.5">{getStatusLabel(attempt)}</span>
                        {accuracy !== null && <span className="tag-chip px-2 py-0.5">正确率 {accuracy}%</span>}
                      </div>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-on-surface-variant/50" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}

function PracticeWorkspace({
  passage,
  questions,
  attempt,
  answers,
  saving,
  loading,
  articlePage,
  onArticlePageChange,
  onBack,
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
  articlePage: number;
  onArticlePageChange: (page: number) => void;
  onBack: () => void;
  onAnswerChange: (questionId: string, answer: string) => void;
  onSave: () => void;
  onSubmit: () => void;
}) {
  if (loading) {
    return <EmptyWorkspace icon={<Loader2 className="h-6 w-6 animate-spin text-primary" />} text="正在加载英语真题训练。" />;
  }

  if (!passage) {
    return <EmptyWorkspace text="没有找到当前题组。" />;
  }

  const submitted = attempt?.status === "submitted";
  const objective = isEnglishObjectiveSection(passage.section);
  const articlePages = paginatePassageContent(passage.content);
  const currentPage = Math.min(articlePage, Math.max(articlePages.length - 1, 0));
  const canSubmit = questions.length > 0 && objective;

  return (
    <section className="english-practice-shell">
      <div className="english-practice-toolbar">
        <div className="min-w-0">
          <button type="button" onClick={onBack} className="control-button h-9 px-3 text-sm">
            <ArrowLeft className="h-4 w-4" />
            返回题组
          </button>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="tag-chip px-2 py-0.5">{englishSectionLabels[passage.section]}</span>
            <span className="tag-chip px-2 py-0.5">{englishPassageLabels[passage.passageNo]}</span>
            <span className="tag-chip px-2 py-0.5">{getStatusLabel(attempt)}</span>
            {submitted && <span className="tag-chip px-2 py-0.5 text-green-700">{formatScore(attempt)}</span>}
          </div>
          <h2 className="mt-2 text-xl font-bold leading-tight text-on-surface">{getEnglishPassageTitle(passage)}</h2>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={onSave} disabled={Boolean(saving) || submitted} className="control-button h-10 px-3 text-sm">
            {saving === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存
          </button>
          <button type="button" onClick={onSubmit} disabled={Boolean(saving) || !canSubmit} className="control-button control-button-primary h-10 px-3 text-sm">
            {saving === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            提交本篇
          </button>
        </div>
      </div>

      <div className="english-practice-grid">
        <article className="english-article-pane">
          {articlePages.length > 0 ? (
            <>
              <div className="mb-4 flex items-center justify-between gap-3 text-xs text-on-surface-variant">
                <span>文章 {currentPage + 1} / {articlePages.length}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onArticlePageChange(Math.max(currentPage - 1, 0))}
                    disabled={currentPage === 0}
                    className="control-button h-8 min-h-0 px-2 text-xs"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onArticlePageChange(Math.min(currentPage + 1, articlePages.length - 1))}
                    disabled={currentPage >= articlePages.length - 1}
                    className="control-button h-8 min-h-0 px-2 text-xs"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <PassagePageContent
                content={articlePages[currentPage]}
                cloze={passage.section === "cloze"}
              />
            </>
          ) : (
            <div className="flex min-h-[28rem] items-center justify-center rounded-lg border border-dashed border-outline-variant/30 text-sm text-on-surface-variant">
              这篇真题原文还未导入。
            </div>
          )}
        </article>

        <aside className="english-question-pane">
          <div className="sticky top-0 z-10 mb-4 flex items-center justify-between gap-3 bg-surface-container-low pb-3">
            <h3 className="text-sm font-semibold text-on-surface">题目</h3>
            <span className="tag-chip px-2 py-0.5 text-xs">{questions.length} 题</span>
          </div>
          {questions.length === 0 ? (
            <InlineState text={passage.section === "writing" ? "写作 AI 评分入口预留中。" : "这篇的题目还未导入。"} />
          ) : (
            <div className="space-y-4">
              {questions.map((question) => {
                const savedAnswer = attempt?.answers.find((answer) => answer.questionId === question.id);
                return (
                  <QuestionBlock
                    key={question.id}
                    passage={passage}
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
  passage,
  question,
  value,
  savedAnswer,
  submitted,
  objective,
  onChange,
}: {
  passage: EnglishPassage;
  question: EnglishQuestion;
  value: string;
  savedAnswer?: { isCorrect?: boolean; score: number };
  submitted: boolean;
  objective: boolean;
  onChange: (value: string) => void;
}) {
  const correct = submitted && savedAnswer?.isCorrect === true;
  const wrong = submitted && savedAnswer?.isCorrect === false;
  const questionTitle = getQuestionTitle(question, passage);
  const showStem = Boolean(questionTitle.trim());

  return (
    <div className="rounded-lg border border-outline-variant/15 bg-surface-container-lowest p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary">第 {question.questionNo} 题</span>
        <span className="rounded-full bg-surface-container-high px-2.5 py-1 text-on-surface-variant">{question.score} 分</span>
        {correct && <span className="rounded-full bg-green-50 px-2.5 py-1 font-medium text-green-700">正确</span>}
        {wrong && <span className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700">错误</span>}
      </div>
      {showStem && (
        <MarkdownContent
          content={questionTitle}
          compact
          className="text-sm font-semibold text-on-surface"
        />
      )}

      {question.options.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {question.options.map((option) => {
            const selected = value === option.label;
            return (
              <button
                key={`${question.id}-${option.label}`}
                type="button"
                onClick={() => onChange(option.label)}
                className={`grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3 rounded-lg border px-3 py-3 text-left text-sm transition-colors ${
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
          rows={objective ? 2 : 8}
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

function EmptyWorkspace({ icon, text }: { icon?: ReactNode; text: string }) {
  return (
    <section className="surface-panel flex min-h-[32rem] flex-col items-center justify-center gap-3 p-6 text-center text-sm text-on-surface-variant">
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
