import type { Math3ChapterAssignment, Math3ProblemClassifyInput } from "./math3-classification";
import type { Problem } from "./types";

const QUESTION_LIMIT = 1200;
const ANSWER_LIMIT = 500;
const OPTION_LIMIT = 500;

export type Math3ClassificationJobResult = {
  resultVersion: 1;
  sourceChecksum: string;
  scopeLabel: string;
  assignments: Math3ChapterAssignment[];
  problemIds: string[];
  tokensUsed: number;
  targetId: string;
};

function compact(value: string, limit: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= limit ? text : `${text.slice(0, limit)}...(已截断)`;
}

export function buildMath3ClassificationInputs(
  problems: Problem[],
  problemIds?: string[],
): Math3ProblemClassifyInput[] {
  const scopedIds = problemIds?.length ? new Set(problemIds) : null;
  return problems.flatMap((problem, index): Math3ProblemClassifyInput[] => {
    if (scopedIds && !scopedIds.has(problem.id)) return [];
    const question = compact(problem.question, QUESTION_LIMIT);
    if (!problem.id.trim() || !question) return [];
    return [{
      id: problem.id.trim().slice(0, 160),
      index: index + 1,
      type: problem.type.slice(0, 80),
      question,
      answer: compact(problem.answer, ANSWER_LIMIT),
      options: problem.options?.map((option, optionIndex) => ({
        label: compact(option.label || String.fromCharCode(65 + optionIndex), 20),
        content: compact(option.content, OPTION_LIMIT),
      })),
    }];
  });
}

function canonicalize(inputs: Math3ProblemClassifyInput[]): string {
  return JSON.stringify(inputs.map((input) => ({
    id: input.id,
    index: input.index,
    type: input.type,
    question: input.question,
    answer: input.answer ?? "",
    options: (input.options ?? []).map((option) => ({ label: option.label, content: option.content })),
  })));
}

export async function calculateMath3ClassificationChecksum(
  inputs: Math3ProblemClassifyInput[],
): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalize(inputs)));
  return Array.from(new Uint8Array(digest)).map((part) => part.toString(16).padStart(2, "0")).join("");
}
