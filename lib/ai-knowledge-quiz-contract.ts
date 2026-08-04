import { createHash } from "node:crypto";

export const AI_KNOWLEDGE_QUIZ_SELF_CHECK_VERSION = "ai-knowledge-quiz-self-check-v1";
export const AI_KNOWLEDGE_QUIZ_MAX_ITEMS = 80;
export const AI_KNOWLEDGE_QUIZ_MAX_QUESTION_CHARS = 4_000;
export const AI_KNOWLEDGE_QUIZ_MAX_EXPLANATION_CHARS = 6_000;

export type AiKnowledgeQuizStatus =
  | "draft"
  | "self_checked"
  | "pending_review"
  | "changes_requested"
  | "approved"
  | "published"
  | "rejected";

export type AiKnowledgeQuizItemType =
  | "single_choice"
  | "multiple_choice"
  | "true_false"
  | "short_answer";

export type AiKnowledgeQuizDifficulty = "easy" | "medium" | "hard";

export type AiKnowledgeQuizOption = {
  label: string;
  text: string;
};

export type AiKnowledgeQuizItemDraft = {
  id?: string;
  ordinal?: number;
  itemType: AiKnowledgeQuizItemType;
  question: string;
  options?: AiKnowledgeQuizOption[];
  answer: string | string[] | boolean;
  explanation: string;
  knowledgePoints?: string[];
  difficulty?: AiKnowledgeQuizDifficulty;
  sourceHeading?: string;
};

export type AiKnowledgeQuizItem = Omit<Required<AiKnowledgeQuizItemDraft>, "id" | "ordinal" | "options" | "knowledgePoints" | "difficulty" | "sourceHeading"> & {
  id: string;
  ordinal: number;
  options: AiKnowledgeQuizOption[];
  knowledgePoints: string[];
  difficulty: AiKnowledgeQuizDifficulty;
  sourceHeading: string | null;
};

export type AiKnowledgeQuizItemPublic = Omit<AiKnowledgeQuizItem, "answer" | "explanation">;

export type AiKnowledgeQuizIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  ordinal?: number;
};

export type AiKnowledgeQuizSelfCheck = {
  version: typeof AI_KNOWLEDGE_QUIZ_SELF_CHECK_VERSION;
  passed: boolean;
  checkedAt?: string;
  itemCount: number;
  checks: {
    structure: boolean;
    answerCoverage: boolean;
    explanationCoverage: boolean;
  };
  issues: AiKnowledgeQuizIssue[];
};

export type AiKnowledgeQuizSelfCheckResult = {
  items: AiKnowledgeQuizItem[];
  selfCheck: AiKnowledgeQuizSelfCheck;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim().slice(0, maxLength) : "";
}

function cleanKnowledgePoints(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 12)));
}

function cleanOptions(value: unknown): AiKnowledgeQuizOption[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).flatMap((item) => {
    if (!isRecord(item)) return [];
    const label = cleanText(item.label, 8);
    const text = cleanText(item.text ?? item.content, 500);
    return label && text ? [{ label, text }] : [];
  });
}

function normalizeAnswer(itemType: AiKnowledgeQuizItemType, value: unknown): string | string[] | boolean | null {
  if (itemType === "true_false") {
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "正确") return true;
    if (value === "false" || value === "错误") return false;
    return null;
  }

  if (itemType === "multiple_choice") {
    if (!Array.isArray(value)) return null;
    const answers = Array.from(new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)));
    return answers.length > 0 ? answers.slice(0, 8) : null;
  }

  if (typeof value !== "string") return null;
  const answer = value.trim().slice(0, 1_000);
  return answer || null;
}

function hasOptionLabel(options: AiKnowledgeQuizOption[], answer: string): boolean {
  return options.some((option) => option.label === answer);
}

