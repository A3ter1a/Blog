import { NextRequest, NextResponse } from "next/server";
import { AiKnowledgeQuizError, submitAiKnowledgeQuiz } from "@/lib/server-ai-knowledge-quiz";
import { getAiRequestContext } from "@/lib/server-ai-auth";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAiRequestContext(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const quiz = await submitAiKnowledgeQuiz(auth.context.supabase, auth.context.user.id, id);
    if (!quiz) return NextResponse.json({ error: "快测不存在", success: false }, { status: 404 });
    return NextResponse.json({ success: true, quiz });
  } catch (error: unknown) {
    const status = error instanceof AiKnowledgeQuizError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "快测提交失败", success: false }, { status });
  }
}
