"use client";

import { getActiveAiAccountSlot } from "@/lib/auth-session-slot";
import type { CollectionDetail, CollectionItem, CollectionSummary } from "@/lib/collections-contract";
import {
  getSiteCacheKey,
  clearSiteCache,
  clearSiteCacheNamespace,
  readSiteCache,
  siteCacheValuesEqual,
  writeSiteCache,
  type SiteCacheRead,
} from "@/lib/site-cache";

export const COLLECTION_DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;
export const COLLECTION_DETAIL_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeItem(value: unknown): CollectionItem | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.collectionId !== "string" || typeof value.noteId !== "string") return null;
  if (typeof value.sortOrder !== "number" || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") return null;
  const rawNote = isRecord(value.note) ? value.note : null;
  const noteType = rawNote?.type === "note" || rawNote?.type === "problem" || rawNote?.type === "essay" ? rawNote.type : null;
  const note: CollectionItem["note"] = rawNote && typeof rawNote.id === "string" && typeof rawNote.title === "string" && noteType
    ? {
        id: rawNote.id,
        type: noteType,
        title: rawNote.title,
        subject: rawNote.subject === "math" || rawNote.subject === "english" || rawNote.subject === "politics" || rawNote.subject === "economics" ? rawNote.subject : null,
        tags: Array.isArray(rawNote.tags) ? rawNote.tags.filter((tag): tag is string => typeof tag === "string") : [],
        coverImage: typeof rawNote.coverImage === "string" ? rawNote.coverImage : null,
        createdAt: typeof rawNote.createdAt === "string" ? rawNote.createdAt : "",
        updatedAt: typeof rawNote.updatedAt === "string" ? rawNote.updatedAt : "",
        isPublished: rawNote.isPublished === true,
      }
    : null;
  return {
    id: value.id,
    collectionId: value.collectionId,
    noteId: value.noteId,
    sortOrder: value.sortOrder,
    addedByUserId: typeof value.addedByUserId === "string" ? value.addedByUserId : "",
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    note,
  };
}

function normalizeDetail(value: unknown): CollectionDetail | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.ownerUserId !== "string" || typeof value.title !== "string") return null;
  if (typeof value.createdAt !== "string" || typeof value.updatedAt !== "string" || !Array.isArray(value.items)) return null;
  const subject = value.subject === "math" || value.subject === "english" || value.subject === "politics" || value.subject === "economics" ? value.subject : null;
  return {
    id: value.id,
    ownerUserId: value.ownerUserId,
    ownerKind: value.ownerKind === "ai" ? "ai" : "human",
    aiProfileId: typeof value.aiProfileId === "string" ? value.aiProfileId : null,
    title: value.title,
    description: typeof value.description === "string" ? value.description : "",
    subject,
    coverImage: typeof value.coverImage === "string" ? value.coverImage : null,
    isPublished: value.isPublished === true,
    itemCount: typeof value.itemCount === "number" ? Math.max(0, Math.trunc(value.itemCount)) : value.items.length,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    orderedNoteIds: Array.isArray(value.orderedNoteIds) ? value.orderedNoteIds.filter((id): id is string => typeof id === "string") : [],
    items: value.items.map(normalizeItem).filter((item): item is CollectionItem => Boolean(item)),
  };
}

function getScope(): string {
  return getActiveAiAccountSlot() ? `ai-${getActiveAiAccountSlot()}` : "public";
}

export function getCollectionDetailCacheKey(id: string): string {
  return getSiteCacheKey("collection-detail", `${getScope()}-${id}`);
}

export function readCollectionDetailCache(id: string): SiteCacheRead<CollectionDetail> | null {
  return readSiteCache(getCollectionDetailCacheKey(id), normalizeDetail, {
    ttlMs: COLLECTION_DETAIL_CACHE_TTL_MS,
    maxAgeMs: COLLECTION_DETAIL_CACHE_MAX_AGE_MS,
  });
}

export function writeCollectionDetailCache(detail: CollectionDetail): void {
  writeSiteCache(getCollectionDetailCacheKey(detail.id), detail);
}

export function clearCollectionDetailCache(id: string): void {
  clearSiteCache(getCollectionDetailCacheKey(id));
}

export function clearCollectionDetailCaches(): void {
  clearSiteCacheNamespace("collection-detail");
}

export function collectionDetailsEqual(left: CollectionDetail | null, right: CollectionDetail | null): boolean {
  return siteCacheValuesEqual(left, right);
}

export function summaryFromDetail(detail: CollectionDetail): CollectionSummary {
  return {
    id: detail.id,
    ownerUserId: detail.ownerUserId,
    ownerKind: detail.ownerKind,
    aiProfileId: detail.aiProfileId,
    title: detail.title,
    description: detail.description,
    subject: detail.subject,
    coverImage: detail.coverImage,
    isPublished: detail.isPublished,
    itemCount: detail.items.length,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    orderedNoteIds: detail.items.map((item) => item.noteId),
  };
}
