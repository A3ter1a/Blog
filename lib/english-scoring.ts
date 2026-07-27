import { isEnglishObjectiveSection, normalizeEnglishObjectiveAnswer, type EnglishQuestion, type EnglishSection } from "./english-training.ts";

export type EnglishObjectiveGrade = {
  questionId: string;
  isCorrect: boolean;
  score: number;
};

export function scoreEnglishObjectiveAnswers(
  section: EnglishSection,
  questions: Array<Pick<EnglishQuestion, "id" | "standardAnswer" | "score">>,
  answers: Record<string, string>,
): { grades: EnglishObjectiveGrade[]; score: number; maxScore: number } {
  if (!isEnglishObjectiveSection(section)) throw new Error("主观题不能生成 system_scored 分数");
  const grades = questions.map((question) => {
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
