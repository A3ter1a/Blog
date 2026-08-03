"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BookOpen, Bot, ListChecks, Loader2, MemoryStick, Quote, Send, Trash2, X } from "lucide-react";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { useToast } from "@/components/ui/Toast";
import { AI_CONFIG_STORAGE_KEY, ALLOW_CLIENT_AI_KEYS, DEFAULT_AI_CONFIG, normalizeAIConfig } from "@/lib/ai-config";
import { resolveAIProviderRoute } from "@/lib/ai-provider-routing";
import { readJsonStorage } from "@/lib/browser-storage";
import { buildAuthHeaders } from "@/lib/fetch-with-auth";
import type { AiKnowledgeQuizItemPublic } from "@/lib/ai-knowledge-quiz-contract";
import type { NoteQASource } from "@/lib/note-qa";
import { useAdminAuth } from "@/hooks/useAdminAuth";

type AssistantDockProps = {
  noteId: string;
  noteTitle: string;
  sourcePath?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotedText?: string;
  onQuotedTextConsumed?: () => void;
};

type AssistantChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  question?: string;
  sources?: NoteQASource[];
  totalChunks?: number;
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

const ASSISTANT_CONVERSATION_STORAGE_PREFIX = "asteroid:note-assistant:v1";
const MAX_STORED_MESSAGES = 24;

function createMessageId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getConversationStorageKey(noteId: string): string {
  return `${ASSISTANT_CONVERSATION_STORAGE_PREFIX}:${noteId}`;
}

function normalizeStoredMessages(value: unknown): AssistantChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): AssistantChatMessage[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const candidate = item as Partial<AssistantChatMessage>;
    if (candidate.role !== "user" && candidate.role !== "assistant") return [];
    if (typeof candidate.id !== "string" || typeof candidate.content !== "string" || typeof candidate.createdAt !== "string") return [];
    return [{
      id: candidate.id,
      role: candidate.role,
      content: candidate.content.slice(0, 8_000),
      createdAt: candidate.createdAt,
      question: typeof candidate.question === "string" ? candidate.question.slice(0, 2_000) : undefined,
      sources: Array.isArray(candidate.sources) ? candidate.sources.slice(0, 12) as NoteQASource[] : undefined,
      totalChunks: typeof candidate.totalChunks === "number" ? candidate.totalChunks : undefined,
    }];
  }).slice(-MAX_STORED_MESSAGES);
}

/**
 * The assistant is intentionally a note-reader-only surface. The reader owns
 * the trigger and layout state; this component only renders the right drawer
 * once it has been opened for a concrete note.
 */
