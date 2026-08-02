"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BookOpen, Bot, Check, ListChecks, Loader2, MemoryStick, Send, X } from "lucide-react";
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
import type { AiKnowledgeQuizItemPublic } from "@/lib/ai-knowledge-quiz-contract";
import type { NoteQASource } from "@/lib/note-qa";
import { useAdminAuth } from "@/hooks/useAdminAuth";

type AssistantResponse = {
  answer: string;
  sources: NoteQASource[];
  totalChunks: number;
  indexStats?: { createdVersions: number; unchanged: number; skipped: number; chunkCount: number };
};

type AssistantDockProps = {
  noteId: string;
  noteTitle: string;
  sourcePath?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type AssistantQuizSet = {
  quiz: { id: string; title: string; item_count: number };
  items: AiKnowledgeQuizItemPublic[];
};

type AssistantQuizResult = {
  score: number;
  correctCount: number;
  total: number;
  details: Array<{ itemId: string; correct: boolean; explanation: string; knowledgePoints: string[] }>;
};

/**
 * The assistant is intentionally a note-reader-only surface. The reader owns
 * the trigger and layout state; this component only renders the right drawer
 * once it has been opened for a concrete note.
 */
export function AssistantDock({ noteId, noteTitle, sourcePath, open, onOpenChange }: AssistantDockProps) {
  const toast = useToast();
  const { loading: authLoading, isAdmin } = useAdminAuth();
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [reasoning, setReasoning] = useState<"fast" | "deep">("fast");
  const [memories, setMemories] = useState<AssistantMemoryCandidate[]>([]);
  const [quizSets, setQuizSets] = useState<AssistantQuizSet[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<AssistantQuizSet | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string | string[] | boolean>>({});
  const [quizResult, setQuizResult] = useState<AssistantQuizResult | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

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

  useEffect(() => {
    if (!isAdmin || !noteId) return;
    let active = true;
    void (async () => {
      try {
        const request = await fetch(`/api/knowledge-quizzes?noteId=${encodeURIComponent(noteId)}`, { headers: await buildAuthHeaders() });
        const payload = await request.json() as { quizzes?: unknown };
        if (!active || !request.ok || !Array.isArray(payload.quizzes)) return;
        setQuizSets(payload.quizzes as AssistantQuizSet[]);
      } catch {
        if (active) setQuizSets([]);
      }
    })();
    return () => { active = false; };
  }, [isAdmin, noteId]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), textarea:not([disabled]), a[href], input:not([disabled]), select:not([disabled])",
      )).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onOpenChange, open]);

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
          noteId,
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
          sourcePath: sourcePath ?? `/notes/${encodeURIComponent(noteId)}`,
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

  const startQuiz = (quiz: AssistantQuizSet) => {
    setActiveQuiz(quiz);
    setQuizAnswers({});
    setQuizResult(null);
    setResponse(null);
  };

  const submitQuiz = async () => {
    if (!activeQuiz || quizLoading) return;
    setQuizLoading(true);
    try {
      const request = await fetch(`/api/knowledge-quizzes/${encodeURIComponent(activeQuiz.quiz.id)}/attempt`, {
        method: "POST",
        headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ answers: quizAnswers }),
      });
      const payload = await request.json() as { result?: unknown; error?: unknown };
      if (!request.ok || !payload.result || typeof payload.result !== "object") {
        throw new Error(typeof payload.error === "string" ? payload.error : "快测提交失败");
      }
      setQuizResult(payload.result as AssistantQuizResult);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "快测提交失败");
    } finally {
      setQuizLoading(false);
    }
  };

  const proposedMemories = memories.filter((memory) => memory.status === "proposed");
  const acceptedCount = memories.filter((memory) => memory.status === "accepted").length;

  if (authLoading || !isAdmin || !noteId || !open) return null;

  return (
    <div className="assistant-dock-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onOpenChange(false);
    }}>
      <aside
        ref={panelRef}
        id="assistant-dock"
        className="assistant-dock-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assistant-dock-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="border-b border-outline-variant/20 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div id="assistant-dock-title" className="flex items-center gap-2 font-headline text-lg font-bold text-on-surface"><Bot className="h-5 w-5 text-primary" />问助手</div>
              <p className="mt-1 line-clamp-2 text-xs text-on-surface-variant">当前笔记：{noteTitle} · 来源约束回答</p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onMouseDown={(event) => {
                event.stopPropagation();
                onOpenChange(false);
              }}
              onClick={(event) => {
                event.stopPropagation();
                onOpenChange(false);
              }}
              className="control-button h-9 w-9 p-0"
              aria-label="关闭笔记助手"
            >
              <X className="h-4 w-4" />
            </button>
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
            {quizSets.length > 0 && <button type="button" onClick={() => startQuiz(quizSets[0])} className={`control-button h-9 px-3 text-xs ${activeQuiz ? "control-button-selected" : ""}`}><ListChecks className="h-4 w-4" />知识点快测</button>}
          </div>

          {activeQuiz ? (
            <section className="space-y-4">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">知识点快测</p><h3 className="mt-1 font-headline text-base font-semibold text-on-surface">{activeQuiz.quiz.title}</h3><p className="mt-1 text-xs text-on-surface-variant">先独立作答，提交后才显示答案与解析。</p></div><button type="button" className="control-button h-8 px-2 text-xs" onClick={() => { setActiveQuiz(null); setQuizResult(null); }}>返回问答</button></div>
              {activeQuiz.items.map((item) => (
                <div key={item.id} className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-3">
                  <p className="text-sm font-medium leading-6 text-on-surface">{item.ordinal}. {item.question}</p>
                  {item.options.length > 0 && <div className="mt-2 space-y-1.5">{item.options.map((option) => <label key={option.label} className="flex items-start gap-2 text-xs leading-5 text-on-surface-variant"><input type={item.itemType === "multiple_choice" ? "checkbox" : "radio"} name={`quiz-${item.id}`} checked={Array.isArray(quizAnswers[item.id]) ? (quizAnswers[item.id] as string[]).includes(option.label) : quizAnswers[item.id] === option.label} onChange={(event) => { if (item.itemType === "multiple_choice") { const current = Array.isArray(quizAnswers[item.id]) ? quizAnswers[item.id] as string[] : []; setQuizAnswers({ ...quizAnswers, [item.id]: event.target.checked ? [...current, option.label] : current.filter((label) => label !== option.label) }); } else { setQuizAnswers({ ...quizAnswers, [item.id]: option.label }); } }} /> <span><strong>{option.label}.</strong> {option.text}</span></label>)}</div>}
                  {item.itemType === "true_false" && <select className="field-control mt-2 h-9 w-full px-2 text-xs" value={typeof quizAnswers[item.id] === "boolean" ? String(quizAnswers[item.id]) : ""} onChange={(event) => setQuizAnswers({ ...quizAnswers, [item.id]: event.target.value === "true" })}><option value="">选择判断</option><option value="true">正确</option><option value="false">错误</option></select>}
                  {item.itemType === "short_answer" && <input className="field-control mt-2 h-9 w-full px-2 text-xs" value={typeof quizAnswers[item.id] === "string" ? quizAnswers[item.id] as string : ""} onChange={(event) => setQuizAnswers({ ...quizAnswers, [item.id]: event.target.value })} placeholder="输入你的答案" />}
                  {quizResult && <div className={`mt-3 border-t border-outline-variant/15 pt-2 text-xs leading-5 ${quizResult.details.find((detail) => detail.itemId === item.id)?.correct ? "text-emerald-700" : "text-amber-700"}`}>{quizResult.details.find((detail) => detail.itemId === item.id)?.correct ? "回答正确" : "需要复盘"}：{quizResult.details.find((detail) => detail.itemId === item.id)?.explanation}</div>}
                </div>
              ))}
              {quizResult ? <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-3 text-sm text-primary">本次得分 {quizResult.score} 分 · {quizResult.correctCount}/{quizResult.total} 题正确</div> : <button type="button" className="control-button control-button-primary h-10 w-full px-3 text-sm" onClick={() => void submitQuiz()} disabled={quizLoading}>{quizLoading ? "正在判定" : "提交快测"}</button>}
            </section>
          ) : response ? (
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
              <p>询问当前笔记，助手会优先限定在这篇内容中。</p>
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
          }} rows={3} className="field-control w-full resize-none px-3 py-2 text-sm" placeholder="问当前笔记..." />
          <button type="button" onClick={() => void ask()} disabled={loading || !question.trim()} className="control-button control-button-primary mt-2 h-10 w-full px-3 text-sm">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {loading ? "正在检索并回答" : "发送"}
          </button>
        </footer>
      </aside>
    </div>
  );
}
