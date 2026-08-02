import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables, TablesInsert, TablesUpdate } from "@/lib/supabase-schema";
import {
  normalizeAiContentTags,
  runAiContentSelfCheck,
  validateAiContentInput,
  type AiSelfCheck,
} from "@/lib/ai-content-contract";

const AI_PROPOSAL_FIELDS = [
  "id",
  "owner_user_id",
  "ai_profile_id",
  "note_id",
  "title",
  "content",
  "subject",
  "tags",
  "cover_image",
  "videos",
  "problems",
  "review_status",
  "self_check",
  "source_checksum",
  "content_version",
  "reviewer_user_id",
  "reviewed_at",
  "published_at",
  "created_at",
  "updated_at",
].join(",");

export type AiContentProposalRow = Tables<"ai_content_proposals">;
export type AiProfileRow = Tables<"ai_profiles">;

export class AiContentWorkflowError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AiContentWorkflowError";
    this.status = status;
  }
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function buildCheckedSelfCheck(selfCheck: AiSelfCheck): AiSelfCheck {
  return {
    ...selfCheck,
    checkedAt: new Date().toISOString(),
  };
}

function checksum(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function normalizeJsonArray(value: unknown): Json {
  return Array.isArray(value) ? toJson(value.slice(0, 200)) : [];
}

export type CreateAiContentProposalInput = {
  userId: string;
  profile: AiProfileRow;
  title: string;
  content: string;
  subject?: string;
  tags?: unknown;
  coverImage?: unknown;
  videos?: unknown;
  problems?: unknown;
};

export async function listAiContentProposals(
  supabase: SupabaseClient<Database>,
  userId: string,
  limit = 40,
): Promise<AiContentProposalRow[]> {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 100));
  const { data, error } = await supabase
    .from("ai_content_proposals")
    .select(AI_PROPOSAL_FIELDS)
    .eq("owner_user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw error;
  return (data ?? []) as unknown as AiContentProposalRow[];
}

export async function getAiContentProposal(
  supabase: SupabaseClient<Database>,
  userId: string,
  proposalId: string,
): Promise<AiContentProposalRow | null> {
  const { data, error } = await supabase
    .from("ai_content_proposals")
    .select(AI_PROPOSAL_FIELDS)
    .eq("id", proposalId)
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as AiContentProposalRow | null;
}

export async function createAiContentProposal(
  supabase: SupabaseClient<Database>,
  input: CreateAiContentProposalInput,
): Promise<AiContentProposalRow> {
  const title = input.title.trim();
  const content = input.content;
  const inputError = validateAiContentInput(title, content);
  if (inputError) throw new AiContentWorkflowError(inputError, 400);

  if (input.subject && input.subject !== input.profile.subject) {
    throw new AiContentWorkflowError("AI 账号只能提交自己所属学科的内容。", 403);
  }

  const checked = runAiContentSelfCheck(content);
  const selfCheck = buildCheckedSelfCheck(checked.selfCheck);
  const insert: TablesInsert<"ai_content_proposals"> = {
    owner_user_id: input.userId,
    ai_profile_id: input.profile.id,
    title,
    content: checked.content,
    subject: input.profile.subject,
    tags: normalizeAiContentTags(input.tags),
    cover_image: normalizeOptionalText(input.coverImage, 2000),
    videos: normalizeJsonArray(input.videos),
    problems: normalizeJsonArray(input.problems),
    // The owner INSERT policy deliberately accepts only a draft. Promote the
    // proposal after the row exists so the stricter RLS boundary remains intact.
    review_status: "draft",
    self_check: toJson(selfCheck),
    source_checksum: checksum(checked.content),
  };

  const { data: draft, error: insertError } = await supabase
    .from("ai_content_proposals")
    .insert(insert)
    .select(AI_PROPOSAL_FIELDS)
    .single();
  if (insertError) throw insertError;
  const draftProposal = draft as unknown as AiContentProposalRow;

  if (!selfCheck.passed) {
    return draftProposal;
  }

  const { data: checkedProposal, error: updateError } = await supabase
    .from("ai_content_proposals")
    .update({ review_status: "self_checked" })
    .eq("id", draftProposal.id)
    .eq("owner_user_id", input.userId)
    .eq("review_status", "draft")
    .select(AI_PROPOSAL_FIELDS)
    .single();
  if (updateError) throw updateError;
  return checkedProposal as unknown as AiContentProposalRow;
}

