"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileText, ListChecks, Loader2, RefreshCcw, Send, ShieldCheck, Sparkles } from "lucide-react";
import { ContentPreview } from "@/components/ui/ContentPreview";
import { useToast } from "@/components/ui/Toast";
import { buildAuthHeaders } from "@/lib/fetch-with-auth";
import {
  normalizeAiContentTags,
  type AiContentReviewStatus,
  type AiSelfCheck,
} from "@/lib/ai-content-contract";
import type { AiKnowledgeQuizStatus } from "@/lib/ai-knowledge-quiz-contract";
import { subjectMap } from "@/lib/types";
import { useAiContentWorkspace } from "@/hooks/useAiContentWorkspace";
import type { AiContentProposalRow } from "@/lib/server-ai-content";

const STATUS_LABELS: Record<AiContentReviewStatus, string> = {
  draft: "草稿",
  self_checked: "已自检",
  pending_review: "待人工审核",
  changes_requested: "退回返修",
  approved: "已批准",
  published: "已发布",
  rejected: "已拒绝",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readSelfCheck(value: unknown): AiSelfCheck | null {
  if (!isRecord(value) || typeof value.passed !== "boolean") return null;
  return value as unknown as AiSelfCheck;
}

function parseResponseError(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.error === "string" ? value.error : fallback;
}

function statusTone(status: string): string {
  if (status === "published" || status === "approved") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700";
  if (status === "changes_requested" || status === "rejected") return "border-amber-500/25 bg-amber-500/10 text-amber-700";
  if (status === "pending_review") return "border-primary/25 bg-primary/10 text-primary";
  return "border-outline-variant/25 bg-surface-container-high text-on-surface-variant";
}

export function AiContentWorkspace() {
  const toast = useToast();
  const { loading, profile, proposals, error, reload } = useAiContentWorkspace();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [content, setContent] = useState("");
  const [lastSelfCheck, setLastSelfCheck] = useState<AiSelfCheck | null>(null);
  const [busyAction, setBusyAction] = useState<"save" | "submit" | "reload" | null>(null);
  const [quizBusy, setQuizBusy] = useState(false);
  const [quizSummary, setQuizSummary] = useState<{ id: string; count: number; status: AiKnowledgeQuizStatus } | null>(null);

  const selectedProposal = useMemo(
    () => proposals.find((proposal) => proposal.id === selectedId) ?? null,
    [proposals, selectedId],
  );

  const loadQuizSummary = async (proposalId: string) => {
    try {
      const response = await fetch("/api/ai/knowledge-quizzes", {
        headers: await buildAuthHeaders(),
        cache: "no-store",
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isRecord(payload) || !Array.isArray(payload.quizzes)) {
        setQuizSummary(null);
        return;
      }
      const quiz = payload.quizzes.find((item): item is Record<string, unknown> =>
        isRecord(item) && item.proposal_id === proposalId,
      );
      if (!quiz || typeof quiz.id !== "string") {
        setQuizSummary(null);
        return;
      }
      setQuizSummary({
        id: quiz.id,
        count: typeof quiz.item_count === "number" ? quiz.item_count : 0,
        status: typeof quiz.review_status === "string" ? quiz.review_status as AiKnowledgeQuizStatus : "draft",
      });
    } catch {
      setQuizSummary(null);
    }
  };

  const selectProposal = (proposal: AiContentProposalRow) => {
    setSelectedId(proposal.id);
    setTitle(proposal.title);
    setTags(proposal.tags.join(", "));
    setContent(proposal.content);
    setLastSelfCheck(readSelfCheck(proposal.self_check));
    setQuizSummary(null);
    void loadQuizSummary(proposal.id);
  };

  const requestProposal = async (url: string, method: "POST" | "PATCH", body: Record<string, unknown>) => {
    const response = await fetch(url, {
      method,
      headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok || !isRecord(payload) || !isRecord(payload.proposal)) {
      throw new Error(parseResponseError(payload, "AI 内容操作失败"));
    }
    return payload.proposal as AiContentProposalRow;
  };

  const generateKnowledgeQuiz = async () => {
    if (!selectedId || quizBusy) return;
    setQuizBusy(true);
    try {
      const response = await fetch(`/api/ai/knowledge-quizzes/${encodeURIComponent(selectedId)}/generate`, {
        method: "POST",
        headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({}),
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isRecord(payload) || !isRecord(payload.quiz)) {
        throw new Error(parseResponseError(payload, "知识点快测生成失败"));
      }
      const quiz = payload.quiz as Record<string, unknown>;
      if (typeof quiz.id !== "string") throw new Error("快测响应缺少 ID");
      setQuizSummary({
        id: quiz.id,
        count: typeof quiz.item_count === "number" ? quiz.item_count : 0,
        status: typeof quiz.review_status === "string" ? quiz.review_status as AiKnowledgeQuizStatus : "self_checked",
      });
      toast.success("知识点快测已生成，需单独审核后才能调用");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "知识点快测生成失败");
    } finally {
      setQuizBusy(false);
    }
  };

  const submitKnowledgeQuiz = async () => {
    if (!quizSummary?.id || quizBusy) return;
    setQuizBusy(true);
    try {
      const response = await fetch(`/api/ai/knowledge-quizzes/${encodeURIComponent(quizSummary.id)}/submit`, {
        method: "POST",
        headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({}),
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isRecord(payload) || !isRecord(payload.quiz)) {
        throw new Error(parseResponseError(payload, "快测提交审核失败"));
      }
      const quiz = payload.quiz;
      setQuizSummary({
        id: quizSummary.id,
        count: typeof quiz.item_count === "number" ? quiz.item_count : quizSummary.count,
        status: typeof quiz.review_status === "string" ? quiz.review_status as AiKnowledgeQuizStatus : "pending_review",
      });
      toast.success("知识点快测已提交人工审核");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "快测提交审核失败");
    } finally {
      setQuizBusy(false);
    }
  };

  const saveProposal = async (submitAfterSave: boolean) => {
    if (!profile || busyAction) return;
    setBusyAction(submitAfterSave ? "submit" : "save");
    try {
      const body = {
        title,
        content,
        subject: profile.subject,
        tags: normalizeAiContentTags(tags.split(/[,，]/)),
      };
      const proposal = selectedId
        ? await requestProposal(`/api/ai/content-proposals/${encodeURIComponent(selectedId)}`, "PATCH", body)
        : await requestProposal("/api/ai/content-proposals", "POST", body);
      setSelectedId(proposal.id);
      setTitle(proposal.title);
      setTags(proposal.tags.join(", "));
      setContent(proposal.content);
      const selfCheck = readSelfCheck(proposal.self_check);
      setLastSelfCheck(selfCheck);
      await reload();

      if (submitAfterSave) {
        if (!selfCheck?.passed) {
          toast.error("自检未通过，请先修复标记的问题");
          return;
        }
        const submitted = await requestProposal(
          `/api/ai/content-proposals/${encodeURIComponent(proposal.id)}/submit`,
          "POST",
          {},
        );
        setLastSelfCheck(readSelfCheck(submitted.self_check));
        await reload();
        toast.success("已提交人工审核，AI 账号不能直接发布");
      } else {
        toast.success(selfCheck?.passed ? "草稿已保存并通过自检" : "草稿已保存，请先处理自检问题");
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "AI 内容保存失败");
    } finally {
      setBusyAction(null);
    }
  };

  if (loading) {
    return <div className="surface-panel flex min-h-64 items-center justify-center gap-3 p-8 text-sm text-on-surface-variant"><Loader2 className="h-5 w-5 animate-spin text-primary" />正在确认 AI 学科账号…</div>;
  }

  if (error || !profile) {
    return (
      <section className="surface-panel mx-auto max-w-2xl space-y-4 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck className="h-6 w-6" /></div>
        <h2 className="font-headline text-xl font-semibold text-on-surface">需要 AI 学科账号</h2>
        <p className="text-sm leading-6 text-on-surface-variant">{error ?? "当前账号不是已启用的 AI 学科账号。"}</p>
        <Link href="/login" className="control-button control-button-primary inline-flex px-5 py-2.5 text-sm">前往账号登录</Link>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="surface-panel flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-lg font-semibold text-primary">{profile.display_name.slice(0, 1)}</div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">AI 内容工作台</p>
            <h2 className="mt-1 font-headline text-xl font-semibold text-on-surface">{profile.display_name} · {subjectMap[profile.subject]}</h2>
            <p className="mt-1 text-sm text-on-surface-variant">只接收已经由 Codex Skill 规范化的 Markdown；正文不会写入人工文章区。</p>
          </div>
        </div>
        <button type="button" className="control-button inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm" disabled={busyAction !== null} onClick={async () => { setBusyAction("reload"); await reload(); setBusyAction(null); }}><RefreshCcw className="h-4 w-4" />刷新提案</button>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <section className="surface-panel min-w-0 p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Markdown proposal</p><h2 className="mt-1 font-headline text-xl font-semibold text-on-surface">{selectedProposal ? "编辑自己的提案" : "新建文章或讲义"}</h2></div>
            {selectedProposal && <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(selectedProposal.review_status)}`}>{STATUS_LABELS[selectedProposal.review_status as AiContentReviewStatus] ?? selectedProposal.review_status}</span>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="field-label">文章标题</span><input value={title} onChange={(event) => setTitle(event.target.value)} className="field-control h-11 w-full px-3 text-sm" placeholder="例如：微观经济学 · 第 1 章" /></label>
            <label className="block"><span className="field-label">标签</span><input value={tags} onChange={(event) => setTags(event.target.value)} className="field-control h-11 w-full px-3 text-sm" placeholder="讲义, 重点, 第1章" /></label>
          </div>
          <label className="mt-4 block"><span className="field-label">Markdown 正文</span><textarea value={content} onChange={(event) => setContent(event.target.value)} className="field-control min-h-[30rem] w-full resize-y px-3 py-3 font-mono text-sm leading-6" placeholder="# 第一章\n\n把 Codex 输出的规范 Markdown 放在这里…" spellCheck={false} /></label>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" className="control-button inline-flex items-center gap-2 px-4 py-2.5 text-sm" disabled={busyAction !== null} onClick={() => void saveProposal(false)}><Sparkles className="h-4 w-4" />保存并自检</button>
            <button type="button" className="control-button control-button-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm" disabled={busyAction !== null} onClick={() => void saveProposal(true)}><Send className="h-4 w-4" />保存并提交审核</button>
          </div>
        </section>

        <aside className="space-y-5">
          <section className="surface-panel p-4"><div className="mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><h3 className="font-semibold text-on-surface">静默自检结果</h3></div>{lastSelfCheck ? <div className="space-y-3"><div className={`rounded-xl border px-3 py-2 text-sm ${lastSelfCheck.passed ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700" : "border-amber-500/25 bg-amber-500/10 text-amber-700"}`}>{lastSelfCheck.passed ? "格式、排版与标题层级已通过" : "仍有问题，暂不能提交审核"}</div><div className="grid grid-cols-3 gap-2 text-center text-xs text-on-surface-variant"><div className="rounded-lg bg-surface-container-low p-2"><strong className="block text-sm text-on-surface">{lastSelfCheck.characterCount.toLocaleString()}</strong>字符</div><div className="rounded-lg bg-surface-container-low p-2"><strong className="block text-sm text-on-surface">{lastSelfCheck.headingCount}</strong>标题</div><div className="rounded-lg bg-surface-container-low p-2"><strong className="block text-sm text-on-surface">{lastSelfCheck.issues.length}</strong>提示</div></div>{lastSelfCheck.issues.length > 0 && <ul className="space-y-2 text-xs leading-5 text-on-surface-variant">{lastSelfCheck.issues.slice(0, 6).map((issue) => <li key={`${issue.code}-${issue.message}`} className="flex gap-2"><span className={issue.severity === "error" ? "text-error" : "text-amber-600"}>•</span><span>{issue.message}</span></li>)}</ul>}</div> : <p className="text-sm leading-6 text-on-surface-variant">保存后自动检查 Markdown 定界符、代码块、图片链接、排版和标题层级。</p>}</section>
          <section className="surface-panel p-4"><div className="mb-3 flex items-center gap-2"><ListChecks className="h-4 w-4 text-primary" /><h3 className="font-semibold text-on-surface">知识点快测</h3></div><p className="text-sm leading-6 text-on-surface-variant">AI 根据当前讲义单独生成题目、答案和解析；它们不会混入 Markdown 正文，审核通过后才可调用。</p><button type="button" className="control-button control-button-primary mt-3 inline-flex w-full items-center justify-center gap-2 px-3 py-2.5 text-sm" disabled={!selectedId || quizBusy || busyAction !== null} onClick={() => void generateKnowledgeQuiz()}>{quizBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}{selectedId ? (quizBusy ? "正在生成…" : quizSummary ? "重新生成知识点快测" : "生成知识点快测") : "先保存并选择讲义"}</button>{quizSummary && <><div className="mt-3 rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-xs leading-5 text-on-surface-variant">已生成 {quizSummary.count} 题 · 状态：{quizSummary.status === "self_checked" ? "已自检，待提交审核" : quizSummary.status === "pending_review" ? "已提交，等待人工审核" : quizSummary.status === "approved" ? "已批准，等待发布" : quizSummary.status === "published" ? "已发布，可被助手调用" : quizSummary.status}</div>{["self_checked", "changes_requested"].includes(quizSummary.status) && <button type="button" className="control-button mt-2 inline-flex w-full items-center justify-center gap-2 px-3 py-2.5 text-sm" disabled={quizBusy || busyAction !== null} onClick={() => void submitKnowledgeQuiz()}>{quizBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}提交快测审核</button>}</>}</section>
          <section className="surface-panel overflow-hidden p-4"><div className="mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><h3 className="font-semibold text-on-surface">我的提案</h3><span className="ml-auto text-xs text-on-surface-variant">{proposals.length}</span></div>{proposals.length === 0 ? <p className="text-sm leading-6 text-on-surface-variant">还没有提案。完成一篇章节后，从左侧保存。</p> : <div className="space-y-2">{proposals.map((proposal) => <button type="button" key={proposal.id} onClick={() => selectProposal(proposal)} className={`w-full rounded-xl border px-3 py-3 text-left transition ${proposal.id === selectedId ? "border-primary/45 bg-primary/5" : "border-outline-variant/20 bg-surface-container-low hover:border-primary/25"}`}><span className="flex items-start justify-between gap-2"><strong className="line-clamp-2 text-sm text-on-surface">{proposal.title}</strong><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${statusTone(proposal.review_status)}`}>{STATUS_LABELS[proposal.review_status as AiContentReviewStatus] ?? proposal.review_status}</span></span><span className="mt-1 block text-xs text-on-surface-variant">{new Date(proposal.updated_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></button>)}</div>}</section>
        </aside>
      </div>

      <section className="surface-panel p-5"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Render check</p><h2 className="mt-1 font-headline text-lg font-semibold text-on-surface">文章预览</h2></div><span className="text-xs text-on-surface-variant">博客实际 Markdown 渲染</span></div><div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-5">{content.trim() ? <ContentPreview content={content} className="text-on-surface-variant" enableEconomicsTerms={profile.subject === "economics"} enableEconomicsGraphs={profile.subject === "economics"} /> : <div className="flex min-h-32 items-center justify-center text-sm text-on-surface-variant">输入 Markdown 后，这里会显示博客预览。</div>}</div></section>
    </div>
  );
}
