"use client";

import Link from "next/link";
import { createElement, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Circle,
  ClipboardCheck,
  FileText,
  Highlighter,
  Loader2,
  PenLine,
  Save,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { useToast } from "@/components/ui/Toast";
import { buildAuthHeaders } from "@/lib/fetch-with-auth";
import { recordDeepSeekUsage } from "@/lib/ai-usage";
import { englishResultsApi, type EnglishVocabularyInput } from "@/lib/english-results-api";
import { englishTrainingApi, type EnglishAttemptAnswerInput } from "@/lib/english-training-api";
import {
  englishVocabularyEntryTypeLabels,
  englishVocabularyPartOfSpeechLabels,
  isEnglishObjectiveSection,
  type EnglishAttempt,
  type EnglishPassage,
  type EnglishQuestion,
  type EnglishTrainingData,
  type EnglishVocabularyEntry,
  type EnglishVocabularyEntryType,
  type EnglishVocabularyPartOfSpeech,
  type EnglishVocabularySourceArea,
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

type VocabularyDialogMode = "manual" | "ai";

type VocabularyFormState = {
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
  note: string;
};

type EnglishVocabularyRecommendation = {
  entryType: EnglishVocabularyEntryType;
  word: string;
  partOfSpeech: EnglishVocabularyPartOfSpeech;
  definition: string;
  sourceArea: EnglishVocabularySourceArea;
  questionNo: string;
  optionLabel: string;
  sourceExcerpt: string;
  highlightText: string;
  note: string;
};

const partOfSpeechOptions: EnglishVocabularyPartOfSpeech[] = ["n", "v", "adj", "adv", "prep", "conj", "phr", "other"];

const vocabularyTypeOptions: Array<{ value: EnglishVocabularyEntryType; label: string }> = [
  { value: "word", label: "生词" },
  { value: "collocation", label: "固定搭配" },
  { value: "familiar_meaning", label: "熟词生义" },
];

const sourceAreaOptions: Array<{ value: EnglishVocabularySourceArea; label: string }> = [
  { value: "passage", label: "文章" },
  { value: "question", label: "题干" },
  { value: "option", label: "选项" },
];

function createVocabularyForm(passageId = ""): VocabularyFormState {
  return {
    passageId,
    entryType: "word",
    word: "",
    partOfSpeech: "other",
    definition: "",
    sourceArea: "passage",
    sourceQuestionId: "",
    sourceOptionLabel: "",
    sourceExcerpt: "",
    highlightText: "",
    note: "",
  };
}

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

function normalizeVocabularyKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function getRecommendationKey(item: Pick<EnglishVocabularyRecommendation, "entryType" | "word" | "sourceExcerpt">): string {
  return `${item.entryType}:${normalizeVocabularyKey(item.word)}:${normalizeVocabularyKey(item.sourceExcerpt).slice(0, 60)}`;
}

function normalizeQuestionNoKey(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits || value.trim().toLowerCase();
}

function findQuestionForRecommendation(
  item: EnglishVocabularyRecommendation,
  questions: EnglishQuestion[],
): EnglishQuestion | undefined {
  const target = normalizeQuestionNoKey(item.questionNo);
  if (!target) return undefined;
  return questions.find((question) => normalizeQuestionNoKey(question.questionNo) === target);
}

function isSameVocabularyEntry(
  entry: Pick<EnglishVocabularyEntry, "passageId" | "entryType" | "word">,
  input: Pick<EnglishVocabularyInput, "passageId" | "entryType" | "word">,
): boolean {
  return entry.passageId === input.passageId
    && entry.entryType === input.entryType
    && normalizeVocabularyKey(entry.word) === normalizeVocabularyKey(input.word);
}

function getVocabularyHighlightText(entry: Pick<EnglishVocabularyEntry, "highlightText" | "sourceExcerpt" | "word">): string {
  return (entry.highlightText || entry.sourceExcerpt || entry.word).trim();
}

function getVocabularyMarkClass(entryType: EnglishVocabularyEntryType): string {
  return `english-vocab-mark english-vocab-mark-${entryType.replace("_", "-")}`;
}

function findSourcePosition(
  passage: EnglishPassage,
  input: Pick<EnglishVocabularyInput, "sourceArea" | "sourceExcerpt">,
): Pick<EnglishVocabularyInput, "sourceStart" | "sourceEnd" | "sourceParagraph"> {
  if (input.sourceArea && input.sourceArea !== "passage") return {};
  const excerpt = input.sourceExcerpt?.trim();
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

function renderTextWithVocabularyMarks(
  text: string,
  entries: EnglishVocabularyEntry[],
  cloze = false,
): ReactNode[] {
  if (entries.length === 0) return cloze ? renderClozeParagraph(text) : [text];

  const matches = entries
    .map((entry) => {
      const target = getVocabularyHighlightText(entry);
      if (!target) return null;
      const start = text.indexOf(target);
      if (start < 0) return null;
      return {
        entry,
        target,
        start,
        end: start + target.length,
      };
    })
    .filter((item): item is { entry: EnglishVocabularyEntry; target: string; start: number; end: number } => Boolean(item))
    .sort((left, right) => left.start - right.start || right.end - left.end);

  const cleanMatches: typeof matches = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue;
    cleanMatches.push(match);
    cursor = match.end;
  }

  if (cleanMatches.length === 0) return cloze ? renderClozeParagraph(text) : [text];

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  cleanMatches.forEach((match) => {
    if (match.start > lastIndex) {
      const plain = text.slice(lastIndex, match.start);
      nodes.push(...(cloze ? renderClozeParagraph(plain) : [plain]));
    }
    nodes.push(
      <mark
        className={getVocabularyMarkClass(match.entry.entryType)}
        title={`${englishVocabularyEntryTypeLabels[match.entry.entryType]}：${match.entry.word}`}
      >
        {match.target}
      </mark>,
    );
    lastIndex = match.end;
  });

  if (lastIndex < text.length) {
    const rest = text.slice(lastIndex);
    nodes.push(...(cloze ? renderClozeParagraph(rest) : [rest]));
  }

  return nodes;
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

function paginatePassageContent(content: string, targetWords = 380): string[] {
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
  vocabulary,
}: {
  content: string;
  cloze: boolean;
  vocabulary: EnglishVocabularyEntry[];
}) {
  const paragraphs = content.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);

  return (
    <div className="english-passage-content text-on-surface">
      {paragraphs.map((paragraph, index) => (
        <p key={`${index}-${paragraph.slice(0, 12)}`}>
          {renderTextWithVocabularyMarks(paragraph, vocabulary, cloze)}
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
  const [vocabularyDialogOpen, setVocabularyDialogOpen] = useState(false);
  const [vocabularyDialogMode, setVocabularyDialogMode] = useState<VocabularyDialogMode>("manual");
  const [vocabularyForm, setVocabularyForm] = useState<VocabularyFormState>(createVocabularyForm());
  const [savingVocabulary, setSavingVocabulary] = useState(false);
  const [recommendingVocabulary, setRecommendingVocabulary] = useState(false);
  const [recommendations, setRecommendations] = useState<EnglishVocabularyRecommendation[]>([]);
  const [selectedRecommendations, setSelectedRecommendations] = useState<Record<string, boolean>>({});
  const [routeApplied, setRouteApplied] = useState(false);

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
  const activeVocabulary = activePassage
    ? data.vocabulary.filter((entry) => entry.passageId === activePassage.id)
    : [];
  const activePassageVocabulary = activeVocabulary.filter((entry) => entry.sourceArea === "passage");

  useEffect(() => {
    if (routeApplied || isLoading || data.passages.length === 0 || typeof window === "undefined") return;
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const passageId = params.get("passage");
      if (!passageId) {
        setRouteApplied(true);
        return;
      }

      const passage = data.passages.find((item) => item.id === passageId);
      if (!passage) {
        setRouteApplied(true);
        return;
      }

      setActiveCategoryId(getCategoryForPassage(passage));
      setActivePassageId(passage.id);
      setStage("practice");

      const vocabularyId = params.get("vocab");
      const entry = vocabularyId ? data.vocabulary.find((item) => item.id === vocabularyId) : undefined;
      const target = entry ? getVocabularyHighlightText(entry) : "";
      if (target) {
        const pages = paginatePassageContent(passage.content);
        const pageIndex = pages.findIndex((page) => page.includes(target));
        setArticlePage(pageIndex >= 0 ? pageIndex : 0);
      } else {
        setArticlePage(0);
      }

      setRouteApplied(true);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [data.passages, data.vocabulary, isLoading, routeApplied]);

  const handleSelectCategory = (categoryId: TrainingCategoryId) => {
    setActiveCategoryId(categoryId);
    setStage("sets");
  };

  const handleOpenPassage = (passageId: string) => {
    setActivePassageId(passageId);
    setArticlePage(0);
    setVocabularyForm(createVocabularyForm(passageId));
    setRecommendations([]);
    setSelectedRecommendations({});
    setVocabularyDialogMode("manual");
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

  const openVocabularyDialog = () => {
    if (!activePassage) return;
    setVocabularyForm((current) => ({
      ...createVocabularyForm(activePassage.id),
      entryType: current.entryType,
      sourceArea: current.sourceArea,
    }));
    setVocabularyDialogMode("manual");
    setVocabularyDialogOpen(true);
  };

  const buildVocabularyInput = (formState: VocabularyFormState): EnglishVocabularyInput | null => {
    if (!activePassage) return null;
    const word = formState.word.trim();
    const sourceExcerpt = formState.sourceExcerpt.trim();
    if (!word || !sourceExcerpt) return null;

    const input: EnglishVocabularyInput = {
      passageId: activePassage.id,
      entryType: formState.entryType,
      word,
      partOfSpeech: formState.partOfSpeech,
      definition: formState.definition,
      sourceArea: formState.sourceArea,
      sourceQuestionId: formState.sourceArea === "passage" ? undefined : formState.sourceQuestionId,
      sourceOptionLabel: formState.sourceArea === "option" ? formState.sourceOptionLabel : "",
      sourceExcerpt,
      highlightText: formState.highlightText.trim() || word,
      masteryStatus: "new",
      note: formState.note,
      ...findSourcePosition(activePassage, {
        sourceArea: formState.sourceArea,
        sourceExcerpt,
      }),
    };
    return input;
  };

  const saveVocabularyInput = async (input: EnglishVocabularyInput): Promise<EnglishVocabularyEntry | null> => {
    if (data.vocabulary.some((entry) => isSameVocabularyEntry(entry, input))) {
      return null;
    }
    return englishResultsApi.saveVocabulary(input);
  };

  const handleSaveVocabulary = async () => {
    const input = buildVocabularyInput(vocabularyForm);
    if (!input) {
      toast.error("请填写词条和原文片段");
      return;
    }

    setSavingVocabulary(true);
    try {
      const saved = await saveVocabularyInput(input);
      if (!saved) {
        toast.error("这篇里已经记录过这个词条");
        return;
      }
      setData((current) => ({
        ...current,
        vocabulary: [saved, ...current.vocabulary],
      }));
      setVocabularyForm(createVocabularyForm(input.passageId));
      toast.success("已保存词条");
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`保存词条失败：${message}`);
    } finally {
      setSavingVocabulary(false);
    }
  };

  const handleRecommendVocabulary = async () => {
    if (!activePassage || !isSubmittedAttempt(activeAttempt) || recommendingVocabulary) return;
    setRecommendingVocabulary(true);
    try {
      const response = await fetch("/api/ai/english-vocabulary/recommend", {
        method: "POST",
        headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          submitted: true,
          passage: {
            year: activePassage.year,
            section: activePassage.section,
            passageNo: activePassage.passageNo,
            content: activePassage.content,
          },
          questions: activeQuestions.map((question) => {
            const savedAnswer = activeAttempt?.answers.find((answer) => answer.questionId === question.id);
            return {
              questionNo: question.questionNo,
              stem: question.stem,
              options: question.options,
              standardAnswer: question.standardAnswer,
              userAnswer: activeAnswers[question.id] ?? savedAnswer?.answer ?? "",
              isCorrect: savedAnswer?.isCorrect,
            };
          }),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(payload.items)) {
        throw new Error(typeof payload.error === "string" ? payload.error : "AI 推荐失败");
      }
      if (typeof payload.tokensUsed === "number") recordDeepSeekUsage(payload.tokensUsed);
      const items = payload.items as EnglishVocabularyRecommendation[];
      setRecommendations(items);
      setSelectedRecommendations(Object.fromEntries(items.map((item) => [getRecommendationKey(item), true])));
      setVocabularyDialogMode("ai");
      toast.success(`已生成 ${items.length} 条候选`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(message);
    } finally {
      setRecommendingVocabulary(false);
    }
  };

  const handleSaveRecommendations = async () => {
    if (!activePassage) return;
    const selectedItems = recommendations.filter((item) => selectedRecommendations[getRecommendationKey(item)]);
    if (selectedItems.length === 0) {
      toast.error("请先选择要保存的候选");
      return;
    }

    setSavingVocabulary(true);
    try {
      const savedItems: EnglishVocabularyEntry[] = [];
      let skipped = 0;
      for (const item of selectedItems) {
        const question = item.sourceArea === "passage"
          ? undefined
          : findQuestionForRecommendation(item, activeQuestions);
        if (item.sourceArea !== "passage" && !question) {
          skipped += 1;
          continue;
        }
        const option = item.sourceArea === "option"
          ? question?.options.find((current) => current.label === item.optionLabel)
            ?? question?.options.find((current) => (
              current.content.includes(item.sourceExcerpt) || current.content.includes(item.highlightText)
            ))
          : undefined;
        if (item.sourceArea === "option" && !option) {
          skipped += 1;
          continue;
        }
        const input: EnglishVocabularyInput = {
          passageId: activePassage.id,
          entryType: item.entryType,
          word: item.word,
          partOfSpeech: item.partOfSpeech,
          definition: item.definition,
          sourceArea: item.sourceArea,
          sourceQuestionId: item.sourceArea === "passage" ? undefined : question?.id,
          sourceOptionLabel: item.sourceArea === "option" ? option?.label ?? "" : "",
          sourceExcerpt: item.sourceExcerpt,
          highlightText: item.highlightText || item.word,
          aiGenerated: true,
          masteryStatus: "new",
          note: item.note,
          ...findSourcePosition(activePassage, {
            sourceArea: item.sourceArea,
            sourceExcerpt: item.sourceExcerpt,
          }),
        };
        const saved = await saveVocabularyInput(input);
        if (saved) savedItems.push(saved);
      }

      if (savedItems.length > 0) {
        setData((current) => ({
          ...current,
          vocabulary: [...savedItems, ...current.vocabulary],
        }));
      }
      toast.success(savedItems.length > 0
        ? `已保存 ${savedItems.length} 条词句${skipped > 0 ? `，跳过 ${skipped} 条` : ""}`
        : skipped > 0 ? "选中的候选缺少可追溯位置" : "选中的候选都已存在");
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`保存推荐失败：${message}`);
    } finally {
      setSavingVocabulary(false);
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
          vocabulary={activeVocabulary}
          passageVocabulary={activePassageVocabulary}
          saving={saving}
          savingVocabulary={savingVocabulary}
          recommendingVocabulary={recommendingVocabulary}
          loading={isLoading}
          articlePage={articlePage}
          onArticlePageChange={setArticlePage}
          onBack={handleBack}
          onOpenVocabulary={openVocabularyDialog}
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
          actions={(
            <Link href="/tools/past-papers" className="control-button h-10 px-3 text-sm">
              <ArrowLeft className="h-4 w-4" />
              返回真题中心
            </Link>
          )}
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
      {activePassage && (
        <VocabularyDialog
          open={vocabularyDialogOpen}
          mode={vocabularyDialogMode}
          passage={activePassage}
          questions={activeQuestions}
          submitted={isSubmittedAttempt(activeAttempt)}
          form={vocabularyForm}
          recommendations={recommendations}
          selectedRecommendations={selectedRecommendations}
          saving={savingVocabulary}
          recommending={recommendingVocabulary}
          onClose={() => setVocabularyDialogOpen(false)}
          onModeChange={setVocabularyDialogMode}
          onFormChange={setVocabularyForm}
          onSaveManual={handleSaveVocabulary}
          onRecommend={handleRecommendVocabulary}
          onRecommendationToggle={(key, checked) => {
            setSelectedRecommendations((current) => ({ ...current, [key]: checked }));
          }}
          onSaveRecommendations={handleSaveRecommendations}
        />
      )}
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
  vocabulary,
  passageVocabulary,
  saving,
  savingVocabulary,
  recommendingVocabulary,
  loading,
  articlePage,
  onArticlePageChange,
  onBack,
  onOpenVocabulary,
  onAnswerChange,
  onSave,
  onSubmit,
}: {
  passage: EnglishPassage | null;
  questions: EnglishQuestion[];
  attempt?: EnglishAttempt;
  answers: EnglishAttemptAnswerInput;
  vocabulary: EnglishVocabularyEntry[];
  passageVocabulary: EnglishVocabularyEntry[];
  saving: "save" | "submit" | null;
  savingVocabulary: boolean;
  recommendingVocabulary: boolean;
  loading: boolean;
  articlePage: number;
  onArticlePageChange: (page: number) => void;
  onBack: () => void;
  onOpenVocabulary: () => void;
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
          <button
            type="button"
            onClick={onOpenVocabulary}
            disabled={savingVocabulary || recommendingVocabulary}
            className="control-button h-10 px-3 text-sm"
          >
            {savingVocabulary || recommendingVocabulary ? <Loader2 className="h-4 w-4 animate-spin" /> : <Highlighter className="h-4 w-4" />}
            生词
          </button>
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
              <div className="english-article-page">
                <PassagePageContent
                  content={articlePages[currentPage]}
                  cloze={passage.section === "cloze"}
                  vocabulary={passageVocabulary}
                />
              </div>
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
                    vocabulary={vocabulary}
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
  vocabulary,
  onChange,
}: {
  passage: EnglishPassage;
  question: EnglishQuestion;
  value: string;
  savedAnswer?: { isCorrect?: boolean; score: number };
  submitted: boolean;
  objective: boolean;
  vocabulary: EnglishVocabularyEntry[];
  onChange: (value: string) => void;
}) {
  const correct = submitted && savedAnswer?.isCorrect === true;
  const wrong = submitted && savedAnswer?.isCorrect === false;
  const questionTitle = getQuestionTitle(question, passage);
  const showStem = Boolean(questionTitle.trim());
  const resultText = correct ? "正确" : wrong ? "错误" : null;
  const questionVocabulary = vocabulary.filter((entry) => (
    entry.sourceQuestionId === question.id && entry.sourceArea === "question"
  ));

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
        <p className="english-question-stem">
          {renderTextWithVocabularyMarks(questionTitle, questionVocabulary)}
        </p>
      )}

      {question.options.length > 0 ? (
        <div className="mt-4 grid gap-2.5">
          {question.options.map((option) => {
            const selected = value === option.label;
            const optionVocabulary = vocabulary.filter((entry) => (
              entry.sourceQuestionId === question.id
              && entry.sourceArea === "option"
              && entry.sourceOptionLabel === option.label
            ));
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
                <span className="english-option-content">
                  {renderTextWithVocabularyMarks(option.content, optionVocabulary)}
                </span>
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

function VocabularyDialog({
  open,
  mode,
  passage,
  questions,
  submitted,
  form,
  recommendations,
  selectedRecommendations,
  saving,
  recommending,
  onClose,
  onModeChange,
  onFormChange,
  onSaveManual,
  onRecommend,
  onRecommendationToggle,
  onSaveRecommendations,
}: {
  open: boolean;
  mode: VocabularyDialogMode;
  passage: EnglishPassage;
  questions: EnglishQuestion[];
  submitted: boolean;
  form: VocabularyFormState;
  recommendations: EnglishVocabularyRecommendation[];
  selectedRecommendations: Record<string, boolean>;
  saving: boolean;
  recommending: boolean;
  onClose: () => void;
  onModeChange: (mode: VocabularyDialogMode) => void;
  onFormChange: (form: VocabularyFormState) => void;
  onSaveManual: () => void;
  onRecommend: () => void;
  onRecommendationToggle: (key: string, checked: boolean) => void;
  onSaveRecommendations: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const selectedQuestion = questions.find((question) => question.id === form.sourceQuestionId) ?? questions[0];
  const sourceQuestions = questions.filter((question) => question.stem || question.options.length > 0);
  const selectedCount = recommendations.filter((item) => selectedRecommendations[getRecommendationKey(item)]).length;

  return (
    <div className="english-vocab-dialog-backdrop" role="dialog" aria-modal="true" aria-label="生词">
      <section ref={dialogRef} className="english-vocab-dialog">
        <header className="english-vocab-dialog-header">
          <div>
            <h2>生词</h2>
            <p>{getPassageDisplayTitle(passage)}</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="english-vocab-icon-button" aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="english-vocab-dialog-tabs">
          <button
            type="button"
            onClick={() => onModeChange("manual")}
            className={mode === "manual" ? "english-vocab-dialog-tab-active" : ""}
          >
            手动添加
          </button>
          <button
            type="button"
            onClick={() => onModeChange("ai")}
            className={mode === "ai" ? "english-vocab-dialog-tab-active" : ""}
          >
            AI 推荐
          </button>
        </div>

        {mode === "manual" ? (
          <div className="english-vocab-form">
            <div className="grid grid-cols-2 gap-2">
              <VocabularySelect
                label="类型"
                value={form.entryType}
                options={vocabularyTypeOptions}
                onChange={(value) => onFormChange({ ...form, entryType: value as EnglishVocabularyEntryType })}
              />
              <VocabularySelect
                label="词性"
                value={form.partOfSpeech}
                options={partOfSpeechOptions.map((value) => ({
                  value,
                  label: englishVocabularyPartOfSpeechLabels[value],
                }))}
                onChange={(value) => onFormChange({ ...form, partOfSpeech: value as EnglishVocabularyPartOfSpeech })}
              />
            </div>

            <VocabularyInput
              label="词条"
              value={form.word}
              onChange={(value) => onFormChange({ ...form, word: value })}
            />
            <VocabularyInput
              label="释义"
              value={form.definition}
              onChange={(value) => onFormChange({ ...form, definition: value })}
            />
            <VocabularySelect
              label="来源"
              value={form.sourceArea}
              options={sourceAreaOptions}
              onChange={(value) => onFormChange({
                ...form,
                sourceArea: value as EnglishVocabularySourceArea,
                sourceQuestionId: value === "passage" ? "" : selectedQuestion?.id ?? "",
                sourceOptionLabel: value === "option" ? selectedQuestion?.options[0]?.label ?? "" : "",
              })}
            />

            {form.sourceArea !== "passage" && sourceQuestions.length > 0 && (
              <VocabularySelect
                label="题号"
                value={form.sourceQuestionId || selectedQuestion?.id || ""}
                options={sourceQuestions.map((question) => ({
                  value: question.id,
                  label: `第 ${question.questionNo} 题`,
                }))}
                onChange={(value) => onFormChange({
                  ...form,
                  sourceQuestionId: value,
                  sourceOptionLabel: form.sourceArea === "option"
                    ? questions.find((question) => question.id === value)?.options[0]?.label ?? ""
                    : "",
                })}
              />
            )}

            {form.sourceArea === "option" && selectedQuestion && (
              <VocabularySelect
                label="选项"
                value={form.sourceOptionLabel || selectedQuestion.options[0]?.label || ""}
                options={selectedQuestion.options.map((option) => ({
                  value: option.label,
                  label: option.label,
                }))}
                onChange={(value) => onFormChange({ ...form, sourceOptionLabel: value })}
              />
            )}

            <VocabularyTextarea
              label="原文片段"
              value={form.sourceExcerpt}
              rows={3}
              onChange={(value) => onFormChange({ ...form, sourceExcerpt: value })}
            />
            <VocabularyInput
              label="高亮文本"
              value={form.highlightText}
              onChange={(value) => onFormChange({ ...form, highlightText: value })}
            />
            <VocabularyTextarea
              label="备注"
              value={form.note}
              rows={2}
              onChange={(value) => onFormChange({ ...form, note: value })}
            />

            <button
              type="button"
              onClick={onSaveManual}
              disabled={saving}
              className="control-button control-button-primary h-10 w-full px-4 text-sm"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存词条
            </button>
          </div>
        ) : (
          <div className="english-vocab-ai">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onRecommend}
                disabled={!submitted || recommending}
                className="control-button h-10 px-3 text-sm"
              >
                {recommending ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                生成推荐
              </button>
              <button
                type="button"
                onClick={onSaveRecommendations}
                disabled={saving || selectedCount === 0}
                className="control-button control-button-primary h-10 px-3 text-sm"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                保存选中
              </button>
            </div>
            {!submitted && (
              <p className="text-sm text-on-surface-variant">提交本篇后可用。</p>
            )}
            <div className="english-vocab-recommendations">
              {recommendations.length === 0 ? (
                <div className="english-vocab-empty">暂无推荐。</div>
              ) : recommendations.map((item) => createElement(VocabularyRecommendationRow, {
                key: getRecommendationKey(item),
                item,
                selected: Boolean(selectedRecommendations[getRecommendationKey(item)]),
                onToggle: onRecommendationToggle,
              }))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function VocabularyRecommendationRow({
  item,
  selected,
  onToggle,
}: {
  item: EnglishVocabularyRecommendation;
  selected: boolean;
  onToggle: (key: string, checked: boolean) => void;
}) {
  const key = getRecommendationKey(item);
  return (
    <label className="english-vocab-recommendation">
      <input
        type="checkbox"
        checked={selected}
        onChange={(event) => onToggle(key, event.target.checked)}
      />
      <span className={getVocabularyMarkClass(item.entryType)}>
        {englishVocabularyEntryTypeLabels[item.entryType]}
      </span>
      <span className="min-w-0 flex-1">
        <strong>{item.word}</strong>
        <em>{item.definition}</em>
        <small>{item.sourceExcerpt}</small>
      </span>
    </label>
  );
}

function VocabularyInput({
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

function VocabularyTextarea({
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

function VocabularySelect({
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
