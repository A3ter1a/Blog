"use client";

import { getActiveAiAccountSlot } from "@/lib/auth-session-slot";
import { clearSiteCacheNamespace, getSiteCacheKey, readSiteCache, writeSiteCache } from "@/lib/site-cache";
import type { Note, NoteAuthorKind, NoteType, Subject } from "@/lib/types";

const NOTES_CACHE_TTL_MS = 5 * 60 * 1000;
const NOTES_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type NotesCachePayload = {
  notes: Note[];
  hasMoreNotes: boolean;
  cachedAt: number;
  expiresAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeCachedNote(value: unknown): Note | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.title !== "string") return null;
  if (value.type !== "note" && value.type !== "problem" && value.type !== "essay") return null;

  const createdAt = typeof value.createdAt === "string" || value.createdAt instanceof Date
    ? new Date(value.createdAt)
    : new Date();
  const updatedAt = typeof value.updatedAt === "string" || value.updatedAt instanceof Date
    ? new Date(value.updatedAt)
    : createdAt;

  return {
    id: value.id,
    type: value.type,
    title: value.title,
    content: typeof value.content === "string" ? value.content : "",
    subject: value.subject === "math" || value.subject === "english" || value.subject === "politics" || value.subject === "economics"
      ? value.subject
      : undefined,
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string") : [],
    coverImage: typeof value.coverImage === "string" ? value.coverImage : undefined,
    videos: [],
    problems: [],
    createdAt,
    updatedAt,
    isPublished: typeof value.isPublished === "boolean" ? value.isPublished : false,
    contentVersion: typeof value.contentVersion === "number" ? value.contentVersion : null,
  };
}

function normalizeNotesCache(value: unknown): NotesCachePayload | null {
  if (!isRecord(value) || !Array.isArray(value.notes)) return null;
  if (typeof value.hasMoreNotes !== "boolean") return null;
  if (typeof value.cachedAt !== "number" || typeof value.expiresAt !== "number") return null;

  const notes = value.notes
    .map(normalizeCachedNote)
    .filter((note): note is Note => Boolean(note));

  return {
    notes,
    hasMoreNotes: value.hasMoreNotes,
    cachedAt: value.cachedAt,
    expiresAt: value.expiresAt,
  };
}

export function getNotesCacheKey(
  query: string,
  authorKind: NoteAuthorKind,
  selectedType: NoteType | "all",
  selectedSubject: Subject | "all",
  sortOrder: "desc" | "asc",
): string | null {
  if (query.trim()) return null;
  const accountScope = authorKind === "ai" ? getActiveAiAccountSlot() : "public";
  if (!accountScope) return null;
  // Keep the directory/filter portion explicit so old cache diagnostics remain
  // readable and the AI account slot cannot leak snapshots across windows.
  const filterScope = `${authorKind}:${selectedType}:${selectedSubject}:${sortOrder}`;
  return getSiteCacheKey("notes-list", `${accountScope}-${filterScope}`);
}

export function readNotesCache(key: string | null): NotesCachePayload | null {
  if (!key) return null;

  const cached = readSiteCache<NotesCachePayload>(key, normalizeNotesCache, {
    ttlMs: NOTES_CACHE_TTL_MS,
    maxAgeMs: NOTES_CACHE_MAX_AGE_MS,
  });
  return cached?.value ?? null;
}

export function writeNotesCache(key: string | null, notes: Note[], hasMoreNotes: boolean): void {
  if (!key) return;

  const cachedAt = Date.now();
  writeSiteCache<NotesCachePayload>(key, {
    notes,
    hasMoreNotes,
    cachedAt,
    expiresAt: cachedAt + NOTES_CACHE_TTL_MS,
  });
}

export function clearNotesListCache(): void {
  clearSiteCacheNamespace("notes-list");
}
