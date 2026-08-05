import { NextRequest, NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/server-admin-auth";
import {
  listAiContentReviewProposals,
  getReviewProposalForAction,
  publishAiContentProposal,
  transitionAiContentProposal,
} from "@/lib/server-ai-content-review";
import { attachAiKnowledgeQuizzesToPublishedNote } from "@/lib/server-ai-knowledge-quiz";
import type { AiContentReviewStatus } from "@/lib/ai-content-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REVIEW_STATUSES = new Set<AiContentReviewStatus>([
  "draft",
  "self_checked",
  "pending_review",
  "changes_requested",
  "approved",
  "published",
  "rejected",
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getLimit(value: string | null): number {
  const parsed = Number(value ?? 40);
  return Number.isFinite(parsed) ? parsed : 40;
}

export async function GET(req: NextRequest) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;

  try {
    const rawStatus = req.nextUrl.searchParams.get("status");
    const status = rawStatus && REVIEW_STATUSES.has(rawStatus as AiContentReviewStatus)
      ? rawStatus as AiContentReviewStatus
      : undefined;
    const proposals = await listAiContentReviewProposals(
      auth.context.supabase,
      status,
      getLimit(req.nextUrl.searchParams.get("limit")),
    );
    return NextResponse.json({
      success: true,
      proposals,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "AI 审核队列读取失败";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;

  try {
    const body: unknown = await req.json().catch(() => ({}));
    const record = body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
    const action = record.action === "approve" || record.action === "publish" || record.action === "approve_and_publish"
      ? record.action
      : null;
    if (!action) {
      return NextResponse.json({ error: "批量操作仅支持批准、发布或批准并发布", success: false }, { status: 400 });
    }
    if (!Array.isArray(record.proposalIds)) {
      return NextResponse.json({ error: "缺少 proposalIds 数组", success: false }, { status: 400 });
    }

    const proposalIds = [...new Set(record.proposalIds
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim()))];
    if (proposalIds.length === 0 || proposalIds.length > 50 || proposalIds.some((id) => !UUID_PATTERN.test(id))) {
      return NextResponse.json({ error: "proposalIds 必须是 1-50 个有效提案 ID", success: false }, { status: 400 });
    }

    const approvedIds: string[] = [];
    const publishedIds: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    for (const proposalId of proposalIds) {
      try {
        let proposal;
        if (action === "approve") {
          proposal = await transitionAiContentProposal(
            auth.context.supabase,
            auth.context.user.id,
            proposalId,
            "approve",
          );
        } else if (action === "publish") {
          const current = await getReviewProposalForAction(auth.context.supabase, proposalId);
          if (!current) {
            failed.push({ id: proposalId, error: "提案不存在" });
            continue;
          }
          if (current.review_status !== "approved" && current.review_status !== "published") {
            throw new Error("只有已批准的提案才能发布");
          }
          proposal = await publishAiContentProposal(auth.context.supabase, proposalId);
        } else {
          const approved = await transitionAiContentProposal(
            auth.context.supabase,
            auth.context.user.id,
            proposalId,
            "approve",
          );
          if (!approved) {
            failed.push({ id: proposalId, error: "提案不存在" });
            continue;
          }
          proposal = await publishAiContentProposal(auth.context.supabase, proposalId);
        }

        if (!proposal) {
          failed.push({ id: proposalId, error: "提案不存在" });
        } else {
          if (action === "approve") approvedIds.push(proposalId);
          if (action === "publish" || action === "approve_and_publish") {
            publishedIds.push(proposalId);
            if (proposal.note_id) {
              await attachAiKnowledgeQuizzesToPublishedNote(auth.context.supabase, proposalId, proposal.note_id);
            }
          }
        }
      } catch (error: unknown) {
        failed.push({ id: proposalId, error: error instanceof Error ? error.message : action === "approve" ? "批准失败" : "发布失败" });
      }
    }

    return NextResponse.json({
      success: failed.length === 0,
      approvedIds,
      publishedIds,
      failed,
      count: action === "approve" ? approvedIds.length : publishedIds.length,
    }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "批量操作失败";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
