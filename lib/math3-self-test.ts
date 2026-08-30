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

export interface Math3SelfTestVerification {
  status: "verified";
  verifiedAt: string;
  profileVersion: string;
  profileLabel: string;
  reviewMethod: "independent-area-review" | "independent-area-review+high-risk-final-gate";
  checkedQuestions: number;
  finalGateQuestions?: number;
  correctedQuestionIndexes: number[];
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
  verification?: Math3SelfTestVerification;
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
  { type: "solution", count: 1, score: 10 },
  { type: "solution", count: 5, score: 12 },
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

export interface Math3SelfTestQuestionPlanItem {
  index: number;
  type: Math3SelfTestQuestionType;
  score: number;
  targetAreaId: Math3KnowledgeAreaId;
  targetDifficulty: "easy" | "medium" | "hard";
}

const FULL_AREA_PLAN: Math3KnowledgeAreaId[] = [
  "calculus", "calculus", "calculus", "calculus", "calculus", "calculus",
  "linear-algebra", "linear-algebra", "probability-statistics", "probability-statistics",
  "calculus", "calculus", "calculus", "calculus", "linear-algebra", "probability-statistics",
  "calculus", "calculus", "calculus", "linear-algebra", "probability-statistics", "probability-statistics",
];

const QUICK_AREA_PLAN: Math3KnowledgeAreaId[] = [
  "calculus", "calculus", "linear-algebra", "probability-statistics",
  "calculus", "probability-statistics", "calculus", "linear-algebra",
];

const FULL_DIFFICULTY_PLANS: Record<Math3SelfTestDifficulty, Array<"easy" | "medium" | "hard">> = {
  comfort: [
    "easy", "easy", "easy", "easy", "easy", "medium", "medium", "medium", "medium", "hard",
    "easy", "easy", "easy", "medium", "medium", "medium",
    "medium", "medium", "medium", "medium", "medium", "hard",
  ],
  simulation: [
    "easy", "easy", "easy", "medium", "medium", "medium", "medium", "medium", "hard", "hard",
    "easy", "easy", "medium", "medium", "medium", "hard",
    "medium", "medium", "hard", "medium", "medium", "hard",
  ],
  challenge: [
    "easy", "easy", "medium", "medium", "medium", "medium", "hard", "hard", "hard", "hard",
    "easy", "medium", "medium", "medium", "hard", "hard",
    "medium", "hard", "hard", "hard", "hard", "hard",
  ],
};

const QUICK_DIFFICULTY_PLANS: Record<Math3SelfTestDifficulty, Array<"easy" | "medium" | "hard">> = {
  comfort: ["easy", "easy", "medium", "medium", "easy", "medium", "medium", "medium"],
  simulation: ["easy", "medium", "medium", "hard", "medium", "medium", "medium", "hard"],
  challenge: ["medium", "medium", "hard", "hard", "medium", "hard", "hard", "hard"],
};

export function getMath3SelfTestQuestionPlan(
  mode: Math3SelfTestMode,
  difficulty: Math3SelfTestDifficulty = "simulation",
): Math3SelfTestQuestionPlanItem[] {
  const plan: Math3SelfTestQuestionPlanItem[] = [];
  const areaPlan = mode === "full" ? FULL_AREA_PLAN : QUICK_AREA_PLAN;
  const difficultyPlan = mode === "full" ? FULL_DIFFICULTY_PLANS[difficulty] : QUICK_DIFFICULTY_PLANS[difficulty];
  const expectedQuestionCount = getMath3SelfTestBlueprint(mode).reduce((sum, item) => sum + item.count, 0);
  if (areaPlan.length !== expectedQuestionCount || difficultyPlan.length !== expectedQuestionCount) {
    throw new Error(`数学三命题蓝图长度错误：${mode}/${difficulty}`);
  }
  for (const item of getMath3SelfTestBlueprint(mode)) {
    for (let i = 0; i < item.count; i++) {
      const index = plan.length;
      plan.push({
        index: index + 1,
        type: item.type,
        score: item.score,
        targetAreaId: areaPlan[index],
        targetDifficulty: difficultyPlan[index],
      });
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
    questionPlan: getMath3SelfTestQuestionPlan(mode, difficulty),
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

function toStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => typeof item === "string" ? [[key, item]] : [])
  );
}

function toNumberRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      const numberValue = Number(item);
      return Number.isFinite(numberValue) ? [[key, numberValue]] : [];
    })
  );
}

function normalizeStepGrades(value: unknown): Record<string, Math3SelfTestStepGrade[]> {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).flatMap(([questionId, rawGrades]) => {
      if (!Array.isArray(rawGrades)) return [];
      const grades = rawGrades.flatMap((rawGrade) => {
        if (!isRecord(rawGrade)) return [];
        const stepId = getString(rawGrade.stepId);
        if (!stepId) return [];
        const maxPoints = Math.max(0, getNumber(rawGrade.maxPoints, 0));
        return [{
          stepId,
          awardedPoints: Math.max(0, Math.min(maxPoints, getNumber(rawGrade.awardedPoints, 0))),
          maxPoints,
          feedback: getString(rawGrade.feedback),
          confidence: Math.max(0, Math.min(1, getNumber(rawGrade.confidence, 0))),
          gradedAt: getString(rawGrade.gradedAt),
        }];
      });
      return grades.length > 0 ? [[questionId, grades]] : [];
    })
  );
}

