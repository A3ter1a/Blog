import { NextRequest, NextResponse } from "next/server";
import { buildMathOcrConfirmationPayload, type MathOcrConfirmationPageInput } from "@/lib/math-training-core";
import { getAdminRequestContext } from "@/lib/server-admin-auth";
import {
  getMathTrainingPersistenceMode,
  getMathTrainingState,
  recordMathOcrConfirmation,
  startMathPaperAttempt,
} from "@/lib/server-math-training-core";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizePages(value: unknown): MathOcrConfirmationPageInput[] {
  if (!Array.isArray(value) || value.length > 40) return [];
  return value.flatMap((item, index): MathOcrConfirmationPageInput[] => {
    const record = asRecord(item);
    const fileName = typeof record.fileName === "string" ? record.fileName.slice(0, 300) : "";
    const sourceFingerprint = typeof record.sourceFingerprint === "string" ? record.sourceFingerprint.slice(0, 128) : "";
    const rawText = typeof record.rawText === "string" ? record.rawText.slice(0, 100_000) : "";
    const confirmedText = typeof record.confirmedText === "string" ? record.confirmedText.slice(0, 100_000) : "";
    return [{ pageNo: index + 1, fileName, sourceFingerprint, rawText, confirmedText }];
  });
}

async function requireSharedMode() {
  const mode = getMathTrainingPersistenceMode();
  return mode === "shared" ? null : NextResponse.json({
    error: "数学共享训练核尚未启用；本机 OCR 可以继续使用，但不能伪装成跨设备记录",
    mode,
  }, { status: 409 });
}

export async function GET(req: NextRequest) {
  const admin = await getAdminRequestContext(req);
  if (!admin.ok) return admin.response;
  const unavailable = await requireSharedMode();
  if (unavailable) return unavailable;
  const paperId = req.nextUrl.searchParams.get("paperId")?.trim() ?? "";
  if (!UUID_PATTERN.test(paperId)) return NextResponse.json({ error: "缺少有效的 paperId" }, { status: 400 });
  try {
    return NextResponse.json({
      mode: "shared",
      state: await getMathTrainingState(admin.context.supabase, paperId),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "数学训练状态读取失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminRequestContext(req);
    if (!admin.ok) return admin.response;
    const unavailable = await requireSharedMode();
    if (unavailable) return unavailable;
    const body = asRecord(await req.json().catch(() => ({})));
    const action = body.action;
    const paperId = typeof body.paperId === "string" ? body.paperId.trim() : "";
    const commandId = typeof body.commandId === "string" ? body.commandId.trim() : "";
    if (!UUID_PATTERN.test(paperId) || !UUID_PATTERN.test(commandId)) {
      return NextResponse.json({ error: "缺少有效的 paperId 或 commandId" }, { status: 400 });
    }

    let result: unknown;
    if (action === "start") {
      const round = Number(body.round);
      if (!Number.isInteger(round) || round < 1 || round > 3) {
        return NextResponse.json({ error: "轮次只能是 1、2 或 3" }, { status: 400 });
      }
      result = await startMathPaperAttempt(admin.context.supabase, {
        paperId,
        round: round as 1 | 2 | 3,
        commandId,
      });
    } else if (action === "confirm_ocr") {
      const attemptId = typeof body.attemptId === "string" ? body.attemptId.trim() : "";
      if (!UUID_PATTERN.test(attemptId)) {
        return NextResponse.json({ error: "缺少有效的 attemptId" }, { status: 400 });
      }
      const payload = buildMathOcrConfirmationPayload(normalizePages(body.pages));
      result = await recordMathOcrConfirmation(admin.context.supabase, {
        attemptId,
        commandId,
        rawPayload: payload.rawPayload,
        confirmedPayload: payload.confirmedPayload,
      });
    } else {
      return NextResponse.json({ error: "未知的数学训练动作" }, { status: 400 });
    }

    return NextResponse.json({
      mode: "shared",
      result,
      state: await getMathTrainingState(admin.context.supabase, paperId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "数学训练命令失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
