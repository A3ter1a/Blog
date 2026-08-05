import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/lib/supabase-schema";
import {
  AiContentWorkflowError,
  type AiContentProposalRow,
  type AiProfileRow,
} from "@/lib/server-ai-content";
import type { AiContentReviewStatus, AiSelfCheck } from "@/lib/ai-content-contract";
import { validateReviewSelection } from "@/lib/ai-review-contract";

const REVIEW_PROPOSAL_FIELDS = [
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

const REVIEW_PROPOSAL_SUMMARY_FIELDS = [
  "id",
  "ai_profile_id",
  "title",
  "subject",
  "review_status",
  "content_version",
  "updated_at",
].join(",");

const REVIEW_PROFILE_FIELDS = [
  "id",
  "account_key",
  "subject",
  "display_name",
  "avatar_url",
  "bio",
  "academic_affiliation",
  "focus_tags",
  "is_active",
  "created_at",
  "updated_at",
].join(",");

const REVIEW_COMMENT_FIELDS = [
  "id",
  "proposal_id",
  "author_user_id",
  "proposal_content_version",
  "selection_start",
  "selection_end",
  "quoted_text",
  "body",
  "status",
  "created_at",
  "updated_at",
].join(",");

export type AiContentProposalCommentRow = Tables<"ai_content_proposal_comments">;

export type AiContentReviewProposal = {
  proposal: AiContentProposalRow;
  profile: AiProfileRow | null;
  comments: AiContentProposalCommentRow[];
};

export type AiContentProposalSummaryRow = Pick<
  AiContentProposalRow,
  "id" | "ai_profile_id" | "title" | "subject" | "review_status" | "content_version" | "updated_at"
>;

export type AiContentReviewSummary = {
  proposal: AiContentProposalSummaryRow;
  profile: AiProfileRow | null;
};

export type ReviewCommentStatus = "open" | "resolved" | "dismissed";
export type ReviewTransition = "request_changes" | "approve" | "reject";

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function isReviewStatus(value: unknown): value is AiContentReviewStatus {
  return [
    "draft",
    "self_checked",
    "pending_review",
    "changes_requested",
    "approved",
    "published",
    "rejected",
  ].includes(value as string);
}

function readSelfCheck(value: unknown): Partial<AiSelfCheck> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<AiSelfCheck>
    : {};
}

async function getReviewProposalRow(
  supabase: SupabaseClient<Database>,
  proposalId: string,
): Promise<AiContentProposalRow | null> {
  const { data, error } = await supabase
    .from("ai_content_proposals")
    .select(REVIEW_PROPOSAL_FIELDS)
    .eq("id", proposalId)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as AiContentProposalRow | null;
}

async function getProfile(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<AiProfileRow | null> {
  const { data, error } = await supabase
    .from("ai_profiles")
    .select(REVIEW_PROFILE_FIELDS)
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as AiProfileRow | null;
}

export async function listAiContentReviewProposals(
  supabase: SupabaseClient<Database>,
  status?: AiContentReviewStatus,
  limit = 80,
): Promise<AiContentReviewSummary[]> {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 100));
  let query = supabase
    .from("ai_content_proposals")
    .select(REVIEW_PROPOSAL_SUMMARY_FIELDS)
    .order("updated_at", { ascending: false })
    .limit(safeLimit);

  if (status) query = query.eq("review_status", status);
  const { data, error } = await query;
  if (error) throw error;

  const proposals = (data ?? []) as unknown as AiContentProposalSummaryRow[];
  const profileIds = [...new Set(proposals.map((proposal) => proposal.ai_profile_id))];
  const profileMap = new Map<string, AiProfileRow>();
  if (profileIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("ai_profiles")
      .select(REVIEW_PROFILE_FIELDS)
      .in("id", profileIds);
    if (profileError) throw profileError;
    for (const profile of (profiles ?? []) as unknown as AiProfileRow[]) {
      profileMap.set(profile.id, profile);
    }
  }

  return proposals.map((proposal) => ({
    proposal,
    profile: profileMap.get(proposal.ai_profile_id) ?? null,
  }));
}

