import assert from "node:assert/strict";
import test from "node:test";

import {
  getMath3RealPaperProfile,
  parseMath3AuditBatch,
  selectMath3FinalGateQuestionIndexes,
  validateMath3SelfTestPaper,
} from "../lib/math3-paper-verification.ts";
import {
  getMath3ChoiceOptionLayout,
  paginateMath3ObjectiveQuestions,
} from "../lib/math3-booklet-layout.ts";

test("完整卷与小卷使用不同的真题结构说明", () => {
  assert.match(getMath3RealPaperProfile("full").label, /真题结构/);
  assert.match(getMath3RealPaperProfile("quick").label, /比例小卷/);
});

test("套卷客观题按方向集中分页并排除解答题", () => {
  const choices = Array.from({ length: 10 }, (_, index) => ({
    type: "choice",
    question: `选择题 ${index + 1}`,
    options: ["A", "B", "C", "D"].map((label) => ({ label, content: `选项 ${label}` })),
  }));
  const fills = Array.from({ length: 6 }, (_, index) => ({
    type: "fill",
    question: `填空题 ${index + 1}`,
  }));
  const solution = { type: "solution", question: "解答题" };

  const landscape = paginateMath3ObjectiveQuestions([...choices, ...fills, solution], "landscape");
  assert.deepEqual(landscape.map((page) => [page.section, page.questions.length]), [
    ["choice", 5], ["choice", 5], ["fill", 6],
  ]);

  const portrait = paginateMath3ObjectiveQuestions([...choices, ...fills, solution], "portrait");
  assert.deepEqual(portrait.map((page) => [page.section, page.questions.length]), [
    ["choice", 5], ["choice", 5], ["fill", 6],
  ]);
});

test("长客观题会提前分页，避免挤压后续题目", () => {
  const pages = paginateMath3ObjectiveQuestions([
    { type: "choice", question: "很长的题干".repeat(400), options: [] },
    { type: "choice", question: "下一题", options: [] },
  ], "landscape");
  assert.deepEqual(pages.map((page) => page.questions.length), [1, 1]);
});

test("短选项排成一行，长选项自动切换为两行", () => {
  const shortOptions = ["0", "1", "2", "3"].map((content) => ({ content }));
  const longOptions = [
    "函数在定义域内严格单调递增且没有最大值",
    "函数在定义域内严格单调递减且没有最小值",
    "函数存在两个不同的极值点并且极值相等",
    "函数仅存在一个驻点且该点不是函数的极值点",
  ].map((content) => ({ content }));
  assert.equal(getMath3ChoiceOptionLayout(shortOptions), "single-row");
  assert.equal(getMath3ChoiceOptionLayout(shortOptions, "portrait"), "single-row");
  assert.equal(getMath3ChoiceOptionLayout(longOptions), "double-row");
});

const plan = [
  {
    index: 1,
    type: "choice",
    score: 5,
    targetAreaId: "calculus",
    targetDifficulty: "easy",
  },
  {
    index: 2,
    type: "solution",
    score: 10,
    targetAreaId: "linear-algebra",
    targetDifficulty: "medium",
  },
];

const paper = {
  title: "测试卷",
  subject: "math3",
  mode: "quick",
  difficulty: "simulation",
  durationMinutes: 60,
  totalScore: 15,
  generatedAt: "2026-08-28T00:00:00.000Z",
  sourcePolicy: "原创",
  blueprint: [],
  coverageTargets: [],
  questions: [
    {
      id: "q-1",
      index: 1,
      type: "choice",
      areaId: "calculus",
      chapterId: "calculus-limit-continuity",
      knowledgePointIds: ["calculus-limit-equivalent-infinitesimal"],
      difficulty: "easy",
      score: 5,
      question: "当 $x\\to0$ 时，求极限。",
      options: [
        { label: "A", content: "$0$" },
        { label: "B", content: "$1$" },
        { label: "C", content: "$2$" },
        { label: "D", content: "$3$" },
      ],
      answer: "B",
      explanation: "由定义可得答案为 $1$。",
      rubricSteps: [],
    },
    {
      id: "q-2",
      index: 2,
      type: "solution",
      areaId: "linear-algebra",
      chapterId: "linear-algebra-matrix",
      knowledgePointIds: ["linear-algebra-matrix-operation"],
      difficulty: "medium",
      score: 10,
      question: "设矩阵 $A$ 满足给定条件，求 $A^2$。",
      answer: "$A^2=I$。",
      explanation: "先化简条件，再计算得到 $A^2=I$。",
      rubricSteps: [
        { id: "q-2-s1", label: "化简", points: 4, expected: "化简矩阵条件。" },
        { id: "q-2-s2", label: "结论", points: 6, expected: "计算并得到 $A^2=I$。" },
      ],
    },
  ],
};

