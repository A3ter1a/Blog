import { NextRequest, NextResponse } from "next/server";
import { AiContentWorkflowError } from "@/lib/server-ai-content";
import {
  createAiContentProposal,
  createAiContentRevisionProposal,
  listAiContentProposals,
  listAiOwnedPublishedNotes,
} from "@/lib/server-ai-content";
import { getAiRequestContext } from "@/lib/server-ai-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getLimit(value: string | null, fallback = 40): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(req: NextRequest) {
  const auth = await getAiRequestContext(req);
  if (!auth.ok) return auth.response;

  try {
    const [proposals, notes] = await Promise.all([
      listAiContentProposals(
        auth.context.supabase,
        auth.context.user.id,
        getLimit(req.nextUrl.searchParams.get("limit")),
      ),
      listAiOwnedPublishedNotes(
        auth.context.supabase,
        auth.context.user.id,
        getLimit(req.nextUrl.searchParams.get("noteLimit"), 100),
      ),
    ]);
    return NextResponse.json({
      success: true,
      profile: auth.context.profile,
      proposals,
      notes,
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
    if (typeof body.noteId === "string" && body.noteId.trim()) {
      const proposal = await createAiContentRevisionProposal(auth.context.supabase, {
        userId: auth.context.user.id,
        profile: auth.context.profile,
        noteId: body.noteId.trim(),
      });
      if (!proposal) return NextResponse.json({ error: "找不到当前 AI 账号拥有的已发布文章", success: false }, { status: 404 });
      return NextResponse.json({ success: true, proposal }, { status: 201 });
    }
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
