import { NextRequest, NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai-client";
import { DEFAULT_DEEPSEEK_MODEL } from "@/lib/ai-config";
import {
  buildNoteQAContext,
  normalizeNoteQAContextLimit,
  normalizeNoteQAMode,
  normalizeNoteQAQuestion,
  normalizeNoteQAScope,
  normalizeNoteQASubject,
  type NoteQAMode,
} from "@/lib/note-qa";
import { requireAdminRequest, resolveAIKey } from "@/lib/server-admin-auth";
import { notesApi } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 90;

function getModeInstruction(mode: NoteQAMode): string {
  if (mode === "locate") {
    return "优先指出答案在笔记中的位置，按来源编号列出对应结论；证据不足时只说明可继续检索的关键词。";
  }

  if (mode === "outline") {
    return "把相关内容整理成复习提纲，先给结论，再列关键概念、易错点和可回看的来源编号。";
  }

  if (mode === "quiz") {
    return "根据笔记内容生成 3 到 5 个自测问题，并给出简短答案；不要编造笔记里没有的知识点。";
  }

  return "直接回答问题，保留必要推导和来源编号。";
}

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
    const subject = normalizeNoteQASubject(record.subject);
    const mode = normalizeNoteQAMode(record.mode);
    const contextLimit = normalizeNoteQAContextLimit(record.contextLimit);

    if (!question) {
      return NextResponse.json({ error: "请输入要查的问题", success: false }, { status: 400 });
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
      subject: subject === "all" ? undefined : subject,
      limit: 160,
    });

    const { context, sources, totalChunks } = buildNoteQAContext(notes, question, scope, contextLimit);
    if (!context || sources.length === 0) {
      return NextResponse.json({
        error: "没有找到可用于回答的已发布内容",
        success: false,
      }, { status: 404 });
    }

    const systemPrompt = `你只根据给出的笔记片段回答。
规则：
- 不补充笔记片段之外的事实。
- 证据不足时直接说明没有足够依据。
- 回答要短、准、适合复习。
- 涉及公式时使用 Markdown 和 LaTeX。
- 关键结论后引用来源编号，例如 [S1]、[S2]。
- 不要引用没有出现在上下文里的来源编号。
- ${getModeInstruction(mode)}`;

    const userPrompt = `问题：${question}

可用片段：
${context}`;

    const { content, tokensUsed } = await callDeepSeek(
      apiKey,
      model,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: mode === "quiz" ? 0.35 : 0.2, maxTokens: mode === "quiz" ? 1600 : 1400 },
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
