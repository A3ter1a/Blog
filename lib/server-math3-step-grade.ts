import "server-only";

import { callDeepSeek } from "./ai-client";
import { parseAIJson } from "./ai-json";
import type { Math3SelfTestStepGrade } from "./math3-self-test";

export type Math3StepGradeQuestionSnapshot = {
  id: string;
  question: string;
  answer: string;
  explanation: string;
};

export type Math3StepGradeRubricSnapshot = {
  id: string;
  label: string;
  points: number;
  expected: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clampNumber(value: unknown, min: number, max: number): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return min;
  return Math.min(max, Math.max(min, numberValue));
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function gradeMath3SelfTestStep(input: {
  apiKey: string;
  model: string;
  question: Math3StepGradeQuestionSnapshot;
  step: Math3StepGradeRubricSnapshot;
  studentAnswer: string;
  signal?: AbortSignal;
}): Promise<{ grade: Math3SelfTestStepGrade; tokensUsed: number }> {
  const answerText = input.studentAnswer.trim();
  if (!answerText) {
    return {
      grade: {
        stepId: input.step.id,
        awardedPoints: 0,
        maxPoints: input.step.points,
        feedback: "未作答，本步骤不得分。",
        confidence: 1,
        gradedAt: new Date().toISOString(),
      },
      tokensUsed: 0,
    };
  }

  const systemPrompt = `你是考研数学三阅卷老师。你每次只批改一个给分步骤，不能顺手批完整题。

规则：
- 只判断当前 step 是否达到 expected 的给分点。
- 不要因为后续步骤正确而补给当前步骤的分。
- 不要因为前面步骤错误而自动扣掉当前步骤之外的分。
- awardedPoints 必须在 0 到 maxPoints 之间，可以给 0.5 分。
- 反馈要短，指出本步骤为什么得分或失分。
- 严格返回 JSON 对象，不要输出 markdown 代码块。

输出结构：
{
  "awardedPoints": 0,
  "feedback": "简短反馈",
  "confidence": 0.0
}`;
  const userPrompt = `题目：
${input.question.question}

标准答案：
${input.question.answer}

标准解析：
${input.question.explanation}

当前评分步骤：
- id: ${input.step.id}
- label: ${input.step.label}
- maxPoints: ${input.step.points}
- expected: ${input.step.expected}

学生作答：
${answerText}`;
  const { content, tokensUsed } = await callDeepSeek(
    input.apiKey,
    input.model,
    [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
    { temperature: 0.15, maxTokens: 1200, responseFormat: "json_object", signal: input.signal },
  );
  let parsed: unknown;
  try {
    parsed = parseAIJson(content);
  } catch {
    throw new Error("AI 评分返回格式解析失败，请重试");
  }
  const object = isRecord(parsed) ? parsed : {};
  const maxPoints = Math.max(0, input.step.points);
  return {
    grade: {
      stepId: input.step.id,
      awardedPoints: Number(clampNumber(object.awardedPoints, 0, maxPoints).toFixed(1)),
      maxPoints,
      feedback: getString(object.feedback) || "本步骤已评分。",
      confidence: clampNumber(object.confidence, 0, 1),
      gradedAt: new Date().toISOString(),
    },
    tokensUsed,
  };
}
