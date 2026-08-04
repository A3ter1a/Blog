"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AlertCircle, BookOpen, Bot, Copy, ListChecks, Loader2, MemoryStick, Quote, RefreshCw, Send, Square, Trash2, X } from "lucide-react";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { useToast } from "@/components/ui/Toast";
import { AI_CONFIG_STORAGE_KEY, ALLOW_CLIENT_AI_KEYS, DEFAULT_AI_CONFIG, DEFAULT_DEEPSEEK_MODEL, normalizeAIConfig } from "@/lib/ai-config";
import { readJsonStorage } from "@/lib/browser-storage";
import { buildAuthHeaders } from "@/lib/fetch-with-auth";
import type { AiKnowledgeQuizItemPublic } from "@/lib/ai-knowledge-quiz-contract";
import type { NoteQARetrievalSummary, NoteQASource } from "@/lib/note-qa";
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
  userMessageId?: string;
  sources?: NoteQASource[];
  totalChunks?: number;
  retrieval?: NoteQARetrievalSummary;
  complete?: boolean;
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

const ASSISTANT_CONVERSATION_STORAGE_PREFIX = "asteroid:note-assistant:v2";
const LEGACY_ASSISTANT_CONVERSATION_STORAGE_PREFIX = "asteroid:note-assistant:v1";
const MAX_STORED_MESSAGES = 24;
const subscribeToPortalReady = () => () => {};
const getPortalReady = () => true;
const getServerPortalReady = () => false;

function createMessageId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getConversationStorageKey(noteId: string): string {
  return `${ASSISTANT_CONVERSATION_STORAGE_PREFIX}:${noteId}`;
}

function getLegacyConversationStorageKey(noteId: string): string {
  return `${LEGACY_ASSISTANT_CONVERSATION_STORAGE_PREFIX}:${noteId}`;
}

function getRetrievalConfidenceLabel(confidence: NoteQARetrievalSummary["confidence"]): string {
  return confidence === "high" ? "依据较强" : confidence === "medium" ? "依据一般" : "依据较弱";
}

function getLoadingPhaseLabel(phase: "indexing" | "retrieving" | "generating" | "idle"): string {
  if (phase === "indexing") return "准备当前笔记索引…";
  if (phase === "retrieving") return "正在检索相关段落…";
  if (phase === "generating") return "正在组织回答…";
  return "正在处理…";
}

function normalizeRetrievalSummary(value: unknown): NoteQARetrievalSummary | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<NoteQARetrievalSummary>;
  if ((candidate.confidence !== "high" && candidate.confidence !== "medium" && candidate.confidence !== "low")
    || typeof candidate.matchedChunks !== "number"
    || typeof candidate.totalChunks !== "number"
    || typeof candidate.topScore !== "number"
    || typeof candidate.averageScore !== "number") return undefined;
  return {
    confidence: candidate.confidence,
    matchedChunks: Math.max(0, Math.round(candidate.matchedChunks)),
    totalChunks: Math.max(0, Math.round(candidate.totalChunks)),
    topScore: Math.max(0, Math.min(1, candidate.topScore)),
    averageScore: Math.max(0, Math.min(1, candidate.averageScore)),
  };
}

