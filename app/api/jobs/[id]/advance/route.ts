import { NextRequest, NextResponse } from "next/server";
import { advanceInternalJob, internalJobLeaseRolloutEnabled } from "@/lib/server-internal-job-runner";
import { getAdminRequestContext, resolveAIKey } from "@/lib/server-admin-auth";
import { sanitizeJobSummaryRow } from "@/lib/server-job-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "任务 ID 无效", success: false }, { status: 400 });
  if (!internalJobLeaseRolloutEnabled()) {
    return NextResponse.json({ error: "站内任务 lease 尚未启用", success: false, availability: "schema_pending" }, { status: 503 });
  }
  try {
    const ledger = await advanceInternalJob(auth.context.supabase, {
      userId: auth.context.user.id,
      jobId: id,
      deepseekApiKey: resolveAIKey("deepseek") ?? "",
      qwenApiKey: resolveAIKey("qwen") ?? "",
    });
    if (ledger.availability !== "synced") {
      return NextResponse.json({ error: "站内任务 lease RPC 尚未就绪", success: false, availability: ledger.availability }, { status: 503 });
    }
    if (!ledger.data) return NextResponse.json({ error: "任务不存在或无权访问", success: false }, { status: 404 });
    return NextResponse.json({ success: true, job: sanitizeJobSummaryRow(ledger.data) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "站内任务推进失败";
    return NextResponse.json({ error: message, success: false }, {
      status: message.includes("API Key 未配置") ? 503 : 500,
    });
  }
}
