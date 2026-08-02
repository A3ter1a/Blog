import { NextRequest, NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/server-admin-auth";
import { listPublishedAiKnowledgeQuizzesForNote } from "@/lib/server-ai-knowledge-quiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;
  const noteId = req.nextUrl.searchParams.get("noteId")?.trim() ?? "";
  if (!noteId) return NextResponse.json({ error: "缺少 noteId", success: false }, { status: 400 });
  try {
    const quizzes = await listPublishedAiKnowledgeQuizzesForNote(auth.context.supabase, noteId);
    return NextResponse.json({ success: true, quizzes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "快测读取失败", success: false }, { status: 500 });
  }
}
