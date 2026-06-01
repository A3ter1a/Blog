import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Note, NoteType, Subject, Flashcard, type PracticeResult, type Problem, type ProblemPracticeStatus, type Profile, type Video } from "./types";
import { DEFAULT_PROFILE, normalizeProfile } from "./profile";

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
export type NoteCreateInput = Omit<Note, "id" | "createdAt" | "updatedAt"> & Partial<Pick<Note, "createdAt" | "updatedAt">>;
export type NoteSummaryQueryOptions = {
  type?: NoteType;
  subject?: Subject;
  sortOrder?: "desc" | "asc";
  limit?: number;
  offset?: number;
  includeCoverImage?: boolean;
};

export type NoteSearchSummaryOptions = {
  limit?: number;
  includeContent?: boolean;
  includeCoverImage?: boolean;
};

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

export type ProblemPracticeStatusRow = {
  id?: string;
  user_id?: string | null;
  note_id?: string | null;
  problem_id?: string | null;
  round?: number | null;
  attempts?: number | null;
  correct_count?: number | null;
  wrong_count?: number | null;
  last_result?: PracticeResult | null;
  is_mastered?: boolean | null;
  last_practiced_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ProblemPracticeStatusInsert = Partial<ProblemPracticeStatusRow>;
export type ProblemPracticeStatusUpdate = Partial<ProblemPracticeStatusRow>;

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

export type SiteProfileRow = {
  id?: string;
  profile?: Profile | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SiteProfileInsert = Partial<SiteProfileRow>;
export type SiteProfileUpdate = Partial<SiteProfileRow>;

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
      problem_practice_statuses: {
        Row: ProblemPracticeStatusRow;
        Insert: ProblemPracticeStatusInsert;
        Update: ProblemPracticeStatusUpdate;
        Relationships: [];
      };
      chapters: {
        Row: ChapterRow;
        Insert: ChapterInsert;
        Update: ChapterUpdate;
        Relationships: [];
      };
      site_profile: {
        Row: SiteProfileRow;
        Insert: SiteProfileInsert;
        Update: SiteProfileUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const SITE_PROFILE_ID = "main";
const NOTE_SUMMARY_FIELDS_WITH_COVER = `
        id,
        type,
        title,
        subject,
        tags,
        cover_image,
        created_at,
        updated_at,
        is_published
      `;

const NOTE_SUMMARY_FIELDS_WITHOUT_COVER = `
        id,
        type,
        title,
        subject,
        tags,
        created_at,
        updated_at,
        is_published
      `;

function getNoteSummaryFields(includeCoverImage = true): string {
  return includeCoverImage ? NOTE_SUMMARY_FIELDS_WITH_COVER : NOTE_SUMMARY_FIELDS_WITHOUT_COVER;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function normalizeSearchTerm(query: string): string {
  return query
    .trim()
    .replace(/[%,()*{}"\\]/g, " ")
    .replace(/\s+/g, " ");
}

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

export async function assertAdminWrite(): Promise<string> {
  const { data } = await getSupabase().auth.getSession();
  const session = data.session;
  const token = session?.access_token;
  const userId = session?.user.id;

  if (!token || !userId) {
    throw new Error("需要管理员登录后才能修改数据");
  }

  const res = await fetch("/api/auth/admin", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const data: unknown = await res.json().catch(() => null);
    const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
      ? data.error
      : "需要管理员登录后才能修改数据";
    throw new Error(message);
  }
  return userId;
}

async function hasAdminSession(): Promise<boolean> {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;

  if (!token) return false;

  try {
    const res = await fetch("/api/auth/admin", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    return res.ok;
  } catch {
    return false;
  }
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
  // Get note summaries for list view. This intentionally excludes content, videos, and problems.
  async getSummaries(options: NoteSummaryQueryOptions = {}): Promise<Note[]> {
    const supabase = getSupabase();
    const ascending = options.sortOrder === "asc";
    let query = supabase
      .from("notes")
      .select(getNoteSummaryFields(options.includeCoverImage))
      .eq("is_published", true)
      .order("created_at", { ascending });

    if (options.type) query = query.eq("type", options.type);
    if (options.subject) query = query.or(`subject.eq.${options.subject},type.eq.essay`);
    if (typeof options.limit === "number") {
      const from = Math.max(0, options.offset ?? 0);
      query = query.range(from, from + Math.max(1, options.limit) - 1);
    }

    const { data, error } = await query;

    if (error) throw error;
    return ((data || []) as NoteRow[]).map(mapSnakeToCamel);
  },

  async getSummaryCoverImages(ids: string[]): Promise<Record<string, string>> {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return {};

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("notes")
      .select("id, cover_image")
      .eq("is_published", true)
      .in("id", uniqueIds);

    if (error) throw error;

    const rows = (data || []) as Array<Pick<NoteRow, "id" | "cover_image">>;
    return Object.fromEntries(
      rows
        .filter((row) => row.id && row.cover_image)
        .map((row) => [row.id as string, row.cover_image as string]),
    );
  },

  // Backward-compatible alias. Prefer getSummaries() for list pages.
  async getAll(): Promise<Note[]> {
    return notesApi.getSummaries();
  },

  // Get note by ID (fetch all fields for detail view)
  async getById(id: string): Promise<Note | null> {
    const supabase = getSupabase();
    let query = supabase
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
      .eq("id", id);

    if (!(await hasAdminSession())) {
      query = query.eq("is_published", true);
    }

    const { data, error } = await query.single();

    if (error) return null;
    return mapSnakeToCamel(data);
  },

  // Create note
  async create(note: NoteCreateInput): Promise<Note> {
    await assertAdminWrite();
    const supabase = getSupabase();
    const dbNote = mapCamelToSnake(note);
    const createdAt = note.createdAt instanceof Date ? note.createdAt : new Date();
    const updatedAt = note.updatedAt instanceof Date ? note.updatedAt : createdAt;
    
    const { data, error } = await supabase
      .from("notes")
      .insert([{
        ...dbNote,
        created_at: createdAt.toISOString(),
        updated_at: updatedAt.toISOString(),
      }])
      .select()
      .single();

    if (error) throw error;
    return mapSnakeToCamel(data);
  },

  // Update note
  async update(id: string, updates: Partial<Note>): Promise<Note> {
    await assertAdminWrite();
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
    await assertAdminWrite();
    const supabase = getSupabase();
    const { error } = await supabase.from("notes").delete().eq("id", id);
    if (error) throw error;
  },

  // Search note summaries. Content is searchable but not returned to the list page.
  async searchSummaries(
    query: string,
    type?: NoteType,
    subject?: Subject,
    sortOrder: "desc" | "asc" = "desc",
    options: NoteSearchSummaryOptions = {},
  ): Promise<Note[]> {
    const term = normalizeSearchTerm(query);
    if (!term) return [];
    const tagTerms = [...new Set(term.split(" ").filter(Boolean))];
    const maxResults = Math.max(1, Math.min(options.limit ?? 48, 100));

    const supabase = getSupabase();
    const ascending = sortOrder === "asc";

    const baseQuery = () => {
      let q = supabase
        .from("notes")
        .select(getNoteSummaryFields(options.includeCoverImage))
        .eq("is_published", true);

      if (type) q = q.eq("type", type);
      if (subject) q = q.or(`subject.eq.${subject},type.eq.essay`);
      return q;
    };

    const searchQueries = [
      baseQuery()
        .ilike("title", `%${term}%`)
        .order("created_at", { ascending })
        .limit(maxResults),
      baseQuery()
        .overlaps("tags", tagTerms)
        .order("created_at", { ascending })
        .limit(maxResults),
    ];

    if (options.includeContent) {
      searchQueries.push(
        baseQuery()
          .ilike("content", `%${term}%`)
          .order("created_at", { ascending })
          .limit(maxResults),
      );
    }

    const results = await Promise.all(searchQueries);
    for (const result of results) {
      if (result.error) throw result.error;
    }

    const rowsById = new Map<string, NoteRow>();
    for (const result of results) {
      for (const row of (result.data || []) as NoteRow[]) {
        if (row.id) rowsById.set(row.id, row);
      }
    }

    return [...rowsById.values()]
      .map(mapSnakeToCamel)
      .sort((a, b) => {
        const diff = b.createdAt.getTime() - a.createdAt.getTime();
        return sortOrder === "desc" ? diff : -diff;
      })
      .slice(0, maxResults);
  },

  // Backward-compatible alias. Prefer searchSummaries() for list pages.
  async search(query: string, type?: NoteType, subject?: Subject): Promise<Note[]> {
    return notesApi.searchSummaries(query, type, subject);
  },
};

export const profileApi = {
  async get(): Promise<Profile> {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("site_profile")
        .select("profile")
        .eq("id", SITE_PROFILE_ID)
        .maybeSingle();

      if (error || !data?.profile) return DEFAULT_PROFILE;
      return normalizeProfile(data.profile);
    } catch {
      return DEFAULT_PROFILE;
    }
  },

  async update(profile: Profile): Promise<Profile> {
    await assertAdminWrite();

    const supabase = getSupabase();
    const nextProfile = normalizeProfile(profile);
    const { data, error } = await supabase
      .from("site_profile")
      .upsert({
        id: SITE_PROFILE_ID,
        profile: nextProfile,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" })
      .select("profile")
      .single();

    if (error) throw error;
    return normalizeProfile(data.profile);
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
    await assertAdminWrite();
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
    await assertAdminWrite();
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
    await assertAdminWrite();
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

function mapPracticeStatusSnakeToCamel(row: ProblemPracticeStatusRow): ProblemPracticeStatus {
  const createdAt = row.created_at ? new Date(row.created_at) : new Date();
  const updatedAt = row.updated_at ? new Date(row.updated_at) : createdAt;

  return {
    id: row.id ?? "",
    noteId: row.note_id ?? "",
    problemId: row.problem_id ?? "",
    round: row.round ?? 0,
    attempts: row.attempts ?? 0,
    correctCount: row.correct_count ?? 0,
    wrongCount: row.wrong_count ?? 0,
    lastResult: row.last_result || undefined,
    isMastered: row.is_mastered ?? false,
    lastPracticedAt: row.last_practiced_at ? new Date(row.last_practiced_at) : undefined,
    createdAt,
    updatedAt,
  };
}

export const problemPracticeApi = {
  async getByNoteId(noteId: string): Promise<ProblemPracticeStatus[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("problem_practice_statuses")
      .select("*")
      .eq("note_id", noteId);

    if (error) throw error;
    return (data || []).map(mapPracticeStatusSnakeToCamel);
  },

  async recordResult(
    noteId: string,
    problemId: string,
    result: PracticeResult,
    current?: ProblemPracticeStatus
  ): Promise<ProblemPracticeStatus> {
    const userId = await assertAdminWrite();
    const supabase = getSupabase();
    const now = new Date().toISOString();
    const nextRound = (current?.round ?? 0) + 1;
    const nextAttempts = (current?.attempts ?? 0) + 1;

    const payload: ProblemPracticeStatusInsert = {
      user_id: userId,
      note_id: noteId,
      problem_id: problemId,
      round: nextRound,
      attempts: nextAttempts,
      correct_count: (current?.correctCount ?? 0) + (result === "correct" ? 1 : 0),
      wrong_count: (current?.wrongCount ?? 0) + (result === "wrong" ? 1 : 0),
      last_result: result,
      is_mastered: result === "correct" && nextRound >= 2,
      last_practiced_at: now,
      updated_at: now,
      created_at: current ? undefined : now,
    };

    const { data, error } = await supabase
      .from("problem_practice_statuses")
      .upsert(payload, { onConflict: "user_id,note_id,problem_id" })
      .select()
      .single();

    if (error) throw error;
    return mapPracticeStatusSnakeToCamel(data);
  },

  async reset(noteId: string, problemId: string): Promise<void> {
    const userId = await assertAdminWrite();
    const supabase = getSupabase();
    const { error } = await supabase
      .from("problem_practice_statuses")
      .delete()
      .eq("user_id", userId)
      .eq("note_id", noteId)
      .eq("problem_id", problemId);

    if (error) throw error;
  },
};
