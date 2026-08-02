import { NextRequest, NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/server-admin-auth";
import { AiContentWorkflowError } from "@/lib/server-ai-content";
import {
  deleteAiContentProposalComment,
  updateAiContentProposalComment,
  type ReviewCommentStatus,
} from "@/lib/server-ai-content-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function errorResponse(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "批注操作失败";
  const status = error instanceof AiContentWorkflowError ? error.status : 500;
  return NextResponse.json({ error: message, success: false }, { status });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;
  const { id, commentId } = await params;
  if (!isUuid(id) || !isUuid(commentId)) return NextResponse.json({ error: "批注 ID 无效", success: false }, { status: 400 });

  try {
    const raw = await req.json().catch(() => ({}));
    const body = isRecord(raw) ? raw : {};
    const status = body.status;
    if (status !== "open" && status !== "resolved" && status !== "dismissed") {
      throw new AiContentWorkflowError("批注状态无效。", 400);
    }
    const comment = await updateAiContentProposalComment(
      auth.context.supabase,
      commentId,
      status as ReviewCommentStatus,
    );
    if (!comment || comment.proposal_id !== id) {
      return NextResponse.json({ error: "批注不存在", success: false }, { status: 404 });
    }
    return NextResponse.json({ success: true, comment });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;
  const { id, commentId } = await params;
  if (!isUuid(id) || !isUuid(commentId)) return NextResponse.json({ error: "批注 ID 无效", success: false }, { status: 400 });

  try {
    const deleted = await deleteAiContentProposalComment(auth.context.supabase, id, commentId);
    if (!deleted) return NextResponse.json({ error: "批注不存在", success: false }, { status: 404 });
    return NextResponse.json({ success: true, id: commentId, proposalId: id });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