export async function getAiContentReviewProposal(
  supabase: SupabaseClient<Database>,
  proposalId: string,
): Promise<AiContentReviewProposal | null> {
  const proposal = await getReviewProposalRow(supabase, proposalId);
  if (!proposal) return null;

  const { data: comments, error } = await supabase
    .from("ai_content_proposal_comments")
    .select(REVIEW_COMMENT_FIELDS)
    .eq("proposal_id", proposalId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return {
    proposal,
    profile: await getProfile(supabase, proposal.ai_profile_id),
    comments: (comments ?? []) as unknown as AiContentProposalCommentRow[],
  };
}

export async function transitionAiContentProposal(
  supabase: SupabaseClient<Database>,
  reviewerUserId: string,
  proposalId: string,
  transition: ReviewTransition,
): Promise<AiContentProposalRow | null> {
  const existing = await getReviewProposalRow(supabase, proposalId);
  if (!existing) return null;

  const allowed: Record<ReviewTransition, AiContentReviewStatus[]> = {
    request_changes: ["pending_review"],
    approve: ["pending_review"],
    reject: ["pending_review", "changes_requested"],
  };
  const currentStatus = isReviewStatus(existing.review_status) ? existing.review_status : null;
  if (!currentStatus || !allowed[transition].includes(currentStatus)) {
    throw new AiContentWorkflowError("当前提案状态不允许执行该审核操作。", 409);
  }

  if (transition === "approve" && readSelfCheck(existing.self_check).passed !== true) {
    throw new AiContentWorkflowError("自检未通过，不能批准该提案。", 409);
  }

  const nextStatus: AiContentReviewStatus = transition === "request_changes"
    ? "changes_requested"
    : transition === "approve"
      ? "approved"
      : "rejected";
  const update: TablesUpdate<"ai_content_proposals"> = {
    review_status: nextStatus,
    reviewer_user_id: reviewerUserId,
    reviewed_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("ai_content_proposals")
    .update(update)
    .eq("id", proposalId)
    .in("review_status", allowed[transition])
    .select(REVIEW_PROPOSAL_FIELDS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AiContentWorkflowError("提案刚刚发生变化，请刷新审核页。", 409);
  return data as unknown as AiContentProposalRow;
}

export async function publishAiContentProposal(
  supabase: SupabaseClient<Database>,
  proposalId: string,
): Promise<AiContentProposalRow> {
  const { data, error } = await supabase.rpc("publish_ai_content_proposal", {
    p_proposal_id: proposalId,
  });
  if (error) throw error;
  return data as unknown as AiContentProposalRow;
}

export async function createAiContentProposalComment(
  supabase: SupabaseClient<Database>,
  reviewerUserId: string,
  input: {
    proposalId: string;
    proposalContentVersion: unknown;
    selectionStart: unknown;
    selectionEnd: unknown;
    quotedText: unknown;
    body: unknown;
  },
): Promise<AiContentProposalCommentRow> {
  const proposal = await getReviewProposalRow(supabase, input.proposalId);
  if (!proposal) throw new AiContentWorkflowError("提案不存在或已被删除。", 404);
  if (!["pending_review", "changes_requested"].includes(proposal.review_status)) {
    throw new AiContentWorkflowError("当前提案不再接受新的审核批注。", 409);
  }

  const version = typeof input.proposalContentVersion === "number" ? input.proposalContentVersion : NaN;
  const selectionStart = typeof input.selectionStart === "number" ? input.selectionStart : NaN;
  const selectionEnd = typeof input.selectionEnd === "number" ? input.selectionEnd : NaN;
  const quotedText = typeof input.quotedText === "string" ? input.quotedText : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";
  const selection = validateReviewSelection({
    content: proposal.content,
    proposalContentVersion: version,
    currentContentVersion: proposal.content_version,
    selectionStart,
    selectionEnd,
    quotedText,
  });
  if (!selection.ok) throw new AiContentWorkflowError(selection.message, selection.status);
  if (!body || body.length > 4000) throw new AiContentWorkflowError("批注内容不能为空且不能超过 4000 个字符。", 400);

  const insert: TablesInsert<"ai_content_proposal_comments"> = {
    proposal_id: proposal.id,
    author_user_id: reviewerUserId,
    proposal_content_version: version,
    selection_start: selectionStart,
    selection_end: selectionEnd,
    quoted_text: quotedText,
    body,
    status: "open",
  };
  const { data, error } = await supabase
    .from("ai_content_proposal_comments")
    .insert(insert)
    .select(REVIEW_COMMENT_FIELDS)
    .single();
  if (error) throw error;
  return data as unknown as AiContentProposalCommentRow;
}

export async function updateAiContentProposalComment(
  supabase: SupabaseClient<Database>,
  commentId: string,
  status: ReviewCommentStatus,
): Promise<AiContentProposalCommentRow | null> {
  if (!["open", "resolved", "dismissed"].includes(status)) {
    throw new AiContentWorkflowError("批注状态无效。", 400);
  }
  const update: TablesUpdate<"ai_content_proposal_comments"> = { status };
  const { data, error } = await supabase
    .from("ai_content_proposal_comments")
    .update(update)
    .eq("id", commentId)
    .select(REVIEW_COMMENT_FIELDS)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as AiContentProposalCommentRow | null;
}

export async function deleteAiContentProposalComment(
  supabase: SupabaseClient<Database>,
  proposalId: string,
  commentId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("ai_content_proposal_comments")
    .delete()
    .eq("proposal_id", proposalId)
    .eq("id", commentId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

export async function getReviewProposalForAction(
  supabase: SupabaseClient<Database>,
  proposalId: string,
): Promise<AiContentProposalRow | null> {
  return getReviewProposalRow(supabase, proposalId);
}

export function serializeReviewPayload(value: unknown): Json {
  return toJson(value);
}
