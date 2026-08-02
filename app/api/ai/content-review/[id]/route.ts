import { NextRequest, NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/server-admin-auth";
import {
  AiContentWorkflowError,
} from "@/lib/server-ai-content";
import {
  createAiContentProposalComment,
  getAiContentReviewProposal,
  getReviewProposalForAction,
  publishAiContentProposal,
  transitionAiContentProposal,
  type ReviewTransition,
} from "@/lib/server-ai-content-review";
import { attachAiKnowledgeQuizzesToPublishedNote } from "@/lib/server-ai-knowledge-quiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function workflowErrorResponse(error: unknown, fallback: string): NextResponse {
  const message = error instanceof Error ? error.message : fallback;
  const status = error instanceof AiContentWorkflowError
    ? error.status
    : typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "42501"
      ? 403
      : 500;
  return NextResponse.json({ error: message, success: false }, { status });
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  const raw = await req.json().catch(() => ({}));
  return isRecord(raw) ? raw : {};
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "提案 ID 无效", success: false }, { status: 400 });

  try {
    const proposal = await getAiContentReviewProposal(auth.context.supabase, id);
    if (!proposal) return NextResponse.json({ error: "提案不存在", success: false }, { status: 404 });
    return NextResponse.json({ success: true, proposal }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    return workflowErrorResponse(error, "AI 审核提案读取失败");
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "提案 ID 无效", success: false }, { status: 400 });

  try {
    const body = await readJson(req);
    const comment = await createAiContentProposalComment(auth.context.supabase, auth.context.user.id, {
      proposalId: id,
      proposalContentVersion: body.proposalContentVersion ?? body.contentVersion,
      selectionStart: body.selectionStart,
      selectionEnd: body.selectionEnd,
      quotedText: body.quotedText,
      body: body.body,
    });
    return NextResponse.json({ success: true, comment }, { status: 201 });
  } catch (error: unknown) {
    return workflowErrorResponse(error, "审核批注保存失败");
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "提案 ID 无效", success: false }, { status: 400 });

  try {
    const body = await readJson(req);
    const action = body.action;
    let proposal;
    if (action === "request_changes" || action === "approve" || action === "reject") {
      proposal = await transitionAiContentProposal(
        auth.context.supabase,
        auth.context.user.id,
        id,
        action as ReviewTransition,
      );
    } else if (action === "publish") {
      const current = await getReviewProposalForAction(auth.context.supabase, id);
      if (!current) return NextResponse.json({ error: "提案不存在", success: false }, { status: 404 });
      if (current.review_status !== "approved" && current.review_status !== "published") {
        throw new AiContentWorkflowError("只有已批准的提案才能发布。", 409);
      }
      proposal = await publishAiContentProposal(auth.context.supabase, id);
    } else if (action === "approve_and_publish") {
      const approved = await transitionAiContentProposal(
        auth.context.supabase,
        auth.context.user.id,
        id,
        "approve",
      );
      if (!approved) return NextResponse.json({ error: "提案不存在", success: false }, { status: 404 });
      proposal = await publishAiContentProposal(auth.context.supabase, id);
    } else {
      return NextResponse.json({ error: "审核操作无效", success: false }, { status: 400 });
    }

    if (!proposal) return NextResponse.json({ error: "提案不存在", success: false }, { status: 404 });
    if (proposal.note_id) {
      await attachAiKnowledgeQuizzesToPublishedNote(auth.context.supabase, id, proposal.note_id);
    }
    const detail = await getAiContentReviewProposal(auth.context.supabase, id);
    return NextResponse.json({ success: true, proposal: detail ?? { proposal, profile: null, comments: [] } });
  } catch (error: unknown) {
    return workflowErrorResponse(error, "AI 审核操作失败");
  }
}
