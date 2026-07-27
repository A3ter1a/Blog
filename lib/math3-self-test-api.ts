import { assertAdminWrite, getSupabase, type Math3SelfTestInsert, type Math3SelfTestRow, type Math3SelfTestUpdate } from "./supabase";
import type { Json } from "./supabase-schema";
import {
  normalizeMath3SelfTestAttempt,
  normalizeMath3SelfTestPaper,
  type Math3SelfTestCreateInput,
  type Math3SelfTestDifficulty,
  type Math3SelfTestMode,
  type Math3SelfTestRecord,
  type Math3SelfTestStatus,
} from "./math3-self-test";

const MATH3_SELF_TEST_FIELDS = "id,user_id,title,mode,difficulty,status,paper,attempt,score,max_score,started_at,submitted_at,created_at,updated_at";

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function mapMath3SelfTestSnakeToCamel(row: Math3SelfTestRow): Math3SelfTestRecord {
  const createdAt = row.created_at ? new Date(row.created_at) : new Date();
  const updatedAt = row.updated_at ? new Date(row.updated_at) : createdAt;
  const mode: Math3SelfTestMode = row.mode === "full" ? "full" : "quick";
  const difficulty: Math3SelfTestDifficulty = row.difficulty === "comfort" || row.difficulty === "challenge"
    ? row.difficulty
    : "simulation";
  const status: Math3SelfTestStatus = row.status === "in_progress" || row.status === "submitted" || row.status === "reviewed"
    ? row.status
    : "draft";
  const paper = normalizeMath3SelfTestPaper(row.paper, mode, difficulty);
  const attempt = normalizeMath3SelfTestAttempt(row.attempt, row.started_at ?? undefined);

  return {
    id: row.id ?? "",
    userId: row.user_id || undefined,
    title: row.title ?? paper?.title ?? "数学三自测试卷",
    mode,
    difficulty,
    status,
    paper,
    attempt,
    score: row.score ?? attempt.totalScore ?? 0,
    maxScore: row.max_score ?? paper?.totalScore ?? 0,
    startedAt: row.started_at ? new Date(row.started_at) : undefined,
    submittedAt: row.submitted_at ? new Date(row.submitted_at) : undefined,
    createdAt,
    updatedAt,
  };
}

function mapMath3SelfTestCamelToSnake(test: Partial<Math3SelfTestRecord>): Math3SelfTestUpdate {
  const db: Math3SelfTestUpdate = {};
  if (test.userId !== undefined) db.user_id = test.userId;
  if (test.title !== undefined) db.title = test.title;
  if (test.mode !== undefined) db.mode = test.mode;
  if (test.difficulty !== undefined) db.difficulty = test.difficulty;
  if (test.status !== undefined) db.status = test.status;
  if (test.paper !== undefined) db.paper = toJson(test.paper);
  if (test.attempt !== undefined) db.attempt = toJson(test.attempt);
  if (test.score !== undefined) db.score = test.score;
  if (test.maxScore !== undefined) db.max_score = test.maxScore;
  if (test.startedAt !== undefined) db.started_at = test.startedAt?.toISOString();
  if (test.submittedAt !== undefined) db.submitted_at = test.submittedAt?.toISOString();
  return db;
}

export const math3SelfTestsApi = {
  async getAll(): Promise<Math3SelfTestRecord[]> {
    const userId = await assertAdminWrite();
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("math3_self_tests")
      .select(MATH3_SELF_TEST_FIELDS)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return (data || []).map(mapMath3SelfTestSnakeToCamel);
  },

  async getById(id: string): Promise<Math3SelfTestRecord | null> {
    const userId = await assertAdminWrite();
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("math3_self_tests")
      .select(MATH3_SELF_TEST_FIELDS)
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) return null;
    return mapMath3SelfTestSnakeToCamel(data);
  },

  async create(test: Math3SelfTestCreateInput): Promise<Math3SelfTestRecord> {
    const userId = await assertAdminWrite();
    const supabase = getSupabase();
    const now = new Date().toISOString();
    const payload: Math3SelfTestInsert = {
      user_id: userId,
      title: test.title,
      mode: test.mode,
      difficulty: test.difficulty,
      status: test.status,
      paper: toJson(test.paper),
      attempt: toJson(test.attempt),
      score: test.score,
      max_score: test.maxScore,
      started_at: test.startedAt?.toISOString(),
      submitted_at: test.submittedAt?.toISOString(),
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await supabase
      .from("math3_self_tests")
      .insert([payload])
      .select(MATH3_SELF_TEST_FIELDS)
      .single();

    if (error) throw error;
    return mapMath3SelfTestSnakeToCamel(data);
  },

  async update(id: string, updates: Partial<Math3SelfTestRecord>): Promise<Math3SelfTestRecord> {
    const userId = await assertAdminWrite();
    const supabase = getSupabase();
    const payload = {
      ...mapMath3SelfTestCamelToSnake(updates),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("math3_self_tests")
      .update(payload)
      .eq("id", id)
      .eq("user_id", userId)
      .select(MATH3_SELF_TEST_FIELDS)
      .single();

    if (error) throw error;
    return mapMath3SelfTestSnakeToCamel(data);
  },

  async delete(id: string): Promise<void> {
    const userId = await assertAdminWrite();
    const supabase = getSupabase();
    const { error } = await supabase
      .from("math3_self_tests")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
  },
};