export type UpdateAiContentProposalInput = {
  userId: string;
  profile: AiProfileRow;
  proposalId: string;
  title?: unknown;
  content?: unknown;
  tags?: unknown;
  coverImage?: unknown;
  videos?: unknown;
  problems?: unknown;
};

export async function updateAiContentProposal(
  supabase: SupabaseClient<Database>,
  input: UpdateAiContentProposalInput,
): Promise<AiContentProposalRow | null> {
  const existing = await getAiContentProposal(supabase, input.userId, input.proposalId);
  if (!existing) return null;
  if (!["draft", "self_checked", "changes_requested"].includes(existing.review_status)) {
    throw new AiContentWorkflowError("只有草稿或退回返修的提案可以由 AI 编辑。", 409);
  }

  const title = typeof input.title === "string" ? input.title.trim() : existing.title;
  const content = typeof input.content === "string" ? input.content : existing.content;
  const inputError = validateAiContentInput(title, content);
  if (inputError) throw new AiContentWorkflowError(inputError, 400);

  const checked = runAiContentSelfCheck(content);
  const selfCheck = buildCheckedSelfCheck(checked.selfCheck);
  const update: TablesUpdate<"ai_content_proposals"> = {
    title,
    content: checked.content,
    subject: input.profile.subject,
    tags: input.tags === undefined ? existing.tags : normalizeAiContentTags(input.tags),
    cover_image: input.coverImage === undefined
      ? existing.cover_image
      : normalizeOptionalText(input.coverImage, 2000),
    videos: input.videos === undefined ? existing.videos : normalizeJsonArray(input.videos),
    problems: input.problems === undefined ? existing.problems : normalizeJsonArray(input.problems),
    review_status: selfCheck.passed ? "self_checked" : "draft",
    self_check: toJson(selfCheck),
    source_checksum: checksum(checked.content),
  };

  const { data, error } = await supabase
    .from("ai_content_proposals")
    .update(update)
    .eq("id", input.proposalId)
    .eq("owner_user_id", input.userId)
    .select(AI_PROPOSAL_FIELDS)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as AiContentProposalRow | null;
}

export async function rerunAiContentSelfCheck(
  supabase: SupabaseClient<Database>,
  userId: string,
  proposalId: string,
): Promise<AiContentProposalRow | null> {
  const existing = await getAiContentProposal(supabase, userId, proposalId);
  if (!existing) return null;
  if (!["draft", "self_checked", "pending_review", "changes_requested"].includes(existing.review_status)) {
    throw new AiContentWorkflowError("当前提案状态不允许重新自检。", 409);
  }

  const checked = runAiContentSelfCheck(existing.content);
  const selfCheck = buildCheckedSelfCheck(checked.selfCheck);
  const update: TablesUpdate<"ai_content_proposals"> = {
    content: checked.content,
    review_status: selfCheck.passed ? "self_checked" : "draft",
    self_check: toJson(selfCheck),
    source_checksum: checksum(checked.content),
  };
  const { data, error } = await supabase
    .from("ai_content_proposals")
    .update(update)
    .eq("id", proposalId)
    .eq("owner_user_id", userId)
    .select(AI_PROPOSAL_FIELDS)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as AiContentProposalRow | null;
}

export async function submitAiContentProposal(
  supabase: SupabaseClient<Database>,
  userId: string,
  proposalId: string,
): Promise<AiContentProposalRow | null> {
  const existing = await getAiContentProposal(supabase, userId, proposalId);
  if (!existing) return null;
  if (existing.review_status === "pending_review") return existing;
  if (!["draft", "self_checked", "changes_requested"].includes(existing.review_status)) {
    throw new AiContentWorkflowError("当前提案状态不允许提交审核。", 409);
  }

  const selfCheck = existing.self_check as unknown as Partial<AiSelfCheck>;
  if (selfCheck?.passed !== true) {
    throw new AiContentWorkflowError("请先修复自检问题，再提交人工审核。", 409);
  }

  const { data, error } = await supabase.rpc("submit_ai_content_proposal", {
    p_proposal_id: proposalId,
  });
  if (error) throw error;
  return data as unknown as AiContentProposalRow;
}
