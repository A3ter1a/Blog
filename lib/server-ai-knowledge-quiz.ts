import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables, TablesInsert, TablesUpdate } from "@/lib/supabase-schema";
import {
  answersEqual,
  checksumAiKnowledgeQuiz,
  runAiKnowledgeQuizSelfCheck,
  toPublicAiKnowledgeQuizItem,
  type AiKnowledgeQuizItem,
  type AiKnowledgeQuizItemPublic,
  type AiKnowledgeQuizSelfCheck,
  type AiKnowledgeQuizStatus,
} from "@/lib/ai-knowledge-quiz-contract";

const QUIZ_FIELDS = [
  "id",
  "proposal_id",
  "note_id",
  "owner_user_id",
  "ai_profile_id",
  "title",
  "subject",
  "review_status",
  "self_check",
  "source_checksum",
  "content_version",
  "item_count",
  "reviewer_user_id",
  "reviewed_at",
  "published_at",
  "created_at",
  "updated_at",
].join(",");

const ITEM_FIELDS = [
  "id",
  "quiz_id",
  "ordinal",
  "item_type",
  "question",
  "options",
  "answer",
  "explanation",
  "knowledge_points",
  "difficulty",
  "source_heading",
  "created_at",
  "updated_at",
].join(",");

const ATTEMPT_FIELDS = [
  "id",
  "quiz_id",
  "user_id",
  "answers",
  "result",
  "score",
  "completed_at",
  "created_at",
  "updated_at",
].join(",");

export type AiKnowledgeQuizRow = Tables<"ai_knowledge_quizzes">;
export type AiKnowledgeQuizItemRow = Tables<"ai_knowledge_quiz_items">;
export type AiKnowledgeQuizAttemptRow = Tables<"ai_knowledge_quiz_attempts">;

export type AiKnowledgeQuizWithItems = {
  quiz: AiKnowledgeQuizRow;
  items: AiKnowledgeQuizItem[];
};

export class AiKnowledgeQuizError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AiKnowledgeQuizError";
    this.status = status;
  }
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function checkedSelfCheck(value: AiKnowledgeQuizSelfCheck): AiKnowledgeQuizSelfCheck {
  return { ...value, checkedAt: new Date().toISOString() };
}

function normalizeStoredItem(row: AiKnowledgeQuizItemRow): AiKnowledgeQuizItem {
  const checked = runAiKnowledgeQuizSelfCheck([{
    id: row.id,
    ordinal: row.ordinal,
    itemType: row.item_type,
    question: row.question,
    options: row.options,
    answer: row.answer,
    explanation: row.explanation,
    knowledgePoints: row.knowledge_points,
    difficulty: row.difficulty,
    sourceHeading: row.source_heading,
  }]);
  const item = checked.items[0];
  if (!item) throw new AiKnowledgeQuizError("快测题目数据损坏。", 500);
  return item;
}

function normalizeItems(value: unknown): { items: AiKnowledgeQuizItem[]; selfCheck: AiKnowledgeQuizSelfCheck } {
  const checked = runAiKnowledgeQuizSelfCheck(value);
  return {
    items: checked.items,
    selfCheck: checkedSelfCheck(checked.selfCheck),
  };
}

function safeTitle(value: unknown, fallback: string): string {
  const title = typeof value === "string" ? value.trim().slice(0, 200) : "";
  return title || fallback;
}

function hashProposalSource(proposalId: string, title: string, items: AiKnowledgeQuizItem[]): string {
  return createHash("sha256")
    .update(`${proposalId}\n${title}\n${checksumAiKnowledgeQuiz(items)}`, "utf8")
    .digest("hex");
}

async function fetchItems(
  supabase: SupabaseClient<Database>,
  quizId: string,
): Promise<AiKnowledgeQuizItem[]> {
  const { data, error } = await supabase
    .from("ai_knowledge_quiz_items")
    .select(ITEM_FIELDS)
    .eq("quiz_id", quizId)
    .order("ordinal", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => normalizeStoredItem(row as unknown as AiKnowledgeQuizItemRow));
}

