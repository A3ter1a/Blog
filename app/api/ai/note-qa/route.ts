import { NextRequest, NextResponse } from "next/server";
import {
  callDeepSeek,
  openDeepSeekStream,
  type DeepSeekReasoningEffort,
  type DeepSeekThinkingMode,
} from "@/lib/ai-client";
import { DEFAULT_DEEPSEEK_MODEL } from "@/lib/ai-config";
import {
  normalizeNoteQAContextLimit,
  normalizeNoteQAConversation,
  normalizeNoteQAMode,
  normalizeNoteQAQuestion,
  summarizeNoteQARetrieval,
  normalizeNoteQAScope,
  normalizeNoteQASubject,
  type NoteQAMode,
  type NoteQARetrievalSummary,
  type NoteQASource,
} from "@/lib/note-qa";
import { buildAcceptedMemoryContext } from "@/lib/assistant-memory";
import { getAdminRequestContext, resolveAIKey } from "@/lib/server-admin-auth";
import { listAssistantMemories } from "@/lib/server-assistant-memory";
import { searchPrivateNoteRag, syncPrivateNotesRag } from "@/lib/server-private-note-rag";
import type { NoteRow } from "@/lib/supabase-schema";
import { normalizeNoteProblems } from "@/lib/supabase";
import type { Note } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 90;

const NOTE_QA_FIELDS = "id,type,title,content,subject,tags,problems,created_at,updated_at,is_published,content_version";

function mapNote(row: NoteRow): Note {
  const createdAt = row.created_at ? new Date(row.created_at) : new Date(0);
  return {
    id: row.id ?? "",
    type: row.type ?? "note",
    title: row.title ?? "",
    content: row.content ?? "",
    subject: row.subject ?? undefined,
    tags: Array.isArray(row.tags) ? row.tags : [],
    problems: normalizeNoteProblems(row.problems),
    createdAt,
    updatedAt: row.updated_at ? new Date(row.updated_at) : createdAt,
    isPublished: row.is_published ?? false,
    contentVersion: row.content_version ?? null,
  };
}

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

function normalizeReasoningEffort(value: unknown): DeepSeekReasoningEffort | undefined {
  return value === "high" || value === "max" ? value : undefined;
}

function normalizeThinkingMode(value: unknown): DeepSeekThinkingMode | undefined {
  return value === "enabled" || value === "disabled" ? value : undefined;
}

type NoteQAStreamEvent =
  | { type: "meta"; sources: NoteQASource[]; totalChunks: number; retrieval: NoteQARetrievalSummary; indexStats: unknown }
  | { type: "delta"; delta: string }
  | { type: "done"; tokensUsed: number }
  | { type: "error"; error: string };

