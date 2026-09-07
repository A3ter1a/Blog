import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_QWEN_MODEL } from "@/lib/ai-config";
import type { MathPaperOcrSourceAsset } from "@/lib/math-paper-ocr-job";
import {
  createMathPaperOcrJob,
  internalJobLeaseSchemaAvailable,
} from "@/lib/server-internal-job-runner";
import { getAdminRequestContext, resolveAIKey } from "@/lib/server-admin-auth";
import { scheduleInternalJobDrain } from "@/lib/server-internal-job-background";
import { sanitizeJobSummaryRow } from "@/lib/server-job-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseAssets(value: unknown): MathPaperOcrSourceAsset[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): MathPaperOcrSourceAsset[] => {
    const record = asRecord(item);
    const path = typeof record.path === "string" ? record.path.trim() : "";
    const pageId = typeof record.pageId === "string" ? record.pageId.trim() : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const sourceFingerprint = typeof record.sourceFingerprint === "string" ? record.sourceFingerprint.trim() : "";
    const mimeType = record.mimeType;
    return path && pageId && name && sourceFingerprint && ["image/jpeg", "image/png", "image/webp"].includes(String(mimeType))
      ? [{ path, pageId, name, sourceFingerprint, mimeType: mimeType as MathPaperOcrSourceAsset["mimeType"] }]
      : [];
  });
}

export async function GET(req: NextRequest) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;
  try {
    const available = await internalJobLeaseSchemaAvailable(auth.context.supabase);
    return NextResponse.json({
      success: true,
      available: available && Boolean(resolveAIKey("qwen")),
      availability: available ? "synced" : "schema_pending",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "数学答题纸 OCR 能力检查失败";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;
  try {
    const body = asRecord(await req.json().catch(() => ({})));
    const assets = parseAssets(body.assets);
    if (assets.length < 1 || assets.length > 20) {
      return NextResponse.json({ error: "数学答题纸 OCR 每次必须包含 1–20 张有效私有原图", success: false }, { status: 400 });
    }
    const qwenApiKey = resolveAIKey("qwen");
    if (!qwenApiKey) {
      return NextResponse.json({ error: "服务器 Qwen API Key 未配置", success: false }, { status: 503 });
    }
    const ledger = await createMathPaperOcrJob(auth.context.supabase, {
      userId: auth.context.user.id,
      assets,
      qwenModel: typeof body.qwenModel === "string" && body.qwenModel.trim()
        ? body.qwenModel.trim()
        : DEFAULT_QWEN_MODEL,
    });
    if (ledger.availability !== "synced" || !ledger.data) {
      return NextResponse.json({
        error: "数学答题纸 OCR 持久任务尚未启用",
        success: false,
        availability: ledger.availability,
      }, { status: 503 });
    }
    scheduleInternalJobDrain(auth.context.supabase, {
      userId: auth.context.user.id,
      jobId: ledger.data.id,
      deepseekApiKey: "",
      qwenApiKey,
    });
    return NextResponse.json({ success: true, job: sanitizeJobSummaryRow(ledger.data) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "数学答题纸 OCR 任务创建失败";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
