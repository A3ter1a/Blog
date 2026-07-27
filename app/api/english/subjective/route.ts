import { NextRequest, NextResponse } from "next/server";
import {
  confirmEnglishSubjectiveGrade,
  getEnglishTrainingPersistenceMode,
  loadEnglishTrainingCoreLedgers,
  runEnglishSubjectiveSubmission,
} from "@/lib/server-english-training-core";
import { getAdminRequestContext } from "@/lib/server-admin-auth";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeAnswers(value: unknown): Record<string, string> {
  const record = asRecord(value);
  return Object.fromEntries(Object.entries(record).flatMap(([key, answer]) => (
    key.length <= 80 && typeof answer === "string" ? [[key, answer.slice(0, 20_000)]] : []
  )));
}

export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminRequestContext(req);
    if (!admin.ok) return admin.response;
    const mode = getEnglishTrainingPersistenceMode();
    if (mode === "legacy") {
      return NextResponse.json({ error: "主观题确认流需先完成共享训练核迁移" }, { status: 409 });
    }

    const body = asRecord(await req.json().catch(() => ({})));
    const action = body.action;
    const passageId = typeof body.passageId === "string" ? body.passageId.trim() : "";
    const commandId = typeof body.commandId === "string" ? body.commandId.trim() : "";
    if (!UUID_PATTERN.test(passageId) || !UUID_PATTERN.test(commandId)) {
      return NextResponse.json({ error: "缺少有效的 passageId 或 commandId" }, { status: 400 });
    }

    if (action === "record_suggestion") {
      const round = Number(body.round);
      const suggestion = asRecord(body.suggestion);
      if (!Number.isInteger(round) || round < 1 || round > 3) {
        return NextResponse.json({ error: "轮次只能是 1、2 或 3" }, { status: 400 });
      }
      await runEnglishSubjectiveSubmission(admin.context.supabase, {
        passageId,
        round: round as 1 | 2 | 3,
        answers: normalizeAnswers(body.answers),
        commandId,
        score: Number(suggestion.score),
        feedback: typeof suggestion.feedback === "string" ? suggestion.feedback : "",
        breakdown: asRecord(suggestion.breakdown),
      });
    } else if (action === "confirm_final") {
      const revisionId = typeof body.revisionId === "string" ? body.revisionId.trim() : "";
      if (!UUID_PATTERN.test(revisionId)) {
        return NextResponse.json({ error: "缺少有效的 revisionId" }, { status: 400 });
      }
      await confirmEnglishSubjectiveGrade(admin.context.supabase, {
        revisionId,
        commandId,
        score: Number(body.score),
        feedback: typeof body.feedback === "string" ? body.feedback : "",
        breakdown: asRecord(body.breakdown),
        writeLegacy: mode === "dual",
      });
    } else {
      return NextResponse.json({ error: "未知的主观题确认动作" }, { status: 400 });
    }

    const ledgers = await loadEnglishTrainingCoreLedgers(admin.context.supabase, admin.context.user.id, passageId);
    return NextResponse.json({ mode, ledgers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "英语主观题确认失败";
    console.error("[EnglishSubjective] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
