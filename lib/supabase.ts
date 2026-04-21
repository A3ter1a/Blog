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

// Notes API (使用 getSupabase() 确保延迟初始化)
// 注意: Supabase 类型适配尚未完成，暂时使用 any 绕过
export const notesApi = {
  // Get all notes
  async getAll(): Promise<Note[]> {
    const supabase = getSupabase();
    const { data, error } = await (supabase as any)
      .from("notes")
      .select("*")
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // Get note by ID
  async getById(id: string): Promise<Note | null> {
    const supabase = getSupabase();
    const { data, error } = await (supabase as any)
      .from("notes")
      .select("*")
      .eq("id", id)
      .single();

    if (error) return null;
    return data;
  },

  // Create note
  async create(note: Omit<Note, "id" | "createdAt" | "updatedAt">): Promise<Note> {
    const supabase = getSupabase();
    const { data, error } = await (supabase as any)
      .from("notes")
      .insert([
        {
          type: note.type,
          title: note.title,
          content: note.content,
          subject: note.subject || null,
          tags: note.tags,
          cover_image: note.coverImage || null,
          videos: note.videos || [],
          problems: note.problems || [],
          is_published: note.isPublished,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Update note
  async update(id: string, updates: Partial<Note>): Promise<Note> {
    const supabase = getSupabase();
    const dbUpdates: any = { ...updates, updated_at: new Date().toISOString() };
    // Map camelCase to snake_case
    if (updates.coverImage !== undefined) { dbUpdates.cover_image = updates.coverImage; delete dbUpdates.coverImage; }
    if (updates.isPublished !== undefined) { dbUpdates.is_published = updates.isPublished; delete dbUpdates.isPublished; }
    
    const { data, error } = await (supabase as any)
      .from("notes")
      .update(dbUpdates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Delete note
  async delete(id: string): Promise<void> {
    const supabase = getSupabase();
    const { error } = await (supabase as any).from("notes").delete().eq("id", id);
    if (error) throw error;
  },

  // Search notes
  async search(query: string, type?: NoteType, subject?: Subject): Promise<Note[]> {
    const supabase = getSupabase();
    let q = (supabase as any)
      .from("notes")
      .select("*")
      .eq("is_published", true)
      .or(`title.ilike.%${query}%,content.ilike.%${query}%`);

    if (type) q = q.eq("type", type);
    if (subject) q = q.eq("subject", subject);

    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },
};
