import { NextRequest, NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/server-admin-auth";
import { AiKnowledgeQuizError, gradeAiKnowledgeQuizAttempt } from "@/lib/server-ai-knowledge-quiz";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const body: unknown = await req.json().catch(() => ({}));
    const answers = isRecord(body) && "answers" in body ? body.answers : body;
    const graded = await gradeAiKnowledgeQuizAttempt(auth.context.supabase, auth.context.user.id, id, answers);
    return NextResponse.json({ success: true, attempt: graded.attempt, result: graded.result });
  } catch (error: unknown) {
    const status = error instanceof AiKnowledgeQuizError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "快测提交失败", success: false }, { status });
  }
}
