import type { Problem, ProblemOption } from "@/lib/types";

const DEFAULT_CHOICE_OPTION_COUNT = 4;

export function createChoiceOptions(count = DEFAULT_CHOICE_OPTION_COUNT): ProblemOption[] {
  return Array.from({ length: count }, (_, index) => ({
    label: String.fromCharCode(65 + index),
    content: "",
  }));
}

export function ensureChoiceOptions(options?: ProblemOption[]): ProblemOption[] {
  const source = options && options.length > 0 ? options : createChoiceOptions();
  return source.map((option, index) => ({
    label: options && options.length > 0 ? String(option.label ?? "").trim() : String.fromCharCode(65 + index),
    content: String(option.content ?? ""),
  }));
}

export function normalizeProblemOptions(options?: ProblemOption[]): ProblemOption[] {
  return ensureChoiceOptions(options).map((option) => ({
    label: option.label.trim().toUpperCase(),
    content: option.content.trim(),
  }));
}

export function normalizeProblem(problem: Problem): Problem {
  return {
    ...problem,
    tips: problem.tips?.trim() ? problem.tips : undefined,
    options: problem.type === "choice" ? normalizeProblemOptions(problem.options) : undefined,
  };
}

export function normalizeProblemDraft(problem: Partial<Problem>): Partial<Problem> {
  return {
    ...problem,
    tips: problem.tips?.trim() ? problem.tips : undefined,
    options: problem.type === "choice" ? normalizeProblemOptions(problem.options) : undefined,
  };
}

export function getProblemValidationIssues(problem: Partial<Problem>): string[] {
  const issues: string[] = [];

  if (!problem.question?.trim()) {
    issues.push("题目内容不能为空");
  }

  if (problem.type === "choice") {
    const options = problem.options ?? [];
    const labels = options.map((option) => String(option.label ?? "").trim().toUpperCase());

    if (options.length < 2) {
      issues.push("选择题至少需要 2 个选项");
    }

    if (labels.some((label) => !label)) {
      issues.push("选择题选项标签不能为空");
    }

    if (options.some((option) => !String(option.content ?? "").trim())) {
      issues.push("选择题选项内容不能为空");
    }

    const duplicateLabel = labels.find((label, index) => label && labels.indexOf(label) !== index);
    if (duplicateLabel) {
      issues.push(`选择题选项标签不能重复：${duplicateLabel}`);
    }
  }

  return issues;
}

export function getProblemsValidationIssues(problems: Problem[]): Array<{ index: number; issues: string[] }> {
  return problems
    .map((problem, index) => ({ index, issues: getProblemValidationIssues(problem) }))
    .filter((result) => result.issues.length > 0);
}
