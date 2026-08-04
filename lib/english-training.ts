export type EnglishPaperType = "english1";
export type EnglishSection = "reading" | "cloze" | "new_type" | "translation" | "writing";
export type EnglishNewTypeKind = "heading" | "insertion" | "ordering" | "statement_matching";
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

export interface EnglishQuestionOption {
  label: string;
  content: string;
}

export function normalizeEnglishQuestionOptions(value: unknown): EnglishQuestionOption[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    return typeof record.label === "string" && typeof record.content === "string"
      ? [{ label: record.label, content: record.content }]
      : [];
  });
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

export interface EnglishTrainingData {
  papers: EnglishPaper[];
  passages: EnglishPassage[];
  questions: EnglishQuestion[];
  attempts: EnglishAttempt[];
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

export function isEnglishObjectiveSection(section: EnglishSection): boolean {
  return section === "reading" || section === "cloze" || section === "new_type";
}

/**
 * The database keeps the original exam section name for compatibility. The
 * three new-question formats are therefore inferred from the imported
 * directions instead of adding another database column.
 */
export function getEnglishNewTypeKind(content: string): EnglishNewTypeKind {
  const normalized = content.toLowerCase().replace(/\s+/g, " ");
  if (/comments on an article|statements summarizing the comments|choose the best statement .* numbered name/.test(normalized)) return "statement_matching";
  if (/wrong order|reorganize (?:these )?paragraphs|paragraphs .* order/.test(normalized)) return "ordering";
  if (/subheading|list of headings|choose a heading|most suitable heading/.test(normalized)) return "heading";
  return "insertion";
}

function stripImportedDirections(content: string): string {
  return content.replace(
    /^(?:directions?|read the following|(?:in\s+)?the following|for questions|you are going to read)[\s\S]*?(?:\(\s*\d+\s+points?\s*\)|on\s+answer\s+sheet(?:\s+\d+)?\.?(?:\s*\(\s*\d+\s+points?\s*\))?)\s*/i,
    "",
  );
}

function stripImportedAnswerKey(content: string): string {
  return content.replace(
    /\s+41\.\s*(?:[A-H]\s*)?42\.\s*(?:[A-H]\s*)?43\.\s*(?:[A-H]\s*)?44\.\s*(?:[A-H]\s*)?45\.\s*(?:[A-H]\s*)?$/i,
    "",
  );
}

/** Remove OCR instructions, page footers and answer-key tails before display. */
export function cleanEnglishPassageContent(section: EnglishSection, content: string): string {
  let cleaned = content
    .replace(/\r\n?/g, "\n")
    .replace(/\(\s*\)\s*-?\s*11\s*-\s*\(\s*14\s*\)/gi, "")
    .replace(/-\s*11\s*-\s*\(\s*14\s*\)/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (section === "cloze" || section === "new_type" || section === "translation") {
    cleaned = stripImportedDirections(cleaned);
  }
  if (section === "new_type") {
    cleaned = stripImportedAnswerKey(cleaned);
  }
  if (section === "writing") {
    cleaned = cleaned
      .replace(/^\s*\d{2}\.\s*/i, "")
      .replace(/\s+Part\s+[AB]\s*$/i, "")
      .trim();
  }

  return cleaned
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function hasEnglishPassageOriginal(section: EnglishSection, content: string): boolean {
  const cleaned = cleanEnglishPassageContent(section, content);
  if (!cleaned) return false;
  if (section !== "cloze") return true;

  const blankNumbers = new Set(
    [...cleaned.matchAll(/(?<!\w)(\d{1,2})(?!\w)/g)]
      .map((match) => Number(match[1]))
      .filter((number) => number >= 1 && number <= 20),
  );
  return blankNumbers.size >= 10;
}

export function cleanEnglishQuestionStem(section: EnglishSection, questionNo: string, stem: string): string {
  let cleaned = stem.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (section === "writing") {
    cleaned = cleaned.replace(new RegExp(`^${questionNo}\\.\\s*`, "i"), "");
    cleaned = cleaned.replace(/\s+Part\s+[AB]\s*$/i, "").trim();
  }
  return cleaned;
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
