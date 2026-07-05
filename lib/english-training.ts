export type EnglishPaperType = "english1";
export type EnglishSection = "reading" | "cloze" | "new_type" | "translation" | "writing";
export type EnglishPassageNo =
  | "text1"
  | "text2"
  | "text3"
  | "text4"
  | "cloze"
  | "new_type"
  | "translation"
  | "small_writing"
  | "big_writing";
export type EnglishAttemptStatus = "in_progress" | "submitted";
export type EnglishVocabularyEntryType = "word" | "collocation" | "familiar_meaning";
export type EnglishVocabularyPartOfSpeech = "n" | "v" | "adj" | "adv" | "prep" | "conj" | "phr" | "other";
export type EnglishVocabularyMasteryStatus = "new" | "learning" | "mastered";
export type EnglishVocabularySourceArea = "passage" | "question" | "option";

export interface EnglishQuestionOption {
  label: string;
  content: string;
}

export interface EnglishPaper {
  id: string;
  year: number;
  paperType: EnglishPaperType;
  title: string;
  totalScore: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnglishPassage {
  id: string;
  paperId: string;
  year: number;
  section: EnglishSection;
  passageNo: EnglishPassageNo;
  title: string;
  content: string;
  totalScore: number;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnglishQuestion {
  id: string;
  passageId: string;
  questionNo: string;
  stem: string;
  options: EnglishQuestionOption[];
  standardAnswer: string;
  score: number;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnglishAttemptAnswer {
  id: string;
  attemptId: string;
  questionId: string;
  answer: string;
  isCorrect?: boolean;
  score: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnglishAttempt {
  id: string;
  userId?: string;
  passageId: string;
  status: EnglishAttemptStatus;
  score: number;
  maxScore: number;
  startedAt: Date;
  submittedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  answers: EnglishAttemptAnswer[];
}

export interface EnglishVocabularyEntry {
  id: string;
  userId?: string;
  passageId: string;
  entryType: EnglishVocabularyEntryType;
  word: string;
  partOfSpeech: EnglishVocabularyPartOfSpeech;
  definition: string;
  exampleSentence: string;
  sourceArea: EnglishVocabularySourceArea;
  sourceQuestionId?: string;
  sourceOptionLabel?: string;
  sourceExcerpt: string;
  highlightText: string;
  sourceStart?: number;
  sourceEnd?: number;
  sourceParagraph?: number;
  aiGenerated: boolean;
  masteryStatus: EnglishVocabularyMasteryStatus;
  note: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnglishTrainingData {
  papers: EnglishPaper[];
  passages: EnglishPassage[];
  questions: EnglishQuestion[];
  attempts: EnglishAttempt[];
  vocabulary: EnglishVocabularyEntry[];
}

export const ENGLISH_TRAINING_YEARS = Array.from({ length: 20 }, (_, index) => 2026 - index);

export const englishSectionLabels: Record<EnglishSection, string> = {
  reading: "阅读",
  cloze: "完形",
  new_type: "新题型",
  translation: "翻译",
  writing: "写作",
};

export const englishPassageLabels: Record<EnglishPassageNo, string> = {
  text1: "Text 1",
  text2: "Text 2",
  text3: "Text 3",
  text4: "Text 4",
  cloze: "完形",
  new_type: "新题型",
  translation: "翻译",
  small_writing: "小作文",
  big_writing: "大作文",
};

export const englishVocabularyPartOfSpeechLabels: Record<EnglishVocabularyPartOfSpeech, string> = {
  n: "n.",
  v: "v.",
  adj: "adj.",
  adv: "adv.",
  prep: "prep.",
  conj: "conj.",
  phr: "phr.",
  other: "其他",
};

export const englishVocabularyEntryTypeLabels: Record<EnglishVocabularyEntryType, string> = {
  word: "生词",
  collocation: "固定搭配",
  familiar_meaning: "熟词生义",
};

export const englishVocabularyMasteryLabels: Record<EnglishVocabularyMasteryStatus, string> = {
  new: "新词",
  learning: "学习中",
  mastered: "已掌握",
};

export function isEnglishObjectiveSection(section: EnglishSection): boolean {
  return section === "reading" || section === "cloze" || section === "new_type";
}

export function normalizeEnglishObjectiveAnswer(answer: string): string {
  return answer
    .trim()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[，。；、,.，\s]/g, "")
    .toUpperCase();
}

export function getEnglishPassageTitle(passage: Pick<EnglishPassage, "year" | "section" | "passageNo" | "title">): string {
  const base = `${passage.year} ${englishSectionLabels[passage.section]} ${englishPassageLabels[passage.passageNo]}`;
  return passage.title ? `${base} · ${passage.title}` : base;
}
