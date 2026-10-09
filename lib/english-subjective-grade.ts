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

/** Reject incomplete model responses instead of persisting a fabricated zero. */
export function parseEnglishSubjectiveGradeSuggestion(
  value: unknown,
  maxScore: number,
): EnglishSubjectiveGradeSuggestion {
  if (!isRecord(value)
    || typeof value.score !== "number"
    || !Number.isFinite(value.score)
    || value.score < 0
    || value.score > maxScore
    || typeof value.feedback !== "string"
    || !value.feedback.trim()) {
    throw new Error("AI 没有返回有效的分数和评语，请在任务中心重试。");
  }
  return normalizeEnglishSubjectiveGradeSuggestion(value, maxScore);
}

export function extractEnglishSubjectiveJobSuggestion(value: unknown): EnglishSubjectiveGradeSuggestion | null {
  if (!isRecord(value)) return null;
  let candidate = isRecord(value.suggestion) ? value.suggestion : null;
  if (!candidate && typeof value.revisionId === "string" && Array.isArray(value.ledgers)) {
    for (const ledger of value.ledgers.filter(isRecord)) {
      for (const round of (Array.isArray(ledger.rounds) ? ledger.rounds : []).filter(isRecord)) {
        const revision = (Array.isArray(round.revisions) ? round.revisions : []).filter(isRecord)
          .find((item) => item.id === value.revisionId);
        const grade = (Array.isArray(revision?.grades) ? revision.grades : []).filter(isRecord)
          .filter((item) => item.origin === "ai_suggested")
          .sort((left, right) => Number(right.gradeSeq) - Number(left.gradeSeq))[0];
        if (grade) candidate = { ...(isRecord(grade.breakdown) ? grade.breakdown : {}), ...grade };
      }
    }
  }
  if (!candidate || typeof candidate.maxScore !== "number" || !Number.isFinite(candidate.maxScore) || candidate.maxScore <= 0) return null;
  try { return parseEnglishSubjectiveGradeSuggestion(candidate, candidate.maxScore); }
  catch { return null; }
}
