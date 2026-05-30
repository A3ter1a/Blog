import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Note, NoteType, Subject, Flashcard, type Problem, type Video } from "./types";

export type NoteRow = {
  id?: string;
  type?: NoteType | null;
  title?: string | null;
  content?: string | null;
  subject?: Subject | null;
  tags?: string[] | null;
  cover_image?: string | null;
  videos?: Video[] | null;
  problems?: Problem[] | null;
  created_at?: string | null;
  updated_at?: string | null;
  is_published?: boolean | null;
};

export type NoteInsert = Partial<NoteRow>;
export type NoteUpdate = Partial<NoteRow>;

export type FlashcardRow = {
  id?: string;
  note_id?: string | null;
  question?: string | null;
  answer?: string | null;
  interval?: number | null;
  repetition?: number | null;
  ease_factor?: number | null;
  next_review?: string | null;
  last_review?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type FlashcardInsert = Partial<FlashcardRow>;
export type FlashcardUpdate = Partial<FlashcardRow>;

export type ChapterRow = {
  id?: string;
  note_id?: string | null;
  name?: string | null;
  parent_id?: string | null;
  sort_order?: number | null;
  description?: string | null;
  color?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ChapterInsert = Partial<ChapterRow>;
export type ChapterUpdate = Partial<ChapterRow>;

type Database = {
  public: {
    Tables: {
      notes: {
        Row: NoteRow;
        Insert: NoteInsert;
        Update: NoteUpdate;
        Relationships: [];
      };
      flashcards: {
        Row: FlashcardRow;
        Insert: FlashcardInsert;
        Update: FlashcardUpdate;
        Relationships: [];
      };
      chapters: {
        Row: ChapterRow;
        Insert: ChapterInsert;
        Update: ChapterUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// 延迟初始化 - 只在变量存在时创建客户端
let _supabase: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> {
  if (!_supabase) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase 未配置。请设置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY");
    }
    _supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
  }
  return _supabase;
}

// 字段转换：snake_case → camelCase
function mapSnakeToCamel(row: NoteRow): Note {
  const createdAt = row.created_at ? new Date(row.created_at) : new Date();
  const updatedAt = row.updated_at ? new Date(row.updated_at) : createdAt;
  
  return {
    id: row.id ?? "",
    type: row.type ?? "note",
    title: row.title ?? "",
    content: row.content ?? "",
    subject: row.subject || undefined,
    tags: Array.isArray(row.tags) ? row.tags : [],
    coverImage: row.cover_image || undefined,
    videos: Array.isArray(row.videos) ? row.videos : [],
    problems: Array.isArray(row.problems) ? row.problems : [],
    createdAt,
    updatedAt,
    isPublished: row.is_published ?? true,
  };
}

// 字段转换：camelCase → snake_case
function mapCamelToSnake(note: Partial<Note>): NoteUpdate {
  const db: NoteUpdate = {};
  if (note.type !== undefined) db.type = note.type;
  if (note.title !== undefined) db.title = note.title;
  if (note.content !== undefined) db.content = note.content;
  if (note.subject !== undefined) db.subject = note.subject;
  if (note.tags !== undefined) db.tags = note.tags;
  if (note.coverImage !== undefined) db.cover_image = note.coverImage;
  if (note.videos !== undefined) db.videos = note.videos;
  if (note.problems !== undefined) db.problems = note.problems;
  if (note.isPublished !== undefined) db.is_published = note.isPublished;
  return db;
}

// Notes API (使用 getSupabase() 确保延迟初始化)
export const notesApi = {
  // Get all notes (optimized: only fetch fields needed for list view)
  async getAll(): Promise<Note[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("notes")
      .select(`
        id,
        type,
        title,
        subject,
        tags,
        cover_image,
        created_at,
        updated_at,
        is_published
      `)
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []).map(mapSnakeToCamel);
  },

  // Get note by ID (fetch all fields for detail view)
  async getById(id: string): Promise<Note | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("notes")
      .select(`
        id,
        type,
        title,
        content,
        subject,
        tags,
        cover_image,
        videos,
        problems,
        created_at,
        updated_at,
        is_published
      `)
      .eq("id", id)
      .single();

    if (error) return null;
    return mapSnakeToCamel(data);
  },

  // Create note
  async create(note: Omit<Note, "id" | "createdAt" | "updatedAt">): Promise<Note> {
    const supabase = getSupabase();
    const dbNote = mapCamelToSnake(note);
    
    const { data, error } = await supabase
      .from("notes")
      .insert([{
        ...dbNote,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (error) throw error;
    return mapSnakeToCamel(data);
  },

  // Update note
  async update(id: string, updates: Partial<Note>): Promise<Note> {
    const supabase = getSupabase();
    const dbUpdates = mapCamelToSnake(updates);
    dbUpdates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("notes")
      .update(dbUpdates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return mapSnakeToCamel(data);
  },

  // Delete note
  async delete(id: string): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase.from("notes").delete().eq("id", id);
    if (error) throw error;
  },

  // Search notes (optimized field selection)
  async search(query: string, type?: NoteType, subject?: Subject): Promise<Note[]> {
    const supabase = getSupabase();
    let q = supabase
      .from("notes")
      .select(`
        id,
        type,
        title,
        subject,
        tags,
        cover_image,
        created_at,
        updated_at,
        is_published
      `)
      .eq("is_published", true)
      .or(`title.ilike.%${query}%,content.ilike.%${query}%`);

    if (type) q = q.eq("type", type);
    if (subject) q = q.eq("subject", subject);

    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(mapSnakeToCamel);
  },
};

// Flashcard API
function mapFlashcardSnakeToCamel(row: FlashcardRow): Flashcard {
  return {
    id: row.id ?? "",
    noteId: row.note_id ?? "",
    question: row.question ?? "",
    answer: row.answer ?? "",
    interval: row.interval || 1,
    repetition: row.repetition || 0,
    easeFactor: row.ease_factor || 2.5,
    nextReview: row.next_review ? new Date(row.next_review) : new Date(),
    lastReview: row.last_review ? new Date(row.last_review) : undefined,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
  };
}

export const flashcardsApi = {
  // Get due flashcards (cards ready for review)
  async getDue(limit: number = 20): Promise<Flashcard[]> {
    const supabase = getSupabase();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("flashcards")
      .select("*")
      .lte("next_review", now)
      .order("next_review", { ascending: true })
      .limit(limit);

    if (error) throw error;
    return (data || []).map(mapFlashcardSnakeToCamel);
  },

  // Get all flashcards for a note
  async getByNoteId(noteId: string): Promise<Flashcard[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("flashcards")
      .select("*")
      .eq("note_id", noteId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return (data || []).map(mapFlashcardSnakeToCamel);
  },

  // Create flashcard
  async create(card: Omit<Flashcard, "id" | "createdAt" | "updatedAt">): Promise<Flashcard> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("flashcards")
      .insert([{
        note_id: card.noteId,
        question: card.question,
        answer: card.answer,
        interval: card.interval,
        repetition: card.repetition,
        ease_factor: card.easeFactor,
        next_review: card.nextReview.toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (error) throw error;
    return mapFlashcardSnakeToCamel(data);
  },

  // Update flashcard (after review)
  async update(id: string, updates: Partial<Flashcard>): Promise<Flashcard> {
    const supabase = getSupabase();
    const dbUpdates: FlashcardUpdate = { updated_at: new Date().toISOString() };
    if (updates.interval !== undefined) dbUpdates.interval = updates.interval;
    if (updates.repetition !== undefined) dbUpdates.repetition = updates.repetition;
    if (updates.easeFactor !== undefined) dbUpdates.ease_factor = updates.easeFactor;
    if (updates.nextReview !== undefined) dbUpdates.next_review = updates.nextReview.toISOString();
    if (updates.lastReview !== undefined) dbUpdates.last_review = updates.lastReview.toISOString();

    const { data, error } = await supabase
      .from("flashcards")
      .update(dbUpdates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return mapFlashcardSnakeToCamel(data);
  },

  // Delete flashcard
  async delete(id: string): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase.from("flashcards").delete().eq("id", id);
    if (error) throw error;
  },

  // Get count of due cards
  async getDueCount(): Promise<number> {
    const supabase = getSupabase();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("flashcards")
      .select("id")
      .lte("next_review", now);

    if (error) throw error;
    return data?.length || 0;
  },
};
