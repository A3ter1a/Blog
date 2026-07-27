import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_DEEPSEEK_MODEL } from "@/lib/ai-config";
import { createMarkdownReviewJob, internalJobLeaseRolloutEnabled } from "@/lib/server-internal-job-runner";
import { getAdminRequestContext, resolveAIKey } from "@/lib/server-admin-auth";
import { sanitizeJobSummaryRow } from "@/lib/server-job-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function POST(req: NextRequest) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;
  if (!internalJobLeaseRolloutEnabled()) {
    return NextResponse.json({
      success: false,
      availability: "schema_pending",
      error: "站内持久任务尚未启用，继续使用当前同步审阅流程",
    }, { status: 503 });
  }
  if (!resolveAIKey("deepseek")) {
    return NextResponse.json({ error: "服务器 DeepSeek API Key 未配置", success: false }, { status: 503 });
  }

  try {
    const rawBody: unknown = await req.json().catch(() => ({}));
    const body = isRecord(rawBody) ? rawBody : {};
    const markdown = typeof body.markdown === "string" ? body.markdown : "";
    const model = typeof body.model === "string" && body.model.trim()
      ? body.model.trim()
      : DEFAULT_DEEPSEEK_MODEL;
    const ledger = await createMarkdownReviewJob(auth.context.supabase, {
      userId: auth.context.user.id,
      markdown,
      model,
    });
    if (ledger.availability !== "synced" || !ledger.data) {
      return NextResponse.json({
        success: false,
        availability: ledger.availability,
        error: "站内任务 lease RPC 尚未就绪，继续使用当前同步审阅流程",
      }, { status: 503 });
    }
    return NextResponse.json({ success: true, job: sanitizeJobSummaryRow(ledger.data) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Markdown 审阅任务创建失败";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
