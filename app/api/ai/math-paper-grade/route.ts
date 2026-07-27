import { NextRequest, NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai-client";
import { parseAIJson } from "@/lib/ai-json";
import { resolveAIProviderRoute } from "@/lib/ai-provider-routing";
import { normalizeMathGradeSuggestion, parseMathGradeSource } from "@/lib/math-training-core";
import { getAdminRequestContext, resolveAIKey } from "@/lib/server-admin-auth";
import { getMathGradeSource, getMathTrainingPersistenceMode } from "@/lib/server-math-training-core";

export const runtime = "nodejs";
export const maxDuration = 120;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminRequestContext(req);
    if (!admin.ok) return admin.response;
    if (getMathTrainingPersistenceMode() !== "shared") {
      return NextResponse.json({ error: "数学共享训练核尚未启用，不能生成无归属的建议分" }, { status: 409 });
    }
    const body = asRecord(await req.json().catch(() => ({})));
    const confirmationId = typeof body.confirmationId === "string" ? body.confirmationId.trim() : "";
    const apiKey = resolveAIKey("deepseek", body.apiKey);
    if (!UUID_PATTERN.test(confirmationId)) return NextResponse.json({ error: "缺少有效的 confirmationId" }, { status: 400 });
    if (!apiKey) return NextResponse.json({ error: "DeepSeek API key 未配置" }, { status: 400 });

    const source = parseMathGradeSource(await getMathGradeSource(admin.context.supabase, confirmationId));
    const confirmedPages = Array.isArray(source.confirmedPayload.pages)
      ? source.confirmedPayload.pages.map((page, index) => {
        const record = asRecord(page);
        return `答题页 ${index + 1}：\n${typeof record.text === "string" ? record.text : "（空）"}`;
      }).join("\n\n")
      : "";
    if (!confirmedPages.trim()) return NextResponse.json({ error: "已确认 OCR 文本为空" }, { status: 409 });

    const problemText = source.problems.map((problem) => [
      `problemId: ${problem.problemId}`,
      `题号：${problem.problemNo}`,
      `题目：${problem.prompt}`,
      `标准答案：${problem.standardAnswer}`,
      `评分细则：${JSON.stringify(problem.scoringRubric)}`,
      `本题满分：${problem.maxScore}`,
    ].join("\n")).join("\n\n");
    const task = resolveAIProviderRoute("deep_reasoning");
    const systemPrompt = `你是严谨的考研数学阅卷老师。你只能依据给定的固定真题、标准答案、评分细则和用户已确认的 OCR 文本评分。你的结果只是建议，用户确认前绝不是正式成绩。

要求：
- 为每道题逐步给分；每个步骤必须绑定原样 problemId。
- 同一题所有步骤 maxScore 之和必须严格等于该题满分；所有题都必须覆盖。
- earnedScore 在 0 到该步骤 maxScore 之间，允许 0.5 分。
- deductionReason 在未满分时说明具体扣分原因；满分时可为 null。
- 不推测 OCR 文本没有表达的步骤，不因最终答案正确而补发过程分。
- feedback、strengths、issues、suggestions 要可读且可操作；confidence 在 0 到 1。
- 只返回 JSON，不要 Markdown。

结构：
{"feedback":"总评","strengths":["优点"],"issues":["问题"],"suggestions":["建议"],"confidence":0,"steps":[{"problemId":"UUID","criterion":"评分点","earnedScore":0,"maxScore":0,"deductionReason":"扣分原因或 null"}]}`;
    const userPrompt = `试卷：${source.examYear ?? "未知年份"} ${source.paperCode ?? "数学"}

固定题源与评分细则：
${problemText}

用户逐页确认后的 OCR 作答：
${confirmedPages}`;
    const { content, tokensUsed } = await callDeepSeek(apiKey, task.model, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], { temperature: 0.05, maxTokens: 5000, responseFormat: "json_object" });
    const suggestion = normalizeMathGradeSuggestion(parseAIJson(content), source.problems);
    return NextResponse.json({ suggestion, tokensUsed, model: task.model, confirmationId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "数学建议评分失败";
    console.error("[MathPaperGrade] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
