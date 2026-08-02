import { NextRequest, NextResponse } from "next/server";
import { AiKnowledgeQuizError, createAiKnowledgeQuiz, listAiKnowledgeQuizzes } from "@/lib/server-ai-knowledge-quiz";
import { getAiRequestContext } from "@/lib/server-ai-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function GET(req: NextRequest) {
  const auth = await getAiRequestContext(req);
  if (!auth.ok) return auth.response;
  try {
    const quizzes = await listAiKnowledgeQuizzes(auth.context.supabase, auth.context.user.id);
    return NextResponse.json({ success: true, profile: auth.context.profile, quizzes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "快测读取失败", success: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await getAiRequestContext(req);
  if (!auth.ok) return auth.response;
  try {
    const rawBody: unknown = await req.json().catch(() => ({}));
    const body = isRecord(rawBody) ? rawBody : {};
    const proposalId = typeof body.proposalId === "string" ? body.proposalId.trim() : "";
    if (!proposalId) return NextResponse.json({ error: "缺少讲义提案 ID", success: false }, { status: 400 });
    const created = await createAiKnowledgeQuiz(auth.context.supabase, {
      userId: auth.context.user.id,
      profile: auth.context.profile,
      proposalId,
      title: body.title,
      items: body.items,
    });
    return NextResponse.json({ success: true, quiz: created.quiz, items: created.items }, { status: 201 });
  } catch (error: unknown) {
    const status = error instanceof AiKnowledgeQuizError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "快测保存失败", success: false }, { status });
  }
}
