import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_DEEPSEEK_MODEL, DEFAULT_QWEN_MODEL, normalizeOcrProvider } from "@/lib/ai-config";
import type { ProblemOcrChapterContextItem, ProblemOcrSourceAsset } from "@/lib/problem-ocr-contract";
import { createProblemOcrJob, internalJobLeaseSchemaAvailable } from "@/lib/server-internal-job-runner";
import { getAdminRequestContext, resolveAIKey } from "@/lib/server-admin-auth";
import { sanitizeJobSummaryRow } from "@/lib/server-job-ledger";
import { scheduleInternalJobDrain } from "@/lib/server-internal-job-background";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseAssets(value: unknown): ProblemOcrSourceAsset[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ProblemOcrSourceAsset[] => {
    const record = isRecord(item) ? item : {};
    const path = typeof record.path === "string" ? record.path.trim() : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const mimeType = record.mimeType;
    return path && name && ["image/jpeg", "image/png", "image/webp"].includes(String(mimeType))
      ? [{ path, name, mimeType: mimeType as ProblemOcrSourceAsset["mimeType"] }]
      : [];
  });
}

function parseChapterContext(value: unknown): ProblemOcrChapterContextItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ProblemOcrChapterContextItem[] => {
    const record = isRecord(item) ? item : {};
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    return id && name ? [{ id, name }] : [];
  }).slice(0, 200);
}

export async function GET(req: NextRequest) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;
  try {
    const available = await internalJobLeaseSchemaAvailable(auth.context.supabase);
    return NextResponse.json({
      success: true,
      available: available && Boolean(resolveAIKey("deepseek")) && (normalizeOcrProvider(req.nextUrl.searchParams.get("provider")) === "deepseek" || Boolean(resolveAIKey("qwen"))),
      availability: available ? "synced" : "schema_pending",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "题库 OCR 能力检查失败";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;
  try {
    const raw: unknown = await req.json().catch(() => ({}));
    const body = isRecord(raw) ? raw : {};
    const assets = parseAssets(body.assets);
    if (assets.length < 1 || assets.length > 10) {
      return NextResponse.json({ error: "题库 OCR 每次必须包含 1–10 张有效私有源图", success: false }, { status: 400 });
    }
    const ocrProvider = normalizeOcrProvider(body.ocrProvider);
    if (!resolveAIKey("deepseek") || (ocrProvider === "qwen" && !resolveAIKey("qwen"))) {
      return NextResponse.json({ error: "所选 OCR 服务或题目分析所需的服务端 API Key 未配置", success: false }, { status: 503 });
    }
    const targetId = typeof body.targetId === "string" ? body.targetId.trim().slice(0, 200) : "";
    if (!/^[A-Za-z0-9:_-]{8,200}$/.test(targetId)) {
      return NextResponse.json({ error: "题库 OCR 缺少有效的编辑目标", success: false }, { status: 400 });
    }
    const ledger = await createProblemOcrJob(auth.context.supabase, {
      userId: auth.context.user.id,
      assets,
      chapterContext: parseChapterContext(body.chapterContext),
      qwenModel: typeof body.qwenModel === "string" && body.qwenModel.trim() ? body.qwenModel.trim() : DEFAULT_QWEN_MODEL,
      deepseekModel: typeof body.deepseekModel === "string" && body.deepseekModel.trim() ? body.deepseekModel.trim() : DEFAULT_DEEPSEEK_MODEL,
      ocrProvider,
      targetId,
    });
    if (ledger.availability !== "synced" || !ledger.data) {
      return NextResponse.json({
        error: "题库 OCR 持久任务尚未启用，不能安全开始识别",
        success: false,
        availability: ledger.availability,
      }, { status: 503 });
    }
    scheduleInternalJobDrain(auth.context.supabase, {
      userId: auth.context.user.id,
      jobId: ledger.data.id,
      deepseekApiKey: resolveAIKey("deepseek") ?? "",
      qwenApiKey: resolveAIKey("qwen") ?? "",
    });
    return NextResponse.json({ success: true, job: sanitizeJobSummaryRow(ledger.data) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "题库 OCR 任务创建失败";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