function normalizeItem(value: unknown, ordinal: number): { item: AiKnowledgeQuizItem; issues: AiKnowledgeQuizIssue[] } {
  const record = isRecord(value) ? value : {};
  const rawType = record.itemType ?? record.type;
  const itemType: AiKnowledgeQuizItemType = rawType === "multiple_choice"
    || rawType === "true_false"
    || rawType === "short_answer"
    ? rawType
    : "single_choice";
  const options = cleanOptions(record.options);
  const answer = normalizeAnswer(itemType, record.answer);
  const question = cleanText(record.question, AI_KNOWLEDGE_QUIZ_MAX_QUESTION_CHARS);
  const explanation = cleanText(record.explanation, AI_KNOWLEDGE_QUIZ_MAX_EXPLANATION_CHARS);
  const issues: AiKnowledgeQuizIssue[] = [];

  if (!question) issues.push({ code: "missing_question", severity: "error", message: `第 ${ordinal} 题缺少题干。`, ordinal });
  if (!explanation) issues.push({ code: "missing_explanation", severity: "error", message: `第 ${ordinal} 题缺少解析。`, ordinal });
  if (itemType === "single_choice" && options.length < 2) {
    issues.push({ code: "choice_options_too_few", severity: "error", message: `第 ${ordinal} 题至少需要两个选项。`, ordinal });
  }
  if (itemType === "multiple_choice" && options.length < 2) {
    issues.push({ code: "multiple_choice_options_too_few", severity: "error", message: `第 ${ordinal} 题至少需要两个选项。`, ordinal });
  }
  if (answer === null) {
    issues.push({ code: "missing_answer", severity: "error", message: `第 ${ordinal} 题缺少可判定答案。`, ordinal });
  } else if (itemType === "single_choice" && typeof answer === "string" && !hasOptionLabel(options, answer)) {
    issues.push({ code: "answer_option_missing", severity: "error", message: `第 ${ordinal} 题答案不对应现有选项。`, ordinal });
  } else if (itemType === "multiple_choice" && Array.isArray(answer) && answer.some((item) => !hasOptionLabel(options, item))) {
    issues.push({ code: "multiple_answer_option_missing", severity: "error", message: `第 ${ordinal} 题存在不对应选项的答案。`, ordinal });
  }

  const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : `draft-${ordinal}`;
  return {
    item: {
      id,
      ordinal,
      itemType,
      question,
      options,
      answer: answer ?? "",
      explanation,
      knowledgePoints: cleanKnowledgePoints(record.knowledgePoints ?? record.knowledge_points),
      difficulty: record.difficulty === "easy" || record.difficulty === "hard" ? record.difficulty : "medium",
      sourceHeading: cleanText(record.sourceHeading ?? record.source_heading, 240) || null,
    },
    issues,
  };
}

export function runAiKnowledgeQuizSelfCheck(value: unknown): AiKnowledgeQuizSelfCheckResult {
  const rawItems = Array.isArray(value) ? value : [];
  const limitedItems = rawItems.slice(0, AI_KNOWLEDGE_QUIZ_MAX_ITEMS);
  const normalized = limitedItems.map((item, index) => normalizeItem(item, index + 1));
  const items = normalized.map(({ item }) => item);
  const issues = normalized.flatMap(({ issues: itemIssues }) => itemIssues);

  if (!Array.isArray(value)) {
    issues.push({ code: "items_not_array", severity: "error", message: "快测题目必须是数组。" });
  }
  if (rawItems.length === 0) {
    issues.push({ code: "empty_quiz", severity: "error", message: "至少需要一题知识点快测。" });
  }
  if (rawItems.length > AI_KNOWLEDGE_QUIZ_MAX_ITEMS) {
    issues.push({ code: "too_many_items", severity: "error", message: `单个快测最多 ${AI_KNOWLEDGE_QUIZ_MAX_ITEMS} 题。` });
  }
  if (items.some((item) => item.knowledgePoints.length === 0)) {
    issues.push({ code: "missing_knowledge_point", severity: "warning", message: "部分题目没有标注知识点，审核时请补充。" });
  }

  const hasErrors = issues.some((issue) => issue.severity === "error");
  return {
    items,
    selfCheck: {
      version: AI_KNOWLEDGE_QUIZ_SELF_CHECK_VERSION,
      passed: items.length > 0 && !hasErrors,
      itemCount: items.length,
      checks: {
        structure: !issues.some((issue) => issue.code.includes("question") || issue.code.includes("options") || issue.code === "items_not_array"),
        answerCoverage: !issues.some((issue) => issue.code.includes("answer")),
        explanationCoverage: !issues.some((issue) => issue.code === "missing_explanation"),
      },
      issues,
    },
  };
}

export function toPublicAiKnowledgeQuizItem(item: AiKnowledgeQuizItem): AiKnowledgeQuizItemPublic {
  return Object.fromEntries(
    Object.entries(item).filter(([key]) => key !== "answer" && key !== "explanation"),
  ) as AiKnowledgeQuizItemPublic;
}

export function canonicalAiKnowledgeQuizPayload(items: AiKnowledgeQuizItem[]): string {
  return JSON.stringify(items.map((item) => ({
    ordinal: item.ordinal,
    itemType: item.itemType,
    question: item.question,
    options: item.options,
    answer: item.answer,
    explanation: item.explanation,
    knowledgePoints: item.knowledgePoints,
    difficulty: item.difficulty,
    sourceHeading: item.sourceHeading,
  })));
}

export function checksumAiKnowledgeQuiz(items: AiKnowledgeQuizItem[]): string {
  return createHash("sha256").update(canonicalAiKnowledgeQuizPayload(items), "utf8").digest("hex");
}

export function answersEqual(expected: AiKnowledgeQuizItem["answer"], actual: unknown): boolean {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    return [...new Set(actual.filter((item): item is string => typeof item === "string").map((item) => item.trim()))].sort().join("\u0000")
      === [...expected].sort().join("\u0000");
  }
  if (typeof expected === "boolean") return actual === expected || (expected && actual === "true") || (!expected && actual === "false");
  return typeof actual === "string" && actual.trim().toLowerCase() === expected.trim().toLowerCase();
}
