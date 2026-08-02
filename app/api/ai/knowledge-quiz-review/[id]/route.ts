import { NextRequest, NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/server-admin-auth";
import {
  AiKnowledgeQuizError,
  getAiKnowledgeQuiz,
  publishAiKnowledgeQuiz,
  transitionAiKnowledgeQuiz,
} from "@/lib/server-ai-knowledge-quiz";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const quiz = await getAiKnowledgeQuiz(auth.context.supabase, id);
    if (!quiz) return NextResponse.json({ error: "快测不存在", success: false }, { status: 404 });
    return NextResponse.json({ success: true, quiz: quiz.quiz, items: quiz.items });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "快测审核读取失败", success: false }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const body: unknown = await req.json().catch(() => ({}));
  const action = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>).action
    : undefined;
  try {
    let quiz;
    if (action === "request_changes" || action === "approve" || action === "reject") {
      quiz = await transitionAiKnowledgeQuiz(auth.context.supabase, auth.context.user.id, id, action);
    } else if (action === "publish") {
      const noteId = body && typeof body === "object" && !Array.isArray(body) && typeof (body as Record<string, unknown>).noteId === "string"
        ? ((body as Record<string, unknown>).noteId as string).trim()
        : undefined;
      quiz = await publishAiKnowledgeQuiz(auth.context.supabase, id, noteId);
    } else {
      return NextResponse.json({ error: "快测审核操作无效", success: false }, { status: 400 });
    }
    if (!quiz) return NextResponse.json({ error: "快测不存在", success: false }, { status: 404 });
    return NextResponse.json({ success: true, quiz });
  } catch (error: unknown) {
    const status = error instanceof AiKnowledgeQuizError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "快测审核操作失败", success: false }, { status });
  }
}
