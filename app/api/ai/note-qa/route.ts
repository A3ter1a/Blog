import { NextRequest, NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai-client";
import { DEFAULT_DEEPSEEK_MODEL } from "@/lib/ai-config";
import {
  buildNoteQAContext,
  normalizeNoteQAQuestion,
  normalizeNoteQAScope,
} from "@/lib/note-qa";
import { requireAdminRequest, resolveAIKey } from "@/lib/server-admin-auth";
import { notesApi } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: NextRequest) {
  try {
    const adminError = await requireAdminRequest(req);
    if (adminError) return adminError;

    const body: unknown = await req.json().catch(() => ({}));
    const record = body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
    const question = normalizeNoteQAQuestion(record.question);
    const scope = normalizeNoteQAScope(record.scope);

    if (!question) {
      return NextResponse.json({ error: "请输入要问的问题", success: false }, { status: 400 });
    }

    const apiKey = resolveAIKey("deepseek", record.apiKey);
    const model = typeof record.model === "string" && record.model.trim()
      ? record.model.trim()
      : DEFAULT_DEEPSEEK_MODEL;

    if (!apiKey) {
      return NextResponse.json({ error: "DeepSeek API key 未配置", success: false }, { status: 400 });
    }

    const notes = await notesApi.getQuestionAnswerSources({
      type: scope === "all" ? undefined : scope,
      limit: 140,
    });

    const { context, sources, totalChunks } = buildNoteQAContext(notes, question, scope);
    if (!context || sources.length === 0) {
      return NextResponse.json({
        error: "没有找到可用于回答的已发布笔记",
        success: false,
      }, { status: 404 });
    }

    const systemPrompt = `你是 Asteroid 个人学习知识库的笔记问答助手。
回答规则：
- 只能依据用户给出的笔记片段回答，不要编造笔记中没有的内容。
- 如果笔记片段证据不足，直接说“我的笔记里暂时没有找到足够依据”，然后给出可以继续检索的建议。
- 回答要简洁、清楚，适合考研复习。
- 涉及公式时使用 Markdown 和 LaTeX。
- 关键结论后引用来源编号，例如 [S1]、[S2]。
- 不要引用没有出现在上下文里的来源编号。`;

    const userPrompt = `问题：
${question}

可用笔记片段：
${context}`;

    const { content, tokensUsed } = await callDeepSeek(
      apiKey,
      model,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.2, maxTokens: 1400 },
    );

    return NextResponse.json({
      answer: content.trim(),
      sources,
      totalChunks,
      tokensUsed,
      success: true,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "笔记问答失败";
    console.error("[NoteQA] Error:", message);
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
