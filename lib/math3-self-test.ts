import { math3KnowledgeAreas, type Math3KnowledgeAreaId } from "./math3-knowledge";

export type Math3SelfTestMode = "quick" | "full";
export type Math3SelfTestDifficulty = "comfort" | "simulation" | "challenge";
export type Math3SelfTestStatus = "draft" | "in_progress" | "submitted" | "reviewed";
export type Math3SelfTestQuestionType = "choice" | "fill" | "solution";

export interface Math3SelfTestRubricStep {
  id: string;
  label: string;
  points: number;
  expected: string;
}

export interface Math3SelfTestQuestion {
  id: string;
  index: number;
  type: Math3SelfTestQuestionType;
  areaId: Math3KnowledgeAreaId;
  chapterId?: string;
  knowledgePointIds: string[];
  difficulty: "easy" | "medium" | "hard";
  score: number;
  question: string;
  options?: Array<{ label: string; content: string }>;
  answer: string;
  explanation: string;
  rubricSteps: Math3SelfTestRubricStep[];
}

export interface Math3SelfTestBlueprintItem {
  type: Math3SelfTestQuestionType;
  count: number;
  score: number;
}

export interface Math3SelfTestPaper {
  title: string;
  subject: "math3";
  mode: Math3SelfTestMode;
  difficulty: Math3SelfTestDifficulty;
  durationMinutes: number;
  totalScore: number;
  generatedAt: string;
  sourcePolicy: string;
  blueprint: Math3SelfTestBlueprintItem[];
  coverageTargets: Array<{ areaId: Math3KnowledgeAreaId; label: string; targetQuestions: number }>;
  questions: Math3SelfTestQuestion[];
}

export interface Math3SelfTestStepGrade {
  stepId: string;
  awardedPoints: number;
  maxPoints: number;
  feedback: string;
  confidence: number;
  gradedAt: string;
}

export interface Math3SelfTestAttempt {
  answers: Record<string, string>;
  markedQuestionIds: string[];
  objectiveScores: Record<string, number>;
  stepGrades: Record<string, Math3SelfTestStepGrade[]>;
  questionScores: Record<string, number>;
  totalScore: number;
  startedAt?: string;
  submittedAt?: string;
}

