import { NextRequest, NextResponse } from "next/server";
import { calculateMath3ClassificationChecksum } from "@/lib/math3-classification-job";
import type { Math3ProblemClassifyInput } from "@/lib/math3-classification";
import {
  createMath3ClassificationJob,
  internalJobLeaseSchemaAvailable,
} from "@/lib/server-internal-job-runner";
import { getAdminRequestContext, resolveAIKey } from "@/lib/server-admin-auth";
import { sanitizeJobSummaryRow } from "@/lib/server-job-ledger";
import { scheduleInternalJobDrain } from "@/lib/server-internal-job-background";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function parseProblems(value: unknown): Math3ProblemClassifyInput[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 200).flatMap((item): Math3ProblemClassifyInput[] => {
    const record = asRecord(item);
    const id = text(record.id, 160);
    const question = text(record.question, 1300);
    const index = Number(record.index);
    const type = text(record.type, 80);
    if (!id || !question || !Number.isInteger(index) || index < 1 || !type) return [];
    const options = Array.isArray(record.options) ? record.options.flatMap((option, optionIndex) => {
      const candidate = asRecord(option);
      const content = text(candidate.content, 600);
      return content ? [{ label: text(candidate.label, 20) || String.fromCharCode(65 + optionIndex), content }] : [];
    }) : [];
    return [{ id, index, type, question, answer: text(record.answer, 600), options }];
  });
}

export async function POST(req: NextRequest) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;
  try {
    if (!await internalJobLeaseSchemaAvailable(auth.context.supabase)) {
      return NextResponse.json({ error: "站内持久任务尚未启用", availability: "schema_pending", success: false }, { status: 503 });
    }
    if (!resolveAIKey("deepseek")) {
      return NextResponse.json({ error: "服务器 DeepSeek API Key 未配置", success: false }, { status: 503 });
    }
    const body = asRecord(await req.json().catch(() => ({})));
    const problems = parseProblems(body.problems);
    if (problems.length < 1 || problems.length > 200) {
      return NextResponse.json({ error: "数学三批量归类必须包含 1–200 道有效题目", success: false }, { status: 400 });
    }
    const sourceChecksum = text(body.sourceChecksum, 64).toLowerCase();
    if (sourceChecksum !== await calculateMath3ClassificationChecksum(problems)) {
      return NextResponse.json({ error: "数学三批量归类源题快照校验失败", success: false }, { status: 400 });
    }
    const targetId = text(body.targetId, 200);
    if (!/^[A-Za-z0-9:_-]{8,200}$/.test(targetId)) {
      return NextResponse.json({ error: "数学三批量归类缺少有效的编辑目标", success: false }, { status: 400 });
    }
    const ledger = await createMath3ClassificationJob(auth.context.supabase, {
      userId: auth.context.user.id,
      problems,
      sourceChecksum,
      scopeLabel: text(body.scopeLabel, 120) || "题目",
      targetId,
    });
    if (ledger.availability !== "synced" || !ledger.data) {
      return NextResponse.json({ error: "数学三批量归类任务登记失败", availability: ledger.availability, success: false }, { status: 503 });
    }
    scheduleInternalJobDrain(auth.context.supabase, {
      userId: auth.context.user.id,
      jobId: ledger.data.id,
      deepseekApiKey: resolveAIKey("deepseek") ?? "",
      qwenApiKey: "",
    });
    return NextResponse.json({ success: true, job: sanitizeJobSummaryRow(ledger.data) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "数学三批量归类任务创建失败";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
