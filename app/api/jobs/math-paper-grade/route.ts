import { NextRequest, NextResponse } from "next/server";
import {
  createMathPaperGradeJob,
  internalJobLeaseSchemaAvailable,
} from "@/lib/server-internal-job-runner";
import { getAdminRequestContext, resolveAIKey } from "@/lib/server-admin-auth";
import { sanitizeJobSummaryRow } from "@/lib/server-job-ledger";
import { getMathTrainingPersistenceMode } from "@/lib/server-math-training-core";
import { scheduleInternalJobDrain } from "@/lib/server-internal-job-background";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(req: NextRequest) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;
  try {
    if (getMathTrainingPersistenceMode() !== "shared") {
      return NextResponse.json({ error: "数学共享训练核尚未启用", success: false }, { status: 409 });
    }
    if (!await internalJobLeaseSchemaAvailable(auth.context.supabase)) {
      return NextResponse.json({
        error: "站内持久任务尚未启用，不能安全生成建议分",
        success: false,
        availability: "schema_pending",
      }, { status: 503 });
    }
    const deepseekApiKey = resolveAIKey("deepseek");
    if (!deepseekApiKey) {
      return NextResponse.json({ error: "服务器 DeepSeek API Key 未配置", success: false }, { status: 503 });
    }

    const body = asRecord(await req.json().catch(() => ({})));
    if (!isUuid(body.paperId) || !isUuid(body.confirmationId)) {
      return NextResponse.json({ error: "缺少有效的 paperId 或 confirmationId", success: false }, { status: 400 });
    }
    const ledger = await createMathPaperGradeJob(auth.context.supabase, {
      userId: auth.context.user.id,
      paperId: body.paperId,
      confirmationId: body.confirmationId,
      targetId: `math-confirmation:${body.confirmationId}`,
    });
    if (ledger.availability !== "synced" || !ledger.data) {
      return NextResponse.json({
        error: "数学真题建议评分任务登记失败，请先检查任务中心迁移",
        success: false,
        availability: ledger.availability,
      }, { status: 503 });
    }
    scheduleInternalJobDrain(auth.context.supabase, {
      userId: auth.context.user.id,
      jobId: ledger.data.id,
      deepseekApiKey,
      qwenApiKey: "",
    });
    return NextResponse.json({ success: true, job: sanitizeJobSummaryRow(ledger.data) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "数学真题建议评分任务创建失败";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
