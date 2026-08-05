import { NextRequest, NextResponse } from "next/server";
import { AiContentWorkflowError, getAiContentProposal, updateAiContentProposal } from "@/lib/server-ai-content";
import { getAiRequestContext } from "@/lib/server-ai-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAiRequestContext(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "提案 ID 无效", success: false }, { status: 400 });

  try {
    const proposal = await getAiContentProposal(auth.context.supabase, auth.context.user.id, id);
    if (!proposal) return NextResponse.json({ error: "提案不存在或无权访问", success: false }, { status: 404 });
    return NextResponse.json(
      { success: true, proposal },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI 提案读取失败", success: false }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAiRequestContext(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "提案 ID 无效", success: false }, { status: 400 });

  try {
    const rawBody: unknown = await req.json().catch(() => ({}));
    const body = isRecord(rawBody) ? rawBody : {};
    const proposal = await updateAiContentProposal(auth.context.supabase, {
      userId: auth.context.user.id,
      profile: auth.context.profile,
      proposalId: id,
      title: body.title,
      content: body.content,
      tags: body.tags,
      coverImage: body.coverImage,
      videos: body.videos,
      problems: body.problems,
    });
    if (!proposal) return NextResponse.json({ error: "提案不存在或无权访问", success: false }, { status: 404 });
    return NextResponse.json({ success: true, proposal });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "AI 提案更新失败";
    const status = error instanceof AiContentWorkflowError ? error.status : 500;
    return NextResponse.json({ error: message, success: false }, { status });
  }
}