export async function getAiKnowledgeQuiz(
  supabase: SupabaseClient<Database>,
  quizId: string,
  ownerUserId?: string,
): Promise<AiKnowledgeQuizWithItems | null> {
  let query = supabase.from("ai_knowledge_quizzes").select(QUIZ_FIELDS).eq("id", quizId);
  if (ownerUserId) query = query.eq("owner_user_id", ownerUserId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    quiz: data as unknown as AiKnowledgeQuizRow,
    items: await fetchItems(supabase, quizId),
  };
}

export async function listAiKnowledgeQuizzes(
  supabase: SupabaseClient<Database>,
  ownerUserId: string,
  limit = 40,
): Promise<AiKnowledgeQuizRow[]> {
  const { data, error } = await supabase
    .from("ai_knowledge_quizzes")
    .select(QUIZ_FIELDS)
    .eq("owner_user_id", ownerUserId)
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, Math.trunc(limit))));
  if (error) throw error;
  return (data ?? []) as unknown as AiKnowledgeQuizRow[];
}

export async function listAiKnowledgeQuizReviewRows(
  supabase: SupabaseClient<Database>,
  limit = 80,
): Promise<AiKnowledgeQuizRow[]> {
  const { data, error } = await supabase
    .from("ai_knowledge_quizzes")
    .select(QUIZ_FIELDS)
    .in("review_status", ["pending_review", "changes_requested", "approved", "published"])
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, Math.trunc(limit))));
  if (error) throw error;
  return (data ?? []) as unknown as AiKnowledgeQuizRow[];
}

export async function createAiKnowledgeQuiz(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    profile: Tables<"ai_profiles">;
    proposalId: string;
    title?: unknown;
    items: unknown;
  },
): Promise<AiKnowledgeQuizWithItems> {
  const { data: proposal, error: proposalError } = await supabase
    .from("ai_content_proposals")
    .select("id, owner_user_id, ai_profile_id, title, subject, note_id")
    .eq("id", input.proposalId)
    .eq("owner_user_id", input.userId)
    .eq("ai_profile_id", input.profile.id)
    .maybeSingle();
  if (proposalError) throw proposalError;
  if (!proposal) throw new AiKnowledgeQuizError("只能为自己的 AI 讲义提案创建快测。", 403);

  const { items, selfCheck } = normalizeItems(input.items);
  if (!items.length) throw new AiKnowledgeQuizError("至少需要生成一题知识点快测。", 400);
  const title = safeTitle(input.title, `${proposal.title} · 知识点快测`);
  const insert: TablesInsert<"ai_knowledge_quizzes"> = {
    proposal_id: input.proposalId,
    note_id: proposal.note_id,
    owner_user_id: input.userId,
    ai_profile_id: input.profile.id,
    title,
    subject: input.profile.subject,
    review_status: selfCheck.passed ? "self_checked" : "draft",
    self_check: toJson(selfCheck),
    source_checksum: hashProposalSource(input.proposalId, title, items),
    item_count: items.length,
  };
  const { data: quizData, error: quizError } = await supabase
    .from("ai_knowledge_quizzes")
    .insert(insert)
    .select(QUIZ_FIELDS)
    .single();
  if (quizError) throw quizError;
  const quiz = quizData as unknown as AiKnowledgeQuizRow;

  const itemInsert: TablesInsert<"ai_knowledge_quiz_items">[] = items.map((item) => ({
    quiz_id: quiz.id,
    ordinal: item.ordinal,
    item_type: item.itemType,
    question: item.question,
    options: toJson(item.options),
    answer: toJson(item.answer),
    explanation: item.explanation,
    knowledge_points: item.knowledgePoints,
    difficulty: item.difficulty,
    source_heading: item.sourceHeading,
  }));
  const { error: itemError } = await supabase.from("ai_knowledge_quiz_items").insert(itemInsert);
  if (itemError) {
    await supabase.from("ai_knowledge_quizzes").delete().eq("id", quiz.id);
    throw itemError;
  }
  return { quiz, items };
}

