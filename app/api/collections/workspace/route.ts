import { NextRequest, NextResponse } from "next/server";
import { getCollectionRequestContext } from "@/lib/server-collection-auth";
import { listCollectionAvailableNotes, listNoteCollections } from "@/lib/server-note-collections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One authenticated snapshot for the collection workspace. The previous UI
 * called the collections and available-notes endpoints separately, repeating
 * the Supabase user/role handshake and making background tabs much slower.
 */
export async function GET(req: NextRequest) {
  const auth = await getCollectionRequestContext(req);
  if (!auth.ok) return auth.response;

  try {
    const [collections, rows] = await Promise.all([
      listNoteCollections(auth.context.supabase, {
        limit: 100,
        ownerUserId: auth.context.actor.role === "ai" ? auth.context.user.id : undefined,
      }),
      listCollectionAvailableNotes(auth.context.supabase, 200, {
        ownerUserId: auth.context.actor.role === "ai" ? auth.context.user.id : undefined,
      }),
    ]);
    const notes = rows.map((note) => ({
      id: note.id,
      type: note.type,
      title: note.title,
      subject: note.subject,
      tags: Array.isArray(note.tags) ? note.tags : [],
      coverImage: note.cover_image,
      createdAt: note.created_at,
      updatedAt: note.updated_at,
      isPublished: note.is_published,
    }));

    return NextResponse.json(
      { success: true, collections, notes, role: auth.context.actor.role, profile: auth.context.profile },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "合集工作台读取失败";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
