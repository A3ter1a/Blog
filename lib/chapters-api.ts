import { getSupabase } from './supabase';
import type { Chapter } from './types';

// Map snake_case DB row to camelCase Chapter
function mapChapter(row: any): Chapter {
  return {
    id: row.id,
    noteId: row.note_id || undefined,
    name: row.name,
    parentId: row.parent_id || undefined,
    sortOrder: row.sort_order ?? 0,
    description: row.description || undefined,
    color: row.color || undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export const chaptersApi = {
  // Get all chapters for a note (including global templates where note_id IS NULL)
  async getByNoteId(noteId: string): Promise<Chapter[]> {
    const supabase = getSupabase();
    const { data, error } = await (supabase as any)
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
    const { data, error } = await (supabase as any)
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
    const supabase = getSupabase();
    const { data, error } = await (supabase as any)
      .from('chapters')
      .insert([{
        note_id: chapter.noteId || null,
        name: chapter.name,
        parent_id: chapter.parentId || null,
        sort_order: chapter.sortOrder ?? 0,
        description: chapter.description || null,
        color: chapter.color || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (error) throw error;
    return mapChapter(data);
  },

  // Update a chapter
  async update(id: string, updates: Partial<Chapter>): Promise<Chapter> {
    const supabase = getSupabase();
    const db: any = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) db.name = updates.name;
    if (updates.parentId !== undefined) db.parent_id = updates.parentId || null;
    if (updates.sortOrder !== undefined) db.sort_order = updates.sortOrder;
    if (updates.description !== undefined) db.description = updates.description;
    if (updates.color !== undefined) db.color = updates.color;

    const { data, error } = await (supabase as any)
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
    const supabase = getSupabase();
    const { error } = await (supabase as any).from('chapters').delete().eq('id', id);
    if (error) throw error;
  },

  // Reorder chapters (batch update sortOrder)
  async reorder(ids: string[]): Promise<void> {
    const supabase = getSupabase();
    const updates = ids.map((id, index) => ({
      id,
      sort_order: index,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await (supabase as any).from('chapters').upsert(updates);
    if (error) throw error;
  },
};
