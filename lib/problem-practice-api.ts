import {
  assertAdminWrite,
  getSupabase,
  type ProblemPracticeStatusInsert,
  type ProblemPracticeStatusRow,
} from "./supabase";
import type { PracticeResult, ProblemPracticeStatus } from "./types";

const PRACTICE_STATUS_BASE_FIELDS = "id,user_id,note_id,problem_id,round,attempts,correct_count,wrong_count,last_result,is_mastered,last_practiced_at,created_at,updated_at";
const PRACTICE_STATUS_FIELDS = `${PRACTICE_STATUS_BASE_FIELDS},is_marked`;
const MARKED_COLUMN_MIGRATION_HINT = "请先在 Supabase SQL Editor 执行 supabase/migrations/0003_problem_practice_marked.sql";

let canReadMarkedColumn: boolean | null = null;

function isMissingMarkedColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { message, details, hint } = error as { message?: string; details?: string; hint?: string };
  return [message, details, hint].some((value) => typeof value === "string" && value.includes("is_marked"));
}

function hasPracticeProgress(status: ProblemPracticeStatus): boolean {
  return status.round > 0
    || status.attempts > 0
    || status.correctCount > 0
    || status.wrongCount > 0
    || Boolean(status.lastResult)
    || status.isMastered
    || Boolean(status.lastPracticedAt);
}

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
    isMarked: row.is_marked ?? false,
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
    const fields = canReadMarkedColumn === false ? PRACTICE_STATUS_BASE_FIELDS : PRACTICE_STATUS_FIELDS;
    const queryStatuses = (selectFields: string) =>
      supabase
        .from("problem_practice_statuses")
        .select(selectFields)
        .eq("user_id", userId)
        .in("note_id", uniqueNoteIds);

    let { data, error } = await queryStatuses(fields);

    if (error && canReadMarkedColumn !== false && isMissingMarkedColumn(error)) {
      canReadMarkedColumn = false;
      const fallback = await queryStatuses(PRACTICE_STATUS_BASE_FIELDS);
      data = fallback.data;
      error = fallback.error;
    } else if (!error) {
      canReadMarkedColumn = true;
    }

    if (error) throw error;
    return ((data || []) as ProblemPracticeStatusRow[]).map(mapPracticeStatusSnakeToCamel);
  },

  async getMarkedByNoteIds(noteIds: string[]): Promise<ProblemPracticeStatus[]> {
    const uniqueNoteIds = [...new Set(noteIds.filter(Boolean))];
    if (uniqueNoteIds.length === 0) return [];

    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await getSupabase()
      .from("problem_practice_statuses")
      .select(PRACTICE_STATUS_FIELDS)
      .eq("user_id", userId)
      .eq("is_marked", true)
      .in("note_id", uniqueNoteIds)
      .order("updated_at", { ascending: false });

    if (error) {
      if (isMissingMarkedColumn(error)) throw new Error(MARKED_COLUMN_MIGRATION_HINT);
      throw error;
    }

    canReadMarkedColumn = true;
    return ((data || []) as ProblemPracticeStatusRow[]).map(mapPracticeStatusSnakeToCamel);
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
      .select(current?.isMarked || canReadMarkedColumn === true ? PRACTICE_STATUS_FIELDS : PRACTICE_STATUS_BASE_FIELDS)
      .single();

    if (error) throw error;
    return mapPracticeStatusSnakeToCamel(data as ProblemPracticeStatusRow);
  },

  async setMarked(
    noteId: string,
    problemId: string,
    marked: boolean,
    current?: ProblemPracticeStatus,
  ): Promise<ProblemPracticeStatus | null> {
    const userId = await assertAdminWrite();
    const supabase = getSupabase();

    if (!marked && !current) return null;

    if (!marked && current && !hasPracticeProgress(current)) {
      const { error } = await supabase
        .from("problem_practice_statuses")
        .delete()
        .eq("user_id", userId)
        .eq("note_id", noteId)
        .eq("problem_id", problemId);

      if (error) throw error;
      return null;
    }

    const now = new Date().toISOString();
    if (current) {
      const { data, error } = await supabase
        .from("problem_practice_statuses")
        .update({
          is_marked: marked,
          updated_at: now,
        })
        .eq("user_id", userId)
        .eq("note_id", noteId)
        .eq("problem_id", problemId)
        .select(PRACTICE_STATUS_FIELDS)
        .single();

      if (error) {
        if (isMissingMarkedColumn(error)) throw new Error(MARKED_COLUMN_MIGRATION_HINT);
        throw error;
      }

      canReadMarkedColumn = true;
      return mapPracticeStatusSnakeToCamel(data as ProblemPracticeStatusRow);
    }

    const payload: ProblemPracticeStatusInsert = {
      user_id: userId,
      note_id: noteId,
      problem_id: problemId,
      round: 0,
      attempts: 0,
      correct_count: 0,
      wrong_count: 0,
      is_mastered: false,
      is_marked: marked,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await supabase
      .from("problem_practice_statuses")
      .upsert(payload, { onConflict: "user_id,note_id,problem_id" })
      .select(PRACTICE_STATUS_FIELDS)
      .single();

    if (error) {
      if (isMissingMarkedColumn(error)) throw new Error(MARKED_COLUMN_MIGRATION_HINT);
      throw error;
    }

    canReadMarkedColumn = true;
    return mapPracticeStatusSnakeToCamel(data as ProblemPracticeStatusRow);
  },

  async reset(
    noteId: string,
    problemId: string,
    current?: ProblemPracticeStatus,
  ): Promise<ProblemPracticeStatus | null> {
    const userId = await assertAdminWrite();
    const supabase = getSupabase();

    if (current?.isMarked) {
      const { data, error } = await supabase
        .from("problem_practice_statuses")
        .update({
          round: 0,
          attempts: 0,
          correct_count: 0,
          wrong_count: 0,
          last_result: null,
          is_mastered: false,
          is_marked: true,
          last_practiced_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("note_id", noteId)
        .eq("problem_id", problemId)
        .select(PRACTICE_STATUS_FIELDS)
        .single();

      if (error) throw error;
      return mapPracticeStatusSnakeToCamel(data as ProblemPracticeStatusRow);
    }

    const { error } = await supabase
      .from("problem_practice_statuses")
      .delete()
      .eq("user_id", userId)
      .eq("note_id", noteId)
      .eq("problem_id", problemId);

    if (error) throw error;
    return null;
  },
};