export interface Math3SelfTestRecord {
  id: string;
  userId?: string;
  title: string;
  mode: Math3SelfTestMode;
  difficulty: Math3SelfTestDifficulty;
  status: Math3SelfTestStatus;
  paper: Math3SelfTestPaper;
  attempt: Math3SelfTestAttempt;
  score: number;
  maxScore: number;
  startedAt?: Date;
  submittedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type Math3SelfTestCreateInput = Omit<Math3SelfTestRecord, "id" | "userId" | "createdAt" | "updatedAt">;

export const math3SelfTestModeMeta: Record<Math3SelfTestMode, {
  label: string;
  durationMinutes: number;
  totalScore: number;
  description: string;
}> = {
  quick: {
    label: "快速自测",
    durationMinutes: 60,
    totalScore: 50,
    description: "60 分钟小卷，适合每天检查状态。",
  },
  full: {
    label: "完整模拟",
    durationMinutes: 180,
    totalScore: 150,
    description: "180 分钟整卷，按考研数学三实战节奏训练。",
  },
};

export const math3SelfTestDifficultyMeta: Record<Math3SelfTestDifficulty, {
  label: string;
  tone: string;
  prompt: string;
}> = {
  comfort: {
    label: "安心卷",
    tone: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
    prompt: "基础题和常规核心题为主，减少压轴难度，用来查漏补缺和建立稳定手感。",
  },
  simulation: {
    label: "模拟卷",
    tone: "bg-primary/10 text-primary border-primary/20",
    prompt: "难度接近考研数学三常规模拟，基础、核心、综合题比例均衡。",
  },
  challenge: {
    label: "拔高卷",
    tone: "bg-rose-500/10 text-rose-700 border-rose-500/20",
    prompt: "综合题比例提高，但避免偏题、怪题和依赖小众二次结论的题。",
  },
};

export const math3SelfTestStatusMeta: Record<Math3SelfTestStatus, string> = {
  draft: "未开始",
  in_progress: "考试中",
  submitted: "待复盘",
  reviewed: "已复盘",
};

export const math3SelfTestTypeLabels: Record<Math3SelfTestQuestionType, string> = {
  choice: "选择题",
  fill: "填空题",
  solution: "解答题",
};

const FULL_BLUEPRINT: Math3SelfTestBlueprintItem[] = [
  { type: "choice", count: 10, score: 5 },
  { type: "fill", count: 6, score: 5 },
  { type: "solution", count: 4, score: 10 },
  { type: "solution", count: 2, score: 15 },
];

const QUICK_BLUEPRINT: Math3SelfTestBlueprintItem[] = [
  { type: "choice", count: 4, score: 5 },
  { type: "fill", count: 2, score: 5 },
  { type: "solution", count: 2, score: 10 },
];

export function getMath3SelfTestBlueprint(mode: Math3SelfTestMode): Math3SelfTestBlueprintItem[] {
  return mode === "full" ? FULL_BLUEPRINT : QUICK_BLUEPRINT;
}

export function getMath3SelfTestCoverageTargets(mode: Math3SelfTestMode) {
  return mode === "full"
    ? [
        { areaId: "calculus" as const, label: "微积分", targetQuestions: 13 },
        { areaId: "linear-algebra" as const, label: "线性代数", targetQuestions: 4 },
        { areaId: "probability-statistics" as const, label: "概率论与数理统计", targetQuestions: 5 },
      ]
    : [
        { areaId: "calculus" as const, label: "微积分", targetQuestions: 4 },
        { areaId: "linear-algebra" as const, label: "线性代数", targetQuestions: 2 },
        { areaId: "probability-statistics" as const, label: "概率论与数理统计", targetQuestions: 2 },
      ];
}

export function getMath3SelfTestQuestionPlan(mode: Math3SelfTestMode): Array<{
  index: number;
  type: Math3SelfTestQuestionType;
  score: number;
}> {
  const plan: Array<{ index: number; type: Math3SelfTestQuestionType; score: number }> = [];
  for (const item of getMath3SelfTestBlueprint(mode)) {
    for (let i = 0; i < item.count; i++) {
      plan.push({ index: plan.length + 1, type: item.type, score: item.score });
    }
  }
  return plan;
}

export function getMath3SelfTestConfig(mode: Math3SelfTestMode, difficulty: Math3SelfTestDifficulty) {
  const modeMeta = math3SelfTestModeMeta[mode];
  return {
    mode,
    difficulty,
    modeLabel: modeMeta.label,
    difficultyLabel: math3SelfTestDifficultyMeta[difficulty].label,
    durationMinutes: modeMeta.durationMinutes,
    totalScore: modeMeta.totalScore,
    blueprint: getMath3SelfTestBlueprint(mode),
    questionPlan: getMath3SelfTestQuestionPlan(mode),
    coverageTargets: getMath3SelfTestCoverageTargets(mode),
  };
}

export function createEmptyMath3SelfTestAttempt(startedAt?: string): Math3SelfTestAttempt {
  return {
    answers: {},
    markedQuestionIds: [],
    objectiveScores: {},
    stepGrades: {},
    questionScores: {},
    totalScore: 0,
    startedAt,
  };
}

export function getMath3KnowledgePromptContext(): string {
  return math3KnowledgeAreas
    .map((area) => {
      const chapters = area.chapters
        .map((chapter) => {
          const points = chapter.points
            .map((point) => `${point.id}:${point.title}`)
            .join("；");
          return `${chapter.id} ${chapter.title} -> ${points}`;
        })
        .join("\n");
      return `${area.id} ${area.title}（参考权重 ${area.examWeight}）\n${chapters}`;
    })
    .join("\n\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function getNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
    )
  );
}

function normalizeQuestionType(value: unknown, fallback: Math3SelfTestQuestionType): Math3SelfTestQuestionType {
  return value === "choice" || value === "fill" || value === "solution" ? value : fallback;
}

function normalizeAreaId(value: unknown): Math3KnowledgeAreaId {
  return value === "linear-algebra" || value === "probability-statistics" || value === "calculus"
    ? value
    : "calculus";
}

function normalizeDifficulty(value: unknown): "easy" | "medium" | "hard" {
  return value === "easy" || value === "hard" ? value : "medium";
}

function normalizeOptions(value: unknown): Array<{ label: string; content: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const options = value
    .map((option, index) => {
      const item = isRecord(option) ? option : {};
      return {
        label: getString(item.label, String.fromCharCode(65 + index)).replace(/[.．、:：]/g, "") || String.fromCharCode(65 + index),
        content: getString(item.content),
      };
    })
    .filter((option) => option.content);
  return options.length > 0 ? options : undefined;
}

