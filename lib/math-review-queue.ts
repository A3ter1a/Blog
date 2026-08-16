export const MATH_MANUAL_REVIEW_QUEUE_STORAGE_KEY = "asteroid:math-manual-review-queue:v1";
export const MAX_MATH_MANUAL_REVIEW_ITEMS = 240;

export type MathManualReviewEntry = {
  practiceKey: string;
  noteId: string;
  problemId: string;
  problemNumber: number;
  noteTitle: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeMathManualReviewQueue(value: unknown): MathManualReviewEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item): MathManualReviewEntry[] => {
    if (!isRecord(item)) return [];
    const practiceKey = typeof item.practiceKey === "string" ? item.practiceKey.trim() : "";
    const noteId = typeof item.noteId === "string" ? item.noteId.trim() : "";
    const problemId = typeof item.problemId === "string" ? item.problemId.trim() : "";
    const problemNumber = typeof item.problemNumber === "number" && Number.isInteger(item.problemNumber)
      ? item.problemNumber
      : 0;
    const noteTitle = typeof item.noteTitle === "string" ? item.noteTitle.trim().slice(0, 200) : "";
    if (!practiceKey || !noteId || !problemId || problemNumber < 1 || !noteTitle || seen.has(practiceKey)) return [];
    seen.add(practiceKey);
    return [{ practiceKey, noteId, problemId, problemNumber, noteTitle }];
  }).slice(0, MAX_MATH_MANUAL_REVIEW_ITEMS);
}

export function parseMathProblemNumbers(value: string, max: number): number[] {
  if (!Number.isInteger(max) || max < 1) return [];
  const selected: number[] = [];
  for (const match of value.matchAll(/(\d+\s*-\s*\d+|\d+)/g)) {
    const token = match[1] ?? "";
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Math.max(1, Math.min(max, Number(range[1])));
      const end = Math.max(start, Math.min(max, Number(range[2])));
      for (let number = start; number <= end && selected.length < 120; number += 1) selected.push(number);
      continue;
    }
    const number = Number(token);
    if (number >= 1 && number <= max) selected.push(number);
  }
  return Array.from(new Set(selected)).slice(0, 120);
}

export function mergeMathManualReviewQueue(
  current: MathManualReviewEntry[],
  additions: MathManualReviewEntry[],
): MathManualReviewEntry[] {
  return normalizeMathManualReviewQueue([...current, ...additions]);
}

export function removeMathManualReviewEntry(
  current: MathManualReviewEntry[],
  practiceKey: string,
): MathManualReviewEntry[] {
  return current.filter((entry) => entry.practiceKey !== practiceKey);
}
