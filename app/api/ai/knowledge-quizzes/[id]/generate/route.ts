import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_DEEPSEEK_MODEL } from "@/lib/ai-config";
import { getAiRequestContext } from "@/lib/server-ai-auth";
import { resolveAIKey } from "@/lib/server-admin-auth";
import { scheduleInternalJobDrain } from "@/lib/server-internal-job-background";
import { createAiKnowledgeQuizJob, internalJobLeaseSchemaAvailable } from "@/lib/server-internal-job-runner";
import { sanitizeJobSummaryRow } from "@/lib/server-job-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAiRequestContext(req);
  if (!auth.ok) return auth.response;
  const { id: proposalId } = await params;
  try {
    if (!await internalJobLeaseSchemaAvailable(auth.context.supabase)) {
      return NextResponse.json({ error: "站内持久任务尚未启用", availability: "schema_pending", success: false }, { status: 503 });
    }
    const body = asRecord(await req.json().catch(() => ({})));
    const proposalResult = await auth.context.supabase
      .from("ai_content_proposals")
      .select("id, title, content")
      .eq("id", proposalId)
      .eq("owner_user_id", auth.context.user.id)
      .eq("ai_profile_id", auth.context.profile.id)
      .maybeSingle();
    if (proposalResult.error) throw proposalResult.error;
    if (!proposalResult.data) return NextResponse.json({ error: "讲义提案不存在或不属于当前 AI 账号", success: false }, { status: 404 });
    const apiKey = resolveAIKey("deepseek", body.apiKey);
    if (!apiKey) return NextResponse.json({ error: "DeepSeek API key 未配置", success: false }, { status: 503 });
    const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : DEFAULT_DEEPSEEK_MODEL;
    const ledger = await createAiKnowledgeQuizJob(auth.context.supabase, {
      userId: auth.context.user.id,
      proposalId,
      proposalTitle: proposalResult.data.title,
      proposalContent: proposalResult.data.content,
      model,
      targetId: `quiz-proposal:${proposalId}`,
    });
    if (ledger.availability !== "synced" || !ledger.data) {
      return NextResponse.json({ error: "知识点快测任务登记失败", availability: ledger.availability, success: false }, { status: 503 });
    }
    scheduleInternalJobDrain(auth.context.supabase, {
      userId: auth.context.user.id,
      jobId: ledger.data.id,
      deepseekApiKey: apiKey,
      qwenApiKey: "",
    });
    return NextResponse.json({ success: true, job: sanitizeJobSummaryRow(ledger.data) }, {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "快测任务创建失败", success: false }, { status: 500 });
  }
}
