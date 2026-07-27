export interface MarkdownReviewChunkCapture {
  chunkIndex: number;
  chunkCount: number;
  sourceMarkdown: string;
  reviewedMarkdown: string;
  summary: string;
  tokensUsed: number;
}

export interface MarkdownReviewProposal {
  proposalVersion: 1;
  proposalId: string;
  createdAt: string;
  captureKind: "api_json_response";
  status: "pending_review";
  model: string;
  summary: string;
  sourceMarkdown: string;
  reviewedMarkdown: string;
  sourceChecksum: string;
  reviewedChecksum: string;
  sourceLength: number;
  reviewedLength: number;
  tokensUsed: number;
  chunks: MarkdownReviewChunkCapture[];
}

interface BuildMarkdownReviewProposalInput {
  sourceMarkdown: string;
  reviewedMarkdown: string;
  model: string;
  summary: string;
  chunks: MarkdownReviewChunkCapture[];
  proposalId?: string;
  createdAt?: string;
}

export interface MarkdownReviewProposalValidation {
  valid: boolean;
  reasons: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function extractMarkdownReviewProposal(value: unknown): MarkdownReviewProposal | null {
  if (!isRecord(value)) return null;
  const chunks = Array.isArray(value.chunks) ? value.chunks : null;
  if (!chunks) return null;

  const normalizedChunks: MarkdownReviewChunkCapture[] = [];
  for (const chunk of chunks) {
    if (!isRecord(chunk)) return null;
    if (
      typeof chunk.chunkIndex !== "number"
      || typeof chunk.chunkCount !== "number"
      || typeof chunk.sourceMarkdown !== "string"
      || typeof chunk.reviewedMarkdown !== "string"
      || typeof chunk.summary !== "string"
      || typeof chunk.tokensUsed !== "number"
    ) {
      return null;
    }
    normalizedChunks.push({
      chunkIndex: chunk.chunkIndex,
      chunkCount: chunk.chunkCount,
      sourceMarkdown: chunk.sourceMarkdown,
      reviewedMarkdown: chunk.reviewedMarkdown,
      summary: chunk.summary,
      tokensUsed: chunk.tokensUsed,
    });
  }

  if (
    value.proposalVersion !== 1
    || typeof value.proposalId !== "string"
    || typeof value.createdAt !== "string"
    || value.captureKind !== "api_json_response"
    || value.status !== "pending_review"
    || typeof value.model !== "string"
    || typeof value.summary !== "string"
    || typeof value.sourceMarkdown !== "string"
    || typeof value.reviewedMarkdown !== "string"
    || typeof value.sourceChecksum !== "string"
    || typeof value.reviewedChecksum !== "string"
    || typeof value.sourceLength !== "number"
    || typeof value.reviewedLength !== "number"
    || typeof value.tokensUsed !== "number"
  ) {
    return null;
  }

  return {
    proposalVersion: 1,
    proposalId: value.proposalId,
    createdAt: value.createdAt,
    captureKind: "api_json_response",
    status: "pending_review",
    model: value.model,
    summary: value.summary,
    sourceMarkdown: value.sourceMarkdown,
    reviewedMarkdown: value.reviewedMarkdown,
    sourceChecksum: value.sourceChecksum,
    reviewedChecksum: value.reviewedChecksum,
    sourceLength: value.sourceLength,
    reviewedLength: value.reviewedLength,
    tokensUsed: value.tokensUsed,
    chunks: normalizedChunks,
  };
}

export async function calculateMarkdownChecksum(markdown: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(markdown),
  );

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createProposalId() {
  if (typeof globalThis.crypto.randomUUID === "function") {
    return `markdown-review-${globalThis.crypto.randomUUID()}`;
  }
  return `markdown-review-${Date.now().toString(36)}`;
}

export async function buildMarkdownReviewProposal(
  input: BuildMarkdownReviewProposalInput,
): Promise<MarkdownReviewProposal> {
  const sourceChecksum = await calculateMarkdownChecksum(input.sourceMarkdown);
  const reviewedChecksum = await calculateMarkdownChecksum(input.reviewedMarkdown);

  return {
    proposalVersion: 1,
    proposalId: input.proposalId ?? createProposalId(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    captureKind: "api_json_response",
    status: "pending_review",
    model: input.model.trim(),
    summary: input.summary.trim(),
    sourceMarkdown: input.sourceMarkdown,
    reviewedMarkdown: input.reviewedMarkdown,
    sourceChecksum,
    reviewedChecksum,
    sourceLength: input.sourceMarkdown.length,
    reviewedLength: input.reviewedMarkdown.length,
    tokensUsed: input.chunks.reduce((total, chunk) => total + Math.max(0, chunk.tokensUsed), 0),
    chunks: input.chunks.map((chunk) => ({ ...chunk })),
  };
}

export function validateMarkdownReviewProposal(
  proposal: MarkdownReviewProposal,
): MarkdownReviewProposalValidation {
  const reasons: string[] = [];

  if (!proposal.sourceMarkdown.trim()) reasons.push("source_empty");
  if (!proposal.reviewedMarkdown.trim()) reasons.push("proposal_empty");
  if (!proposal.model.trim()) reasons.push("model_missing");
  if (proposal.sourceLength !== proposal.sourceMarkdown.length) reasons.push("source_length_mismatch");
  if (proposal.reviewedLength !== proposal.reviewedMarkdown.length) reasons.push("proposal_length_mismatch");
  if (!/^[a-f0-9]{64}$/.test(proposal.sourceChecksum)) reasons.push("source_checksum_invalid");
  if (!/^[a-f0-9]{64}$/.test(proposal.reviewedChecksum)) reasons.push("proposal_checksum_invalid");
  if (proposal.chunks.length === 0) reasons.push("chunks_empty");

  const expectedChunkCount = proposal.chunks.length;
  proposal.chunks.forEach((chunk, index) => {
    if (chunk.chunkIndex !== index + 1) reasons.push(`chunk_${index + 1}_order_invalid`);
    if (chunk.chunkCount !== expectedChunkCount) reasons.push(`chunk_${index + 1}_count_invalid`);
    if (!chunk.sourceMarkdown.trim()) reasons.push(`chunk_${index + 1}_source_empty`);
    if (!chunk.reviewedMarkdown.trim()) reasons.push(`chunk_${index + 1}_proposal_empty`);
  });

  return { valid: reasons.length === 0, reasons };
}

export async function verifyMarkdownReviewProposalChecksums(
  proposal: MarkdownReviewProposal,
): Promise<boolean> {
  const [sourceChecksum, reviewedChecksum] = await Promise.all([
    calculateMarkdownChecksum(proposal.sourceMarkdown),
    calculateMarkdownChecksum(proposal.reviewedMarkdown),
  ]);

  return sourceChecksum === proposal.sourceChecksum
    && reviewedChecksum === proposal.reviewedChecksum;
}

export function canApplyMarkdownReviewProposal(
  proposal: MarkdownReviewProposal,
  currentMarkdown: string,
): boolean {
  return validateMarkdownReviewProposal(proposal).valid
    && currentMarkdown === proposal.sourceMarkdown;
}
