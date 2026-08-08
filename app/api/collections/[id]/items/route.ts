import { NextRequest, NextResponse } from "next/server";
import { getCollectionRequestContext } from "@/lib/server-collection-auth";
import {
  addNoteToCollection,
  CollectionWorkflowError,
  removeNoteFromCollection,
  updateCollectionItemOrder,
} from "@/lib/server-note-collections";
import { isUuid } from "@/lib/collections-contract";
import { revalidatePublicContent } from "@/lib/server-public-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
async function readId(params: Promise<{ id: string }>): Promise<string | null> {
  const { id } = await params;
  return isUuid(id) ? id : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const collectionId = await readId(params);
  if (!collectionId) return NextResponse.json({ success: false, error: "合集 ID 无效" }, { status: 400 });
  const auth = await getCollectionRequestContext(req);
  if (!auth.ok) return auth.response;
  try {
    const rawBody: unknown = await req.json().catch(() => ({}));
    const body = isRecord(rawBody) ? rawBody : {};
    const noteId = typeof body.noteId === "string" ? body.noteId : "";
    if (!isUuid(noteId)) return NextResponse.json({ success: false, error: "笔记 ID 无效" }, { status: 400 });
    const collection = await addNoteToCollection(auth.context.supabase, auth.context.actor, collectionId, noteId, body.sortOrder);
    if (!collection) return NextResponse.json({ success: false, error: "合集不存在或无权访问" }, { status: 404 });
    revalidatePublicContent();
    return NextResponse.json({ success: true, collection });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "合集项目添加失败";
    const status = error instanceof CollectionWorkflowError ? error.status : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const collectionId = await readId(params);
  if (!collectionId) return NextResponse.json({ success: false, error: "合集 ID 无效" }, { status: 400 });
  const auth = await getCollectionRequestContext(req);
  if (!auth.ok) return auth.response;
  try {
    const rawBody: unknown = await req.json().catch(() => ({}));
    const body = isRecord(rawBody) ? rawBody : {};
    const itemId = typeof body.itemId === "string" ? body.itemId : "";
    if (!isUuid(itemId)) return NextResponse.json({ success: false, error: "合集项目 ID 无效" }, { status: 400 });
    const swapItemId = typeof body.swapItemId === "string" ? body.swapItemId : undefined;
    if (swapItemId && !isUuid(swapItemId)) {
      return NextResponse.json({ success: false, error: "交换项目 ID 无效" }, { status: 400 });
    }
    if (swapItemId && typeof body.swapSortOrder !== "number") {
      return NextResponse.json({ success: false, error: "交换项目顺序无效" }, { status: 400 });
    }
    const collection = await updateCollectionItemOrder(
      auth.context.supabase,
      collectionId,
      itemId,
      body.sortOrder,
      swapItemId ? { itemId: swapItemId, sortOrder: body.swapSortOrder } : undefined,
    );
    if (!collection) return NextResponse.json({ success: false, error: "合集不存在或无权访问" }, { status: 404 });
    revalidatePublicContent();
    return NextResponse.json({ success: true, collection });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "合集排序更新失败";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const collectionId = await readId(params);
  if (!collectionId) return NextResponse.json({ success: false, error: "合集 ID 无效" }, { status: 400 });
  const auth = await getCollectionRequestContext(req);
  if (!auth.ok) return auth.response;
  try {
    const rawBody: unknown = await req.json().catch(() => ({}));
    const body = isRecord(rawBody) ? rawBody : {};
    const itemId = typeof body.itemId === "string" ? body.itemId : undefined;
    const noteId = typeof body.noteId === "string" ? body.noteId : undefined;
    const collection = await removeNoteFromCollection(auth.context.supabase, collectionId, itemId, noteId);
    if (!collection) return NextResponse.json({ success: false, error: "合集不存在或无权访问" }, { status: 404 });
    revalidatePublicContent();
    return NextResponse.json({ success: true, collection });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "合集项目移除失败";
    const status = error instanceof CollectionWorkflowError ? error.status : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