function normalizeStoredMessages(value: unknown): AssistantChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): AssistantChatMessage[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const candidate = item as Partial<AssistantChatMessage>;
    if (candidate.role !== "user" && candidate.role !== "assistant") return [];
    if (typeof candidate.id !== "string" || typeof candidate.content !== "string" || typeof candidate.createdAt !== "string") return [];
    if (candidate.role === "assistant" && !candidate.content.trim()) return [];
    return [{
      id: candidate.id,
      role: candidate.role,
      content: candidate.content.slice(0, 8_000),
      createdAt: candidate.createdAt,
      question: typeof candidate.question === "string" ? candidate.question.slice(0, 2_000) : undefined,
      userMessageId: typeof candidate.userMessageId === "string" ? candidate.userMessageId : undefined,
      sources: Array.isArray(candidate.sources) ? candidate.sources.slice(0, 12) as NoteQASource[] : undefined,
      totalChunks: typeof candidate.totalChunks === "number" ? candidate.totalChunks : undefined,
      retrieval: normalizeRetrievalSummary(candidate.retrieval),
      complete: candidate.role === "assistant" ? true : undefined,
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
  const [loadingPhase, setLoadingPhase] = useState<"indexing" | "retrieving" | "generating" | "idle">("idle");
  const [reasoning, setReasoning] = useState<"fast" | "deep">("fast");
  const [quizSets, setQuizSets] = useState<AssistantQuizSet[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<AssistantQuizSet | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string | string[] | boolean>>({});
  const [quizResult, setQuizResult] = useState<AssistantQuizResult | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [activeQuote, setActiveQuote] = useState("");
  const portalReady = useSyncExternalStore(subscribeToPortalReady, getPortalReady, getServerPortalReady);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const [expandedSourceMessageIds, setExpandedSourceMessageIds] = useState<Set<string>>(() => new Set());
  const [memoryProposalIds, setMemoryProposalIds] = useState<Set<string>>(() => new Set());
  const [lastError, setLastError] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [failedRequest, setFailedRequest] = useState<{
    question: string;
    quote: string;
    retryMessageId?: string;
  } | null>(null);
  const followLatestRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const conversationReady = loadedConversationNoteId === noteId;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const current = window.localStorage.getItem(getConversationStorageKey(noteId));
        const legacy = window.sessionStorage.getItem(getLegacyConversationStorageKey(noteId));
        setMessages(normalizeStoredMessages(JSON.parse(current ?? legacy ?? "[]")));
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
      const persistedMessages = messages
        .filter((message) => message.role !== "assistant" || message.complete !== false)
        .slice(-MAX_STORED_MESSAGES);
      window.localStorage.setItem(getConversationStorageKey(noteId), JSON.stringify(persistedMessages));
    } catch {
      // 对话仍保留在当前页面内；持久化不可用时不应中断提问。
    }
  }, [loadedConversationNoteId, messages, noteId]);

  useEffect(() => {
    if (open) return;
    abortControllerRef.current?.abort();
  }, [open]);

  useEffect(() => {
    abortControllerRef.current?.abort();
  }, [noteId]);

  useEffect(() => () => {
    abortControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list || !followLatestRef.current) return;
    list.scrollTo({ top: list.scrollHeight, behavior: loading ? "auto" : "smooth" });
  }, [loading, messages]);

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
    if (!open || !portalReady) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]",
      );
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
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [onOpenChange, open, portalReady]);

  useEffect(() => {
    if (!open || !portalReady) return;
    const nextQuote = quotedText?.replace(/\s+/g, " ").trim().slice(0, 1_600) ?? "";
    if (!nextQuote) return;
    const focusTimer = window.setTimeout(() => {
      setActiveQuote(nextQuote);
      onQuotedTextConsumed?.();
      composerRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [onQuotedTextConsumed, open, portalReady, quotedText]);

  useEffect(() => {
    if (!open || !portalReady || !window.matchMedia("(max-width: 760px)").matches) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open, portalReady]);

  const ask = async (
    questionOverride?: string,
    quoteOverride?: string,
    retryMessageId?: string,
  ) => {
    const userQuestion = (questionOverride ?? question).trim()
      || ((quoteOverride ?? activeQuote) ? "请解释这段选中的内容。" : "");
    if (!userQuestion || loading || !conversationReady) return;
    const quoteSnapshot = quoteOverride ?? activeQuote;
    const previousMessages = messages;
    const retryTarget = retryMessageId ? messages.find((message) => message.id === retryMessageId) : undefined;
    const retryUserMessageId = retryTarget?.userMessageId;
    const displayQuestion = quoteSnapshot
      ? `> ${quoteSnapshot.replace(/\n/g, "\n> ")}\n\n${userQuestion}`
      : userQuestion;
    const userMessage: AssistantChatMessage = {
      id: createMessageId(),
      role: "user",
      content: displayQuestion,
      createdAt: new Date().toISOString(),
    };
    const assistantMessageId = createMessageId();
    const conversation = messages
      .filter((message) => message.id !== retryMessageId && message.id !== retryUserMessageId)
      .slice(-10)
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));
    const assistantMessage: AssistantChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      question: userQuestion,
      sources: [],
      totalChunks: 0,
      userMessageId: retryUserMessageId ?? userMessage.id,
      complete: false,
    };
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setLoadingPhase("indexing");
    setLastError(null);
    setFailedRequest({ question: userQuestion, quote: quoteSnapshot, retryMessageId });
    followLatestRef.current = true;
    setShowScrollToLatest(false);
    setMessages(retryMessageId
      ? previousMessages.map((message) => message.id === retryMessageId ? assistantMessage : message)
      : [...previousMessages, userMessage, assistantMessage].slice(-MAX_STORED_MESSAGES));
    setQuestion("");
    setActiveQuote("");
    let activeStreamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let flushDeltaNow: (() => void) | null = null;
    try {
      const config = readJsonStorage(AI_CONFIG_STORAGE_KEY, DEFAULT_AI_CONFIG, normalizeAIConfig);
      setLoadingPhase("retrieving");
      const request = await fetch("/api/ai/note-qa", {
        method: "POST",
        headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
        signal: controller.signal,
        body: JSON.stringify({
          question: userQuestion,
          selectedText: quoteSnapshot || undefined,
          conversation,
          noteId,
          scope: "all",
          mode: "answer",
          contextLimit: reasoning === "deep" ? 12 : 8,
          model: DEFAULT_DEEPSEEK_MODEL,
          thinking: reasoning === "deep" ? "enabled" : "disabled",
          reasoningEffort: reasoning === "deep" ? "high" : undefined,
          stream: true,
          apiKey: ALLOW_CLIENT_AI_KEYS ? config.deepseekApiKey : undefined,
        }),
      });
      if (!request.ok) {
        const payload = await request.json().catch(() => ({})) as { error?: unknown };
        throw new Error(typeof payload.error === "string" ? payload.error : "助手没有返回有效回答");
      }

      const contentType = request.headers.get("content-type") ?? "";
      if (contentType.includes("text/event-stream") && request.body) {
        setLoadingPhase("generating");
        const reader = request.body.getReader();
        activeStreamReader = reader;
        const decoder = new TextDecoder();
        let buffer = "";
        let answer = "";
        let completed = false;
        let pendingDelta = "";
        let flushTimer: number | null = null;
        const flushDelta = () => {
          if (!pendingDelta) return;
          const delta = pendingDelta;
          pendingDelta = "";
          setMessages((current) => current.map((message) => message.id === assistantMessageId
            ? { ...message, content: `${message.content}${delta}` }
            : message));
        };
        flushDeltaNow = () => {
          if (flushTimer !== null) window.clearTimeout(flushTimer);
          flushTimer = null;
          flushDelta();
        };

        const handleEvent = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) return;
          const serialized = trimmed.slice(5).trim();
          let payload: {
            type?: unknown;
            delta?: unknown;
            sources?: unknown;
            totalChunks?: unknown;
            retrieval?: unknown;
            tokensUsed?: unknown;
            error?: unknown;
          };
          try {
            payload = JSON.parse(serialized) as typeof payload;
          } catch {
            throw new Error("助手返回了无法解析的流式事件");
          }
          if (payload.type === "meta") {
            setMessages((current) => current.map((message) => message.id === assistantMessageId
              ? {
                ...message,
                sources: Array.isArray(payload.sources) ? payload.sources as NoteQASource[] : [],
                totalChunks: typeof payload.totalChunks === "number" ? payload.totalChunks : 0,
                retrieval: normalizeRetrievalSummary(payload.retrieval),
              }
              : message));
          } else if (payload.type === "delta" && typeof payload.delta === "string") {
            answer += payload.delta;
            pendingDelta += payload.delta;
            if (flushTimer === null) {
              flushTimer = window.setTimeout(() => {
                flushTimer = null;
                flushDelta();
              }, 36);
            }
          } else if (payload.type === "done") {
            flushDeltaNow?.();
            completed = true;
            setMessages((current) => current.map((message) => message.id === assistantMessageId
              ? { ...message, complete: true }
              : message));
          } else if (payload.type === "error") {
            throw new Error(typeof payload.error === "string" ? payload.error : "流式回答失败");
          }
        };

        while (!completed) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? "";
          lines.forEach(handleEvent);
        }
        buffer += decoder.decode();
        if (buffer) handleEvent(buffer);
        if (!completed) throw new Error("助手回答流提前结束");
        flushDeltaNow?.();
        if (!answer.trim()) throw new Error("助手没有返回有效回答");
      } else if (contentType.includes("text/event-stream")) {
        throw new Error("助手没有返回可读取的回答流");
      } else {
        const payload = await request.json() as {
          answer?: unknown;
          sources?: unknown;
          totalChunks?: unknown;
          retrieval?: unknown;
          error?: unknown;
        };
        if (typeof payload.answer !== "string" || !payload.answer.trim()) {
          throw new Error(typeof payload.error === "string" ? payload.error : "助手没有返回有效回答");
        }
        setLoadingPhase("generating");
        setMessages((current) => current.map((message) => message.id === assistantMessageId
          ? {
            ...message,
            content: payload.answer as string,
            sources: Array.isArray(payload.sources) ? payload.sources as NoteQASource[] : [],
            totalChunks: typeof payload.totalChunks === "number" ? payload.totalChunks : 0,
            retrieval: normalizeRetrievalSummary(payload.retrieval),
            complete: true,
          }
          : message));
      }
      setFailedRequest(null);
      setLastError(null);
    } catch (error) {
      const cancelled = controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
      flushDeltaNow?.();
      setMessages(previousMessages);
      setQuestion(userQuestion);
      setActiveQuote(quoteSnapshot);
      if (!cancelled) {
        const message = error instanceof Error ? error.message : "未知错误";
        setLastError(message);
        toast.error(`助手回答失败：${message}`);
      }
    } finally {
      activeStreamReader?.releaseLock();
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      setLoading(false);
      setLoadingPhase("idle");
    }
  };

  const stopAnswer = () => {
    abortControllerRef.current?.abort();
  };

  const copyAnswer = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success("回答已复制");
    } catch {
      toast.error("复制失败，请手动选择文字");
    }
  };

  const proposeMemory = async (message: AssistantChatMessage) => {
    if (message.role !== "assistant" || memoryProposalIds.has(message.id)) return;
    setMemoryProposalIds((current) => new Set(current).add(message.id));
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
      setMemoryProposalIds((current) => {
        const next = new Set(current);
        next.delete(message.id);
        return next;
      });
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
  if (!portalReady) return null;

  const dock = (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="assistant-dock-overlay"
          className="assistant-dock-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <button type="button" className="assistant-dock-scrim" aria-label="关闭笔记助手" onClick={() => onOpenChange(false)} />
          <motion.aside
            id="assistant-dock"
            ref={drawerRef}
            className="assistant-dock-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="assistant-dock-title"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
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
              disabled={loading}
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
            ref={closeButtonRef}
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="assistant-dock-toolbar" aria-label="回答方式">
          <span className="assistant-model-badge" title="当前笔记助手使用 DeepSeek V4 Flash 正式模型">V4 Flash</span>
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
            <div
              ref={messageListRef}
              className="assistant-message-list"
              aria-live="off"
              aria-busy={loading}
              onScroll={(event) => {
                const list = event.currentTarget;
                const nearLatest = list.scrollHeight - list.scrollTop - list.clientHeight < 96;
                followLatestRef.current = nearLatest;
                setShowScrollToLatest(!nearLatest);
              }}
            >
              {messages.map((message) => (
                <article key={message.id} className={`assistant-message ${message.role}`}>
                  <span className="assistant-message-role">{message.role === "assistant" ? "助手" : "你"}</span>
                  <div className="assistant-message-bubble">
                    {message.content
                      ? <MarkdownContent content={message.content} className="text-sm leading-7 text-on-surface" />
                      : <div className="assistant-message-placeholder"><Loader2 className="h-4 w-4 animate-spin" />正在生成回答…</div>}
                  </div>
                  {message.role === "assistant" && message.content && message.complete !== false && (
                    <div className="assistant-message-meta">
                      <span>
                        {message.retrieval
                          ? `${getRetrievalConfidenceLabel(message.retrieval.confidence)} · 检索 ${message.retrieval.matchedChunks} 段`
                          : typeof message.totalChunks === "number" ? `检索 ${message.totalChunks} 个片段` : "基于当前笔记"}
                      </span>
                      <div className="assistant-message-actions">
                        <button type="button" onClick={() => void copyAnswer(message.content)} title="复制回答"><Copy className="h-3.5 w-3.5" />复制</button>
                        {message.question && <button type="button" onClick={() => void ask(message.question, "", message.id)} disabled={loading} title="重新生成回答"><RefreshCw className="h-3.5 w-3.5" />重答</button>}
                        <button type="button" disabled={memoryProposalIds.has(message.id)} onClick={() => void proposeMemory(message)}><MemoryStick className="h-3.5 w-3.5" />{memoryProposalIds.has(message.id) ? "已提交" : "记忆候选"}</button>
                      </div>
                    </div>
                  )}
                  {message.role === "assistant" && message.sources && message.sources.length > 0 && (() => {
                    const expanded = expandedSourceMessageIds.has(message.id);
                    const sources = expanded ? message.sources : message.sources.slice(0, 3);
                    return <div className="assistant-source-list" aria-label="回答引用来源">
                      <div className="assistant-source-heading">
                        <span>依据来源 · {message.sources.length}</span>
                        {message.sources.length > 3 && <button type="button" className="assistant-source-toggle" onClick={() => setExpandedSourceMessageIds((current) => {
                          const next = new Set(current);
                          if (next.has(message.id)) next.delete(message.id); else next.add(message.id);
                          return next;
                        })}>{expanded ? "收起" : "展开全部"}</button>}
                      </div>
                      {sources.map((source) => (
                        <Link key={source.id} href={source.href} className="assistant-source-card">
                          <div className="min-w-0">
                            <strong>[{source.id}] {source.sourceLabel}</strong>
                            <span>{source.noteTitle}</span>
                            <small>{source.excerpt}</small>
                          </div>
                          <span aria-hidden="true">跳转</span>
                        </Link>
                      ))}
                    </div>;
                  })()}
                </article>
              ))}
              {loading && <div className="assistant-thinking" role="status"><Loader2 className="h-4 w-4 animate-spin" />{getLoadingPhaseLabel(loadingPhase)}</div>}
              {showScrollToLatest && <button type="button" className="assistant-scroll-latest" onClick={() => {
                followLatestRef.current = true;
                setShowScrollToLatest(false);
                messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: "smooth" });
              }}>回到最新回答</button>}
            </div>
          ) : (
            <div className="assistant-empty-state">
              <BookOpen className="h-7 w-7" />
              <div>
                <strong>从这篇笔记开始问</strong>
                <p>我会先检索当前笔记，再用可点击的依据回答；你也可以先选中文字。</p>
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
          {lastError && (
            <div className="assistant-error-card" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <p>{lastError}</p>
              <div className="assistant-error-actions">
                {failedRequest && <button type="button" onClick={() => {
                  void ask(failedRequest.question, failedRequest.quote, failedRequest.retryMessageId);
                }}>重试</button>}
                <button type="button" aria-label="关闭错误提示" onClick={() => setLastError(null)}><X className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          )}
          {activeQuote && (
            <div className="assistant-quote-card">
              <Quote className="h-4 w-4" />
              <p>{activeQuote}</p>
              <button type="button" onClick={() => setActiveQuote("")} disabled={loading} aria-label="移除引用"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}
          <label htmlFor="assistant-question" className="sr-only">询问当前笔记</label>
          <textarea id="assistant-question" ref={composerRef} value={question} disabled={loading || !conversationReady} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void ask();
            }
          }} rows={2} className="field-control w-full resize-none px-3 py-2.5 text-sm" placeholder={!conversationReady ? "正在恢复本篇对话…" : activeQuote ? "围绕选中内容提问（留空可直接解释）" : "问当前笔记…"} />
          <div className="assistant-composer-actions">
            <span>{!conversationReady ? "正在恢复本篇对话…" : loading ? "回答生成中，可随时停止" : "Enter 发送 · Shift+Enter 换行"}</span>
            {loading ? (
              <button type="button" onClick={stopAnswer} className="control-button h-10 px-4 text-sm" aria-label="停止生成回答"><Square className="h-3.5 w-3.5" />停止</button>
            ) : (
              <button type="button" onClick={() => void ask()} disabled={!conversationReady || (!question.trim() && !activeQuote)} className="control-button control-button-primary h-10 px-4 text-sm">
                <Send className="h-4 w-4" />发送
              </button>
            )}
          </div>
        </footer>
      )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(dock, document.body);
}
