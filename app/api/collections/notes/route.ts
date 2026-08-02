import { NextRequest, NextResponse } from "next/server";
import { getCollectionRequestContext } from "@/lib/server-collection-auth";
import { listCollectionAvailableNotes } from "@/lib/server-note-collections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await getCollectionRequestContext(req);
  if (!auth.ok) return auth.response;
  try {
    const parsed = Number(req.nextUrl.searchParams.get("limit") ?? 120);
    const rows = await listCollectionAvailableNotes(auth.context.supabase, Number.isFinite(parsed) ? parsed : 120);
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
    return NextResponse.json({ success: true, notes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "可加入合集的笔记读取失败";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
