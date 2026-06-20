import { assertAdminWrite, getSupabase, type Math3SelfTestInsert, type Math3SelfTestRow, type Math3SelfTestUpdate } from "./supabase";
import {
  createEmptyMath3SelfTestAttempt,
  type Math3SelfTestCreateInput,
  type Math3SelfTestPaper,
  type Math3SelfTestRecord,
} from "./math3-self-test";

const MATH3_SELF_TEST_FIELDS = "id,user_id,title,mode,difficulty,status,paper,attempt,score,max_score,started_at,submitted_at,created_at,updated_at";

function mapMath3SelfTestSnakeToCamel(row: Math3SelfTestRow): Math3SelfTestRecord {
  const createdAt = row.created_at ? new Date(row.created_at) : new Date();
  const updatedAt = row.updated_at ? new Date(row.updated_at) : createdAt;
  const paper = row.paper as Math3SelfTestPaper;
  const attempt = row.attempt ?? createEmptyMath3SelfTestAttempt(row.started_at ?? undefined);

  return {
    id: row.id ?? "",
    userId: row.user_id || undefined,
    title: row.title ?? paper?.title ?? "数学三自测试卷",
    mode: row.mode ?? paper?.mode ?? "quick",
    difficulty: row.difficulty ?? paper?.difficulty ?? "simulation",
    status: row.status ?? "draft",
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
  if (test.paper !== undefined) db.paper = test.paper;
  if (test.attempt !== undefined) db.attempt = test.attempt;
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
      ...mapMath3SelfTestCamelToSnake(test),
      user_id: userId,
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
