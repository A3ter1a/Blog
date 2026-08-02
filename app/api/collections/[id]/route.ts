import { NextRequest, NextResponse } from "next/server";
import { getCollectionRequestContext } from "@/lib/server-collection-auth";
import { createPublicServerClient } from "@/lib/server-supabase-public";
import {
  CollectionWorkflowError,
  deleteNoteCollection,
  getNoteCollection,
  updateNoteCollection,
} from "@/lib/server-note-collections";
import { isUuid } from "@/lib/collections-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
async function readId(params: Promise<{ id: string }>): Promise<string | null> {
  const { id } = await params;
  return isUuid(id) ? id : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = await readId(params);
  if (!id) return NextResponse.json({ success: false, error: "合集 ID 无效" }, { status: 400 });
  try {
    const publicClient = createPublicServerClient();
    let collection = await getNoteCollection(publicClient, id);
    if (!collection) {
      const auth = await getCollectionRequestContext(req);
      if (!auth.ok) return auth.response;
      collection = await getNoteCollection(auth.context.supabase, id);
    }
    if (!collection) return NextResponse.json({ success: false, error: "合集不存在或暂不可见" }, { status: 404 });
    return NextResponse.json({ success: true, collection }, { headers: { "Cache-Control": collection.isPublished ? "public, max-age=60, stale-while-revalidate=300" : "no-store" } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "合集读取失败";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = await readId(params);
  if (!id) return NextResponse.json({ success: false, error: "合集 ID 无效" }, { status: 400 });
  const auth = await getCollectionRequestContext(req);
  if (!auth.ok) return auth.response;
  try {
    const rawBody: unknown = await req.json().catch(() => ({}));
    const body = isRecord(rawBody) ? rawBody : {};
    const collection = await updateNoteCollection(auth.context.supabase, auth.context.actor, id, body);
    if (!collection) return NextResponse.json({ success: false, error: "合集不存在或无权修改" }, { status: 404 });
    return NextResponse.json({ success: true, collection });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "合集更新失败";
    const status = error instanceof CollectionWorkflowError ? error.status : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = await readId(params);
  if (!id) return NextResponse.json({ success: false, error: "合集 ID 无效" }, { status: 400 });
  const auth = await getCollectionRequestContext(req);
  if (!auth.ok) return auth.response;
  try {
    const deleted = await deleteNoteCollection(auth.context.supabase, id);
    if (!deleted) return NextResponse.json({ success: false, error: "合集不存在或无权删除" }, { status: 404 });
    return NextResponse.json({ success: true, deleted: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "合集删除失败";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
