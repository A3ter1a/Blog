import type {
  Math3SelfTestPaper,
  Math3SelfTestMode,
  Math3SelfTestQuestion,
  Math3SelfTestQuestionPlanItem,
} from "./math3-self-test";

export const MATH3_REAL_PAPER_PROFILE = {
  version: "math3-2021-2026-structure-v2",
  label: "2021—2026 数学三真题结构",
  description: "10 道选择题、6 道填空题、6 道解答题，共 22 题 150 分；按真题题号分布控制学科位置和难度曲线。",
} as const;

export const MATH3_QUICK_PAPER_PROFILE = {
  version: "math3-2021-2026-sampled-structure-v2",
  label: "2021—2026 数学三真题比例小卷",
  description: "从近年真题题型、学科位置和难度曲线中按比例抽取 8 题，组成 50 分训练小卷。",
} as const;

export function getMath3RealPaperProfile(mode: Math3SelfTestMode) {
  return mode === "full" ? MATH3_REAL_PAPER_PROFILE : MATH3_QUICK_PAPER_PROFILE;
}

const REQUIRED_AUDIT_CHECKS = [
  "wellPosed",
  "withinSyllabus",
  "uniqueAnswer",
  "answerCorrect",
  "derivationCorrect",
  "rubricCorrect",
  "difficultyFit",
  "notationComplete",
] as const;

const SUSPICIOUS_PLACEHOLDER_RE = /(?:TODO|TBD|待(?:确认|补充|核对)|无法(?:确定|判断)|答案略|解析略|占位|未提供|缺少题干|请核对来源)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeComparableText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[，。；、,.!！?？:：'"“”‘’`]/g, "")
    .toLowerCase();
}

function hasBalancedDollarDelimiters(value: string): boolean {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "$") continue;
    let backslashCount = 0;
    for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
      backslashCount += 1;
    }
    if (backslashCount % 2 === 0) count += 1;
  }
  return count % 2 === 0;
}

function questionTextIssues(question: Math3SelfTestQuestion): string[] {
  const issues: string[] = [];
  const fields = [
    ["题干", question.question],
    ["答案", question.answer],
    ["解析", question.explanation],
  ] as const;

  for (const [label, value] of fields) {
    if (!value.trim()) issues.push(`${label}为空`);
    if (SUSPICIOUS_PLACEHOLDER_RE.test(value)) issues.push(`${label}含待确认占位内容`);
    if (!hasBalancedDollarDelimiters(value)) issues.push(`${label}的 LaTeX $ 分隔符不成对`);
  }
  return issues;
}

export function validateMath3SelfTestPaper(
  paper: Math3SelfTestPaper,
  questionPlan: Math3SelfTestQuestionPlanItem[],
): string[] {
  const issues: string[] = [];
  if (paper.questions.length !== questionPlan.length) {
    issues.push(`题量应为 ${questionPlan.length}，实际为 ${paper.questions.length}`);
  }

  const expectedTotal = questionPlan.reduce((sum, item) => sum + item.score, 0);
  const actualTotal = paper.questions.reduce((sum, question) => sum + question.score, 0);
  if (Math.abs(expectedTotal - paper.totalScore) > 0.01 || Math.abs(actualTotal - paper.totalScore) > 0.01) {
    issues.push(`总分结构不一致：配置 ${paper.totalScore} 分，题目合计 ${actualTotal} 分`);
  }

  const ids = new Set<string>();
  const normalizedQuestions = new Set<string>();
  for (const planned of questionPlan) {
    const question = paper.questions[planned.index - 1];
    if (!question) continue;
    const prefix = `第 ${planned.index} 题`;

    if (question.index !== planned.index) issues.push(`${prefix}题号不一致`);
    if (question.type !== planned.type) issues.push(`${prefix}题型应为 ${planned.type}`);
    if (Math.abs(question.score - planned.score) > 0.01) issues.push(`${prefix}分值应为 ${planned.score}`);
    if (question.areaId !== planned.targetAreaId) issues.push(`${prefix}学科位置不符合真题结构`);
    if (question.difficulty !== planned.targetDifficulty) issues.push(`${prefix}难度位置不符合目标曲线`);
    if (!question.chapterId) issues.push(`${prefix}缺少有效章节标记`);
    if (question.knowledgePointIds.length === 0) issues.push(`${prefix}缺少有效知识点标记`);
    for (const issue of questionTextIssues(question)) issues.push(`${prefix}${issue}`);

    if (!question.id || ids.has(question.id)) issues.push(`${prefix}缺少唯一题目 ID`);
    ids.add(question.id);

    const normalizedQuestion = normalizeComparableText(question.question);
    if (normalizedQuestion && normalizedQuestions.has(normalizedQuestion)) issues.push(`${prefix}与卷内其他题目重复`);
    normalizedQuestions.add(normalizedQuestion);

    if (question.type === "choice") {
      const options = question.options ?? [];
      const labels = options.map((option) => option.label.toUpperCase());
      const contents = options.map((option) => normalizeComparableText(option.content));
      if (options.length !== 4 || labels.join("") !== "ABCD") issues.push(`${prefix}必须有按 A/B/C/D 排列的四个选项`);
      if (contents.some((content) => !content) || new Set(contents).size !== 4) issues.push(`${prefix}选项为空或重复`);
      if (!/^[A-D]$/i.test(question.answer.trim())) issues.push(`${prefix}选择题答案必须是 A-D 单个字母`);
    }

    if (question.type === "solution") {
      const rubricTotal = question.rubricSteps.reduce((sum, step) => sum + step.points, 0);
      if (question.rubricSteps.length < 2) issues.push(`${prefix}解答题至少需要两个可核对的评分步骤`);
      if (question.rubricSteps.some((step) => !step.label.trim() || !step.expected.trim() || step.points <= 0)) {
        issues.push(`${prefix}评分步骤不完整`);
      }
      if (Math.abs(rubricTotal - question.score) > 0.01) {
        issues.push(`${prefix}评分步骤合计 ${rubricTotal} 分，与题目 ${question.score} 分不一致`);
      }
    }
  }

  return issues;
}

