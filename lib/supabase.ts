import { createClient } from "@supabase/supabase-js";
import { Note, NoteType, Subject } from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// 延迟初始化 - 只在变量存在时创建客户端
let _supabase: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (!_supabase) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase 未配置。请设置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY");
    }
    _supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _supabase;
}

// 字段转换：snake_case → camelCase
function mapSnakeToCamel(row: any): Note {
  const createdAt = row.created_at ? new Date(row.created_at) : new Date();
  const updatedAt = row.updated_at ? new Date(row.updated_at) : createdAt;
  
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    content: row.content,
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
function mapCamelToSnake(note: Partial<Note>): any {
  const db: any = {};
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
    const { data, error } = await (supabase as any)
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
    
    const { data, error } = await (supabase as any)
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
