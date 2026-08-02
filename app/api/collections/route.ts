import { NextRequest, NextResponse } from "next/server";
import { getCollectionRequestContext } from "@/lib/server-collection-auth";
import { createNoteCollection, CollectionWorkflowError, listNoteCollections } from "@/lib/server-note-collections";
import { createPublicServerClient } from "@/lib/server-supabase-public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getLimit(value: string | null): number {
  const parsed = Number(value ?? 100);
  return Number.isFinite(parsed) ? parsed : 100;
}

export async function GET(req: NextRequest) {
  const scope = req.nextUrl.searchParams.get("scope") ?? "public";
  try {
    if (scope === "public") {
      const collections = await listNoteCollections(createPublicServerClient(), { publishedOnly: true, limit: getLimit(req.nextUrl.searchParams.get("limit")) });
      return NextResponse.json({ success: true, collections }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
    }

    const auth = await getCollectionRequestContext(req);
    if (!auth.ok) return auth.response;
    const collections = await listNoteCollections(auth.context.supabase, {
      ownerUserId: scope === "mine" ? auth.context.user.id : undefined,
      limit: getLimit(req.nextUrl.searchParams.get("limit")),
    });
    return NextResponse.json({ success: true, collections, role: auth.context.actor.role, profile: auth.context.profile }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "合集读取失败";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await getCollectionRequestContext(req);
  if (!auth.ok) return auth.response;
  try {
    const rawBody: unknown = await req.json().catch(() => ({}));
    const body = isRecord(rawBody) ? rawBody : {};
    const collection = await createNoteCollection(auth.context.supabase, auth.context.actor, body);
    return NextResponse.json({ success: true, collection }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "合集创建失败";
    const status = error instanceof CollectionWorkflowError ? error.status : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
