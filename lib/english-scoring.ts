import { isEnglishObjectiveSection, normalizeEnglishObjectiveAnswer, type EnglishQuestion, type EnglishSection } from "./english-training.ts";

export const ENGLISH_MANUAL_SCORE_PREFIX = "__ASTEROID_MANUAL_SCORE__:";

export type EnglishObjectiveGrade = {
  questionId: string;
  isCorrect?: boolean;
  isManual?: boolean;
  score: number;
};

export function encodeEnglishManualScore(score: number): string {
  return `${ENGLISH_MANUAL_SCORE_PREFIX}${score}`;
}

export function parseEnglishManualScore(answer: string | undefined, maxScore: number): number | null {
  if (typeof answer !== "string" || !answer.startsWith(ENGLISH_MANUAL_SCORE_PREFIX)) return null;
  const score = Number(answer.slice(ENGLISH_MANUAL_SCORE_PREFIX.length));
  if (!Number.isFinite(score) || score < 0 || score > maxScore) return null;
  return Math.round(score * 100) / 100;
}

export function scoreEnglishObjectiveAnswers(
  section: EnglishSection,
  questions: Array<Pick<EnglishQuestion, "id" | "standardAnswer" | "score">>,
  answers: Record<string, string>,
): { grades: EnglishObjectiveGrade[]; score: number; maxScore: number } {
  if (!isEnglishObjectiveSection(section)) throw new Error("主观题不能生成 system_scored 分数");
  const grades = questions.map((question) => {
    const manualScore = parseEnglishManualScore(answers[question.id], question.score);
    if (manualScore !== null) {
      return { questionId: question.id, isManual: true, score: manualScore };
    }
    const expected = normalizeEnglishObjectiveAnswer(question.standardAnswer);
    const actual = normalizeEnglishObjectiveAnswer(answers[question.id] ?? "");
    const isCorrect = Boolean(expected && actual && expected === actual);
    return { questionId: question.id, isCorrect, score: isCorrect ? question.score : 0 };
  });
  return {
    grades,
    score: grades.reduce((sum, grade) => sum + grade.score, 0),
    maxScore: questions.reduce((sum, question) => sum + question.score, 0),
  };
}
