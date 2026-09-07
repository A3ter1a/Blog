import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_DEEPSEEK_MODEL } from "@/lib/ai-config";
import { getAdminRequestContext, resolveAIKey } from "@/lib/server-admin-auth";
import { scheduleInternalJobDrain } from "@/lib/server-internal-job-background";
import { createEconomicsGraphJob, internalJobLeaseSchemaAvailable } from "@/lib/server-internal-job-runner";
import { sanitizeJobSummaryRow } from "@/lib/server-job-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function POST(req: NextRequest) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;
  try {
    if (!await internalJobLeaseSchemaAvailable(auth.context.supabase)) {
      return NextResponse.json({ error: "站内持久任务尚未启用", availability: "schema_pending", success: false }, { status: 503 });
    }
    const body = asRecord(await req.json().catch(() => ({})));
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const targetId = typeof body.targetId === "string" ? body.targetId : "";
    const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : DEFAULT_DEEPSEEK_MODEL;
    const apiKey = resolveAIKey("deepseek", body.apiKey);
    if (!apiKey) return NextResponse.json({ error: "DeepSeek API key 未配置", success: false }, { status: 503 });
    const ledger = await createEconomicsGraphJob(auth.context.supabase, {
      userId: auth.context.user.id,
      prompt,
      model,
      targetId,
    });
    if (ledger.availability !== "synced" || !ledger.data) {
      return NextResponse.json({ error: "经济学曲线任务登记失败", availability: ledger.availability, success: false }, { status: 503 });
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "曲线任务创建失败", success: false }, { status: 500 });
  }
}
