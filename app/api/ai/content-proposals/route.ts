import { NextRequest, NextResponse } from "next/server";
import { AiContentWorkflowError } from "@/lib/server-ai-content";
import {
  createAiContentProposal,
  listAiContentProposals,
} from "@/lib/server-ai-content";
import { getAiRequestContext } from "@/lib/server-ai-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getLimit(value: string | null): number {
  const parsed = Number(value ?? 40);
  return Number.isFinite(parsed) ? parsed : 40;
}

export async function GET(req: NextRequest) {
  const auth = await getAiRequestContext(req);
  if (!auth.ok) return auth.response;

  try {
    const proposals = await listAiContentProposals(
      auth.context.supabase,
      auth.context.user.id,
      getLimit(req.nextUrl.searchParams.get("limit")),
    );
    return NextResponse.json({
      success: true,
      profile: auth.context.profile,
      proposals,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "AI 提案读取失败";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await getAiRequestContext(req);
  if (!auth.ok) return auth.response;

  try {
    const rawBody: unknown = await req.json().catch(() => ({}));
    const body = isRecord(rawBody) ? rawBody : {};
    const title = typeof body.title === "string" ? body.title : "";
    const content = typeof body.content === "string" ? body.content : "";
    const proposal = await createAiContentProposal(auth.context.supabase, {
      userId: auth.context.user.id,
      profile: auth.context.profile,
      title,
      content,
      subject: typeof body.subject === "string" ? body.subject : undefined,
      tags: body.tags,
      coverImage: body.coverImage,
      videos: body.videos,
      problems: body.problems,
    });
    return NextResponse.json({ success: true, proposal }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "AI 提案保存失败";
    const status = error instanceof AiContentWorkflowError ? error.status : 500;
    return NextResponse.json({ error: message, success: false }, { status });
  }
}
