import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreEnglishObjectiveAnswers } from "@/lib/english-scoring";
import type { EnglishSection } from "@/lib/english-training";
import type { EnglishTrainingCommandAction } from "@/lib/english-training-core";
import {
  getEnglishTrainingPersistenceMode,
  loadEnglishTrainingCoreLedgers,
  runEnglishTrainingCoreCommand,
} from "@/lib/server-english-training-core";
import { createAuthenticatedServerClient, getBearerToken, requireAdminRequest } from "@/lib/server-admin-auth";
import type { Database } from "@/lib/database.types";
import type { EnglishAttemptAnswerRow, EnglishAttemptRow, EnglishPassageRow, EnglishQuestionRow } from "@/lib/supabase-schema";

const PASSAGE_FIELDS = "id,section";
const QUESTION_FIELDS = "id,passage_id,standard_answer,score,sort_order";
const ATTEMPT_FIELDS = "id,user_id,passage_id,status,score,max_score,started_at,submitted_at,created_at,updated_at";
const ANSWER_FIELDS = "id,attempt_id,question_id,answer,is_correct,score,created_at,updated_at";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeAnswers(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key, answer]) => key.length <= 80 && typeof answer === "string")
    .map(([key, answer]) => [key, (answer as string).slice(0, 20_000)]));
}

function readAction(record: Record<string, unknown>): EnglishTrainingCommandAction {
  if (record.action === "save_draft" || record.action === "submit" || record.action === "start_next") {
    return record.action;
  }
  return record.submitted === true ? "submit" : "save_draft";
}

async function loadLegacyProjection(
  supabase: SupabaseClient<Database>,
  userId: string,
  passageId: string,
) {
  const { data: attemptData, error: attemptError } = await supabase
    .from("english_attempts")
    .select(ATTEMPT_FIELDS)
    .eq("user_id", userId)
    .eq("passage_id", passageId)
    .maybeSingle();
  if (attemptError) throw attemptError;
  const attempt = attemptData as EnglishAttemptRow | null;
  if (!attempt?.id) return { attempt: null, answers: [] as EnglishAttemptAnswerRow[] };

  const { data: answerData, error: answerError } = await supabase
    .from("english_attempt_answers")
    .select(ANSWER_FIELDS)
    .eq("attempt_id", attempt.id);
  if (answerError) throw answerError;
  return { attempt, answers: (answerData ?? []) as EnglishAttemptAnswerRow[] };
}

async function saveLegacyAttempt(
  supabase: SupabaseClient<Database>,
  userId: string,
  passageId: string,
  answers: Record<string, string>,
  submitted: boolean,
) {
  const { data: passageData, error: passageError } = await supabase
    .from("english_passages")
    .select(PASSAGE_FIELDS)
    .eq("id", passageId)
    .single();
  if (passageError) throw passageError;
  const passage = passageData as EnglishPassageRow;
  const section = (passage.section ?? "reading") as EnglishSection;
  if (submitted && !["reading", "cloze", "new_type"].includes(section)) {
    throw new Error("主观题必须经过 AI 建议与用户终分确认，不能系统自动判分");
  }

  const { data: questionData, error: questionError } = await supabase
    .from("english_questions")
    .select(QUESTION_FIELDS)
    .eq("passage_id", passageId)
    .order("sort_order", { ascending: true });
  if (questionError) throw questionError;
  const questionRows = (questionData ?? []) as EnglishQuestionRow[];
  const questions = questionRows.flatMap((question) => question.id ? [{
    id: question.id,
    standardAnswer: question.standard_answer ?? "",
    score: question.score ?? 0,
  }] : []);

  const existingProjection = await loadLegacyProjection(supabase, userId, passageId);
  const existing = existingProjection.attempt;
  const existingAnswers = new Map(existingProjection.answers.map((answer) => [answer.question_id ?? "", answer]));
  const now = new Date().toISOString();
  const scored = submitted ? scoreEnglishObjectiveAnswers(section, questions, answers) : null;
  const keepSubmitted = existing?.status === "submitted" && !submitted;
  const maxScore = questions.reduce((sum, question) => sum + question.score, 0);
  const { data: savedAttemptData, error: attemptError } = await supabase
    .from("english_attempts")
    .upsert({
      user_id: userId,
      passage_id: passageId,
      status: submitted || keepSubmitted ? "submitted" : "in_progress",
      score: submitted ? scored?.score ?? 0 : existing?.score ?? 0,
      max_score: maxScore,
      started_at: existing?.started_at ?? now,
      submitted_at: submitted ? now : existing?.submitted_at,
      created_at: existing ? undefined : now,
      updated_at: now,
    }, { onConflict: "user_id,passage_id" })
    .select(ATTEMPT_FIELDS)
    .single();
  if (attemptError) throw attemptError;
  const savedAttempt = savedAttemptData as EnglishAttemptRow;
  if (!savedAttempt.id) throw new Error("旧训练路径未返回 attempt id");
  const savedAttemptId = savedAttempt.id;

  const gradeByQuestionId = new Map(scored?.grades.map((grade) => [grade.questionId, grade]));
  const answerPayloads = questions.map((question) => {
    const previous = existingAnswers.get(question.id);
    const grade = gradeByQuestionId.get(question.id);
    return {
      attempt_id: savedAttemptId,
      question_id: question.id,
      answer: answers[question.id] ?? "",
      is_correct: keepSubmitted ? previous?.is_correct : grade?.isCorrect,
      score: keepSubmitted ? previous?.score ?? 0 : grade?.score ?? 0,
      created_at: previous ? undefined : now,
      updated_at: now,
    };
  });

  const { data: savedAnswerData, error: answerError } = answerPayloads.length > 0
    ? await supabase.from("english_attempt_answers")
      .upsert(answerPayloads, { onConflict: "attempt_id,question_id" })
      .select(ANSWER_FIELDS)
    : { data: [], error: null };
  if (answerError) throw answerError;
  return { attempt: savedAttempt, answers: (savedAnswerData ?? []) as EnglishAttemptAnswerRow[] };
}