function createNoteQAStream(
  upstream: Response,
  metadata: Extract<NoteQAStreamEvent, { type: "meta" }>,
  requestSignal: AbortSignal,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const event = (value: NoteQAStreamEvent) => encoder.encode(`data: ${JSON.stringify(value)}\n\n`);
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let streamCancelled = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      if (requestSignal.aborted || streamCancelled) {
        controller.close();
        return;
      }

      controller.enqueue(event(metadata));
      reader = upstream.body?.getReader() ?? null;
      if (!reader) {
        controller.enqueue(event({ type: "error", error: "DeepSeek API 未返回可读取的流" }));
        controller.close();
        return;
      }

      const activeReader = reader;
      const abortUpstream = () => {
        void activeReader.cancel(requestSignal.reason).catch(() => undefined);
      };
      requestSignal.addEventListener("abort", abortUpstream, { once: true });

      let buffer = "";
      let tokensUsed = 0;
      let upstreamDone = false;

      const enqueue = (value: NoteQAStreamEvent) => {
        if (!streamCancelled && !requestSignal.aborted) controller.enqueue(event(value));
      };

      const handleLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) return;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") {
          upstreamDone = true;
          return;
        }
        if (upstreamDone) return;

        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: unknown } }>;
          error?: { message?: unknown } | string;
          usage?: { total_tokens?: unknown };
        };
        if (parsed.error) {
          const message = typeof parsed.error === "string"
            ? parsed.error
            : typeof parsed.error.message === "string" ? parsed.error.message : "DeepSeek 流式回答失败";
          throw new Error(message);
        }
        if (typeof parsed.usage?.total_tokens === "number") tokensUsed = parsed.usage.total_tokens;
        const delta = parsed.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) enqueue({ type: "delta", delta });
      };

      try {
        while (!upstreamDone) {
          if (requestSignal.aborted || streamCancelled) return;
          const { done: readerDone, value } = await activeReader.read();
          if (readerDone) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? "";
          lines.forEach(handleLine);
        }
        buffer += decoder.decode();
        if (buffer) handleLine(buffer);
        if (!upstreamDone) throw new Error("DeepSeek 回答流提前结束");
        enqueue({ type: "done", tokensUsed });
        controller.close();
      } catch (error) {
        if (!requestSignal.aborted && !streamCancelled) {
          enqueue({
            type: "error",
            error: error instanceof Error ? error.message : "DeepSeek 流式回答失败",
          });
          controller.close();
        }
      } finally {
        requestSignal.removeEventListener("abort", abortUpstream);
        activeReader.releaseLock();
        reader = null;
      }
    },
    async cancel(reason) {
      streamCancelled = true;
      await reader?.cancel(reason).catch(() => undefined);
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAdminRequestContext(req);
    if (!auth.ok) return auth.response;

    const body: unknown = await req.json().catch(() => ({}));
    const record = body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
    const question = normalizeNoteQAQuestion(record.question);
    const scope = normalizeNoteQAScope(record.scope);
    const subject = normalizeNoteQASubject(record.subject);
    const mode = normalizeNoteQAMode(record.mode);
    const contextLimit = normalizeNoteQAContextLimit(record.contextLimit);
    const conversation = normalizeNoteQAConversation(record.conversation);
    const stream = record.stream === true;
    const selectedText = typeof record.selectedText === "string"
      ? record.selectedText.replace(/\s+/g, " ").trim().slice(0, 2_000)
      : "";
    const noteId = typeof record.noteId === "string" ? record.noteId.trim().slice(0, 80) : "";

    if (!question) {
      return NextResponse.json({ error: "请输入要查的问题", success: false }, { status: 400 });
    }

    const apiKey = resolveAIKey("deepseek", record.apiKey);
    const model = typeof record.model === "string" && record.model.trim()
      ? record.model.trim()
      : DEFAULT_DEEPSEEK_MODEL;
    const normalizedReasoningEffort = normalizeReasoningEffort(record.reasoningEffort);
    const thinking = normalizeThinkingMode(record.thinking)
      ?? (record.reasoningEffort === "low" ? "disabled" : normalizedReasoningEffort ? "enabled" : undefined);
    const reasoningEffort = thinking === "disabled" ? undefined : normalizedReasoningEffort;

    if (!apiKey) {
      return NextResponse.json({ error: "DeepSeek API key 未配置", success: false }, { status: 400 });
    }

    const supabase = auth.context.supabase;
    let sourceQuery = supabase
      .from("notes")
      .select(NOTE_QA_FIELDS)
      .order("updated_at", { ascending: false })
      .limit(160);
    if (noteId) sourceQuery = sourceQuery.eq("id", noteId);
    if (scope !== "all") sourceQuery = sourceQuery.eq("type", scope);
    if (subject !== "all") sourceQuery = sourceQuery.eq("subject", subject);
    const { data: sourceRows, error: sourceError } = await sourceQuery;
    if (sourceError) throw sourceError;
    const notes = ((sourceRows ?? []) as NoteRow[]).map(mapNote);

    const indexStats = await syncPrivateNotesRag(supabase, notes);
    const retrievalQuestion = normalizeNoteQAQuestion(
      selectedText ? `${question}\n${selectedText.slice(0, 300)}` : question,
    );
    const { context, sources, totalChunks } = await searchPrivateNoteRag(supabase, {
      question: retrievalQuestion,
      noteId: noteId || undefined,
      limit: contextLimit,
    });
    if (!context || sources.length === 0) {
      return NextResponse.json({
        error: "没有找到可用于回答的私人笔记内容",
        success: false,
      }, { status: 404 });
    }
    const retrieval = summarizeNoteQARetrieval(sources, totalChunks);
    const memoryContext = buildAcceptedMemoryContext(await listAssistantMemories(supabase));

    const systemPrompt = `你是笔记阅读界面的复习助手，只根据给出的笔记片段回答。
规则：
- 不补充笔记片段之外的事实。
- 证据不足时直接说明没有足够依据。
- 先给一句结论，再给必要的解释或步骤，最后用一句话说明不确定性（如果没有不确定性就省略）。
- 每个关键结论紧跟对应来源编号，例如 [S1]、[S2]；不要把引用集中到段末或引用没有出现在上下文里的编号。
- 回答要短、准、适合复习；不要复述整段资料，也不要编造页码。
- 涉及公式时使用 Markdown 和 LaTeX。
- 用户已确认的记忆只作为偏好和学习背景，不能替代笔记证据，也不能伪造来源。
- 若问题涉及经济学概念，必须同时给出严谨定义和通俗解释；资料没有足够定义或页码时明确指出缺口，不得伪造平狄克教材引用。
- ${getModeInstruction(mode)}`;

    const conversationContext = conversation.length > 0
      ? conversation.map((turn) => `${turn.role === "user" ? "用户" : "助手"}：${turn.content}`).join("\n")
      : "";

    const userPrompt = `${conversationContext ? `此前对话（仅用于理解追问指代，不能替代笔记证据）：\n${conversationContext}\n\n` : ""}当前问题：${question}${selectedText ? `\n\n用户选中的笔记原文：\n${selectedText}` : ""}${memoryContext ? `\n\n用户已确认的记忆：\n${memoryContext}` : ""}

可用片段：
${context}`;

    const aiMessages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];
    const aiOptions = {
      temperature: mode === "quiz" ? 0.35 : 0.2,
      maxTokens: mode === "quiz" ? 1600 : 1400,
      reasoningEffort,
      thinking,
    } as const;

    if (stream) {
      const upstream = await openDeepSeekStream(apiKey, model, aiMessages, {
        ...aiOptions,
        signal: req.signal,
      });
      const body = createNoteQAStream(upstream, {
        type: "meta",
        sources,
        totalChunks,
        retrieval,
        indexStats,
      }, req.signal);
      return new Response(body, {
        headers: {
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "Content-Type": "text/event-stream; charset=utf-8",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const { content, tokensUsed } = await callDeepSeek(
      apiKey,
      model,
      aiMessages,
      { ...aiOptions, signal: req.signal },
    );

    return NextResponse.json({
      answer: content.trim(),
      sources,
      totalChunks,
      retrieval,
      indexStats,
      tokensUsed,
      success: true,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "资料检索失败";
    console.error("[NoteQA] Error:", message);
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
