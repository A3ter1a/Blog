import { NextRequest, NextResponse } from "next/server";
import type { MathGradeStep } from "@/lib/math-training-core";
import { getAdminRequestContext } from "@/lib/server-admin-auth";
import {
  confirmMathGrade,
  getMathTrainingPersistenceMode,
  getMathTrainingState,
  recordMathAiGrade,
} from "@/lib/server-math-training-core";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeSteps(value: unknown): MathGradeStep[] {
  if (!Array.isArray(value) || value.length > 400) return [];
  return value.flatMap((item): MathGradeStep[] => {
    const record = asRecord(item);
    const problemId = typeof record.problemId === "string" ? record.problemId.trim() : "";
    const criterion = typeof record.criterion === "string" ? record.criterion.trim().slice(0, 500) : "";
    const earnedScore = Number(record.earnedScore);
    const maxScore = Number(record.maxScore);
    if (!UUID_PATTERN.test(problemId) || !criterion || !Number.isFinite(earnedScore) || !Number.isFinite(maxScore)) return [];
    return [{
      problemId,
      criterion,
      earnedScore,
      maxScore,
      deductionReason: typeof record.deductionReason === "string" ? record.deductionReason.trim().slice(0, 1000) || null : null,
    }];
  });
}

export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminRequestContext(req);
    if (!admin.ok) return admin.response;
    if (getMathTrainingPersistenceMode() !== "shared") {
      return NextResponse.json({ error: "数学共享训练核尚未启用" }, { status: 409 });
    }
    const body = asRecord(await req.json().catch(() => ({})));
    const paperId = typeof body.paperId === "string" ? body.paperId.trim() : "";
    const commandId = typeof body.commandId === "string" ? body.commandId.trim() : "";
    if (!UUID_PATTERN.test(paperId) || !UUID_PATTERN.test(commandId)) {
      return NextResponse.json({ error: "缺少有效的 paperId 或 commandId" }, { status: 400 });
    }
    const action = body.action;
    const feedback = typeof body.feedback === "string" ? body.feedback.trim().slice(0, 5000) : "";
    const steps = normalizeSteps(body.steps);
    const breakdown = asRecord(body.breakdown);
    let result: unknown;
    if (action === "record_suggestion") {
      const confirmationId = typeof body.confirmationId === "string" ? body.confirmationId.trim() : "";
      if (!UUID_PATTERN.test(confirmationId)) return NextResponse.json({ error: "缺少有效的 confirmationId" }, { status: 400 });
      result = await recordMathAiGrade(admin.context.supabase, {
        confirmationId,
        commandId,
        score: Number(body.score),
        maxScore: Number(body.maxScore),
        feedback,
        breakdown,
        steps,
      });
    } else if (action === "confirm_final") {
      const suggestionGradeId = typeof body.suggestionGradeId === "string" ? body.suggestionGradeId.trim() : "";
      if (!UUID_PATTERN.test(suggestionGradeId)) return NextResponse.json({ error: "缺少有效的 suggestionGradeId" }, { status: 400 });
      result = await confirmMathGrade(admin.context.supabase, {
        suggestionGradeId,
        commandId,
        score: Number(body.score),
        feedback,
        breakdown,
        steps,
      });
    } else {
      return NextResponse.json({ error: "未知的数学评分动作" }, { status: 400 });
    }
    return NextResponse.json({
      result,
      state: await getMathTrainingState(admin.context.supabase, paperId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "数学评分保存失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
