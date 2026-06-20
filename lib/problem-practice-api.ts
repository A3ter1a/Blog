import {
  assertAdminWrite,
  getSupabase,
  type ProblemPracticeStatusInsert,
  type ProblemPracticeStatusRow,
} from "./supabase";
import type { PracticeResult, ProblemPracticeStatus } from "./types";

const PRACTICE_STATUS_FIELDS = "id,user_id,note_id,problem_id,round,attempts,correct_count,wrong_count,last_result,is_mastered,last_practiced_at,created_at,updated_at";

async function getCurrentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.user.id ?? null;
}

function mapPracticeStatusSnakeToCamel(row: ProblemPracticeStatusRow): ProblemPracticeStatus {
  const createdAt = row.created_at ? new Date(row.created_at) : new Date();
  const updatedAt = row.updated_at ? new Date(row.updated_at) : createdAt;

  return {
    id: row.id ?? "",
    noteId: row.note_id ?? "",
    problemId: row.problem_id ?? "",
    round: row.round ?? 0,
    attempts: row.attempts ?? 0,
    correctCount: row.correct_count ?? 0,
    wrongCount: row.wrong_count ?? 0,
    lastResult: row.last_result || undefined,
    isMastered: row.is_mastered ?? false,
    lastPracticedAt: row.last_practiced_at ? new Date(row.last_practiced_at) : undefined,
    createdAt,
    updatedAt,
  };
}

export const problemPracticeApi = {
  async getByNoteId(noteId: string): Promise<ProblemPracticeStatus[]> {
    return problemPracticeApi.getByNoteIds([noteId]);
  },

  async getByNoteIds(noteIds: string[]): Promise<ProblemPracticeStatus[]> {
    const uniqueNoteIds = [...new Set(noteIds.filter(Boolean))];
    if (uniqueNoteIds.length === 0) return [];

    const userId = await getCurrentUserId();
    if (!userId) return [];

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("problem_practice_statuses")
      .select(PRACTICE_STATUS_FIELDS)
      .eq("user_id", userId)
      .in("note_id", uniqueNoteIds);

    if (error) throw error;
    return (data || []).map(mapPracticeStatusSnakeToCamel);
  },

  async recordResult(
    noteId: string,
    problemId: string,
    result: PracticeResult,
    current?: ProblemPracticeStatus,
  ): Promise<ProblemPracticeStatus> {
    const userId = await assertAdminWrite();
    const supabase = getSupabase();
    const now = new Date().toISOString();
    const nextRound = (current?.round ?? 0) + 1;
    const nextAttempts = (current?.attempts ?? 0) + 1;

    const payload: ProblemPracticeStatusInsert = {
      user_id: userId,
      note_id: noteId,
      problem_id: problemId,
      round: nextRound,
      attempts: nextAttempts,
      correct_count: (current?.correctCount ?? 0) + (result === "correct" ? 1 : 0),
      wrong_count: (current?.wrongCount ?? 0) + (result === "wrong" ? 1 : 0),
      last_result: result,
      is_mastered: result === "correct" && nextRound >= 2,
      last_practiced_at: now,
      updated_at: now,
      created_at: current ? undefined : now,
    };

    const { data, error } = await supabase
      .from("problem_practice_statuses")
      .upsert(payload, { onConflict: "user_id,note_id,problem_id" })
      .select(PRACTICE_STATUS_FIELDS)
      .single();

    if (error) throw error;
    return mapPracticeStatusSnakeToCamel(data);
  },

  async reset(noteId: string, problemId: string): Promise<void> {
    const userId = await assertAdminWrite();
    const supabase = getSupabase();
    const { error } = await supabase
      .from("problem_practice_statuses")
      .delete()
      .eq("user_id", userId)
      .eq("note_id", noteId)
      .eq("problem_id", problemId);

    if (error) throw error;
  },
};
