import { NextRequest, NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/server-admin-auth";
import {
  listAiContentReviewProposals,
} from "@/lib/server-ai-content-review";
import type { AiContentReviewStatus } from "@/lib/ai-content-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REVIEW_STATUSES = new Set<AiContentReviewStatus>([
  "draft",
  "self_checked",
  "pending_review",
  "changes_requested",
  "approved",
  "published",
  "rejected",
]);

function getLimit(value: string | null): number {
  const parsed = Number(value ?? 80);
  return Number.isFinite(parsed) ? parsed : 80;
}

export async function GET(req: NextRequest) {
  const auth = await getAdminRequestContext(req);
  if (!auth.ok) return auth.response;

  try {
    const rawStatus = req.nextUrl.searchParams.get("status");
    const status = rawStatus && REVIEW_STATUSES.has(rawStatus as AiContentReviewStatus)
      ? rawStatus as AiContentReviewStatus
      : undefined;
    const proposals = await listAiContentReviewProposals(
      auth.context.supabase,
      status,
      getLimit(req.nextUrl.searchParams.get("limit")),
    );
    return NextResponse.json({
      success: true,
      proposals,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "AI 审核队列读取失败";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
