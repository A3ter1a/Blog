import { getSupabase, type ChapterInsert, type ChapterRow, type ChapterUpdate } from './supabase';
import { isAdminEmail } from './admin-auth';
import type { Chapter } from './types';

// Map snake_case DB row to camelCase Chapter
function mapChapter(row: ChapterRow): Chapter {
  return {
    id: row.id ?? "",
    noteId: row.note_id || undefined,
    name: row.name ?? "",
    parentId: row.parent_id || undefined,
    sortOrder: row.sort_order ?? 0,
    description: row.description || undefined,
    color: row.color || undefined,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
  };
}

async function assertAdminWrite(): Promise<void> {
  const { data, error } = await getSupabase().auth.getUser();
  const email = data.user?.email;

  if (error || !isAdminEmail(email)) {
    throw new Error('需要管理员登录后才能修改章节');
  }
}

export const chaptersApi = {
  // Get all chapters for a note (including global templates where note_id IS NULL)
  async getByNoteId(noteId: string): Promise<Chapter[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('chapters')
      .select('*')
      .or(`note_id.eq.${noteId},note_id.is.null`)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw error;
    return (data || []).map(mapChapter);
  },

  // Get only global chapter templates (note_id IS NULL)
  async getTemplates(): Promise<Chapter[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('chapters')
      .select('*')
      .is('note_id', null)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw error;
    return (data || []).map(mapChapter);
  },

  // Create a chapter
  async create(chapter: Omit<Chapter, 'id' | 'createdAt' | 'updatedAt'>): Promise<Chapter> {
    await assertAdminWrite();
    const supabase = getSupabase();
    const newChapter: ChapterInsert = {
      note_id: chapter.noteId || null,
      name: chapter.name,
      parent_id: chapter.parentId || null,
      sort_order: chapter.sortOrder ?? 0,
      description: chapter.description || null,
      color: chapter.color || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('chapters')
      .insert([newChapter])
      .select()
      .single();

    if (error) throw error;
    return mapChapter(data);
  },

  // Update a chapter
  async update(id: string, updates: Partial<Chapter>): Promise<Chapter> {
    await assertAdminWrite();
    const supabase = getSupabase();
    const db: ChapterUpdate = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) db.name = updates.name;
    if (updates.parentId !== undefined) db.parent_id = updates.parentId || null;
    if (updates.sortOrder !== undefined) db.sort_order = updates.sortOrder;
    if (updates.description !== undefined) db.description = updates.description;
    if (updates.color !== undefined) db.color = updates.color;

    const { data, error } = await supabase
      .from('chapters')
      .update(db)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return mapChapter(data);
  },

  // Delete a chapter
  async delete(id: string): Promise<void> {
    await assertAdminWrite();
    const supabase = getSupabase();
    const { error } = await supabase.from('chapters').delete().eq('id', id);
    if (error) throw error;
  },

  // Reorder chapters (batch update sortOrder)
  async reorder(ids: string[]): Promise<void> {
    await assertAdminWrite();
    const supabase = getSupabase();
    const updates: ChapterInsert[] = ids.map((id, index) => ({
      id,
      sort_order: index,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from('chapters').upsert(updates);
    if (error) throw error;
  },
};
