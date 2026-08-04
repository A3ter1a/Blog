import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminRequestContext } from "@/lib/server-admin-auth";
import { ENGLISH_MANUAL_SCORE_PREFIX } from "@/lib/english-scoring";
import {
  getEnglishTrainingPersistenceMode,
  loadEnglishTrainingCoreLedgers,
  runEnglishManualScoreCommand,
} from "@/lib/server-english-training-core";
import type { Database } from "@/lib/database.types";
import type { EnglishAttemptAnswerRow, EnglishAttemptRow, EnglishPassageRow, EnglishQuestionRow } from "@/lib/supabase-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PASSAGE_FIELDS = "id,section";
const QUESTION_FIELDS = "id,passage_id,score,sort_order";
const ATTEMPT_FIELDS = "id,user_id,passage_id,status,score,max_score,started_at,submitted_at,created_at,updated_at";
const ANSWER_FIELDS = "id,attempt_id,question_id,answer,is_correct,score,created_at,updated_at";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeScores(value: unknown): Record<string, number> {
  return Object.fromEntries(Object.entries(asRecord(value)).flatMap(([key, rawScore]) => {
    const score = typeof rawScore === "number" ? rawScore : Number(rawScore);
    return key.length <= 80 && Number.isFinite(score) && score >= 0
      ? [[key, Math.round(score * 100) / 100]]
      : [];
  }));
}

async function saveLegacyManualScore(
  supabase: SupabaseClient<Database>,
  userId: string,
  passageId: string,
  scores: Record<string, number>,
) {
  const { data: passageData, error: passageError } = await supabase
    .from("english_passages")
    .select(PASSAGE_FIELDS)
    .eq("id", passageId)
    .single();
  if (passageError) throw passageError;

  const { data: questionData, error: questionError } = await supabase
    .from("english_questions")
    .select(QUESTION_FIELDS)
    .eq("passage_id", passageId)
    .order("sort_order", { ascending: true });
  if (questionError) throw questionError;

  const questions = (questionData ?? []) as unknown as EnglishQuestionRow[];
  if (questions.length === 0) throw new Error("当前题组没有可记录的题目");
  const questionIds = new Set(questions.flatMap((question) => question.id ? [question.id] : []));
  if (Object.keys(scores).some((questionId) => !questionIds.has(questionId))) {
    throw new Error("得分记录包含不属于当前题组的题目");
  }
  for (const question of questions) {
    const score = scores[question.id ?? ""] ?? 0;
    if (score > (question.score ?? 0)) throw new Error(`第 ${question.sort_order ?? ""} 题得分超过题目满分`);
  }

  const { data: existingData, error: existingError } = await supabase
    .from("english_attempts")
    .select(ATTEMPT_FIELDS)
    .eq("user_id", userId)
    .eq("passage_id", passageId)
    .maybeSingle();
  if (existingError) throw existingError;

  const existing = existingData as unknown as EnglishAttemptRow | null;
  const now = new Date().toISOString();
  const maxScore = questions.reduce((sum, question) => sum + (question.score ?? 0), 0);
  const score = questions.reduce((sum, question) => sum + (scores[question.id ?? ""] ?? 0), 0);
  const { data: savedAttemptData, error: attemptError } = await supabase
    .from("english_attempts")
    .upsert({
      user_id: userId,
      passage_id: passageId,
      status: "submitted",
      score,
      max_score: maxScore,
      started_at: existing?.started_at ?? now,
      submitted_at: now,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    }, { onConflict: "user_id,passage_id" })
    .select(ATTEMPT_FIELDS)
    .single();
  if (attemptError) throw attemptError;
  const savedAttempt = savedAttemptData as unknown as EnglishAttemptRow;
  if (!savedAttempt.id) throw new Error("直接记分没有返回 attempt id");

  const answerPayloads = questions.flatMap((question) => question.id ? [{
    attempt_id: savedAttempt.id as string,
    question_id: question.id,
    answer: `${ENGLISH_MANUAL_SCORE_PREFIX}${scores[question.id] ?? 0}`,
    is_correct: null,
    score: scores[question.id] ?? 0,
    created_at: now,
    updated_at: now,
  }] : []);
  const { data: savedAnswerData, error: answerError } = await supabase
    .from("english_attempt_answers")
    .upsert(answerPayloads, { onConflict: "attempt_id,question_id" })
    .select(ANSWER_FIELDS);
  if (answerError) throw answerError;

  return {
    passage: passageData as unknown as EnglishPassageRow,
    attempt: savedAttempt,
    answers: (savedAnswerData ?? []) as unknown as EnglishAttemptAnswerRow[],
  };
}

export async function POST(req: NextRequest) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;

  try {
    const body = asRecord(await req.json().catch(() => ({})));
    const passageId = typeof body.passageId === "string" ? body.passageId.trim() : "";
    const commandId = typeof body.commandId === "string" ? body.commandId.trim() : "";
    const round = Number(body.round ?? 1);
    const scores = normalizeScores(body.scores);
    if (!UUID_PATTERN.test(passageId) || !UUID_PATTERN.test(commandId)) {
      return NextResponse.json({ error: "缺少有效的 passageId 或 commandId" }, { status: 400 });
    }
    if (!Number.isInteger(round) || round < 1 || round > 3) {
      return NextResponse.json({ error: "轮次只能是 1、2 或 3" }, { status: 400 });
    }

    const mode = getEnglishTrainingPersistenceMode();
    if (mode === "legacy") {
      const projection = await saveLegacyManualScore(auth.context.supabase, auth.context.user.id, passageId, scores);
      return NextResponse.json({ mode, ...projection, ledgers: [] });
    }

    await runEnglishManualScoreCommand(auth.context.supabase, {
      passageId,
      round: round as 1 | 2 | 3,
      scores,
      commandId,
      writeLegacy: mode === "dual",
    });
    const ledgers = await loadEnglishTrainingCoreLedgers(auth.context.supabase, auth.context.user.id, passageId);
    return NextResponse.json({ mode, ledgers });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "英语直接记分失败";
    console.error("[EnglishManualScore] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
