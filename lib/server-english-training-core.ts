import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import {
  mapEnglishTrainingCoreRows,
  type EnglishTrainingCommandAction,
  type EnglishTrainingPersistenceMode,
} from "./english-training-core";

const CORE_ATTEMPT_FIELDS = `
  id,
  english_passage_id,
  round,
  status,
  draft_payload,
  abandon_reason,
  started_at,
  submitted_at,
  sealed_at,
  abandoned_at,
  created_at,
  updated_at,
  attempt_revisions (
    id,
    revision_no,
    kind,
    response_payload,
    created_at,
    grades (
      id,
      origin,
      grade_seq,
      score,
      max_score,
      feedback,
      breakdown,
      created_at
    )
  )
`;

type RpcResult = PromiseLike<{ data: unknown; error: unknown }>;
type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => RpcResult;
};

export function getEnglishTrainingPersistenceMode(): EnglishTrainingPersistenceMode {
  const configured = process.env.ENGLISH_TRAINING_CORE_MODE?.trim().toLowerCase();
  if (!configured) return "legacy";
  if (configured === "legacy" || configured === "dual" || configured === "shared") return configured;
  throw new Error("ENGLISH_TRAINING_CORE_MODE 只能是 legacy、dual 或 shared");
}

export async function loadEnglishTrainingCoreLedgers(
  supabase: SupabaseClient<Database>,
  userId: string,
  passageId?: string,
) {
  let query = supabase
    .from("attempts")
    .select(CORE_ATTEMPT_FIELDS)
    .eq("user_id", userId)
    .eq("source_kind", "english_passage")
    .order("round", { ascending: true });
  if (passageId) query = query.eq("english_passage_id", passageId);

  const { data, error } = await query;
  if (error) throw error;
  return mapEnglishTrainingCoreRows(data);
}

export async function runEnglishTrainingCoreCommand(
  supabase: SupabaseClient<Database>,
  input: {
    passageId: string;
    round: 1 | 2 | 3;
    action: EnglishTrainingCommandAction;
    answers: Record<string, string>;
    commandId: string;
    writeLegacy: boolean;
  },
): Promise<unknown> {
  const { data, error } = await (supabase as unknown as RpcClient).rpc("record_english_training_command", {
    p_passage_id: input.passageId,
    p_round: input.round,
    p_action: input.action,
    p_answers: input.answers,
    p_command_id: input.commandId,
    p_write_legacy: input.writeLegacy,
  });
  if (error) throw error;
  return data;
}

export async function runEnglishManualScoreCommand(
  supabase: SupabaseClient<Database>,
  input: {
    passageId: string;
    round: 1 | 2 | 3;
    scores: Record<string, number>;
    commandId: string;
    writeLegacy: boolean;
  },
): Promise<unknown> {
  const { data, error } = await (supabase as unknown as RpcClient).rpc("record_english_manual_score", {
    p_passage_id: input.passageId,
    p_round: input.round,
    p_scores: input.scores,
    p_command_id: input.commandId,
    p_write_legacy: input.writeLegacy,
  });
  if (error) throw error;
  return data;
}

export async function runEnglishSubjectiveSubmission(
  supabase: SupabaseClient<Database>,
  input: {
    passageId: string;
    round: 1 | 2 | 3;
    answers: Record<string, string>;
    commandId: string;
    score: number;
    feedback: string;
    breakdown: Record<string, unknown>;
  },
): Promise<unknown> {
  const { data, error } = await (supabase as unknown as RpcClient).rpc("record_english_subjective_submission", {
    p_passage_id: input.passageId,
    p_round: input.round,
    p_answers: input.answers,
    p_command_id: input.commandId,
    p_suggested_score: input.score,
    p_feedback: input.feedback,
    p_breakdown: input.breakdown,
  });
  if (error) throw error;
  return data;
}

export async function confirmEnglishSubjectiveGrade(
  supabase: SupabaseClient<Database>,
  input: {
    revisionId: string;
    commandId: string;
    score: number;
    feedback: string;
    breakdown: Record<string, unknown>;
    writeLegacy: boolean;
  },
): Promise<unknown> {
  const { data, error } = await (supabase as unknown as RpcClient).rpc("confirm_english_subjective_grade", {
    p_revision_id: input.revisionId,
    p_command_id: input.commandId,
    p_score: input.score,
    p_feedback: input.feedback,
    p_breakdown: input.breakdown,
    p_write_legacy: input.writeLegacy,
  });
  if (error) throw error;
  return data;
}
