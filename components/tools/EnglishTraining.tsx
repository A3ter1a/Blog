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
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { useToast } from "@/components/ui/Toast";
import { englishTrainingApi, type EnglishAttemptAnswerInput } from "@/lib/english-training-api";
import {
  isEnglishObjectiveSection,
  type EnglishAttempt,
  type EnglishPassage,
  type EnglishQuestion,
  type EnglishTrainingData,
} from "@/lib/english-training";

type TrainingStage = "types" | "sets" | "practice";
type TrainingCategoryId = "reading" | "minor" | "writing";

type TrainingCategory = {
  id: TrainingCategoryId;
  title: string;
  subtitle: string;
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
    subtitle: "阅读理解",
    icon: <BookOpen className="h-5 w-5" />,
  },
  {
    id: "minor",
    title: "三小门",
    subtitle: "完形 / 新题型 / 翻译",
    icon: <FileText className="h-5 w-5" />,
  },
  {
    id: "writing",
    title: "写作",
    subtitle: "小作文 / 大作文",
    icon: <PenLine className="h-5 w-5" />,
  },
];

function getCategoryForPassage(passage: EnglishPassage): TrainingCategoryId {
  if (passage.section === "reading") return "reading";
  if (passage.section === "writing") return "writing";
  return "minor";
}

function isSubmittedAttempt(attempt?: EnglishAttempt): boolean {
  return attempt?.status === "submitted";
}

function buildAnswerMap(attempt?: EnglishAttempt): EnglishAttemptAnswerInput {
  if (!attempt) return {};
  return Object.fromEntries(attempt.answers.map((answer) => [answer.questionId, answer.answer]));
}

function shouldMergeDisplayBlock(current: string, next: string): boolean {
  const currentText = current.trim();
  const nextText = next.trim();
  if (!currentText || !nextText) return false;
  if (/[,;:—-]$/.test(currentText)) return true;
  if (/\b(and|or|but|nor|for|so|yet|to|of|in|on|at|by|with|from|as|than|that|which|who|whose|when|where)$/i.test(currentText)) {
    return true;
  }
  if (!/[.!?]["')\]]?$/.test(currentText)) return true;
  if (/^[a-z,.;:)\]]/.test(nextText)) return true;
  if (/\b[a-z]\)$/.test(currentText) && countWords(currentText) < 36) return true;
  return false;
}