async function authenticate(req: NextRequest) {
  const adminError = await requireAdminRequest(req);
  if (adminError) return { error: adminError } as const;

  const token = getBearerToken(req);
  const supabase = createAuthenticatedServerClient(req);
  const { data: userData, error: userError } = await supabase.auth.getUser(token ?? undefined);
  if (userError || !userData.user) {
    return { error: NextResponse.json({ error: "登录会话无效" }, { status: 401 }) } as const;
  }
  return { supabase, userId: userData.user.id } as const;
}

export async function GET(req: NextRequest) {
  try {
    const authenticated = await authenticate(req);
    if ("error" in authenticated) return authenticated.error;

    const mode = getEnglishTrainingPersistenceMode();
    if (mode === "legacy") return NextResponse.json({ mode, ledgers: [] });

    const passageId = req.nextUrl.searchParams.get("passageId")?.trim() || undefined;
    if (passageId && !UUID_PATTERN.test(passageId)) {
      return NextResponse.json({ error: "passageId 格式无效" }, { status: 400 });
    }
    const ledgers = await loadEnglishTrainingCoreLedgers(authenticated.supabase, authenticated.userId, passageId);
    return NextResponse.json({ mode, ledgers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "英语训练历史加载失败";
    console.error("[EnglishAttempt:GET] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authenticated = await authenticate(req);
    if ("error" in authenticated) return authenticated.error;

    const body: unknown = await req.json().catch(() => ({}));
    const record = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
    const passageId = typeof record.passageId === "string" ? record.passageId.trim() : "";
    const action = readAction(record);
    const round = Number(record.round ?? 1);
    const answers = normalizeAnswers(record.answers);
    const commandId = typeof record.commandId === "string" ? record.commandId.trim() : "";
    if (!passageId || !UUID_PATTERN.test(passageId)) {
      return NextResponse.json({ error: "缺少有效的 passageId" }, { status: 400 });
    }
    if (!Number.isInteger(round) || round < 1 || round > 3) {
      return NextResponse.json({ error: "轮次只能是 1、2 或 3" }, { status: 400 });
    }

    const mode = getEnglishTrainingPersistenceMode();
    if (mode === "legacy") {
      if (action === "start_next") return NextResponse.json({ mode, ledgers: [] });
      const projection = await saveLegacyAttempt(
        authenticated.supabase,
        authenticated.userId,
        passageId,
        answers,
        action === "submit",
      );
      return NextResponse.json({
        ...projection,
        mode,
        ledgers: [],
        scoringOrigin: action === "submit" ? "system_scored" : null,
      });
    }

    if (!UUID_PATTERN.test(commandId)) {
      return NextResponse.json({ error: "共享训练命令缺少有效的 commandId" }, { status: 400 });
    }
    await runEnglishTrainingCoreCommand(authenticated.supabase, {
      passageId,
      round: round as 1 | 2 | 3,
      action,
      answers,
      commandId,
      writeLegacy: mode === "dual",
    });
    const ledgers = await loadEnglishTrainingCoreLedgers(authenticated.supabase, authenticated.userId, passageId);
    const projection = mode === "dual"
      ? await loadLegacyProjection(authenticated.supabase, authenticated.userId, passageId)
      : { attempt: null, answers: [] as EnglishAttemptAnswerRow[] };
    return NextResponse.json({
      ...projection,
      mode,
      ledgers,
      scoringOrigin: action === "submit" ? "system_scored" : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "英语训练保存失败";
    console.error("[EnglishAttempt:POST] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
