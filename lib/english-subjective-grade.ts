export type EnglishSubjectiveGradeSuggestion = {
  score: number;
  maxScore: number;
  feedback: string;
  strengths: string[];
  issues: string[];
  suggestions: string[];
  confidence: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringList(value: unknown, limit = 8): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim().slice(0, 500)] : []).slice(0, limit)
    : [];
}

function clamp(value: unknown, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

export function normalizeEnglishSubjectiveGradeSuggestion(
  value: unknown,
  maxScore: number,
): EnglishSubjectiveGradeSuggestion {
  const record = isRecord(value) ? value : {};
  const safeMax = Math.max(0, maxScore);
  const strengths = stringList(record.strengths);
  const issues = stringList(record.issues);
  const suggestions = stringList(record.suggestions);
  const fallbackFeedback = [...strengths, ...issues, ...suggestions].join("；") || "AI 已给出建议，请人工核对后确认终分。";
  const feedback = typeof record.feedback === "string" && record.feedback.trim()
    ? record.feedback.trim().slice(0, 20_000)
    : fallbackFeedback;

  return {
    score: Number(clamp(record.score, 0, safeMax).toFixed(1)),
    maxScore: safeMax,
    feedback,
    strengths,
    issues,
    suggestions,
    confidence: Number(clamp(record.confidence, 0, 1).toFixed(2)),
  };
}

export function buildEnglishSubjectiveGradeBreakdown(suggestion: EnglishSubjectiveGradeSuggestion) {
  return {
    confidence: suggestion.confidence,
    strengths: suggestion.strengths,
    issues: suggestion.issues,
    suggestions: suggestion.suggestions,
  };
}
