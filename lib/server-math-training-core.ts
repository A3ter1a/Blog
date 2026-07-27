import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  normalizeMathPaperSummaries,
  type MathGradeStep,
  type MathPaperSummary,
  type MathTrainingPersistenceMode,
} from "@/lib/math-training-core";

type RpcResult = PromiseLike<{ data: unknown; error: unknown }>;
type RpcClient = {
  rpc: (name: string, args?: Record<string, unknown>) => RpcResult;
};

function rpcClient(supabase: SupabaseClient<Database>): RpcClient {
  return supabase as unknown as RpcClient;
}

async function runRpc(
  supabase: SupabaseClient<Database>,
  name: string,
  args?: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await rpcClient(supabase).rpc(name, args);
  if (error) throw error;
  return data;
}

export function getMathTrainingPersistenceMode(): MathTrainingPersistenceMode {
  const configured = process.env.MATH_TRAINING_CORE_MODE?.trim().toLowerCase();
  if (!configured) return "local";
  if (configured === "local" || configured === "shared") return configured;
  throw new Error("MATH_TRAINING_CORE_MODE 只能是 local 或 shared");
}

export async function listMathPapers(
  supabase: SupabaseClient<Database>,
): Promise<MathPaperSummary[]> {
  return normalizeMathPaperSummaries(await runRpc(supabase, "list_math_papers"));
}

export async function getMathTrainingState(
  supabase: SupabaseClient<Database>,
  paperId: string,
): Promise<unknown> {
  return runRpc(supabase, "get_math_training_state", { p_math_paper_id: paperId });
}

export async function getMathGradeSource(
  supabase: SupabaseClient<Database>,
  confirmationId: string,
): Promise<unknown> {
  return runRpc(supabase, "get_math_grade_source", { p_confirmation_id: confirmationId });
}

export async function startMathPaperAttempt(
  supabase: SupabaseClient<Database>,
  input: { paperId: string; round: 1 | 2 | 3; commandId: string },
): Promise<unknown> {
  return runRpc(supabase, "start_math_paper_attempt", {
    p_math_paper_id: input.paperId,
    p_round: input.round,
    p_command_id: input.commandId,
  });
}

export async function recordMathOcrConfirmation(
  supabase: SupabaseClient<Database>,
  input: {
    attemptId: string;
    commandId: string;
    rawPayload: Record<string, unknown>;
    confirmedPayload: Record<string, unknown>;
  },
): Promise<unknown> {
  return runRpc(supabase, "record_math_ocr_confirmation", {
    p_attempt_id: input.attemptId,
    p_command_id: input.commandId,
    p_raw_payload: input.rawPayload,
    p_confirmed_payload: input.confirmedPayload,
  });
}

export async function recordMathAiGrade(
  supabase: SupabaseClient<Database>,
  input: {
    confirmationId: string;
    commandId: string;
    score: number;
    maxScore: number;
    feedback: string;
    breakdown: Record<string, unknown>;
    steps: MathGradeStep[];
  },
): Promise<unknown> {
  return runRpc(supabase, "record_math_ai_grade", {
    p_confirmation_id: input.confirmationId,
    p_command_id: input.commandId,
    p_score: input.score,
    p_max_score: input.maxScore,
    p_feedback: input.feedback,
    p_breakdown: input.breakdown,
    p_steps: input.steps,
  });
}

export async function confirmMathGrade(
  supabase: SupabaseClient<Database>,
  input: {
    suggestionGradeId: string;
    commandId: string;
    score: number;
    feedback: string;
    breakdown: Record<string, unknown>;
    steps: MathGradeStep[];
  },
): Promise<unknown> {
  return runRpc(supabase, "confirm_math_grade", {
    p_suggestion_grade_id: input.suggestionGradeId,
    p_command_id: input.commandId,
    p_score: input.score,
    p_feedback: input.feedback,
    p_breakdown: input.breakdown,
    p_steps: input.steps,
  });
}

export async function createPrivateBooklet(
  supabase: SupabaseClient<Database>,
  input: {
    commandId: string;
    title: string;
    content: string;
    sourceRefs: Array<Record<string, unknown>>;
    ruleVersion: string;
    snapshotChecksum: string;
    methodSummaryConfirmed: boolean;
  },
): Promise<unknown> {
  return runRpc(supabase, "create_private_booklet", {
    p_command_id: input.commandId,
    p_title: input.title,
    p_content: input.content,
    p_source_refs: input.sourceRefs,
    p_rule_version: input.ruleVersion,
    p_snapshot_checksum: input.snapshotChecksum,
    p_method_summary_confirmed: input.methodSummaryConfirmed,
  });
}