export function normalizeMath3SelfTestAttempt(value: unknown, startedAt?: string): Math3SelfTestAttempt {
  const source = isRecord(value) ? value : {};
  const normalizedStartedAt = getString(source.startedAt, startedAt);
  const submittedAt = getString(source.submittedAt);

  return {
    answers: toStringRecord(source.answers),
    markedQuestionIds: toStringArray(source.markedQuestionIds),
    objectiveScores: toNumberRecord(source.objectiveScores),
    stepGrades: normalizeStepGrades(source.stepGrades),
    questionScores: toNumberRecord(source.questionScores),
    totalScore: getNumber(source.totalScore, 0),
    startedAt: normalizedStartedAt || undefined,
    submittedAt: submittedAt || undefined,
  };
}

const math3ChapterAreaMap = new Map(
  math3KnowledgeAreas.flatMap((area) => area.chapters.map((chapter) => [chapter.id, area.id] as const))
);

const math3PointAreaMap = new Map(
  math3KnowledgeAreas.flatMap((area) =>
    area.chapters.flatMap((chapter) => chapter.points.map((point) => [point.id, area.id] as const))
  )
);

function normalizeChapterId(value: unknown, areaId: Math3KnowledgeAreaId): string | undefined {
  const chapterId = getString(value);
  return math3ChapterAreaMap.get(chapterId) === areaId ? chapterId : undefined;
}

function normalizeKnowledgePointIds(value: unknown, areaId: Math3KnowledgeAreaId): string[] {
  return toStringArray(value).filter((pointId) => math3PointAreaMap.get(pointId) === areaId);
}

function normalizeAreaId(value: unknown, fallback: Math3KnowledgeAreaId): Math3KnowledgeAreaId {
  return value === "linear-algebra" || value === "probability-statistics" || value === "calculus"
    ? value
    : fallback;
}

function normalizeQuestionDifficulty(value: unknown, fallback: "easy" | "medium" | "hard"): "easy" | "medium" | "hard" {
  return value === "easy" || value === "medium" || value === "hard" ? value : fallback;
}

function normalizeVerification(value: unknown, questionCount: number): Math3SelfTestVerification | undefined {
  if (!isRecord(value) || value.status !== "verified") return undefined;
  const verifiedAt = getString(value.verifiedAt);
  const profileVersion = getString(value.profileVersion);
  const profileLabel = getString(value.profileLabel);
  const checkedQuestions = Math.max(0, Math.floor(getNumber(value.checkedQuestions, 0)));
  const finalGateQuestions = Math.max(0, Math.floor(getNumber(value.finalGateQuestions, 0)));
  if (!verifiedAt || !profileVersion || !profileLabel || checkedQuestions !== questionCount) return undefined;

  return {
    status: "verified",
    verifiedAt,
    profileVersion,
    profileLabel,
    reviewMethod: value.reviewMethod === "independent-area-review+high-risk-final-gate"
      ? "independent-area-review+high-risk-final-gate"
      : "independent-area-review",
    checkedQuestions,
    finalGateQuestions: finalGateQuestions > 0 ? Math.min(questionCount, finalGateQuestions) : undefined,
    correctedQuestionIndexes: Array.isArray(value.correctedQuestionIndexes)
      ? Array.from(new Set(value.correctedQuestionIndexes
        .map((index) => Number(index))
        .filter((index) => Number.isInteger(index) && index >= 1 && index <= questionCount)))
      : [],
  };
}

function normalizeBlueprint(value: unknown, fallback: Math3SelfTestBlueprintItem[]): Math3SelfTestBlueprintItem[] {
  if (!Array.isArray(value)) return fallback;
  const items = value.flatMap((raw): Math3SelfTestBlueprintItem[] => {
    if (!isRecord(raw)) return [];
    const type = raw.type;
    const count = Math.floor(getNumber(raw.count, 0));
    const score = getNumber(raw.score, 0);
    if ((type !== "choice" && type !== "fill" && type !== "solution") || count <= 0 || score <= 0) return [];
    return [{ type, count, score }];
  });
  return items.length > 0 ? items : fallback;
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
  options: { enforceRealPaperProfile?: boolean } = {},
): Math3SelfTestPaper {
  const config = getMath3SelfTestConfig(mode, difficulty);
  const source = isRecord(value) ? value : {};
  const rawQuestions = Array.isArray(source.questions) ? source.questions : [];
  const now = new Date().toISOString();
  const enforceRealPaperProfile = options.enforceRealPaperProfile === true
    || (isRecord(source.verification) && source.verification.status === "verified");

  const questions = config.questionPlan.flatMap((planned, index): Math3SelfTestQuestion[] => {
    const raw = isRecord(rawQuestions[index]) ? rawQuestions[index] : {};
    const questionText = getString(raw.question);
    if (!questionText) return [];

    const id = getString(raw.id, `math3-q-${planned.index}-${crypto.randomUUID()}`);
    const type = planned.type;
    const score = enforceRealPaperProfile ? planned.score : Math.max(0, getNumber(raw.score, planned.score));
    const areaId = enforceRealPaperProfile
      ? planned.targetAreaId
      : normalizeAreaId(raw.areaId, planned.targetAreaId);

    return [{
      id,
      index: planned.index,
      type,
      areaId,
      chapterId: normalizeChapterId(raw.chapterId, areaId),
      knowledgePointIds: normalizeKnowledgePointIds(raw.knowledgePointIds, areaId),
      difficulty: enforceRealPaperProfile
        ? planned.targetDifficulty
        : normalizeQuestionDifficulty(raw.difficulty, planned.targetDifficulty),
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
    sourcePolicy: getString(source.sourcePolicy, "按 2021—2026 数学三真题结构原创命题；不得直接复制真题、商业题库、网课讲义或来源不明的整题。"),
    blueprint: enforceRealPaperProfile ? config.blueprint : normalizeBlueprint(source.blueprint, config.blueprint),
    coverageTargets: config.coverageTargets,
    questions,
    verification: normalizeVerification(source.verification, questions.length),
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