export async function updateAiKnowledgeQuiz(
  supabase: SupabaseClient<Database>,
  input: { userId: string; quizId: string; title?: unknown; items?: unknown },
): Promise<AiKnowledgeQuizWithItems | null> {
  const existing = await getAiKnowledgeQuiz(supabase, input.quizId, input.userId);
  if (!existing) return null;
  if (!["draft", "self_checked", "changes_requested", "rejected"].includes(existing.quiz.review_status)) {
    throw new AiKnowledgeQuizError("当前快测状态不允许由 AI 修改。", 409);
  }
  const normalized = input.items === undefined
    ? { items: existing.items, selfCheck: existing.quiz.self_check as unknown as AiKnowledgeQuizSelfCheck }
    : normalizeItems(input.items);
  const title = safeTitle(input.title, existing.quiz.title);
  const update: TablesUpdate<"ai_knowledge_quizzes"> = {
    title,
    review_status: normalized.selfCheck.passed ? "self_checked" : "draft",
    self_check: toJson(normalized.selfCheck),
    source_checksum: hashProposalSource(existing.quiz.proposal_id, title, normalized.items),
    item_count: normalized.items.length,
    content_version: existing.quiz.content_version + 1,
  };
  const { data, error } = await supabase
    .from("ai_knowledge_quizzes")
    .update(update)
    .eq("id", input.quizId)
    .eq("owner_user_id", input.userId)
    .select(QUIZ_FIELDS)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { error: deleteError } = await supabase.from("ai_knowledge_quiz_items").delete().eq("quiz_id", input.quizId);
  if (deleteError) throw deleteError;
  const itemInsert: TablesInsert<"ai_knowledge_quiz_items">[] = normalized.items.map((item) => ({
    quiz_id: input.quizId,
    ordinal: item.ordinal,
    item_type: item.itemType,
    question: item.question,
    options: toJson(item.options),
    answer: toJson(item.answer),
    explanation: item.explanation,
    knowledge_points: item.knowledgePoints,
    difficulty: item.difficulty,
    source_heading: item.sourceHeading,
  }));
  const { error: itemError } = await supabase.from("ai_knowledge_quiz_items").insert(itemInsert);
  if (itemError) throw itemError;
  return { quiz: data as unknown as AiKnowledgeQuizRow, items: normalized.items };
}

export async function submitAiKnowledgeQuiz(
  supabase: SupabaseClient<Database>,
  userId: string,
  quizId: string,
): Promise<AiKnowledgeQuizRow | null> {
  const existing = await getAiKnowledgeQuiz(supabase, quizId, userId);
  if (!existing) return null;
  if (!["draft", "self_checked", "changes_requested"].includes(existing.quiz.review_status)) {
    throw new AiKnowledgeQuizError("当前快测状态不允许提交审核。", 409);
  }
  const selfCheck = existing.quiz.self_check as unknown as Partial<AiKnowledgeQuizSelfCheck>;
  if (selfCheck.passed !== true) throw new AiKnowledgeQuizError("请先修复快测自检问题。", 409);
  const { data, error } = await supabase
    .from("ai_knowledge_quizzes")
    .update({ review_status: "pending_review" })
    .eq("id", quizId)
    .eq("owner_user_id", userId)
    .select(QUIZ_FIELDS)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as AiKnowledgeQuizRow | null;
}

