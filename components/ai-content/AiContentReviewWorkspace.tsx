"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  CheckCircle2,
  FileText,
  Loader2,
  MessageSquarePlus,
  RefreshCcw,
  Send,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { ContentPreview } from "@/components/ui/ContentPreview";
import { AiKnowledgeQuizReviewPanel } from "@/components/ai-content/AiKnowledgeQuizReviewPanel";
import { useToast } from "@/components/ui/Toast";
import { buildAuthHeaders } from "@/lib/fetch-with-auth";
import { subjectMap } from "@/lib/types";
import { AI_REVIEW_QUEUE_CHANGED_EVENT, type AiContentReviewStatus } from "@/lib/ai-content-contract";
import type {
  AiContentProposalCommentRow,
  AiContentReviewProposal,
} from "@/lib/server-ai-content-review";

const STATUS_LABELS: Record<AiContentReviewStatus, string> = {
  draft: "草稿",
  self_checked: "已自检",
  pending_review: "待审核",
  changes_requested: "待返修",
  approved: "已批准",
  published: "已发布",
  rejected: "已驳回",
};

const FILTERS: Array<{ value: "" | AiContentReviewStatus; label: string }> = [
  { value: "", label: "全部提案" },
  { value: "pending_review", label: "待审核" },
  { value: "changes_requested", label: "待返修" },
  { value: "approved", label: "已批准" },
  { value: "published", label: "已发布" },
  { value: "rejected", label: "已驳回" },
];

type ReviewAction = "request_changes" | "approve" | "reject" | "publish" | "approve_and_publish";
type Selection = { start: number; end: number; quote: string } | null;

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

function commentTone(status: string): string {
  if (status === "resolved") return "border-emerald-500/20 bg-emerald-500/5";
  if (status === "dismissed") return "border-outline-variant/15 bg-surface-container-low opacity-70";
  return "border-primary/20 bg-primary/[0.04]";
}