function normalizeRubricSteps(value: unknown, questionId: string, maxScore: number): Math3SelfTestRubricStep[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [{
      id: `${questionId}-step-1`,
      label: "关键步骤",
      points: maxScore,
      expected: "写出主要计算或证明过程，并得到正确结论。",
    }];
  }

  const steps = value
    .map((step, index) => {
      const item = isRecord(step) ? step : {};
      const points = Math.max(0, getNumber(item.points, 0));
      return {
        id: getString(item.id, `${questionId}-step-${index + 1}`),
        label: getString(item.label, `步骤 ${index + 1}`),
        points,
        expected: getString(item.expected, getString(item.description, "")),
      };
    })
    .filter((step) => step.points > 0 && step.expected);

  if (steps.length === 0) {
    return [{
      id: `${questionId}-step-1`,
      label: "关键步骤",
      points: maxScore,
      expected: "写出主要计算或证明过程，并得到正确结论。",
    }];
  }

  const total = steps.reduce((sum, step) => sum + step.points, 0);
  if (Math.abs(total - maxScore) <= 0.01 || total <= 0) return steps;

  return steps.map((step) => ({
    ...step,
    points: Number(((step.points / total) * maxScore).toFixed(1)),
  }));
}

export function normalizeMath3SelfTestPaper(
  value: unknown,
  mode: Math3SelfTestMode,
  difficulty: Math3SelfTestDifficulty,
): Math3SelfTestPaper {
  const config = getMath3SelfTestConfig(mode, difficulty);
  const source = isRecord(value) ? value : {};
  const rawQuestions = Array.isArray(source.questions) ? source.questions : [];
  const now = new Date().toISOString();

  const questions = config.questionPlan.flatMap((planned, index): Math3SelfTestQuestion[] => {
    const raw = isRecord(rawQuestions[index]) ? rawQuestions[index] : {};
    const questionText = getString(raw.question);
    if (!questionText) return [];

    const id = getString(raw.id, `math3-q-${planned.index}-${crypto.randomUUID()}`);
    const type = normalizeQuestionType(raw.type, planned.type);
    const score = getNumber(raw.score, planned.score);

    return [{
      id,
      index: planned.index,
      type,
      areaId: normalizeAreaId(raw.areaId),
      chapterId: getString(raw.chapterId) || undefined,
      knowledgePointIds: toStringArray(raw.knowledgePointIds),
      difficulty: normalizeDifficulty(raw.difficulty),
      score,
      question: questionText,
      options: type === "choice" ? normalizeOptions(raw.options) : undefined,
      answer: getString(raw.answer),
      explanation: getString(raw.explanation),
      rubricSteps: type === "solution" ? normalizeRubricSteps(raw.rubricSteps, id, score) : [],
    }];
  });

  return {
    title: getString(source.title, `${config.difficultyLabel} · ${config.modeLabel}`),
    subject: "math3",
    mode,
    difficulty,
    durationMinutes: config.durationMinutes,
    totalScore: config.totalScore,
    generatedAt: getString(source.generatedAt, now),
    sourcePolicy: "AI 原创模拟题；不得直接复制商业题库、网课讲义或来源不明的整题。",
    blueprint: config.blueprint,
    coverageTargets: config.coverageTargets,
    questions,
  };
}

export function isObjectiveQuestion(type: Math3SelfTestQuestionType): boolean {
  return type === "choice" || type === "fill";
}

export function normalizeObjectiveAnswer(value: string): string {
  return value
    .trim()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[，。；、,.，\s]/g, "")
    .toUpperCase();
}

export function gradeObjectiveAnswer(question: Math3SelfTestQuestion, answer: string): number {
  if (!isObjectiveQuestion(question.type)) return 0;
  const expected = normalizeObjectiveAnswer(question.answer);
  const actual = normalizeObjectiveAnswer(answer);
  if (!expected || !actual) return 0;
  return expected === actual ? question.score : 0;
}

export function sumMath3SelfTestScore(attempt: Math3SelfTestAttempt): number {
  return Object.values(attempt.questionScores).reduce((sum, score) => sum + (Number.isFinite(score) ? score : 0), 0);
}
