import { NextRequest, NextResponse } from "next/server";
import { AiKnowledgeQuizError, getAiKnowledgeQuiz, updateAiKnowledgeQuiz } from "@/lib/server-ai-knowledge-quiz";
import { getAiRequestContext } from "@/lib/server-ai-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAiRequestContext(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const quiz = await getAiKnowledgeQuiz(auth.context.supabase, id, auth.context.user.id);
    if (!quiz) return NextResponse.json({ error: "快测不存在", success: false }, { status: 404 });
    return NextResponse.json({ success: true, quiz: quiz.quiz, items: quiz.items });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "快测读取失败", success: false }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAiRequestContext(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const rawBody: unknown = await req.json().catch(() => ({}));
    const body = isRecord(rawBody) ? rawBody : {};
    const updated = await updateAiKnowledgeQuiz(auth.context.supabase, {
      userId: auth.context.user.id,
      quizId: id,
      title: body.title,
      items: body.items,
    });
    if (!updated) return NextResponse.json({ error: "快测不存在", success: false }, { status: 404 });
    return NextResponse.json({ success: true, quiz: updated.quiz, items: updated.items });
  } catch (error: unknown) {
    const status = error instanceof AiKnowledgeQuizError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "快测更新失败", success: false }, { status });
  }
}
