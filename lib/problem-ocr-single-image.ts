import type { Problem } from "./types.ts";

/** One uploaded image is one question, including every numbered subquestion. */
export function mergeSingleImageProblems<T extends Partial<Problem>>(problems: T[], ocrText: string): T[] {
  if (problems.length <= 1) return problems;
  const sections = problems.map((problem, index) => {
    const options = problem.options?.map((option) => `${option.label}. ${option.content}`).join("\n");
    return `（${index + 1}）${problem.question ?? ""}${options ? `\n${options}` : ""}`;
  });
  const answers = problems.map((problem, index) => problem.answer?.trim() ? `（${index + 1}）${problem.answer.trim()}` : "").filter(Boolean);
  return [{
    ...problems[0],
    type: problems.every((problem) => problem.type === "proof") ? "proof"
      : problems.every((problem) => problem.type === "proofEssay") ? "proofEssay" : "calculation",
    question: ocrText.trim() || sections.join("\n\n"),
    answer: answers.join("\n\n"),
    options: undefined,
    explanation: problems.map((problem) => problem.explanation?.trim()).filter(Boolean).join("\n\n"),
    difficulty: problems.some((problem) => problem.difficulty === "hard") ? "hard" : problems[0].difficulty,
    chapterId: problems.every((problem) => problem.chapterId === problems[0].chapterId) ? problems[0].chapterId : undefined,
  }];
}