export function AssistantDock({
  noteId,
  noteTitle,
  sourcePath,
  open,
  onOpenChange,
  quotedText,
  onQuotedTextConsumed,
}: AssistantDockProps) {
  const toast = useToast();
  const { loading: authLoading, isAdmin } = useAdminAuth();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [loadedConversationNoteId, setLoadedConversationNoteId] = useState("");
  const [loading, setLoading] = useState(false);
  const [reasoning, setReasoning] = useState<"fast" | "deep">("fast");
  const [quizSets, setQuizSets] = useState<AssistantQuizSet[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<AssistantQuizSet | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string | string[] | boolean>>({});
  const [quizResult, setQuizResult] = useState<AssistantQuizResult | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [activeQuote, setActiveQuote] = useState("");
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const conversationReady = loadedConversationNoteId === noteId;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setMessages(normalizeStoredMessages(JSON.parse(window.sessionStorage.getItem(getConversationStorageKey(noteId)) ?? "[]")));
      } catch {
        setMessages([]);
      } finally {
        setLoadedConversationNoteId(noteId);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [noteId]);

  useEffect(() => {
    if (loadedConversationNoteId !== noteId) return;
    try {
      window.sessionStorage.setItem(getConversationStorageKey(noteId), JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)));
    } catch {
      // 对话仍保留在当前页面内；会话存储不可用时不应中断提问。
    }
  }, [loadedConversationNoteId, messages, noteId]);

  useEffect(() => {
    if (!isAdmin || !noteId || !open) return;
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
  }, [isAdmin, noteId, open]);

  useEffect(() => {
    if (!open) return;

    const nextQuote = quotedText?.replace(/\s+/g, " ").trim().slice(0, 1_600) ?? "";
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusTimer = window.setTimeout(() => {
      if (nextQuote) {
        setActiveQuote(nextQuote);
        onQuotedTextConsumed?.();
      }
      composerRef.current?.focus();
    }, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onOpenChange, onQuotedTextConsumed, open, quotedText]);

  const ask = async () => {
    const userQuestion = question.trim() || (activeQuote ? "请解释这段选中的内容。" : "");
    if (!userQuestion || loading) return;
    const quoteSnapshot = activeQuote;
    const displayQuestion = quoteSnapshot
      ? `> ${quoteSnapshot.replace(/\n/g, "\n> ")}\n\n${userQuestion}`
      : userQuestion;
    const userMessage: AssistantChatMessage = {
      id: createMessageId(),
      role: "user",
      content: displayQuestion,
      createdAt: new Date().toISOString(),
    };
    const conversation = messages.slice(-10).map((message) => ({
      role: message.role,
      content: message.content,
    }));

    setLoading(true);
    setMessages((current) => [...current, userMessage].slice(-MAX_STORED_MESSAGES));
    setQuestion("");
    setActiveQuote("");
    try {
      const config = readJsonStorage(AI_CONFIG_STORAGE_KEY, DEFAULT_AI_CONFIG, normalizeAIConfig);
      const route = resolveAIProviderRoute(reasoning === "deep" ? "deep_reasoning" : "fast_retrieval");
      const request = await fetch("/api/ai/note-qa", {
        method: "POST",
        headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          question: userQuestion,
          selectedText: quoteSnapshot || undefined,
          conversation,
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
      const assistantMessage: AssistantChatMessage = {
        id: createMessageId(),
        role: "assistant",
        content: payload.answer as string,
        createdAt: new Date().toISOString(),
        question: userQuestion,
        sources: Array.isArray(payload.sources) ? payload.sources as NoteQASource[] : [],
        totalChunks: typeof payload.totalChunks === "number" ? payload.totalChunks : 0,
      };
      setMessages((current) => [...current, assistantMessage].slice(-MAX_STORED_MESSAGES));
    } catch (error) {
      setMessages((current) => current.filter((message) => message.id !== userMessage.id));
      setQuestion(userQuestion);
      setActiveQuote(quoteSnapshot);
      toast.error(`助手回答失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setLoading(false);
    }
  };

  const proposeMemory = async (message: AssistantChatMessage) => {
    if (message.role !== "assistant") return;
    try {
      const request = await fetch("/api/assistant/memories", {
        method: "POST",
        headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          action: "propose",
          commandId: crypto.randomUUID(),
          content: `问题：${message.question ?? "当前笔记追问"}\n结论：${message.content}`,
          reason: "可能影响后续复习建议，等待用户确认",
          sourcePath: sourcePath ?? `/notes/${encodeURIComponent(noteId)}`,
        }),
      });
      const payload = await request.json() as { memory?: unknown; error?: unknown };
      if (!request.ok || !payload.memory) throw new Error(typeof payload.error === "string" ? payload.error : "记忆候选保存失败");
      toast.success("已送到工具页的助手记忆，等待你审核");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法形成记忆候选");
    }
  };

  const startQuiz = (quiz: AssistantQuizSet) => {
    setActiveQuiz(quiz);
    setQuizAnswers({});
    setQuizResult(null);
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

  const suggestedQuestions = ["概括本篇主线", "指出最容易混淆的概念", "按考试思路整理重点"];

  if (authLoading || !isAdmin || !noteId || !open) return null;

  return (
    <aside
      id="assistant-dock"
      className="assistant-dock-panel"
      role="complementary"
      aria-labelledby="assistant-dock-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onOpenChange(false);
        }
      }}
    >
      <header className="assistant-dock-header">
        <div className="flex min-w-0 items-start gap-3">
          <span className="assistant-dock-mark"><Bot className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <div id="assistant-dock-title" className="font-headline text-lg font-bold text-on-surface">问助手</div>
            <p className="mt-0.5 truncate text-xs text-on-surface-variant">{noteTitle}</p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              className="assistant-icon-button"
              aria-label="清空当前笔记的助手对话"
              title="清空对话"
              onClick={() => {
                if (window.confirm("清空当前笔记的助手对话吗？此操作不会删除笔记。")) setMessages([]);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            className="assistant-icon-button"
            aria-label="关闭笔记助手"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="assistant-dock-toolbar" aria-label="回答方式">
          <button type="button" aria-pressed={reasoning === "fast"} onClick={() => setReasoning("fast")} className={reasoning === "fast" ? "is-active" : ""}>快速</button>
          <button type="button" aria-pressed={reasoning === "deep"} onClick={() => setReasoning("deep")} className={reasoning === "deep" ? "is-active" : ""}>深度</button>
          {quizSets.length > 0 && <button type="button" onClick={() => startQuiz(quizSets[0])} className={activeQuiz ? "is-active ml-auto" : "ml-auto"}><ListChecks className="h-4 w-4" />快测</button>}
        </div>
      </header>

      <div className="assistant-dock-body">
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
          ) : !conversationReady ? (
            <div className="assistant-dock-loading"><Loader2 className="h-5 w-5 animate-spin" />恢复本篇对话…</div>
          ) : messages.length > 0 ? (
            <div className="assistant-message-list" aria-live="polite">
              {messages.map((message) => (
                <article key={message.id} className={`assistant-message ${message.role}`}>
                  <span className="assistant-message-role">{message.role === "assistant" ? "助手" : "你"}</span>
                  <div className="assistant-message-bubble">
                    <MarkdownContent content={message.content} className="text-sm leading-7 text-on-surface" />
                  </div>
                  {message.role === "assistant" && (
                    <div className="assistant-message-meta">
                      <span>{typeof message.totalChunks === "number" ? `检索 ${message.totalChunks} 个片段` : "基于当前笔记"}</span>
                      <button type="button" onClick={() => void proposeMemory(message)}><MemoryStick className="h-3.5 w-3.5" />记忆候选</button>
                    </div>
                  )}
                  {message.role === "assistant" && message.sources && message.sources.length > 0 && (
                    <div className="assistant-source-list" aria-label="回答引用来源">
                      {message.sources.map((source) => (
                        <Link key={source.id} href={source.href} className="assistant-source-card">
                          <strong>[{source.id}] {source.sourceLabel}</strong>
                          <span>{source.noteTitle}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </article>
              ))}
              {loading && <div className="assistant-thinking" role="status"><Loader2 className="h-4 w-4 animate-spin" />正在当前笔记中查找依据…</div>}
            </div>
          ) : (
            <div className="assistant-empty-state">
              <BookOpen className="h-7 w-7" />
              <div>
                <strong>从这篇笔记开始问</strong>
                <p>回答只引用当前笔记；你也可以先选中文字再呼出助手。</p>
              </div>
              <div className="assistant-suggestion-list">
                {suggestedQuestions.map((suggestion) => (
                  <button type="button" key={suggestion} onClick={() => { setQuestion(suggestion); composerRef.current?.focus(); }}>{suggestion}</button>
                ))}
              </div>
            </div>
          )}
      </div>

      {!activeQuiz && (
        <footer className="assistant-composer">
          {activeQuote && (
            <div className="assistant-quote-card">
              <Quote className="h-4 w-4" />
              <p>{activeQuote}</p>
              <button type="button" onClick={() => setActiveQuote("")} aria-label="移除引用"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}
          <label htmlFor="assistant-question" className="sr-only">询问当前笔记</label>
          <textarea id="assistant-question" ref={composerRef} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void ask();
            }
          }} rows={2} className="field-control w-full resize-none px-3 py-2.5 text-sm" placeholder={activeQuote ? "围绕选中内容提问（留空可直接解释）" : "问当前笔记…"} />
          <div className="assistant-composer-actions">
            <span>Enter 发送 · Shift+Enter 换行</span>
            <button type="button" onClick={() => void ask()} disabled={loading || (!question.trim() && !activeQuote)} className="control-button control-button-primary h-10 px-4 text-sm">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {loading ? "回答中" : "发送"}
            </button>
          </div>
        </footer>
      )}
    </aside>
  );
}
