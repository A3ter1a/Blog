import { NextRequest, NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai-client";
import { parseAIJson } from "@/lib/ai-json";
import { resolveAIProviderRoute } from "@/lib/ai-provider-routing";
import { normalizeEnglishSubjectiveGradeSuggestion } from "@/lib/english-subjective-grade";
import { getAdminRequestContext, resolveAIKey } from "@/lib/server-admin-auth";

export const runtime = "nodejs";
export const maxDuration = 90;

function normalizeAnswers(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, answer]) => (
    key.length <= 80 && typeof answer === "string" ? [[key, answer.slice(0, 20_000)]] : []
  )));
}

export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminRequestContext(req);
    if (!admin.ok) return admin.response;

    const body: unknown = await req.json().catch(() => ({}));
    const record = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
    const passageId = typeof record.passageId === "string" ? record.passageId.trim() : "";
    const answers = normalizeAnswers(record.answers);
    const apiKey = resolveAIKey("deepseek", record.apiKey);
    if (!passageId) return NextResponse.json({ error: "缺少 passageId" }, { status: 400 });
    if (!apiKey) return NextResponse.json({ error: "DeepSeek API key 未配置" }, { status: 400 });

    const { data: passage, error: passageError } = await admin.context.supabase
      .from("english_passages")
      .select("id,year,section,passage_no,title,content,total_score")
      .eq("id", passageId)
      .single();
    if (passageError) throw passageError;
    if (passage.section !== "translation" && passage.section !== "writing") {
      return NextResponse.json({ error: "只有翻译与写作使用主观评分" }, { status: 409 });
    }

    const { data: questions, error: questionError } = await admin.context.supabase
      .from("english_questions")
      .select("id,question_no,stem,standard_answer,score,sort_order")
      .eq("passage_id", passageId)
      .order("sort_order", { ascending: true });
    if (questionError) throw questionError;
    const questionRows = questions ?? [];
    const questionIds = new Set(questionRows.map((question) => question.id));
    if (Object.keys(answers).some((questionId) => !questionIds.has(questionId))) {
      return NextResponse.json({ error: "答案包含不属于当前题组的题目" }, { status: 400 });
    }
    const maxScore = questionRows.reduce((sum, question) => sum + Number(question.score ?? 0), 0);
    if (questionRows.length === 0 || maxScore <= 0) {
      return NextResponse.json({ error: "当前题组缺少有效评分来源" }, { status: 409 });
    }

    const answerText = questionRows.map((question) => [
      `题号：${question.question_no}`,
      `题目：${question.stem || passage.content || "（无）"}`,
      `参考答案：${question.standard_answer || "（无固定答案，请按考研英语一标准评分）"}`,
      `考生作答：${answers[question.id] ?? "（未作答）"}`,
      `本题满分：${question.score}`,
    ].join("\n")).join("\n\n");
    const task = resolveAIProviderRoute("deep_reasoning");
    const systemPrompt = `你是严谨的考研英语一阅卷老师，只评阅翻译或写作主观题。你的分数只是建议，用户确认前绝不能视为正式成绩。

要求：
- 严格按题目满分评分，score 在 0 到 ${maxScore} 之间，允许 0.5 分。
- 翻译重点检查信息完整、语义准确、中文表达；写作重点检查任务完成、结构、语言准确与表达质量。
- 明确指出优点、问题和可操作修改建议，不虚构原文中不存在的信息。
- feedback 给出简洁总评；confidence 在 0 到 1。
- 只返回 JSON 对象，不要 Markdown。

结构：
{"score":0,"feedback":"总评","strengths":["优点"],"issues":["问题"],"suggestions":["修改建议"],"confidence":0}`;
    const userPrompt = `题型：${passage.section}
年份：${passage.year}
题组：${passage.passage_no}
标题：${passage.title || "（无）"}

${answerText}`;
    const { content, tokensUsed } = await callDeepSeek(apiKey, task.model, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], { temperature: 0.1, maxTokens: 2000, responseFormat: "json_object" });
    const suggestion = normalizeEnglishSubjectiveGradeSuggestion(parseAIJson(content), maxScore);
    return NextResponse.json({ suggestion, tokensUsed, model: task.model });
  } catch (error) {
    const message = error instanceof Error ? error.message : "英语主观题建议评分失败";
    console.error("[EnglishSubjectiveGrade] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
