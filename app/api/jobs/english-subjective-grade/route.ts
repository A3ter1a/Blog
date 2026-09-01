import { NextRequest, NextResponse } from "next/server";
import {
  createEnglishSubjectiveGradeJob,
  internalJobLeaseSchemaAvailable,
} from "@/lib/server-internal-job-runner";
import { getAdminRequestContext, resolveAIKey } from "@/lib/server-admin-auth";
import { normalizeEnglishSubjectiveAnswers } from "@/lib/server-english-subjective-grade";
import { getEnglishTrainingPersistenceMode } from "@/lib/server-english-training-core";
import { scheduleInternalJobDrain } from "@/lib/server-internal-job-background";
import { sanitizeJobSummaryRow } from "@/lib/server-job-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(req: NextRequest) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;
  try {
    if (getEnglishTrainingPersistenceMode() === "legacy") {
      return NextResponse.json({ error: "主观题确认流需先完成共享训练核迁移", success: false }, { status: 409 });
    }
    if (!await internalJobLeaseSchemaAvailable(auth.context.supabase)) {
      return NextResponse.json({ error: "站内持久任务尚未启用", availability: "schema_pending", success: false }, { status: 503 });
    }
    const deepseekApiKey = resolveAIKey("deepseek");
    if (!deepseekApiKey) {
      return NextResponse.json({ error: "服务器 DeepSeek API Key 未配置", success: false }, { status: 503 });
    }
    const body = asRecord(await req.json().catch(() => ({})));
    const round = Number(body.round);
    const answers = normalizeEnglishSubjectiveAnswers(body.answers);
    if (!isUuid(body.passageId) || !Number.isInteger(round) || round < 1 || round > 3) {
      return NextResponse.json({ error: "缺少有效的 passageId 或轮次", success: false }, { status: 400 });
    }
    if (!Object.values(answers).some((answer) => answer.trim())) {
      return NextResponse.json({ error: "请先填写主观题作答", success: false }, { status: 400 });
    }
    const ledger = await createEnglishSubjectiveGradeJob(auth.context.supabase, {
      userId: auth.context.user.id,
      passageId: body.passageId,
      round: round as 1 | 2 | 3,
      answers,
      targetId: `english-round:${body.passageId}:${round}`,
    });
    if (ledger.availability !== "synced" || !ledger.data) {
      return NextResponse.json({ error: "英语主观题建议评分任务登记失败", availability: ledger.availability, success: false }, { status: 503 });
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
    const message = error instanceof Error ? error.message : "英语主观题建议评分任务创建失败";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
