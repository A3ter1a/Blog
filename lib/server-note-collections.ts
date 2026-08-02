import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert, TablesUpdate } from "./supabase-schema";
import {
  COLLECTION_ITEM_LIMIT,
  COLLECTION_LIMIT,
  normalizeCollectionCoverImage,
  normalizeCollectionDescription,
  normalizeCollectionPublished,
  normalizeCollectionSortOrder,
  normalizeCollectionSubject,
  normalizeCollectionTitle,
  type CollectionDetail,
  type CollectionItem,
  type CollectionOwnerKind,
  type CollectionSummary,
} from "./collections-contract";
import type { Subject } from "./types";

type ServerSupabase = SupabaseClient<Database>;
type CollectionRow = Tables<"note_collections">;
type CollectionItemRow = Tables<"note_collection_items">;
type NoteRow = Tables<"notes">;

const COLLECTION_FIELDS = [
  "id",
  "owner_user_id",
  "owner_kind",
  "ai_profile_id",
  "title",
  "description",
  "subject",
  "cover_image",
  "is_published",
  "created_at",
  "updated_at",
].join(",");

const ITEM_FIELDS = [
  "id",
  "collection_id",
  "note_id",
  "sort_order",
  "added_by_user_id",
  "created_at",
  "updated_at",
].join(",");

const NOTE_FIELDS = [
  "id",
  "type",
  "title",
  "subject",
  "tags",
  "cover_image",
  "created_at",
  "updated_at",
  "is_published",
].join(",");

export type CollectionActor = {
  userId: string;
  role: "admin" | "ai";
  aiProfileId?: string | null;
  subject?: Subject | null;
};

export class CollectionWorkflowError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CollectionWorkflowError";
    this.status = status;
  }
}

function isOwnerKind(value: unknown): value is CollectionOwnerKind {
  return value === "human" || value === "ai";
}

function asSubject(value: unknown): Subject | null {
  return normalizeCollectionSubject(value);
}

function toSummary(row: CollectionRow, itemCount = 0): CollectionSummary {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    ownerKind: isOwnerKind(row.owner_kind) ? row.owner_kind : "human",
    aiProfileId: row.ai_profile_id,
    title: row.title,
    description: row.description,
    subject: asSubject(row.subject),
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
          subject: asSubject(note.subject),
          tags: Array.isArray(note.tags) ? note.tags : [],
          coverImage: note.cover_image,
          createdAt: note.created_at,
          updatedAt: note.updated_at,
          isPublished: note.is_published,
        }
      : null,
  };
}

async function countItems(
  supabase: ServerSupabase,
  collectionIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (collectionIds.length === 0) return counts;

  const { data, error } = await supabase
    .from("note_collection_items")
    .select("collection_id")
    .in("collection_id", collectionIds)
    .limit(collectionIds.length * COLLECTION_ITEM_LIMIT);
  if (error) throw error;
  for (const row of (data ?? []) as Array<Pick<CollectionItemRow, "collection_id">>) {
    counts.set(row.collection_id, (counts.get(row.collection_id) ?? 0) + 1);
  }
  return counts;
}

export async function listNoteCollections(
  supabase: ServerSupabase,
  options: { publishedOnly?: boolean; limit?: number; ownerUserId?: string } = {},
): Promise<CollectionSummary[]> {
  const limit = Math.max(1, Math.min(Math.trunc(options.limit ?? COLLECTION_LIMIT), COLLECTION_LIMIT));
  let query = supabase
    .from("note_collections")
    .select(COLLECTION_FIELDS)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (options.publishedOnly) query = query.eq("is_published", true);
  if (options.ownerUserId) query = query.eq("owner_user_id", options.ownerUserId);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as CollectionRow[];
  const counts = await countItems(supabase, rows.map((row) => row.id));
  return rows.map((row) => toSummary(row, counts.get(row.id) ?? 0));
}

