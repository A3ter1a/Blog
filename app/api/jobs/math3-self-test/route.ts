import { NextRequest, NextResponse } from "next/server";
import type { Math3SelfTestDifficulty, Math3SelfTestMode } from "@/lib/math3-self-test";
import {
  createMath3SelfTestGenerationJob,
  internalJobLeaseSchemaAvailable,
} from "@/lib/server-internal-job-runner";
import { getAdminRequestContext, resolveAIKey } from "@/lib/server-admin-auth";
import { scheduleInternalJobDrain } from "@/lib/server-internal-job-background";
import { sanitizeJobSummaryRow } from "@/lib/server-job-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMode(value: unknown): value is Math3SelfTestMode {
  return value === "quick" || value === "full";
}

function isDifficulty(value: unknown): value is Math3SelfTestDifficulty {
  return value === "comfort" || value === "simulation" || value === "challenge";
}

export async function POST(req: NextRequest) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;
  try {
    if (!await internalJobLeaseSchemaAvailable(auth.context.supabase)) {
      return NextResponse.json({
        error: "站内持久任务尚未启用，不能安全生成试卷",
        success: false,
        availability: "schema_pending",
      }, { status: 503 });
    }
    const deepseekApiKey = resolveAIKey("deepseek");
    if (!deepseekApiKey) {
      return NextResponse.json({ error: "服务器 DeepSeek API Key 未配置", success: false }, { status: 503 });
    }

    const rawBody: unknown = await req.json().catch(() => ({}));
    const body = isRecord(rawBody) ? rawBody : {};
    const mode = isMode(body.mode) ? body.mode : "quick";
    const difficulty = isDifficulty(body.difficulty) ? body.difficulty : "simulation";
    const ledger = await createMath3SelfTestGenerationJob(auth.context.supabase, {
      userId: auth.context.user.id,
      mode,
      difficulty,
    });
    if (ledger.availability !== "synced" || !ledger.data) {
      return NextResponse.json({
        error: "数学三试卷生成任务登记失败，请先检查任务中心迁移",
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
    const message = error instanceof Error ? error.message : "数学三试卷生成任务创建失败";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