export async function transitionAiKnowledgeQuiz(
  supabase: SupabaseClient<Database>,
  reviewerUserId: string,
  quizId: string,
  action: "request_changes" | "approve" | "reject",
): Promise<AiKnowledgeQuizRow | null> {
  const { data: existing, error: existingError } = await supabase
    .from("ai_knowledge_quizzes")
    .select(QUIZ_FIELDS)
    .eq("id", quizId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) return null;
  const current = existing as unknown as AiKnowledgeQuizRow;
  if (!["pending_review", "changes_requested"].includes(current.review_status)) {
    throw new AiKnowledgeQuizError("当前快测状态不允许审核。", 409);
  }
  if (action === "approve") {
    const selfCheck = current.self_check as unknown as Partial<AiKnowledgeQuizSelfCheck>;
    if (selfCheck.passed !== true) throw new AiKnowledgeQuizError("快测自检未通过，不能批准。", 409);
  }
  const nextStatus: AiKnowledgeQuizStatus = action === "request_changes"
    ? "changes_requested"
    : action === "approve"
      ? "approved"
      : "rejected";
  const { data, error } = await supabase
    .from("ai_knowledge_quizzes")
    .update({ review_status: nextStatus, reviewer_user_id: reviewerUserId, reviewed_at: new Date().toISOString() })
    .eq("id", quizId)
    .in("review_status", ["pending_review", "changes_requested"])
    .select(QUIZ_FIELDS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AiKnowledgeQuizError("快测刚刚发生变化，请刷新审核页。", 409);
  return data as unknown as AiKnowledgeQuizRow;
}

export async function publishAiKnowledgeQuiz(
  supabase: SupabaseClient<Database>,
  quizId: string,
  noteId?: string | null,
): Promise<AiKnowledgeQuizRow | null> {
  const { data, error } = await supabase
    .from("ai_knowledge_quizzes")
    .update({
      review_status: "published",
      note_id: noteId ?? undefined,
      published_at: new Date().toISOString(),
    })
    .eq("id", quizId)
    .in("review_status", ["approved", "published"])
    .select(QUIZ_FIELDS)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as AiKnowledgeQuizRow | null;
}

export async function attachAiKnowledgeQuizzesToPublishedNote(
  supabase: SupabaseClient<Database>,
  proposalId: string,
  noteId: string,
): Promise<void> {
  const { error } = await supabase
    .from("ai_knowledge_quizzes")
    .update({ note_id: noteId })
    .eq("proposal_id", proposalId)
    .in("review_status", ["approved", "published"]);
  if (error) throw error;
}

export async function listPublishedAiKnowledgeQuizzesForNote(
  supabase: SupabaseClient<Database>,
  noteId: string,
): Promise<Array<{ quiz: AiKnowledgeQuizRow; items: AiKnowledgeQuizItemPublic[] }>> {
  const { data, error } = await supabase
    .from("ai_knowledge_quizzes")
    .select(QUIZ_FIELDS)
    .eq("note_id", noteId)
    .in("review_status", ["approved", "published"])
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const result: Array<{ quiz: AiKnowledgeQuizRow; items: AiKnowledgeQuizItemPublic[] }> = [];
  for (const row of data ?? []) {
    const quiz = row as unknown as AiKnowledgeQuizRow;
    const items = await fetchItems(supabase, quiz.id);
    result.push({ quiz, items: items.map(toPublicAiKnowledgeQuizItem) });
  }
  return result;
}

export async function gradeAiKnowledgeQuizAttempt(
  supabase: SupabaseClient<Database>,
  userId: string,
  quizId: string,
  answers: unknown,
): Promise<{ attempt: AiKnowledgeQuizAttemptRow; result: Json }> {
  const full = await getAiKnowledgeQuiz(supabase, quizId);
  if (!full || !["approved", "published"].includes(full.quiz.review_status)) {
    throw new AiKnowledgeQuizError("快测尚未通过审核或已不可用。", 404);
  }
  const answerMap = isRecord(answers) ? answers : {};
  const details = full.items.map((item) => {
    const actual = answerMap[item.id] ?? answerMap[String(item.ordinal)];
    const correct = answersEqual(item.answer, actual);
    return {
      itemId: item.id,
      ordinal: item.ordinal,
      correct,
      answer: item.answer,
      explanation: item.explanation,
      knowledgePoints: item.knowledgePoints,
    };
  });
  const correctCount = details.filter((detail) => detail.correct).length;
  const score = details.length > 0 ? Number(((correctCount / details.length) * 100).toFixed(2)) : 0;
  const result = toJson({ correctCount, total: details.length, score, details });
  const insert: TablesInsert<"ai_knowledge_quiz_attempts"> = {
    quiz_id: quizId,
    user_id: userId,
    answers: toJson(answerMap),
    result,
    score,
    completed_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("ai_knowledge_quiz_attempts")
    .insert(insert)
    .select(ATTEMPT_FIELDS)
    .single();
  if (error) throw error;
  return { attempt: data as unknown as AiKnowledgeQuizAttemptRow, result };
}

export function stripQuizAnswers(items: AiKnowledgeQuizItem[]): AiKnowledgeQuizItemPublic[] {
  return items.map(toPublicAiKnowledgeQuizItem);
}
