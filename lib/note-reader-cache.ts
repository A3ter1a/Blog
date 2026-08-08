"use client";

import type { PublicAiProfile } from "@/lib/ai-profile";
import type { Chapter, Note } from "@/lib/types";
import { normalizeNoteProblems, normalizeNoteVideos } from "@/lib/supabase";
import {
  clearSiteCache,
  getSiteCacheKey,
  readSiteCache,
  siteCacheValuesEqual,
  writeSiteCache,
  type SiteCacheRead,
} from "@/lib/site-cache";

export const NOTE_READER_CACHE_TTL_MS = 5 * 60 * 1000;
export const NOTE_READER_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeDate(value: unknown): Date | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeNote(value: unknown): Note | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") return null;
  if (value.type !== "note" && value.type !== "problem" && value.type !== "essay") return null;
  const createdAt = normalizeDate(value.createdAt);
  const updatedAt = normalizeDate(value.updatedAt) ?? createdAt;
  if (!createdAt || !updatedAt) return null;
  return {
    id: value.id,
    type: value.type,
    title: value.title,
    content: typeof value.content === "string" ? value.content : "",
    subject: value.subject === "math" || value.subject === "english" || value.subject === "politics" || value.subject === "economics" ? value.subject : undefined,
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string") : [],
    coverImage: typeof value.coverImage === "string" ? value.coverImage : undefined,
    videos: normalizeNoteVideos(value.videos),
    problems: normalizeNoteProblems(value.problems),
    createdAt,
    updatedAt,
    isPublished: value.isPublished === true,
    contentVersion: typeof value.contentVersion === "number" ? value.contentVersion : null,
  };
}

function normalizeChapter(value: unknown): Chapter | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  const createdAt = normalizeDate(value.createdAt);
  const updatedAt = normalizeDate(value.updatedAt) ?? createdAt;
  if (!createdAt || !updatedAt) return null;
  return {
    id: value.id,
    noteId: typeof value.noteId === "string" ? value.noteId : undefined,
    name: value.name,
    parentId: typeof value.parentId === "string" ? value.parentId : undefined,
    sortOrder: typeof value.sortOrder === "number" ? value.sortOrder : 0,
    description: typeof value.description === "string" ? value.description : undefined,
    color: typeof value.color === "string" ? value.color : undefined,
    createdAt,
    updatedAt,
  };
}

function normalizeProfile(value: unknown): PublicAiProfile | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.display_name !== "string") return null;
  if (value.subject !== "math" && value.subject !== "english" && value.subject !== "politics" && value.subject !== "economics") return null;
  return {
    id: value.id,
    account_key: typeof value.account_key === "string" ? value.account_key : "",
    subject: value.subject,
    display_name: value.display_name,
    avatar_url: typeof value.avatar_url === "string" ? value.avatar_url : null,
    bio: typeof value.bio === "string" ? value.bio : "",
    academic_affiliation: typeof value.academic_affiliation === "string" ? value.academic_affiliation : "",
    focus_tags: Array.isArray(value.focus_tags) ? value.focus_tags.filter((tag): tag is string => typeof tag === "string") : [],
    is_active: value.is_active !== false,
  };
}

function noteKey(noteId: string): string {
  return getSiteCacheKey("note-reader", `public-${noteId}`);
}

function chapterKey(noteId: string): string {
  return getSiteCacheKey("note-chapters", `public-${noteId}`);
}

function profileKey(noteId: string): string {
  return getSiteCacheKey("note-author", `public-${noteId}`);
}

const readOptions = { ttlMs: NOTE_READER_CACHE_TTL_MS, maxAgeMs: NOTE_READER_CACHE_MAX_AGE_MS };

export function readPublicNoteCache(noteId: string): SiteCacheRead<Note> | null {
  return readSiteCache(noteKey(noteId), normalizeNote, readOptions);
}

export function writePublicNoteCache(note: Note): void {
  if (!note.isPublished) return;
  writeSiteCache(noteKey(note.id), note);
}

export function readPublicChaptersCache(noteId: string): SiteCacheRead<Chapter[]> | null {
  return readSiteCache(chapterKey(noteId), (value) => Array.isArray(value) ? value.map(normalizeChapter).filter((item): item is Chapter => Boolean(item)) : null, readOptions);
}

export function writePublicChaptersCache(noteId: string, chapters: Chapter[]): void {
  writeSiteCache(chapterKey(noteId), chapters);
}

export function readPublicAuthorProfileCache(noteId: string): SiteCacheRead<PublicAiProfile> | null {
  return readSiteCache(profileKey(noteId), normalizeProfile, readOptions);
}

export function writePublicAuthorProfileCache(noteId: string, profile: PublicAiProfile | null): void {
  if (profile) writeSiteCache(profileKey(noteId), profile);
  else clearSiteCache(profileKey(noteId));
}

export function clearPublicNoteCache(noteId: string): void {
  clearSiteCache(noteKey(noteId));
  clearSiteCache(chapterKey(noteId));
  clearSiteCache(profileKey(noteId));
}

export function noteReaderValuesEqual(left: unknown, right: unknown): boolean {
  return siteCacheValuesEqual(left, right);
}
