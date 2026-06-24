import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Note, NoteType, Profile, Subject } from "./types";
import { DEFAULT_PROFILE, normalizeProfile } from "./profile";
import type { Database, NoteRow, NoteUpdate } from "./supabase-schema";

export type {
  ChapterInsert,
  ChapterRow,
  ChapterUpdate,
  Database,
  Math3SelfTestInsert,
  Math3SelfTestRow,
  Math3SelfTestUpdate,
  NoteInsert,
  NoteRow,
  NoteUpdate,
  ProblemPracticeStatusInsert,
  ProblemPracticeStatusRow,
  ProblemPracticeStatusUpdate,
  SiteProfileInsert,
  SiteProfileRow,
  SiteProfileUpdate,
} from "./supabase-schema";

export type NoteCreateInput = Omit<Note, "id" | "createdAt" | "updatedAt"> & Partial<Pick<Note, "createdAt" | "updatedAt">>;
export type NoteMutationMeta = {
  id: string;
  updatedAt: Date;
};
export type NoteSummaryQueryOptions = {
  type?: NoteType;
  subject?: Subject;
  sortOrder?: "desc" | "asc";
  limit?: number;
  offset?: number;
  includeCoverImage?: boolean;
  includeProblems?: boolean;
};

export type NoteSearchSummaryOptions = {
  limit?: number;
  includeContent?: boolean;
  includeCoverImage?: boolean;
};

export type NoteQAReadOptions = {
  type?: NoteType;
  subject?: Subject;
  limit?: number;
};

const SITE_PROFILE_ID = "main";
const NOTE_DETAIL_FIELDS = `
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
      `;

const NOTE_QA_FIELDS = `
        id,
        type,
        title,
        content,
        subject,
        tags,
        problems,
        created_at,
        updated_at,
        is_published
      `;

const NOTE_PRACTICE_FIELDS = `
        id,
        type,
        title,
        subject,
        tags,
        problems,
        created_at,
        updated_at,
        is_published
      `;

function getNoteSummaryFields(includeCoverImage = true, includeProblems = false): string {
  return [
    "id",
    "type",
    "title",
    "subject",
    "tags",
    includeCoverImage ? "cover_image" : null,
    includeProblems ? "problems" : null,
    "created_at",
    "updated_at",
    "is_published",
  ].filter(Boolean).join(",");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const ADMIN_WRITE_ASSERTION_TTL_MS = 60 * 1000;

let cachedAdminWriteAssertion: {
  token: string;
  userId: string;
  expiresAt: number;
} | null = null;

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
    cachedAdminWriteAssertion = null;
    throw new Error("需要管理员登录后才能修改数据");
  }

  if (
    cachedAdminWriteAssertion
    && cachedAdminWriteAssertion.token === token
    && cachedAdminWriteAssertion.userId === userId
    && cachedAdminWriteAssertion.expiresAt > Date.now()
  ) {
    return userId;
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

  cachedAdminWriteAssertion = {
    token,
    userId,
    expiresAt: Date.now() + ADMIN_WRITE_ASSERTION_TTL_MS,
  };

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

async function readPracticeSets(ids: string[], publishedOnly: boolean): Promise<Note[]> {
  const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const orderById = new Map(uniqueIds.map((id, index) => [id, index]));
  let query = getSupabase()
    .from("notes")
    .select(NOTE_PRACTICE_FIELDS)
    .in("id", uniqueIds)
    .eq("type", "problem");

  if (publishedOnly) {
    query = query.eq("is_published", true);
  }

  const { data, error } = await query;

  if (error) throw error;

  return ((data || []) as NoteRow[])
    .map(mapSnakeToCamel)
    .sort((a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0));
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
  // Get note summaries for list view. By default this excludes content, videos, and problems.
  async getSummaries(options: NoteSummaryQueryOptions = {}): Promise<Note[]> {
    const supabase = getSupabase();
    const ascending = options.sortOrder === "asc";
    let query = supabase
      .from("notes")
      .select(getNoteSummaryFields(options.includeCoverImage, options.includeProblems))
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
      .select(NOTE_DETAIL_FIELDS)
      .eq("id", id);

    if (!(await hasAdminSession())) {
      query = query.eq("is_published", true);
    }

    const { data, error } = await query.single();

    if (error) return null;
    return mapSnakeToCamel(data);
  },

  // Admin edit page read. The page is already guarded by AdminGate, so avoid
  // an extra /api/auth/admin round trip before loading the editable payload.
  async getEditableById(id: string): Promise<Note | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("notes")
      .select(NOTE_DETAIL_FIELDS)
      .eq("id", id)
      .single();

    if (error) return null;
    return mapSnakeToCamel(data);
  },

  // Public detail read for the article/problem reading page. Avoids the admin-session round trip.
  async getPublishedById(id: string): Promise<Note | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("notes")
      .select(NOTE_DETAIL_FIELDS)
      .eq("id", id)
      .eq("is_published", true)
      .single();

    if (error) return null;
    return mapSnakeToCamel(data);
  },

  // Get the fields required by the practice page without loading note content, videos, or cover image.
  async getPracticeSet(id: string): Promise<Note | null> {
    const sets = await notesApi.getPracticeSets([id]);
    return sets[0] ?? null;
  },

  async getPracticeSets(ids: string[]): Promise<Note[]> {
    return readPracticeSets(ids, !(await hasAdminSession()));
  },

  async getPublishedPracticeSets(ids: string[]): Promise<Note[]> {
    return readPracticeSets(ids, true);
  },

  // Public read for the lightweight note Q&A tool. Keep this separate from
  // list/detail reads so the Q&A route can fetch content without slowing pages.
  async getQuestionAnswerSources(options: NoteQAReadOptions = {}): Promise<Note[]> {
    const supabase = getSupabase();
    const limit = Math.max(1, Math.min(options.limit ?? 120, 200));
    let query = supabase
      .from("notes")
      .select(NOTE_QA_FIELDS)
      .eq("is_published", true)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (options.type) query = query.eq("type", options.type);
    if (options.subject) query = query.eq("subject", options.subject);

    const { data, error } = await query;

    if (error) throw error;
    return ((data || []) as NoteRow[]).map(mapSnakeToCamel);
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
      .select(NOTE_DETAIL_FIELDS)
      .single();

    if (error) throw error;
    return mapSnakeToCamel(data);
  },

  // Create note and return only lightweight mutation metadata.
  async createLight(note: NoteCreateInput): Promise<NoteMutationMeta> {
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
      .select("id, updated_at")
      .single();

    if (error) throw error;
    return {
      id: data.id ?? "",
      updatedAt: data.updated_at ? new Date(data.updated_at) : updatedAt,
    };
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
      .select(NOTE_DETAIL_FIELDS)
      .single();

    if (error) throw error;
    return mapSnakeToCamel(data);
  },

  // Update note and return only lightweight mutation metadata.
  async updateLight(id: string, updates: Partial<Note>): Promise<NoteMutationMeta> {
    await assertAdminWrite();
    const supabase = getSupabase();
    const dbUpdates = mapCamelToSnake(updates);
    const updatedAt = new Date();
    dbUpdates.updated_at = updatedAt.toISOString();

    const { data, error } = await supabase
      .from("notes")
      .update(dbUpdates)
      .eq("id", id)
      .select("id, updated_at")
      .single();

    if (error) throw error;
    return {
      id: data.id ?? id,
      updatedAt: data.updated_at ? new Date(data.updated_at) : updatedAt,
    };
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
