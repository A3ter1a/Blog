"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Bot, Check, Loader2, MemoryStick, Send, X } from "lucide-react";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { useToast } from "@/components/ui/Toast";
import {
  normalizeAssistantMemories,
  type AssistantMemoryCandidate,
} from "@/lib/assistant-memory";
import { AI_CONFIG_STORAGE_KEY, ALLOW_CLIENT_AI_KEYS, DEFAULT_AI_CONFIG, normalizeAIConfig } from "@/lib/ai-config";
import { resolveAIProviderRoute } from "@/lib/ai-provider-routing";
import { readJsonStorage } from "@/lib/browser-storage";
import { buildAuthHeaders } from "@/lib/fetch-with-auth";
import type { NoteQASource } from "@/lib/note-qa";
import { useAdminAuth } from "@/hooks/useAdminAuth";

type AssistantResponse = {
  answer: string;
  sources: NoteQASource[];
  totalChunks: number;
  indexStats?: { createdVersions: number; unchanged: number; skipped: number; chunkCount: number };
};

export function AssistantDock() {
  const pathname = usePathname();
  const toast = useToast();
  const { loading: authLoading, isAdmin } = useAdminAuth();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [reasoning, setReasoning] = useState<"fast" | "deep">("fast");
  const [memories, setMemories] = useState<AssistantMemoryCandidate[]>([]);
  const noteId = useMemo(() => {
    const match = pathname.match(/^\/notes\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }, [pathname]);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    void (async () => {
      try {
        const request = await fetch("/api/assistant/memories", { headers: await buildAuthHeaders() });
        const payload = await request.json() as { memories?: unknown };
        if (active && request.ok) setMemories(normalizeAssistantMemories(payload.memories));
      } catch {
        if (active) setMemories([]);
      }
    })();
    return () => { active = false; };
  }, [isAdmin]);

  const ask = async () => {
    if (!question.trim() || loading) return;
    setLoading(true);
    setResponse(null);
    try {
      const config = readJsonStorage(AI_CONFIG_STORAGE_KEY, DEFAULT_AI_CONFIG, normalizeAIConfig);
      const route = resolveAIProviderRoute(reasoning === "deep" ? "deep_reasoning" : "fast_retrieval");
      const request = await fetch("/api/ai/note-qa", {
        method: "POST",
        headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          question: question.trim(),
          noteId: noteId || undefined,
          scope: "all",
          mode: "answer",
          contextLimit: reasoning === "deep" ? 12 : 8,
          model: route.model,
          apiKey: ALLOW_CLIENT_AI_KEYS ? config.deepseekApiKey : undefined,
        }),
      });
      const payload = await request.json() as { answer?: unknown; sources?: unknown; totalChunks?: unknown; indexStats?: unknown; error?: unknown };
      if (!request.ok || typeof payload.answer !== "string") {
        throw new Error(typeof payload.error === "string" ? payload.error : "助手没有返回有效回答");
      }
      setResponse({
        answer: payload.answer,
        sources: Array.isArray(payload.sources) ? payload.sources as NoteQASource[] : [],
        totalChunks: typeof payload.totalChunks === "number" ? payload.totalChunks : 0,
        indexStats: payload.indexStats && typeof payload.indexStats === "object"
          ? payload.indexStats as AssistantResponse["indexStats"]
          : undefined,
      });
    } catch (error) {
      toast.error(`助手回答失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setLoading(false);
    }
  };

  const proposeMemory = async () => {
    if (!response) return;
    try {
      const request = await fetch("/api/assistant/memories", {
        method: "POST",
        headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          action: "propose",
          commandId: crypto.randomUUID(),
          content: `问题：${question.trim()}\n结论：${response.answer}`,
          reason: "可能影响后续复习建议，等待用户确认",
          sourcePath: pathname,
        }),
      });
      const payload = await request.json() as { memory?: unknown; error?: unknown };
      const normalized = normalizeAssistantMemories([payload.memory]);
      if (!request.ok || normalized.length !== 1) throw new Error(typeof payload.error === "string" ? payload.error : "记忆候选保存失败");
      setMemories([normalized[0], ...memories.filter((memory) => memory.id !== normalized[0].id)].slice(0, 40));
      toast.success("已形成记忆候选，尚未长期记住");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法形成记忆候选");
    }
  };

  const decideMemory = async (id: string, decision: "accepted" | "rejected") => {
    try {
      const request = await fetch("/api/assistant/memories", {
        method: "POST",
        headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action: "decide", candidateId: id, decision }),
      });
      const payload = await request.json() as { memory?: unknown; error?: unknown };
      const normalized = normalizeAssistantMemories([payload.memory]);
      if (!request.ok || normalized.length !== 1) throw new Error(typeof payload.error === "string" ? payload.error : "记忆确认失败");
      setMemories(memories.map((memory) => memory.id === id ? normalized[0] : memory));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "记忆候选处理失败");
    }
  };

  const proposedMemories = memories.filter((memory) => memory.status === "proposed");
  const acceptedCount = memories.filter((memory) => memory.status === "accepted").length;

  if (authLoading || !isAdmin) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-primary/25 bg-primary text-on-primary shadow-lg transition-transform hover:scale-105"
        aria-label="打开学习助手"
      >
        <Bot className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex justify-end bg-black/20" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setOpen(false);
        }}>
          <aside className="flex h-full w-full max-w-[31rem] flex-col border-l border-outline-variant/25 bg-surface shadow-2xl" role="dialog" aria-modal="true" aria-label="Asteroid 学习助手">
            <header className="border-b border-outline-variant/20 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-headline text-lg font-bold text-on-surface"><Bot className="h-5 w-5 text-primary" />学习助手</div>
                  <p className="mt-1 text-xs text-on-surface-variant">{noteId ? "当前笔记上下文" : "全部笔记上下文"} · 来源约束回答</p>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="control-button h-9 w-9 p-0" aria-label="关闭学习助手"><X className="h-4 w-4" /></button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="tag-chip px-2 py-1">持久混合检索 · pgvector</span>
                <span className="tag-chip px-2 py-1">已接受记忆 {acceptedCount}</span>
                <span className="tag-chip px-2 py-1">写操作需确认</span>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-4 flex gap-2">
                <button type="button" onClick={() => setReasoning("fast")} className={`control-button h-9 px-3 text-xs ${reasoning === "fast" ? "control-button-selected" : ""}`}>快速定位 · V4 Flash</button>
                <button type="button" onClick={() => setReasoning("deep")} className={`control-button h-9 px-3 text-xs ${reasoning === "deep" ? "control-button-selected" : ""}`}>深度串联 · V4 Pro</button>
              </div>

              {response ? (
                <div className="space-y-4">
                  <section className="rounded-lg border border-outline-variant/20 bg-surface-container-low p-4">
                    <MarkdownContent content={response.answer} className="text-sm leading-7 text-on-surface" />
                  </section>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-on-surface-variant">检索 {response.totalChunks} 个候选片段</span>
                    <button type="button" onClick={() => void proposeMemory()} className="control-button h-9 px-3 text-xs"><MemoryStick className="h-4 w-4" />设为记忆候选</button>
                  </div>
                  {response.sources.length > 0 && (
                    <section>
                      <h3 className="mb-2 text-xs font-semibold text-on-surface-variant">引用来源</h3>
                      <div className="space-y-2">
                        {response.sources.map((source) => (
                          <Link key={source.id} href={source.href} className="block rounded-lg border border-outline-variant/20 px-3 py-2 text-sm hover:border-primary/35">
                            <div className="font-semibold text-on-surface">[{source.id}] {source.noteTitle}</div>
                            <div className="mt-1 text-xs text-on-surface-variant">{source.sourceLabel}</div>
                          </Link>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              ) : (
                <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center text-sm text-on-surface-variant">
                  <BookOpen className="h-9 w-9 opacity-40" />
                  <p>{noteId ? "询问当前笔记，助手会优先限定在这篇内容中。" : "询问你的笔记；没有证据时，助手应明确说不知道。"}</p>
                </div>
              )}

              {proposedMemories.length > 0 && (
                <section className="mt-5 border-t border-outline-variant/20 pt-4">
                  <h3 className="mb-2 text-xs font-semibold text-on-surface-variant">等待你确认的记忆</h3>
                  <div className="space-y-2">
                    {proposedMemories.map((memory) => (
                      <div key={memory.id} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                        <p className="line-clamp-4 whitespace-pre-wrap text-xs leading-5 text-on-surface">{memory.content}</p>
                        <div className="mt-2 flex gap-2">
                          <button type="button" onClick={() => void decideMemory(memory.id, "accepted")} className="control-button control-button-primary h-8 px-2 text-xs"><Check className="h-3.5 w-3.5" />接受</button>
                          <button type="button" onClick={() => void decideMemory(memory.id, "rejected")} className="control-button h-8 px-2 text-xs">拒绝</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <footer className="border-t border-outline-variant/20 p-4">
              <textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void ask();
                }
              }} rows={3} className="field-control w-full resize-none px-3 py-2 text-sm" placeholder={noteId ? "问当前笔记..." : "问全部笔记..."} />
              <button type="button" onClick={() => void ask()} disabled={loading || !question.trim()} className="control-button control-button-primary mt-2 h-10 w-full px-3 text-sm">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {loading ? "正在检索并回答" : "发送"}
              </button>
            </footer>
          </aside>
        </div>
      )}
    </>
  );
}
