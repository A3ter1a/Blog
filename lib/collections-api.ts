import type { Tables } from "./database.types";
import { getSupabase } from "./supabase";
import type { CollectionDetail, CollectionItem, CollectionSummary } from "./collections-contract";

type CollectionRow = Tables<"note_collections">;
type CollectionItemRow = Tables<"note_collection_items">;
type NoteRow = Tables<"notes">;

const COLLECTION_FIELDS = "id,owner_user_id,owner_kind,ai_profile_id,title,description,subject,cover_image,is_published,created_at,updated_at";
const ITEM_FIELDS = "id,collection_id,note_id,sort_order,added_by_user_id,created_at,updated_at";
const NOTE_FIELDS = "id,type,title,subject,tags,cover_image,created_at,updated_at,is_published";

function toSummary(row: CollectionRow, itemCount = 0): CollectionSummary {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    ownerKind: row.owner_kind === "ai" ? "ai" : "human",
    aiProfileId: row.ai_profile_id,
    title: row.title,
    description: row.description,
    subject: row.subject,
    coverImage: row.cover_image,
    isPublished: row.is_published,
    itemCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toItem(row: CollectionItemRow, note: NoteRow | null): CollectionItem {
  return {
    id: row.id,
    collectionId: row.collection_id,
    noteId: row.note_id,
    sortOrder: row.sort_order,
    addedByUserId: row.added_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    note: note
      ? {
          id: note.id,
          type: note.type,
          title: note.title,
          subject: note.subject,
          tags: Array.isArray(note.tags) ? note.tags : [],
          coverImage: note.cover_image,
          createdAt: note.created_at,
          updatedAt: note.updated_at,
          isPublished: note.is_published,
        }
      : null,
  };
}

export const collectionsApi = {
  async getPublishedSummaries(limit = 100): Promise<CollectionSummary[]> {
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 100));
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("note_collections")
      .select(COLLECTION_FIELDS)
      .eq("is_published", true)
      .order("updated_at", { ascending: false })
      .limit(safeLimit);
    if (error) throw error;
    const rows = (data ?? []) as unknown as CollectionRow[];
    if (rows.length === 0) return [];
    const { data: items, error: itemError } = await supabase
      .from("note_collection_items")
      .select("collection_id,note_id,sort_order,created_at")
      .in("collection_id", rows.map((row) => row.id))
      // The directory consumes this flat response as the collection order.
      // Keep the database ordering explicit; Supabase does not guarantee row
      // order unless an order clause is present.
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .order("note_id", { ascending: true });
    if (itemError) throw itemError;
    const counts = new Map<string, number>();
    const orderedNoteIds = new Map<string, string[]>();
    for (const item of (items ?? []) as Array<Pick<CollectionItemRow, "collection_id" | "note_id">>) {
      counts.set(item.collection_id, (counts.get(item.collection_id) ?? 0) + 1);
      const noteIds = orderedNoteIds.get(item.collection_id) ?? [];
      noteIds.push(item.note_id);
      orderedNoteIds.set(item.collection_id, noteIds);
    }
    return rows.map((row) => ({
      ...toSummary(row, counts.get(row.id) ?? 0),
      orderedNoteIds: orderedNoteIds.get(row.id) ?? [],
    }));
  },

  async getPublishedById(id: string): Promise<CollectionDetail | null> {
    const supabase = getSupabase();
    const { data: collection, error } = await supabase
      .from("note_collections")
      .select(COLLECTION_FIELDS)
      .eq("id", id)
      .eq("is_published", true)
      .maybeSingle();
    if (error) throw error;
    if (!collection) return null;
    const { data: itemData, error: itemError } = await supabase
      .from("note_collection_items")
      .select(ITEM_FIELDS)
      .eq("collection_id", id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (itemError) throw itemError;
    const itemRows = (itemData ?? []) as unknown as CollectionItemRow[];
    const noteIds = Array.from(new Set(itemRows.map((row) => row.note_id)));
    const noteMap = new Map<string, NoteRow>();
    if (noteIds.length > 0) {
      const { data: noteData, error: noteError } = await supabase
        .from("notes")
        .select(NOTE_FIELDS)
        .in("id", noteIds)
        .eq("is_published", true);
      if (noteError) throw noteError;
      for (const note of (noteData ?? []) as unknown as NoteRow[]) noteMap.set(note.id, note);
    }
    const row = collection as unknown as CollectionRow;
    const items = itemRows.map((item) => toItem(item, noteMap.get(item.note_id) ?? null));
    return { ...toSummary(row, items.length), items };
  },
};