export function selectMath3FinalGateQuestionIndexes(
  questions: Math3SelfTestQuestion[],
  correctedQuestionIndexes: Iterable<number>,
): number[] {
  const corrected = new Set(correctedQuestionIndexes);
  return questions
    .filter((question) => question.type === "solution" || question.difficulty === "hard" || corrected.has(question.index))
    .map((question) => question.index);
}

export interface Math3AuditCorrection {
  index: number;
  question: Record<string, unknown>;
}

export interface Math3AuditBatchResult {
  checkedQuestions: number;
  corrections: Math3AuditCorrection[];
  summary: string;
}

export function parseMath3AuditBatch(
  value: unknown,
  expectedQuestionIndexes: number[],
  options: { allowCorrections?: boolean } = {},
): Math3AuditBatchResult {
  if (!isRecord(value)) throw new Error("独立审校没有返回有效 JSON 对象");
  const summary = getString(value.summary);
  if (value.status !== "passed") {
    throw new Error(summary ? `独立审校未通过：${summary}` : "独立审校未通过，试卷已拒绝保存");
  }

  const expected = new Set(expectedQuestionIndexes);
  const rawAudits = Array.isArray(value.audits) ? value.audits : [];
  const auditedIndexes = new Set<number>();
  for (const rawAudit of rawAudits) {
    if (!isRecord(rawAudit)) throw new Error("独立审校报告存在无效题目记录");
    const index = Number(rawAudit.index);
    if (!Number.isInteger(index) || !expected.has(index) || auditedIndexes.has(index)) {
      throw new Error("独立审校报告的题号缺失、重复或越界");
    }
    auditedIndexes.add(index);
    if (rawAudit.status !== "passed") throw new Error(`第 ${index} 题独立审校未通过`);
    const confidence = Number(rawAudit.confidence);
    if (!Number.isFinite(confidence) || confidence < 0.9 || confidence > 1) {
      throw new Error(`第 ${index} 题审校置信度不足，试卷已拒绝保存`);
    }
    if (!getString(rawAudit.independentResult)) throw new Error(`第 ${index} 题缺少独立验算结论`);
    if (rawAudit.recheckedAfterCorrection !== true) throw new Error(`第 ${index} 题没有完成修正后复核`);
    if (!Array.isArray(rawAudit.issues) || rawAudit.issues.length > 0) throw new Error(`第 ${index} 题仍有未解决问题`);
    const checks = rawAudit.checks;
    if (!isRecord(checks) || REQUIRED_AUDIT_CHECKS.some((key) => checks[key] !== true)) {
      throw new Error(`第 ${index} 题没有通过全部正确性检查`);
    }
  }
  if (auditedIndexes.size !== expected.size) throw new Error("独立审校没有逐题完整覆盖本组题目");

  const rawCorrections = Array.isArray(value.correctedQuestions) ? value.correctedQuestions : [];
  const correctionIndexes = new Set<number>();
  const corrections = rawCorrections.map((rawCorrection): Math3AuditCorrection => {
    if (!isRecord(rawCorrection)) throw new Error("独立审校返回了无效修正记录");
    const index = Number(rawCorrection.index);
    if (!Number.isInteger(index) || !expected.has(index) || correctionIndexes.has(index) || !isRecord(rawCorrection.question)) {
      throw new Error("独立审校修正记录的题号或题目内容无效");
    }
    correctionIndexes.add(index);
    return { index, question: rawCorrection.question };
  });
  if (options.allowCorrections === false && corrections.length > 0) {
    throw new Error("二次终审发现仍需修正的题目，整卷已拒绝保存");
  }

  return { checkedQuestions: auditedIndexes.size, corrections, summary };
}