export async function getNoteCollection(
  supabase: ServerSupabase,
  collectionId: string,
): Promise<CollectionDetail | null> {
  const { data: collection, error: collectionError } = await supabase
    .from("note_collections")
    .select(COLLECTION_FIELDS)
    .eq("id", collectionId)
    .maybeSingle();
  if (collectionError) throw collectionError;
  if (!collection) return null;

  const { data: itemData, error: itemError } = await supabase
    .from("note_collection_items")
    .select(ITEM_FIELDS)
    .eq("collection_id", collectionId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(COLLECTION_ITEM_LIMIT);
  if (itemError) throw itemError;

  const itemRows = (itemData ?? []) as unknown as CollectionItemRow[];
  const noteIds = Array.from(new Set(itemRows.map((item) => item.note_id)));
  const notes = new Map<string, NoteRow>();
  if (noteIds.length > 0) {
    const { data: noteData, error: noteError } = await supabase
      .from("notes")
      .select(NOTE_FIELDS)
      .in("id", noteIds);
    if (noteError) throw noteError;
    for (const row of (noteData ?? []) as unknown as NoteRow[]) notes.set(row.id, row);
  }

  const row = collection as unknown as CollectionRow;
  const items = itemRows.map((item) => toItem(item, notes.get(item.note_id) ?? null));
  return { ...toSummary(row, items.length), items };
}

export async function createNoteCollection(
  supabase: ServerSupabase,
  actor: CollectionActor,
  input: {
    title?: unknown;
    description?: unknown;
    subject?: unknown;
    coverImage?: unknown;
    isPublished?: unknown;
    ownerKind?: unknown;
    ownerUserId?: unknown;
    aiProfileId?: unknown;
  },
): Promise<CollectionSummary> {
  const ownerKind: CollectionOwnerKind = actor.role === "ai"
    ? "ai"
    : isOwnerKind(input.ownerKind) ? input.ownerKind : "human";
  const ownerUserId = actor.role === "ai"
    ? actor.userId
    : typeof input.ownerUserId === "string" && input.ownerUserId ? input.ownerUserId : actor.userId;
  const aiProfileId = ownerKind === "ai"
    ? actor.role === "ai" ? actor.userId : typeof input.aiProfileId === "string" ? input.aiProfileId : null
    : null;

  if (ownerKind === "ai" && !aiProfileId) {
    throw new CollectionWorkflowError("AI 合集必须绑定 AI 角色资料。", 400);
  }

  const insert: TablesInsert<"note_collections"> = {
    owner_user_id: ownerUserId,
    owner_kind: ownerKind,
    ai_profile_id: aiProfileId,
    title: normalizeCollectionTitle(input.title),
    description: normalizeCollectionDescription(input.description),
    subject: normalizeCollectionSubject(input.subject) ?? actor.subject ?? null,
    cover_image: normalizeCollectionCoverImage(input.coverImage),
    is_published: actor.role === "admin" ? normalizeCollectionPublished(input.isPublished) : false,
  };

  const { data, error } = await supabase
    .from("note_collections")
    .insert(insert)
    .select(COLLECTION_FIELDS)
    .single();
  if (error) throw error;
  return toSummary(data as unknown as CollectionRow, 0);
}

export async function updateNoteCollection(
  supabase: ServerSupabase,
  actor: CollectionActor,
  collectionId: string,
  input: {
    title?: unknown;
    description?: unknown;
    subject?: unknown;
    coverImage?: unknown;
    isPublished?: unknown;
  },
): Promise<CollectionSummary | null> {
  const update: TablesUpdate<"note_collections"> = {};
  if (input.title !== undefined) update.title = normalizeCollectionTitle(input.title);
  if (input.description !== undefined) update.description = normalizeCollectionDescription(input.description);
  if (input.subject !== undefined) update.subject = normalizeCollectionSubject(input.subject);
  if (input.coverImage !== undefined) update.cover_image = normalizeCollectionCoverImage(input.coverImage);
  if (actor.role === "admin" && input.isPublished !== undefined) {
    update.is_published = normalizeCollectionPublished(input.isPublished);
  }
  if (Object.keys(update).length === 0) throw new CollectionWorkflowError("没有可更新的合集字段。", 400);

  const { data, error } = await supabase
    .from("note_collections")
    .update(update)
    .eq("id", collectionId)
    .select(COLLECTION_FIELDS)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as CollectionRow;
  const counts = await countItems(supabase, [collectionId]);
  return toSummary(row, counts.get(collectionId) ?? 0);
}

export async function deleteNoteCollection(
  supabase: ServerSupabase,
  collectionId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("note_collections")
    .delete()
    .eq("id", collectionId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function addNoteToCollection(
  supabase: ServerSupabase,
  actor: CollectionActor,
  collectionId: string,
  noteId: string,
  sortOrder?: unknown,
): Promise<CollectionDetail | null> {
  const { data: lastItem, error: lastItemError } = await supabase
    .from("note_collection_items")
    .select("sort_order")
    .eq("collection_id", collectionId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastItemError) throw lastItemError;

  const nextSortOrder = sortOrder === undefined
    ? ((lastItem as Pick<CollectionItemRow, "sort_order"> | null)?.sort_order ?? -1) + 1
    : normalizeCollectionSortOrder(sortOrder);
  const insert: TablesInsert<"note_collection_items"> = {
    collection_id: collectionId,
    note_id: noteId,
    sort_order: nextSortOrder,
    added_by_user_id: actor.userId,
  };
  const { error } = await supabase.from("note_collection_items").insert(insert);
  if (error) throw error;
  return getNoteCollection(supabase, collectionId);
}

export async function updateCollectionItemOrder(
  supabase: ServerSupabase,
  collectionId: string,
  itemId: string,
  sortOrder: unknown,
): Promise<CollectionDetail | null> {
  const { error } = await supabase
    .from("note_collection_items")
    .update({ sort_order: normalizeCollectionSortOrder(sortOrder) })
    .eq("id", itemId)
    .eq("collection_id", collectionId);
  if (error) throw error;
  return getNoteCollection(supabase, collectionId);
}

export async function removeNoteFromCollection(
  supabase: ServerSupabase,
  collectionId: string,
  itemId?: string,
  noteId?: string,
): Promise<CollectionDetail | null> {
  let query = supabase.from("note_collection_items").delete().eq("collection_id", collectionId);
  if (itemId) query = query.eq("id", itemId);
  else if (noteId) query = query.eq("note_id", noteId);
  else throw new CollectionWorkflowError("缺少合集项目 ID。", 400);
  const { error } = await query;
  if (error) throw error;
  return getNoteCollection(supabase, collectionId);
}

export async function listCollectionAvailableNotes(
  supabase: ServerSupabase,
  limit = 120,
): Promise<Array<Pick<NoteRow, "id" | "type" | "title" | "subject" | "tags" | "cover_image" | "created_at" | "updated_at" | "is_published">>> {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 200));
  const { data, error } = await supabase
    .from("notes")
    .select(NOTE_FIELDS)
    .order("updated_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw error;
  return (data ?? []) as unknown as Array<Pick<NoteRow, "id" | "type" | "title" | "subject" | "tags" | "cover_image" | "created_at" | "updated_at" | "is_published">>;
}