export function AiContentReviewWorkspace() {
  const toast = useToast();
  const [items, setItems] = useState<AiContentReviewProposal[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AiContentReviewProposal | null>(null);
  const [filter, setFilter] = useState<"" | AiContentReviewStatus>("pending_review");
  const [selectedProposalIds, setSelectedProposalIds] = useState<Set<string>>(() => new Set());
  const [selection, setSelection] = useState<Selection>(null);
  const [commentBody, setCommentBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<ReviewAction | "comment" | "refresh" | "batch_approve" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const loadQueue = useCallback(async (nextFilter = filter) => {
    setLoading(true);
    try {
      const suffix = nextFilter ? `?status=${encodeURIComponent(nextFilter)}` : "";
      const response = await fetch(`/api/ai/content-review${suffix}`, {
        headers: await buildAuthHeaders(),
        cache: "no-store",
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isRecord(payload) || !Array.isArray(payload.proposals)) {
        throw new Error(readError(payload, "审核队列读取失败"));
      }
      setItems(payload.proposals as AiContentReviewProposal[]);
      const currentIds = new Set((payload.proposals as AiContentReviewProposal[]).map((item) => item.proposal.id));
      setSelectedProposalIds((current) => new Set([...current].filter((id) => currentIds.has(id))));
      setError(null);
    } catch (nextError: unknown) {
      const message = nextError instanceof Error ? nextError.message : "审核队列读取失败";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const loadDetail = useCallback(async (proposalId: string) => {
    setDetailLoading(true);
    setSelection(null);
    try {
      const response = await fetch(`/api/ai/content-review/${encodeURIComponent(proposalId)}`, {
        headers: await buildAuthHeaders(),
        cache: "no-store",
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isRecord(payload) || !isRecord(payload.proposal)) {
        throw new Error(readError(payload, "审核正文读取失败"));
      }
      setDetail(payload.proposal as AiContentReviewProposal);
    } catch (nextError: unknown) {
      toast.error(nextError instanceof Error ? nextError.message : "审核正文读取失败");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const requestedId = new URLSearchParams(window.location.search).get("proposal")?.trim();
    if (!requestedId) return;
    const timer = window.setTimeout(() => {
      setSelectedId(requestedId);
      void loadDetail(requestedId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDetail]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadQueue();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadQueue]);

  useEffect(() => {
    if (loading) return undefined;
    if (!selectedId && items[0]) {
      const nextId = items[0].proposal.id;
      const timer = window.setTimeout(() => {
        setSelectedId(nextId);
        void loadDetail(nextId);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (selectedId && !items.some((item) => item.proposal.id === selectedId)) {
      const nextId = items[0]?.proposal.id ?? null;
      const timer = window.setTimeout(() => {
        setSelectedId(nextId);
        setDetail(null);
        if (nextId) void loadDetail(nextId);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [items, loadDetail, loading, selectedId]);

  const selectedSummary = useMemo(
    () => items.find((item) => item.proposal.id === selectedId) ?? null,
    [items, selectedId],
  );
  const proposal = detail?.proposal ?? selectedSummary?.proposal ?? null;
  const comments = detail?.comments ?? [];
  const canReview = proposal?.review_status === "pending_review";
  const canPublish = proposal?.review_status === "approved";
  const selectableItems = useMemo(
    () => items.filter((item) => item.proposal.review_status === "pending_review"),
    [items],
  );
  const selectedPendingIds = useMemo(
    () => selectableItems.map((item) => item.proposal.id).filter((id) => selectedProposalIds.has(id)),
    [selectableItems, selectedProposalIds],
  );
  const allPendingSelected = selectableItems.length > 0 && selectedPendingIds.length === selectableItems.length;

  const refresh = async () => {
    setBusyAction("refresh");
    await loadQueue();
    if (selectedId) await loadDetail(selectedId);
    setBusyAction(null);
  };

  const runAction = async (action: ReviewAction) => {
    if (!proposal || busyAction) return;
    if (action === "reject" && !window.confirm("确定驳回这篇提案吗？驳回后 AI 账号不能继续编辑。")) return;
    setBusyAction(action);
    try {
      const response = await fetch(`/api/ai/content-review/${encodeURIComponent(proposal.id)}`, {
        method: "PATCH",
        headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action }),
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readError(payload, "审核操作失败"));
      await loadQueue();
      await loadDetail(proposal.id);
      window.dispatchEvent(new CustomEvent(AI_REVIEW_QUEUE_CHANGED_EVENT));
      toast.success(action === "request_changes" ? "已退回返修" : action === "approve" ? "已批准提案" : action === "publish" || action === "approve_and_publish" ? "已发布到博客" : "已驳回提案");
    } catch (nextError: unknown) {
      toast.error(nextError instanceof Error ? nextError.message : "审核操作失败");
    } finally {
      setBusyAction(null);
    }
  };

  const runBatchApprove = async () => {
    if (busyAction || selectedPendingIds.length === 0) return;
    if (!window.confirm(`确定批准选中的 ${selectedPendingIds.length} 篇 AI 文章吗？只会改变审核状态，不会自动发布。`)) return;
    setBusyAction("batch_approve");
    try {
      const response = await fetch("/api/ai/content-review", {
        method: "PATCH",
        headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action: "approve", proposalIds: selectedPendingIds }),
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readError(payload, "批量批准失败"));
      const approvedIds = isRecord(payload) && Array.isArray(payload.approvedIds)
        ? payload.approvedIds.filter((id): id is string => typeof id === "string")
        : [];
      const failedCount = isRecord(payload) && Array.isArray(payload.failed) ? payload.failed.length : 0;
      setSelectedProposalIds(new Set());
      await loadQueue();
      if (selectedId) await loadDetail(selectedId);
      window.dispatchEvent(new CustomEvent(AI_REVIEW_QUEUE_CHANGED_EVENT));
      if (failedCount > 0) {
        toast.error(`已批准 ${approvedIds.length} 篇，${failedCount} 篇未完成，请检查队列。`);
      } else {
        toast.success(`已批量批准 ${approvedIds.length} 篇文章`);
      }
    } catch (nextError: unknown) {
      toast.error(nextError instanceof Error ? nextError.message : "批量批准失败");
    } finally {
      setBusyAction(null);
    }
  };

  const captureSelection = () => {
    const element = bodyRef.current;
    if (!element || !proposal) return;
    const start = element.selectionStart;
    const end = element.selectionEnd;
    if (start === end) {
      setSelection(null);
      return;
    }
    setSelection({ start, end, quote: proposal.content.slice(start, end) });
  };

  const addComment = async () => {
    if (!proposal || !selection || !commentBody.trim() || busyAction) return;
    setBusyAction("comment");
    try {
      const response = await fetch(`/api/ai/content-review/${encodeURIComponent(proposal.id)}`, {
        method: "POST",
        headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          proposalContentVersion: proposal.content_version,
          selectionStart: selection.start,
          selectionEnd: selection.end,
          quotedText: selection.quote,
          body: commentBody,
        }),
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readError(payload, "批注保存失败"));
      setCommentBody("");
      setSelection(null);
      await loadDetail(proposal.id);
      toast.success("批注已保存");
    } catch (nextError: unknown) {
      toast.error(nextError instanceof Error ? nextError.message : "批注保存失败");
    } finally {
      setBusyAction(null);
    }
  };

  const setCommentStatus = async (comment: AiContentProposalCommentRow, status: "open" | "resolved" | "dismissed") => {
    if (!proposal || busyAction) return;
    setBusyAction("comment");
    try {
      const response = await fetch(`/api/ai/content-review/${encodeURIComponent(proposal.id)}/comments/${encodeURIComponent(comment.id)}`, {
        method: "PATCH",
        headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status }),
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readError(payload, "批注状态更新失败"));
      await loadDetail(proposal.id);
    } catch (nextError: unknown) {
      toast.error(nextError instanceof Error ? nextError.message : "批注状态更新失败");
    } finally {
      setBusyAction(null);
    }
  };

  const jumpToComment = (comment: AiContentProposalCommentRow) => {
    if (!proposal || comment.proposal_content_version !== proposal.content_version) {
      toast.error("内容已更新，请重新选择文字；旧批注不会自动套用。 ");
      return;
    }
    if (proposal.content.slice(comment.selection_start, comment.selection_end) !== comment.quoted_text) {
      toast.error("选区内容已变化，请重新选择文字。 ");
      return;
    }
    const element = bodyRef.current;
    element?.focus();
    element?.setSelectionRange(comment.selection_start, comment.selection_end);
    setSelection({ start: comment.selection_start, end: comment.selection_end, quote: comment.quoted_text });
  };

  return (
    <div className="space-y-5" aria-live="polite">
      <section className="surface-panel flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" /></div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">HUMAN REVIEW</p>
            <h2 className="mt-1 truncate font-headline text-xl font-semibold text-on-surface">AI 内容审核</h2>
            <p className="mt-1 text-sm text-on-surface-variant">先看博客实际渲染，再在 Markdown 原文上选中文字批注；旧版本批注不会静默套用。</p>
          </div>
        </div>
        <button type="button" className="control-button inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2.5 text-sm" disabled={busyAction !== null} onClick={() => void refresh()}><RefreshCcw className="h-4 w-4" />刷新队列</button>
      </section>

      {error && <div role="alert" className="rounded-xl border border-error/25 bg-error/5 px-4 py-3 text-sm text-error">{error} <button type="button" className="ml-2 underline" onClick={() => void loadQueue()}>重试</button></div>}

      <div className="grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)_21rem]">
        <aside className="surface-panel min-w-0 p-4">
          <div className="mb-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><h3 className="font-semibold text-on-surface">提案队列</h3></div><span className="text-xs text-on-surface-variant">{items.length}</span></div>
          <label className="field-label" htmlFor="review-filter">筛选状态</label>
          <select id="review-filter" value={filter} onChange={(event) => { const next = event.target.value as "" | AiContentReviewStatus; setFilter(next); setSelectedId(null); setDetail(null); setSelectedProposalIds(new Set()); void loadQueue(next); }} className="field-control mt-1 h-11 w-full px-3 text-sm">
            {FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          {selectableItems.length > 0 && (
            <div className="mt-3 rounded-xl border border-primary/15 bg-primary/[0.04] p-3">
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold text-on-surface">
                <input type="checkbox" checked={allPendingSelected} onChange={(event) => setSelectedProposalIds(event.target.checked ? new Set(selectableItems.map((item) => item.proposal.id)) : new Set())} className="h-4 w-4 accent-[var(--color-primary)]" />
                全选当前待审核
              </label>
              <button type="button" className="control-button control-button-primary mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 px-3 text-sm" disabled={busyAction !== null || selectedPendingIds.length === 0} onClick={() => void runBatchApprove()}>
                {busyAction === "batch_approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                批准选中 · {selectedPendingIds.length}
              </button>
              <p className="mt-2 text-[11px] leading-5 text-on-surface-variant">只批准审核状态，不会自动发布。</p>
            </div>
          )}
          <div className="mt-4 space-y-2">
            {loading ? <div className="flex items-center justify-center gap-2 py-10 text-sm text-on-surface-variant"><Loader2 className="h-4 w-4 animate-spin text-primary" />读取中</div> : items.length === 0 ? <div className="rounded-xl border border-dashed border-outline-variant/30 px-3 py-8 text-center text-sm leading-6 text-on-surface-variant">当前筛选没有提案。<br />AI 提交后会出现在这里。</div> : items.map((item) => {
               const active = item.proposal.id === selectedId;
               const selectable = item.proposal.review_status === "pending_review";
               return <div key={item.proposal.id} className={`flex gap-2 rounded-xl border px-3 py-3 transition duration-200 ${active ? "border-primary/45 bg-primary/5" : "border-outline-variant/20 bg-surface-container-low hover:border-primary/25"}`}>
                 {selectable && <label className="flex shrink-0 cursor-pointer items-start pt-0.5" aria-label={`选择 ${item.proposal.title}`}>
                   <input type="checkbox" checked={selectedProposalIds.has(item.proposal.id)} onChange={(event) => setSelectedProposalIds((current) => { const next = new Set(current); if (event.target.checked) next.add(item.proposal.id); else next.delete(item.proposal.id); return next; })} className="mt-1 h-4 w-4 accent-[var(--color-primary)]" />
                 </label>}
                 <button type="button" onClick={() => { setSelectedId(item.proposal.id); void loadDetail(item.proposal.id); }} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35">
                   <span className="flex items-start justify-between gap-2"><strong className="line-clamp-2 text-sm text-on-surface">{item.proposal.title}</strong><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${statusTone(item.proposal.review_status)}`}>{STATUS_LABELS[item.proposal.review_status as AiContentReviewStatus] ?? item.proposal.review_status}</span></span>
                   <span className="mt-2 block truncate text-xs text-on-surface-variant">{item.profile?.display_name ?? "未知 AI 资料"} · v{item.proposal.content_version}</span>
                 </button>
               </div>;
            })}
          </div>
        </aside>

        <section className="surface-panel min-w-0 p-5">
          {detailLoading ? <div className="flex min-h-[36rem] items-center justify-center gap-2 text-sm text-on-surface-variant"><Loader2 className="h-5 w-5 animate-spin text-primary" />读取审核正文…</div> : !proposal ? <div className="flex min-h-[36rem] flex-col items-center justify-center gap-3 text-center text-sm text-on-surface-variant"><FileText className="h-8 w-8 text-primary/40" /><p>选择左侧提案开始审核。</p></div> : <>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">PROPOSAL · v{proposal.content_version}</p><h2 className="mt-1 break-words font-headline text-xl font-semibold text-on-surface">{proposal.title}</h2><div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant"><span>{subjectMap[proposal.subject]}</span><span>·</span><span>{proposal.content.length.toLocaleString()} 字符</span><span className={`rounded-full border px-2 py-0.5 ${statusTone(proposal.review_status)}`}>{STATUS_LABELS[proposal.review_status as AiContentReviewStatus] ?? proposal.review_status}</span></div></div>
              {detail?.profile && <Link href={`/ai-profiles/${detail.profile.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-left transition hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"><span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-semibold text-primary">{detail.profile.avatar_url ? <img src={detail.profile.avatar_url} alt="" className="h-full w-full object-cover" /> : detail.profile.display_name.slice(0, 1)}</span><span><strong className="block text-xs text-on-surface">{detail.profile.display_name}</strong><span className="block text-[11px] text-on-surface-variant">查看作者资料</span></span><UserRound className="h-4 w-4 text-on-surface-variant" /></Link>}
            </div>

            <div className="mb-4 flex flex-wrap gap-2" aria-label="审核操作">
              {canReview && <><button type="button" className="control-button min-h-11 inline-flex items-center gap-2 px-3 text-sm" disabled={busyAction !== null} onClick={() => void runAction("request_changes")}><MessageSquarePlus className="h-4 w-4" />退回返修</button><button type="button" className="control-button control-button-primary min-h-11 inline-flex items-center gap-2 px-3 text-sm" disabled={busyAction !== null} onClick={() => void runAction("approve")}><Check className="h-4 w-4" />批准</button><button type="button" className="control-button control-button-danger min-h-11 inline-flex items-center gap-2 px-3 text-sm" disabled={busyAction !== null} onClick={() => void runAction("reject")}><X className="h-4 w-4" />驳回</button><button type="button" className="control-button min-h-11 inline-flex items-center gap-2 px-3 text-sm" disabled={busyAction !== null} onClick={() => void runAction("approve_and_publish")}><Send className="h-4 w-4" />批准并发布</button></>}
              {canPublish && <button type="button" className="control-button control-button-primary min-h-11 inline-flex items-center gap-2 px-3 text-sm" disabled={busyAction !== null} onClick={() => void runAction("publish")}><Send className="h-4 w-4" />发布到博客</button>}
            </div>

            <section className="mb-5 rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">RENDER CHECK</p><h3 className="mt-1 font-headline text-lg font-semibold text-on-surface">博客实际渲染</h3></div><span className="text-xs text-on-surface-variant">只读预览</span></div><div className="max-h-[32rem] overflow-auto rounded-xl border border-outline-variant/15 bg-surface p-4"><ContentPreview content={proposal.content} enableEconomicsTerms={proposal.subject === "economics"} enableEconomicsGraphs={proposal.subject === "economics"} /></div></section>

            <section><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">ANNOTATION SOURCE</p><h3 className="mt-1 font-headline text-lg font-semibold text-on-surface">选择 Markdown 原文添加批注</h3></div><span className="text-xs text-on-surface-variant">选区按 UTF‑16 偏移保存 · v{proposal.content_version}</span></div><textarea ref={bodyRef} readOnly value={proposal.content} onSelect={captureSelection} onMouseUp={captureSelection} aria-label="可选择批注的 Markdown 原文" className="field-control min-h-[19rem] w-full resize-y whitespace-pre-wrap px-4 py-3 font-mono text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35" />{selection && <div className="mt-3 rounded-xl border border-primary/20 bg-primary/[0.04] p-3"><p className="text-xs font-semibold text-primary">已选择 {selection.end - selection.start} 个字符</p><p className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap text-sm leading-6 text-on-surface">{selection.quote}</p><label className="mt-3 block"><span className="field-label">批注内容</span><textarea value={commentBody} onChange={(event) => setCommentBody(event.target.value)} className="field-control mt-1 min-h-24 w-full resize-y px-3 py-2 text-sm" placeholder="指出需要补充、修改或核对的地方…" /></label><div className="mt-2 flex justify-end gap-2"><button type="button" className="control-button min-h-11 px-3 text-sm" onClick={() => { setSelection(null); setCommentBody(""); }}>取消</button><button type="button" className="control-button control-button-primary min-h-11 inline-flex items-center gap-2 px-3 text-sm" disabled={!commentBody.trim() || busyAction !== null || !canReview} onClick={() => void addComment()}><MessageSquarePlus className="h-4 w-4" />保存批注</button></div></div>}</section>
          </>}
        </section>

        <aside className="surface-panel min-w-0 p-4">
          <div className="mb-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><MessageSquarePlus className="h-4 w-4 text-primary" /><h3 className="font-semibold text-on-surface">批注</h3></div><span className="text-xs text-on-surface-variant">{comments.length}</span></div>
          {!proposal ? <p className="text-sm leading-6 text-on-surface-variant">选择提案后，这里会显示批注。</p> : comments.length === 0 ? <div className="rounded-xl border border-dashed border-outline-variant/30 px-3 py-8 text-center text-sm leading-6 text-on-surface-variant">还没有批注。<br />在正文选中文字即可添加。</div> : <div className="space-y-3">{comments.map((comment) => { const stale = comment.proposal_content_version !== proposal.content_version; return <article key={comment.id} className={`rounded-xl border p-3 ${commentTone(comment.status)}`}><div className="flex items-start justify-between gap-2"><span className={`rounded-full border px-2 py-0.5 text-[10px] ${comment.status === "open" ? "border-primary/20 bg-primary/10 text-primary" : "border-outline-variant/20 bg-surface-container-high text-on-surface-variant"}`}>{comment.status === "open" ? "待处理" : comment.status === "resolved" ? "已解决" : "已忽略"}</span><span className="text-[10px] text-on-surface-variant">v{comment.proposal_content_version}</span></div><button type="button" className="mt-2 block w-full text-left text-xs leading-5 text-primary hover:underline disabled:cursor-not-allowed disabled:text-on-surface-variant" disabled={stale} onClick={() => jumpToComment(comment)}>{stale ? "内容已更新，请重新选择" : `“${comment.quoted_text || "（空选区）"}”`}</button><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-on-surface">{comment.body}</p><div className="mt-3 flex flex-wrap gap-2">{comment.status === "open" && <button type="button" className="control-button min-h-9 px-2.5 text-xs" disabled={busyAction !== null} onClick={() => void setCommentStatus(comment, "resolved")}><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />标记解决</button>}{comment.status === "open" && <button type="button" className="control-button min-h-9 px-2.5 text-xs" disabled={busyAction !== null} onClick={() => void setCommentStatus(comment, "dismissed")}>忽略</button>}</div></article>; })}</div>}
          {detail?.profile && <div className="mt-5 border-t border-outline-variant/15 pt-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">AUTHOR</p><Link href={`/ai-profiles/${detail.profile.id}`} className="mt-2 flex items-center gap-3 rounded-xl p-2 transition hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"><span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary">{detail.profile.avatar_url ? <img src={detail.profile.avatar_url} alt="" className="h-full w-full object-cover" /> : detail.profile.display_name.slice(0, 1)}</span><span className="min-w-0"><strong className="block truncate text-sm text-on-surface">{detail.profile.display_name}</strong><span className="block truncate text-xs text-on-surface-variant">{subjectMap[detail.profile.subject]} · 资料页</span></span></Link></div>}
        </aside>
      </div>
      <AiKnowledgeQuizReviewPanel />
    </div>
  );
}