function splitLongParagraph(paragraph: string): string[] {
  if (paragraph.length < 980) return [paragraph];

  const parts: string[] = [];
  let current = "";
  const sentences = paragraph.match(/[^.!?]+[.!?]["')\]]?|[^.!?]+$/g) ?? [paragraph];

  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence.trim()}` : sentence.trim();
    if (current && next.length > 760) {
      parts.push(current);
      current = sentence.trim();
      continue;
    }
    current = next;
  }

  if (current) parts.push(current);
  return parts.length > 0 ? parts : [paragraph];
}

function normalizePassageParagraphs(content: string): string[] {
  const blocks = content
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (blocks.length <= 1) {
    return blocks.length === 0 ? [] : splitLongParagraph(content.replace(/\s+/g, " ").trim());
  }

  const paragraphs: string[] = [];
  let current = "";
  for (const block of blocks) {
    if (!current) {
      current = block;
      continue;
    }
    if (shouldMergeDisplayBlock(current, block)) {
      current = `${current} ${block}`;
      continue;
    }
    paragraphs.push(current);
    current = block;
  }
  if (current) paragraphs.push(current);
  return paragraphs.flatMap(splitLongParagraph);
}

function countWords(text: string): number {
  return text.match(/[A-Za-z]+(?:[-'][A-Za-z]+)?|\d+/g)?.length ?? 0;
}

function splitParagraphIntoChunks(paragraph: string, targetWords: number): string[] {
  if (countWords(paragraph) <= targetWords) return [paragraph];
  const sentences = paragraph.match(/[^.!?]+[.!?]["')\]]?|[^.!?]+$/g) ?? [paragraph];
  const chunks: string[] = [];
  let current = "";
  let currentWords = 0;

  for (const sentence of sentences) {
    const cleanSentence = sentence.trim();
    const sentenceWords = countWords(cleanSentence);
    if (sentenceWords > targetWords) {
      if (current) {
        chunks.push(current);
        current = "";
        currentWords = 0;
      }
      const words = cleanSentence.split(/\s+/).filter(Boolean);
      for (let index = 0; index < words.length; index += targetWords) {
        chunks.push(words.slice(index, index + targetWords).join(" "));
      }
      continue;
    }
    if (current && currentWords + sentenceWords > targetWords) {
      chunks.push(current);
      current = cleanSentence;
      currentWords = sentenceWords;
      continue;
    }
    current = current ? `${current} ${cleanSentence}` : cleanSentence;
    currentWords += sentenceWords;
  }
  if (current) chunks.push(current);
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

function getPassageDisplayTitle(passage: EnglishPassage): string {
  if (passage.section === "reading" && passage.passageNo.startsWith("text")) {
    return `${passage.year} 阅读 ${passage.passageNo.replace("text", "")}`;
  }
  if (passage.passageNo === "small_writing") return `${passage.year} 小作文`;
  if (passage.passageNo === "big_writing") return `${passage.year} 大作文`;
  if (passage.section === "cloze") return `${passage.year} 完形`;
  if (passage.section === "new_type") return `${passage.year} 新题型`;
  if (passage.section === "translation") return `${passage.year} 翻译`;
  return `${passage.year}`;
}

function getPassageWindowLabel(passage: EnglishPassage): string {
  if (passage.section === "reading" && passage.passageNo.startsWith("text")) {
    return passage.passageNo.replace("text", "");
  }
  if (passage.passageNo === "small_writing") return "小作文";
  if (passage.passageNo === "big_writing") return "大作文";
  if (passage.section === "cloze") return "完形";
  if (passage.section === "new_type") return "新题型";
  if (passage.section === "translation") return "翻译";
  return "训练";
}

function sortPassagesOldestFirst(left: EnglishPassage, right: EnglishPassage): number {
  return left.year - right.year
    || left.sortOrder - right.sortOrder
    || left.passageNo.localeCompare(right.passageNo);
}

function sortPassagesForWindow(
  passages: EnglishPassage[],
  attemptsByPassageId: Map<string, EnglishAttempt>,
): EnglishPassage[] {
  return [...passages].sort((left, right) => {
    const leftSubmitted = isSubmittedAttempt(attemptsByPassageId.get(left.id));
    const rightSubmitted = isSubmittedAttempt(attemptsByPassageId.get(right.id));
    if (leftSubmitted !== rightSubmitted) return leftSubmitted ? 1 : -1;
    return sortPassagesOldestFirst(left, right);
  });
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
          onSelect={handleSelectCategory}
        />
      )}
      {stage === "sets" && activeCategory && (
        <TrainingSetList
          category={activeCategory}
          passages={categoryPassages}
          attemptsByPassageId={attemptsByPassageId}
          loading={isLoading}
          error={loadError}
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
      {stage !== "practice" && (
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
      )}
      <PageShell
        width="workspace"
        topPadding={stage === "practice" ? "none" : "content"}
        className={stage === "practice" ? "english-practice-page" : ""}
      >
        {workspace}
      </PageShell>
    </>
  );
}

function TrainingTypeSelect({
  loading,
  error,
  stats,
  onSelect,
}: {
  loading: boolean;
  error: string | null;
  stats: EnglishTrainingStats;
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
      <div className="mx-auto grid max-w-4xl gap-3">
        {TRAINING_CATEGORIES.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelect(category.id)}
            className="surface-card group flex min-h-28 items-center gap-4 p-4 text-left sm:p-5"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {category.icon}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-on-surface sm:text-xl">{category.title}</h2>
              <p className="mt-1 text-sm leading-6 text-on-surface-variant">{category.subtitle}</p>
            </div>
            <div className="ml-auto flex shrink-0 items-center text-primary">
              <ChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function TrainingSetList({
  category,
  passages,
  attemptsByPassageId,
  loading,
  error,
  onBack,
  onSelect,
}: {
  category: TrainingCategory;
  passages: EnglishPassage[];
  attemptsByPassageId: Map<string, EnglishAttempt>;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onSelect: (passageId: string) => void;
}) {
  const yearGroups = useMemo(() => {
    const groups = new Map<number, EnglishPassage[]>();
    for (const passage of passages) {
      const current = groups.get(passage.year) ?? [];
      current.push(passage);
      groups.set(passage.year, current);
    }
    return Array.from(groups.entries())
      .map(([year, groupPassages]) => {
        const sortedPassages = sortPassagesForWindow(groupPassages, attemptsByPassageId);
        return {
          year,
          passages: sortedPassages,
          completed: sortedPassages.length > 0 && sortedPassages.every((passage) => isSubmittedAttempt(attemptsByPassageId.get(passage.id))),
        };
      })
      .sort((left, right) => {
        if (left.completed !== right.completed) return left.completed ? 1 : -1;
        return left.year - right.year;
      });
  }, [attemptsByPassageId, passages]);

  return (
    <section className="space-y-4">
      <div className="surface-panel p-4 sm:p-5">
        <div className="min-w-0">
          <button type="button" onClick={onBack} className="control-button mb-4 h-9 px-3 text-sm">
            <ArrowLeft className="h-4 w-4" />
            返回题型
          </button>
          <h2 className="text-2xl font-bold text-on-surface">{category.title}</h2>
        </div>
      </div>

      <section className="surface-panel p-4 sm:p-5">
        {loading ? (
          <InlineState icon={<Loader2 className="h-4 w-4 animate-spin text-primary" />} text="加载题组..." />
        ) : error ? (
          <InlineState text={error} tone="text-red-600" />
        ) : yearGroups.length === 0 ? (
          <InlineState text="还没有可用题组。" />
        ) : (
          <div className="grid gap-3">
            {yearGroups.map((group) => (
              <div
                key={group.year}
                className={`flex flex-col gap-3 rounded-lg border border-outline-variant/15 bg-surface-container-low/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between ${
                  group.completed ? "opacity-50" : ""
                }`}
              >
                <div className="text-2xl font-bold tabular-nums text-on-surface">{group.year}</div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  {group.passages.map((passage) => {
                    const submitted = isSubmittedAttempt(attemptsByPassageId.get(passage.id));
                    return (
                      <button
                        key={passage.id}
                        type="button"
                        onClick={() => onSelect(passage.id)}
                        aria-label={getPassageDisplayTitle(passage)}
                        className={`english-year-choice ${submitted ? "english-year-choice-submitted" : ""}`}
                      >
                        {getPassageWindowLabel(passage)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
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
        <div className="english-practice-titlebar">
          <button type="button" onClick={onBack} className="control-button h-9 px-3 text-sm">
            <ArrowLeft className="h-4 w-4" />
            返回题组
          </button>
          <h2 className="english-practice-title">{getPassageDisplayTitle(passage)}</h2>
          {submitted && (
            <p className="english-practice-score">
              得分 {attempt?.score ?? 0}/{attempt?.maxScore ?? 0}
            </p>
          )}
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
          {questions.length === 0 ? (
            <InlineState text={passage.section === "writing" ? "写作 AI 评分入口预留中。" : "这篇的题目还未导入。"} />
          ) : (
            <div className="grid gap-4">
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
  const resultText = correct ? "正确" : wrong ? "错误" : null;

  return (
    <div className={`english-question-card ${correct ? "english-question-card-correct" : ""} ${wrong ? "english-question-card-wrong" : ""}`}>
      <div className="english-question-meta">
        <span>第 {question.questionNo} 题</span>
        {resultText && (
          <span className={correct ? "text-green-700" : "text-red-700"}>
            {resultText} · {savedAnswer?.score ?? 0}/{question.score}
          </span>
        )}
      </div>
      {showStem && (
        <p className="english-question-stem">{questionTitle}</p>
      )}

      {question.options.length > 0 ? (
        <div className="mt-4 grid gap-2.5">
          {question.options.map((option) => {
            const selected = value === option.label;
            return (
              <button
                key={`${question.id}-${option.label}`}
                type="button"
                onClick={() => onChange(option.label)}
                className={`english-option-button ${selected ? "english-option-button-selected" : ""}`}
              >
                <span className="english-option-label">
                  {option.label}
                </span>
                <span className="english-option-content">{option.content}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={objective ? 2 : 8}
          className="field-control english-written-answer mt-3 w-full resize-y px-3 py-2"
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
