import { NextRequest, NextResponse } from "next/server";
import { AiContentWorkflowError, submitAiContentProposal } from "@/lib/server-ai-content";
import { getAiRequestContext } from "@/lib/server-ai-auth";

export const runtime = "nodejs";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAiRequestContext(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "提案 ID 无效", success: false }, { status: 400 });

  try {
    const proposal = await submitAiContentProposal(auth.context.supabase, auth.context.user.id, id);
    if (!proposal) return NextResponse.json({ error: "提案不存在或无权访问", success: false }, { status: 404 });
    return NextResponse.json({ success: true, proposal });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "提交人工审核失败";
    const status = error instanceof AiContentWorkflowError ? error.status : 500;
    return NextResponse.json({ error: message, success: false }, { status });
  }
}
