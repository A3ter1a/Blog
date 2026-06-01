"use client";

import { readJsonStorage, removeStorage, writeJsonStorage } from "@/lib/browser-storage";
import type { Note, NoteType, Subject } from "@/lib/types";

const NOTES_CACHE_PREFIX = "asteroid-notes-page:";
const NOTES_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

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
    isPublished: typeof value.isPublished === "boolean" ? value.isPublished : true,
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
  selectedType: NoteType | "all",
  selectedSubject: Subject | "all",
  sortOrder: "desc" | "asc",
): string | null {
  if (query.trim()) return null;
  return `${NOTES_CACHE_PREFIX}${selectedType}:${selectedSubject}:${sortOrder}`;
}

export function readNotesCache(key: string | null): NotesCachePayload | null {
  if (!key) return null;

  const cached = readJsonStorage<NotesCachePayload | null>(key, null, normalizeNotesCache);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    removeStorage(key);
    return null;
  }

  return cached;
}

export function writeNotesCache(key: string | null, notes: Note[], hasMoreNotes: boolean): void {
  if (!key) return;

  const cachedAt = Date.now();
  writeJsonStorage<NotesCachePayload>(key, {
    notes,
    hasMoreNotes,
    cachedAt,
    expiresAt: cachedAt + NOTES_CACHE_TTL_MS,
  });
}
