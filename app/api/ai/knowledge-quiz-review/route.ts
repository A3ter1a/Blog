import { NextRequest, NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/server-admin-auth";
import { listAiKnowledgeQuizReviewRows } from "@/lib/server-ai-knowledge-quiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;
  try {
    const quizzes = await listAiKnowledgeQuizReviewRows(auth.context.supabase);
    return NextResponse.json({ success: true, quizzes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "快测审核列表读取失败", success: false }, { status: 500 });
  }
}
