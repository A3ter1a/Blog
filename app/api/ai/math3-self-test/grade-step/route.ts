import { NextRequest, NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai-client";
import { DEFAULT_DEEPSEEK_MODEL } from "@/lib/ai-config";
import { parseAIJson } from "@/lib/ai-json";
import type { Math3SelfTestQuestion, Math3SelfTestRubricStep } from "@/lib/math3-self-test";
import { requireAdminRequest, resolveAIKey } from "@/lib/server-admin-auth";

export const runtime = "nodejs";
export const maxDuration = 90;

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

export async function POST(req: NextRequest) {
  try {
    const adminError = await requireAdminRequest(req);
    if (adminError) return adminError;

    const {
      question,
      step,
      studentAnswer,
      apiKey: clientApiKey,
      model: clientModel,
    } = await req.json() as {
      question?: Math3SelfTestQuestion;
      step?: Math3SelfTestRubricStep;
      studentAnswer?: string;
      apiKey?: unknown;
      model?: unknown;
    };

    const apiKey = resolveAIKey("deepseek", clientApiKey);
    const model = typeof clientModel === "string" && clientModel.trim()
      ? clientModel.trim()
      : DEFAULT_DEEPSEEK_MODEL;

    if (!apiKey) {
      return NextResponse.json({ error: "DeepSeek API key 未配置" }, { status: 400 });
    }

    if (!question || !step) {
      return NextResponse.json({ error: "缺少题目或评分步骤" }, { status: 400 });
    }

    const answerText = typeof studentAnswer === "string" ? studentAnswer.trim() : "";
    if (!answerText) {
      return NextResponse.json({
        grade: {
          stepId: step.id,
          awardedPoints: 0,
          maxPoints: step.points,
          feedback: "未作答，本步骤不得分。",
          confidence: 1,
          gradedAt: new Date().toISOString(),
        },
        tokensUsed: 0,
        success: true,
      });
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
${question.question}

标准答案：
${question.answer}

标准解析：
${question.explanation}

当前评分步骤：
- id: ${step.id}
- label: ${step.label}
- maxPoints: ${step.points}
- expected: ${step.expected}

学生作答：
${answerText}`;

    const { content, tokensUsed } = await callDeepSeek(
      apiKey,
      model,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.15, maxTokens: 1200, responseFormat: "json_object" }
    );

    let parsed: unknown;
    try {
      parsed = parseAIJson(content);
    } catch {
      return NextResponse.json(
        { error: "AI 评分返回格式解析失败，请重试", rawContent: content },
        { status: 422 }
      );
    }

    const object = isRecord(parsed) ? parsed : {};
    const maxPoints = Math.max(0, step.points);
    const grade = {
      stepId: step.id,
      awardedPoints: Number(clampNumber(object.awardedPoints, 0, maxPoints).toFixed(1)),
      maxPoints,
      feedback: getString(object.feedback) || "本步骤已评分。",
      confidence: clampNumber(object.confidence, 0, 1),
      gradedAt: new Date().toISOString(),
    };

    return NextResponse.json({ grade, tokensUsed, success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "分步评分失败";
    console.error("[Math3SelfTestGradeStep] Error:", message);
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