function passedAudit(index) {
  return {
    index,
    status: "passed",
    independentResult: `第 ${index} 题独立结果`,
    confidence: 0.96,
    recheckedAfterCorrection: true,
    issues: [],
    checks: {
      wellPosed: true,
      withinSyllabus: true,
      uniqueAnswer: true,
      answerCorrect: true,
      derivationCorrect: true,
      rubricCorrect: true,
      difficultyFit: true,
      notationComplete: true,
    },
  };
}

test("数学三最终结构门接受完整且一致的试卷", () => {
  assert.deepEqual(validateMath3SelfTestPaper(paper, plan), []);
});

test("数学三最终结构门拒绝重复选项和评分分值错误", () => {
  const invalid = structuredClone(paper);
  invalid.questions[0].options[3].content = "$2$";
  invalid.questions[1].rubricSteps[1].points = 5;
  const issues = validateMath3SelfTestPaper(invalid, plan);
  assert.equal(issues.some((issue) => issue.includes("选项为空或重复")), true);
  assert.equal(issues.some((issue) => issue.includes("评分步骤合计")), true);
});

test("二次终审覆盖所有解答题、难题和初审修正题", () => {
  assert.deepEqual(selectMath3FinalGateQuestionIndexes(paper.questions, []), [2]);
  assert.deepEqual(selectMath3FinalGateQuestionIndexes(paper.questions, [1]), [1, 2]);
  const withHardChoice = structuredClone(paper.questions);
  withHardChoice[0].difficulty = "hard";
  assert.deepEqual(selectMath3FinalGateQuestionIndexes(withHardChoice, []), [1, 2]);
});

test("独立审校报告必须逐题覆盖全部检查", () => {
  const parsed = parseMath3AuditBatch({
    status: "passed",
    summary: "全部通过",
    correctedQuestions: [{ index: 1, question: { ...paper.questions[0], answer: "A" } }],
    audits: [passedAudit(1), passedAudit(2)],
  }, [1, 2]);
  assert.equal(parsed.checkedQuestions, 2);
  assert.deepEqual(parsed.corrections.map((item) => item.index), [1]);

  assert.throws(() => parseMath3AuditBatch({
    status: "passed",
    summary: "漏审一题",
    correctedQuestions: [],
    audits: [passedAudit(1)],
  }, [1, 2]), /逐题完整覆盖/);
});

test("独立审校报告拒绝低置信度或未完成的检查", () => {
  const lowConfidence = passedAudit(1);
  lowConfidence.confidence = 0.89;
  assert.throws(() => parseMath3AuditBatch({
    status: "passed",
    summary: "错误通过",
    correctedQuestions: [],
    audits: [lowConfidence],
  }, [1]), /置信度不足/);

  const incomplete = passedAudit(1);
  incomplete.checks.answerCorrect = false;
  assert.throws(() => parseMath3AuditBatch({
    status: "passed",
    summary: "错误通过",
    correctedQuestions: [],
    audits: [incomplete],
  }, [1]), /全部正确性检查/);
});

test("二次终审不接受任何仍需修正的题目", () => {
  const finalAudit = {
    status: "passed",
    summary: "终审通过",
    correctedQuestions: [],
    audits: [passedAudit(1)],
  };
  assert.equal(parseMath3AuditBatch(finalAudit, [1], { allowCorrections: false }).checkedQuestions, 1);

  assert.throws(() => parseMath3AuditBatch({
    ...finalAudit,
    correctedQuestions: [{ index: 1, question: paper.questions[0] }],
  }, [1], { allowCorrections: false }), /二次终审发现仍需修正/);
});
