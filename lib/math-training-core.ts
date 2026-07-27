export type MathTrainingPersistenceMode = "local" | "shared";

export type MathPaperSummary = {
  id: string;
  examYear: number;
  paperCode: "math_1" | "math_2" | "math_3";
  title: string;
  sourceChecksum: string;
  problemCount: number;
  maxScore: number;
};

export type MathGradeSourceProblem = {
  problemId: string;
  problemNo: number;
  prompt: string;
  standardAnswer: string;
  scoringRubric: unknown;
  maxScore: number;
};

export type MathGradeStep = {
  problemId: string;
  criterion: string;
  earnedScore: number;
  maxScore: number;
  deductionReason: string | null;
};

export type MathGradeSuggestion = {
  score: number;
  maxScore: number;
  feedback: string;
  strengths: string[];
  issues: string[];
  suggestions: string[];
  confidence: number;
  steps: MathGradeStep[];
};

export type MathOcrConfirmationPageInput = {
  pageNo: number;
  fileName: string;
  sourceFingerprint: string;
  rawText: string;
  confirmedText: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function boundedText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item): string[] => {
      const text = boundedText(item, 500);
      return text ? [text] : [];
    }).slice(0, 20)
    : [];
}

export function buildMathOcrConfirmationPayload(pages: MathOcrConfirmationPageInput[]) {
  if (pages.length === 0) throw new Error("至少需要一页已确认 OCR 文本");
  const ordered = [...pages].sort((left, right) => left.pageNo - right.pageNo);
  const pageNos = new Set<number>();
  for (const page of ordered) {
    if (!Number.isInteger(page.pageNo) || page.pageNo < 1 || pageNos.has(page.pageNo)) {
      throw new Error("OCR 页码必须从 1 开始且不能重复");
    }
    if (!page.fileName.trim() || !page.sourceFingerprint.trim() || !page.rawText.trim() || !page.confirmedText.trim()) {
      throw new Error(`第 ${page.pageNo} 页缺少原图指纹、原始文本或确认文本`);
    }
    pageNos.add(page.pageNo);
  }

  return {
    rawPayload: {
      pages: ordered.map((page) => ({
        pageNo: page.pageNo,
        fileName: page.fileName.trim(),
        sourceFingerprint: page.sourceFingerprint.trim(),
        text: page.rawText.trim(),
      })),
    },
    confirmedPayload: {
      pages: ordered.map((page) => ({
        pageNo: page.pageNo,
        fileName: page.fileName.trim(),
        sourceFingerprint: page.sourceFingerprint.trim(),
        text: page.confirmedText.trim(),
      })),
    },
  };
}

export function normalizeMathGradeSuggestion(
  value: unknown,
  sourceProblems: MathGradeSourceProblem[],
): MathGradeSuggestion {
  if (!isRecord(value)) throw new Error("数学评分没有返回有效 JSON 对象");
  if (sourceProblems.length === 0) throw new Error("数学真题缺少固定题目和评分细则");
  const sourceById = new Map(sourceProblems.map((problem) => [problem.problemId, problem]));
  const rawSteps = Array.isArray(value.steps) ? value.steps : [];
  const steps = rawSteps.flatMap((item): MathGradeStep[] => {
    if (!isRecord(item)) return [];
    const problemId = boundedText(item.problemId, 80);
    const problem = sourceById.get(problemId);
    const criterion = boundedText(item.criterion, 500);
    const earned = finiteNumber(item.earnedScore);
    const max = finiteNumber(item.maxScore);
    if (!problem || !criterion || earned === null || max === null || max <= 0) return [];
    return [{
      problemId,
      criterion,
      earnedScore: Math.min(max, Math.max(0, earned)),
      maxScore: max,
      deductionReason: boundedText(item.deductionReason, 1000) || null,
    }];
  });
  if (steps.length !== rawSteps.length || steps.length === 0) {
    throw new Error("数学评分步骤缺失或格式无效，不能进入确认环节");
  }

  for (const problem of sourceProblems) {
    const problemSteps = steps.filter((step) => step.problemId === problem.problemId);
    const stepMax = problemSteps.reduce((sum, step) => sum + step.maxScore, 0);
    if (problemSteps.length === 0 || Math.abs(stepMax - problem.maxScore) > 0.0001) {
      throw new Error(`第 ${problem.problemNo} 题评分步骤没有完整覆盖 ${problem.maxScore} 分`);
    }
  }

  const maxScore = sourceProblems.reduce((sum, problem) => sum + problem.maxScore, 0);
  const score = steps.reduce((sum, step) => sum + step.earnedScore, 0);
  const feedback = boundedText(value.feedback, 5000);
  if (!feedback) throw new Error("数学评分缺少总评");
  const confidence = finiteNumber(value.confidence);

  return {
    score,
    maxScore,
    feedback,
    strengths: stringList(value.strengths),
    issues: stringList(value.issues),
    suggestions: stringList(value.suggestions),
    confidence: Math.min(1, Math.max(0, confidence ?? 0)),
    steps,
  };
}

export function parseMathGradeSource(value: unknown): {
  confirmationId: string;
  confirmedPayload: Record<string, unknown>;
  problems: MathGradeSourceProblem[];
  examYear?: number;
  paperCode?: string;
} {
  if (!isRecord(value) || !isRecord(value.confirmedPayload) || !isRecord(value.sourceSnapshot)) {
    throw new Error("数学评分来源不完整");
  }
  const confirmationId = boundedText(value.confirmationId, 80);
  const sourceSnapshot = value.sourceSnapshot;
  const problems = Array.isArray(sourceSnapshot.problems)
    ? sourceSnapshot.problems.flatMap((item): MathGradeSourceProblem[] => {
      if (!isRecord(item)) return [];
      const problemId = boundedText(item.problemId, 80);
      const problemNo = finiteNumber(item.problemNo);
      const maxScore = finiteNumber(item.maxScore);
      const prompt = boundedText(item.prompt, 100_000);
      const standardAnswer = boundedText(item.standardAnswer, 100_000);
      if (!problemId || problemNo === null || maxScore === null || maxScore <= 0 || !prompt || !standardAnswer) return [];
      return [{
        problemId,
        problemNo,
        prompt,
        standardAnswer,
        scoringRubric: item.scoringRubric,
        maxScore,
      }];
    })
    : [];
  if (!confirmationId || problems.length === 0) throw new Error("数学评分来源缺少确认 ID 或固定题目");
  return {
    confirmationId,
    confirmedPayload: value.confirmedPayload,
    problems,
    examYear: finiteNumber(sourceSnapshot.examYear) ?? undefined,
    paperCode: boundedText(sourceSnapshot.paperCode, 40) || undefined,
  };
}

export function normalizeMathPaperSummaries(value: unknown): MathPaperSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): MathPaperSummary[] => {
    if (!isRecord(item)) return [];
    const id = boundedText(item.id, 80);
    const examYear = finiteNumber(item.examYear);
    const paperCode = item.paperCode;
    const sourceChecksum = boundedText(item.sourceChecksum, 64);
    const title = boundedText(item.title, 500);
    if (!id || examYear === null || !title || sourceChecksum.length !== 64
      || (paperCode !== "math_1" && paperCode !== "math_2" && paperCode !== "math_3")) return [];
    return [{
      id,
      examYear,
      paperCode,
      title,
      sourceChecksum,
      problemCount: finiteNumber(item.problemCount) ?? 0,
      maxScore: finiteNumber(item.maxScore) ?? 0,
    }];
  });
}
