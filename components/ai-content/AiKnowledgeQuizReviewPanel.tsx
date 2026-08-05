"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, FileQuestion, Loader2, RefreshCcw, RotateCcw, Send, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import type { AiKnowledgeQuizItemType, AiKnowledgeQuizStatus } from "@/lib/ai-knowledge-quiz-contract";

type QuizRow = {
  id: string;
  proposal_id: string;
  note_id: string | null;
  title: string;
  subject: string;
  review_status: AiKnowledgeQuizStatus;
  self_check: unknown;
  content_version: number;
  item_count: number;
  updated_at: string;
};

type QuizItem = {
  id: string;
  ordinal: number;
  itemType: AiKnowledgeQuizItemType;
  question: string;
  options: Array<{ label: string; text: string }>;
  answer: string | string[] | boolean;
  explanation: string;
  knowledgePoints: string[];
  difficulty: string;
  sourceHeading: string | null;
};

type QuizDetail = { quiz: QuizRow; items: QuizItem[] };
type ReviewAction = "request_changes" | "approve" | "reject" | "publish";

const STATUS_LABELS: Record<AiKnowledgeQuizStatus, string> = {
  draft: "草稿",
  self_checked: "已自检",
  pending_review: "待审核",
  changes_requested: "待返修",
  approved: "已批准",
  published: "已发布",
  rejected: "已驳回",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readError(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.error === "string" ? value.error : fallback;
}

function statusTone(status: string): string {
  if (status === "published" || status === "approved") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700";
  if (status === "changes_requested" || status === "rejected") return "border-amber-500/25 bg-amber-500/10 text-amber-700";
  if (status === "pending_review") return "border-primary/25 bg-primary/10 text-primary";
  return "border-outline-variant/25 bg-surface-container-high text-on-surface-variant";
}

function formatAnswer(answer: QuizItem["answer"]): string {
  if (typeof answer === "boolean") return answer ? "正确" : "错误";
  return Array.isArray(answer) ? answer.join("、") : answer;
}

export function AiKnowledgeQuizReviewPanel() {
  const toast = useToast();
  const [rows, setRows] = useState<QuizRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<QuizDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<ReviewAction | "refresh" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth("/api/ai/knowledge-quiz-review", {
        cache: "no-store",
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isRecord(payload) || !Array.isArray(payload.quizzes)) {
        throw new Error(readError(payload, "快测审核列表读取失败"));
      }
      const nextRows = payload.quizzes.filter((value): value is QuizRow => isRecord(value) && typeof value.id === "string") as QuizRow[];
      setRows(nextRows);
      setError(null);
      if (selectedId && !nextRows.some((row) => row.id === selectedId)) {
        setSelectedId(nextRows[0]?.id ?? null);
        setDetail(null);
      } else if (!selectedId && nextRows[0]) {
        setSelectedId(nextRows[0].id);
      }
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : "快测审核列表读取失败");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  const loadDetail = useCallback(async (quizId: string) => {
    setDetailLoading(true);
    try {
      const response = await fetchWithAuth(`/api/ai/knowledge-quiz-review/${encodeURIComponent(quizId)}`, {
        cache: "no-store",
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isRecord(payload) || !isRecord(payload.quiz)) {
        throw new Error(readError(payload, "快测审核正文读取失败"));
      }
      setDetail({
        quiz: payload.quiz as unknown as QuizRow,
        items: Array.isArray(payload.items) ? payload.items as unknown as QuizItem[] : [],
      });
    } catch (nextError: unknown) {
      setDetail(null);
      toast.error(nextError instanceof Error ? nextError.message : "快测审核正文读取失败");
    } finally {
      setDetailLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRows();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRows]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const timer = window.setTimeout(() => {
      void loadDetail(selectedId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDetail, selectedId]);

  const selectedRow = useMemo(() => rows.find((row) => row.id === selectedId) ?? null, [rows, selectedId]);
  const quiz = detail?.quiz ?? selectedRow;
  const canReview = quiz?.review_status === "pending_review";
  const canPublish = quiz?.review_status === "approved";

  const runAction = async (action: ReviewAction) => {
    if (!quiz || busyAction) return;
    if (action === "reject" && !window.confirm("确定驳回这份知识点快测吗？")) return;
    setBusyAction(action);
    try {
      const response = await fetchWithAuth(`/api/ai/knowledge-quiz-review/${encodeURIComponent(quiz.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, noteId: quiz.note_id }),
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isRecord(payload) || !isRecord(payload.quiz)) {
        throw new Error(readError(payload, "快测审核操作失败"));
      }
      setDetail((current) => current ? { ...current, quiz: payload.quiz as unknown as QuizRow } : current);
      await loadRows();
      toast.success(action === "request_changes" ? "已退回快测返修" : action === "approve" ? "快测已批准" : action === "publish" ? "快测已发布" : "快测已驳回");
    } catch (nextError: unknown) {
      toast.error(nextError instanceof Error ? nextError.message : "快测审核操作失败");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className="surface-panel p-5" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FileQuestion className="h-5 w-5" /></div>
          <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">KNOWLEDGE QUIZ REVIEW</p><h2 className="mt-1 font-headline text-xl font-semibold text-on-surface">讲义知识点快测审核</h2><p className="mt-1 text-sm text-on-surface-variant">题目、答案与解析独立于 Markdown；只有批准或发布后，阅读助手才能调用。</p></div>
        </div>
        <button type="button" className="control-button inline-flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm" disabled={busyAction !== null} onClick={() => { setBusyAction("refresh"); void loadRows().finally(() => setBusyAction(null)); }}><RefreshCcw className="h-4 w-4" />刷新快测</button>
      </div>

      {error && <div role="alert" className="mt-4 rounded-xl border border-error/25 bg-error/5 px-4 py-3 text-sm text-error">{error}</div>}
      <div className="mt-5 grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-2xl border border-outline-variant/20 bg-surface-container-low p-3">
          <div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-semibold text-on-surface">快测队列</h3><span className="text-xs text-on-surface-variant">{rows.length}</span></div>
          {loading ? <div className="flex items-center justify-center gap-2 py-10 text-sm text-on-surface-variant"><Loader2 className="h-4 w-4 animate-spin text-primary" />读取中</div> : rows.length === 0 ? <div className="rounded-xl border border-dashed border-outline-variant/30 px-3 py-8 text-center text-sm leading-6 text-on-surface-variant">暂无待审核或已审核快测。<br />AI 提交后会显示在这里。</div> : <div className="space-y-2">{rows.map((row) => <button key={row.id} type="button" onClick={() => setSelectedId(row.id)} className={`w-full rounded-xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 ${row.id === selectedId ? "border-primary/45 bg-primary/5" : "border-outline-variant/20 bg-surface hover:border-primary/25"}`}><span className="flex items-start justify-between gap-2"><strong className="line-clamp-2 text-sm text-on-surface">{row.title}</strong><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${statusTone(row.review_status)}`}>{STATUS_LABELS[row.review_status]}</span></span><span className="mt-1 block text-xs text-on-surface-variant">{row.item_count} 题 · v{row.content_version}</span></button>)}</div>}
        </aside>

        <section className="min-w-0 rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4">
          {detailLoading ? <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-on-surface-variant"><Loader2 className="h-5 w-5 animate-spin text-primary" />读取题目、答案与解析…</div> : !quiz ? <div className="flex min-h-64 items-center justify-center text-sm text-on-surface-variant">选择一份快测开始审核。</div> : <>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">QUIZ · v{quiz.content_version}</p><h3 className="mt-1 break-words font-headline text-lg font-semibold text-on-surface">{quiz.title}</h3><div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant"><span>{quiz.subject}</span><span>·</span><span>{quiz.item_count} 题</span><span className={`rounded-full border px-2 py-0.5 ${statusTone(quiz.review_status)}`}>{STATUS_LABELS[quiz.review_status]}</span></div></div><div className="flex flex-wrap gap-2" aria-label="快测审核操作">{canReview && <><button type="button" className="control-button min-h-10 inline-flex items-center gap-2 px-3 text-sm" disabled={busyAction !== null} onClick={() => void runAction("request_changes")}><RotateCcw className="h-4 w-4" />退回返修</button><button type="button" className="control-button control-button-primary min-h-10 inline-flex items-center gap-2 px-3 text-sm" disabled={busyAction !== null} onClick={() => void runAction("approve")}><Check className="h-4 w-4" />批准</button><button type="button" className="control-button control-button-danger min-h-10 inline-flex items-center gap-2 px-3 text-sm" disabled={busyAction !== null} onClick={() => void runAction("reject")}><X className="h-4 w-4" />驳回</button></>}{canPublish && <button type="button" className="control-button control-button-primary min-h-10 inline-flex items-center gap-2 px-3 text-sm" disabled={busyAction !== null} onClick={() => void runAction("publish")}><Send className="h-4 w-4" />发布/绑定讲义</button>}</div></div>
            <div className="mt-4 rounded-xl border border-outline-variant/20 bg-surface p-3 text-xs text-on-surface-variant">{quiz.note_id ? "已绑定博客文章，发布后阅读助手可调用。" : "尚未绑定博客文章；批准后，发布讲义时会自动绑定。"}</div>
            <div className="mt-4 space-y-3">{detail?.items?.map((item) => <article key={item.id} className="rounded-xl border border-outline-variant/20 bg-surface p-4"><div className="flex flex-wrap items-start justify-between gap-2"><p className="text-sm font-medium leading-6 text-on-surface">{item.ordinal}. {item.question}</p><span className="rounded-full bg-surface-container-high px-2 py-1 text-[10px] text-on-surface-variant">{item.difficulty}</span></div>{item.options.length > 0 && <div className="mt-2 space-y-1 text-xs leading-5 text-on-surface-variant">{item.options.map((option) => <div key={option.label}><strong>{option.label}.</strong> {option.text}</div>)}</div>}<div className="mt-3 grid gap-2 border-t border-outline-variant/15 pt-3 text-xs leading-5 sm:grid-cols-2"><div><span className="font-semibold text-primary">答案：</span>{formatAnswer(item.answer)}</div><div><span className="font-semibold text-primary">知识点：</span>{item.knowledgePoints.join("、") || "未标注"}</div></div><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-on-surface-variant"><span className="font-semibold text-on-surface">解析：</span>{item.explanation}</p>{item.sourceHeading && <p className="mt-2 text-[11px] text-on-surface-variant">来源标题：{item.sourceHeading}</p>}</article>)}</div>
          </>}
        </section>
      </div>
    </section>
  );
}
