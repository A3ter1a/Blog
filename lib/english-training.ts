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

export interface EnglishNewTypePresentation {
  body: string;
  choices: EnglishQuestionOption[];
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

const ENGLISH_NEW_TYPE_KIND_BY_YEAR: Partial<Record<number, EnglishNewTypeKind>> = {
  2007: "heading",
  2008: "ordering",
  2009: "insertion",
  2010: "ordering",
  2011: "ordering",
  2012: "insertion",
  2013: "insertion",
  2014: "ordering",
  2015: "insertion",
  2016: "heading",
  2017: "ordering",
  2018: "ordering",
  2019: "ordering",
  2020: "heading",
  2021: "insertion",
  2022: "insertion",
  2023: "ordering",
  2024: "statement_matching",
  2025: "ordering",
  2026: "ordering",
};

/**
 * The database keeps the original exam section name for compatibility. The
 * three new-question formats are therefore inferred from the imported
 * directions instead of adding another database column.
 */
export function getEnglishNewTypeKind(content: string, context = "", year?: number): EnglishNewTypeKind {
  const normalized = `${content} ${context}`.toLowerCase().replace(/\s+/g, " ");
  if (/comments on an article|statements summarizing the comments|choose the best statement .* numbered name|观点匹配/.test(normalized)) return "statement_matching";
  if (/wrong order|reorganize (?:these )?paragraphs|paragraphs .* order|most suitable paragraphs .* coherent text|段落排序/.test(normalized)) return "ordering";
  if (/subheading|list of headings|choose a heading|most suitable heading|段落匹配标题/.test(normalized)) return "heading";
  if (typeof year === "number" && ENGLISH_NEW_TYPE_KIND_BY_YEAR[year]) return ENGLISH_NEW_TYPE_KIND_BY_YEAR[year] as EnglishNewTypeKind;
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

type EnglishNewTypeChoiceMarker = {
  label: string;
  start: number;
  end: number;
};

function findNewTypeChoiceMarkers(content: string): EnglishNewTypeChoiceMarker[] {
  const markers: EnglishNewTypeChoiceMarker[] = [];
  const pattern = /(?:^|\s)(?:\[([A-H])\]|([A-H])\.)\s*/g;
  for (const match of content.matchAll(pattern)) {
    const label = match[1] ?? match[2];
    if (!label) continue;
    const leadingWhitespace = match[0].length - match[0].trimStart().length;
    markers.push({
      label,
      start: (match.index ?? 0) + leadingWhitespace,
      end: (match.index ?? 0) + match[0].length,
    });
  }
  return markers;
}

function findNewTypeChoiceRun(content: string): EnglishNewTypeChoiceMarker[] {
  const markers = findNewTypeChoiceMarkers(content);
  for (let start = 0; start < markers.length; start += 1) {
    const run = [markers[start]];
    for (let index = start + 1; index < markers.length; index += 1) {
      const previous = run[run.length - 1];
      if (markers[index].label.charCodeAt(0) !== previous.label.charCodeAt(0) + 1) break;
      run.push(markers[index]);
    }
    if (run.length >= 5 && run[0].label === "A") return run;
  }
  return [];
}

function normalizeNewTypeChoiceText(value: string): string {
  return value
    .replace(/\(\s*\)\s*-?\s*11\s*-\s*\(\s*14\s*\)/gi, "")
    .replace(/-\s*11\s*-\s*\(\s*14\s*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNewTypeBodyText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function trimContaminatedHeadingChoice(value: string): { content: string; bodyStart: string } {
  const normalized = normalizeNewTypeChoiceText(value);
  if (!normalized) return { content: "", bodyStart: "" };

  const firstSentenceEnd = normalized.search(/[.!?](?=\s|$)/);
  const searchLimit = firstSentenceEnd >= 0 ? firstSentenceEnd : normalized.length;
  const titleCaseBoundaries = [...normalized.slice(0, searchLimit).matchAll(/\s+(?=[A-Z][a-z]+\s+[A-Z][a-z]+)/g)]
    .map((match) => match.index ?? -1)
    .filter((index) => index >= 14);
  const lowerCaseSentenceBoundaries = [...normalized.slice(0, searchLimit).matchAll(/\s+(?=[A-Z][a-z]+\s+[a-z]+)/g)]
    .map((match) => match.index ?? -1)
    .filter((index) => index >= 14);
  const boundary = (titleCaseBoundaries.length > 0 ? titleCaseBoundaries : lowerCaseSentenceBoundaries).at(-1);
  if (boundary === undefined) return { content: normalized, bodyStart: "" };
  return {
    content: normalized.slice(0, boundary).trim(),
    bodyStart: normalized.slice(boundary).trim(),
  };
}

function parseNewTypeChoicesFromContent(content: string, markers: EnglishNewTypeChoiceMarker[]): EnglishQuestionOption[] {
  return markers.map((marker, index) => ({
    label: marker.label,
    content: normalizeNewTypeChoiceText(content.slice(marker.end, markers[index + 1]?.start ?? content.length)),
  }));
}

function findChoiceContentEnd(content: string, markerEnd: number, choiceContent: string): number | null {
  const normalized = choiceContent.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const match = new RegExp(escaped).exec(content.slice(markerEnd));
  return match ? markerEnd + match.index + match[0].length : null;
}

/**
 * Separate the answer bank from the reading body. OCR exports place the bank
 * at the beginning for heading questions, at the end for insertion/matching,
 * and sometimes use the whole set of paragraphs as an ordering question.
 */
export function getEnglishNewTypePresentation(
  content: string,
  kind: EnglishNewTypeKind,
  importedChoices: EnglishQuestionOption[] = [],
): EnglishNewTypePresentation {
  const cleaned = cleanEnglishPassageContent("new_type", content);
  const choiceRun = findNewTypeChoiceRun(cleaned);
  const parsedChoices = choiceRun.length > 0 ? parseNewTypeChoicesFromContent(cleaned, choiceRun) : [];
  const choices = (importedChoices.length > 0 ? importedChoices : parsedChoices).map((choice) => {
    const trimmed = kind === "heading" ? trimContaminatedHeadingChoice(choice.content).content : normalizeNewTypeChoiceText(choice.content);
    return { label: choice.label.trim(), content: trimmed };
  }).filter((choice) => choice.label && choice.content);

  if (kind === "ordering") {
    return { body: "", choices };
  }
  if (choiceRun.length === 0) {
    return { body: cleaned, choices };
  }

  const beforeChoices = normalizeNewTypeBodyText(cleaned.slice(0, choiceRun[0].start));
  const lastChoice = importedChoices.at(-1)?.content ?? parsedChoices.at(-1)?.content ?? "";
  const choiceEnd = findChoiceContentEnd(cleaned, choiceRun[choiceRun.length - 1].end, lastChoice)
    ?? choiceRun[choiceRun.length - 1].end;
  const afterChoices = normalizeNewTypeBodyText(cleaned.slice(choiceEnd));
  // Some years print the bank after the article (2007/2016/2020), while
  // paragraph-insertion papers print it before the article. Keep whichever
  // side is the actual passage and never leave A-G mixed into the body.
  const body = [beforeChoices, afterChoices].filter(Boolean).join("\n\n").trim();
  return { body, choices };
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

export interface EnglishPromptImage {
  src: string;
  alt: string;
}

const ENGLISH_PROMPT_IMAGE_PATTERN = /!\[([^\]]*)\]\((data:image\/[a-z0-9.+-]+;base64,[^)\s]+|https?:\/\/[^)\s]+|\/[^)\s]+)\)/gi;

export function extractEnglishPromptImages(content: string): EnglishPromptImage[] {
  return [...content.matchAll(ENGLISH_PROMPT_IMAGE_PATTERN)].map((match) => ({
    alt: match[1]?.trim() || "作文题目原图",
    src: match[2],
  }));
}

export function removeEnglishPromptImages(content: string): string {
  return content.replace(ENGLISH_PROMPT_IMAGE_PATTERN, "").replace(/\n{3,}/g, "\n\n").trim();
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
