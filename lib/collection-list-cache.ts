"use client";

import { getActiveAiAccountSlot } from "@/lib/auth-session-slot";
import type { CollectionOwnerKind, CollectionSummary } from "@/lib/collections-contract";
import {
  clearSiteCacheNamespace,
  getSiteCacheKey,
  readSiteCache,
  siteCacheValuesEqual,
  writeSiteCache,
  type SiteCacheRead,
} from "@/lib/site-cache";

export const COLLECTION_LIST_CACHE_TTL_MS = 5 * 60 * 1000;
export const COLLECTION_LIST_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSummary(value: unknown): CollectionSummary | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.ownerUserId !== "string" || typeof value.title !== "string") return null;
  if (typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") return null;
  const ownerKind: CollectionOwnerKind = value.ownerKind === "ai" ? "ai" : "human";
  const subject = value.subject === "math" || value.subject === "english" || value.subject === "politics" || value.subject === "economics"
    ? value.subject
    : null;
  return {
    id: value.id,
    ownerUserId: value.ownerUserId,
    ownerKind,
    aiProfileId: typeof value.aiProfileId === "string" ? value.aiProfileId : null,
    title: value.title,
    description: typeof value.description === "string" ? value.description : "",
    subject,
    coverImage: typeof value.coverImage === "string" ? value.coverImage : null,
    isPublished: value.isPublished === true,
    itemCount: typeof value.itemCount === "number" ? Math.max(0, Math.trunc(value.itemCount)) : 0,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    orderedNoteIds: Array.isArray(value.orderedNoteIds)
      ? value.orderedNoteIds.filter((id): id is string => typeof id === "string")
      : [],
  };
}

function normalizeSummaries(value: unknown): CollectionSummary[] | null {
  if (!Array.isArray(value)) return null;
  return value.map(normalizeSummary).filter((item): item is CollectionSummary => Boolean(item));
}

export function getCollectionListCacheScope(ownerKind: "human" | "ai"): string | null {
  if (ownerKind === "ai") {
    const slot = getActiveAiAccountSlot();
    return slot ? `ai-${slot}` : null;
  }
  return "published";
}

export function getCollectionListCacheKey(ownerKind: "human" | "ai"): string | null {
  const scope = getCollectionListCacheScope(ownerKind);
  return scope ? getSiteCacheKey("collection-list", `${ownerKind}-${scope}`) : null;
}

export function readCollectionListCache(ownerKind: "human" | "ai"): SiteCacheRead<CollectionSummary[]> | null {
  const key = getCollectionListCacheKey(ownerKind);
  return key
    ? readSiteCache(key, normalizeSummaries, {
        ttlMs: COLLECTION_LIST_CACHE_TTL_MS,
        maxAgeMs: COLLECTION_LIST_CACHE_MAX_AGE_MS,
      })
    : null;
}

export function writeCollectionListCache(ownerKind: "human" | "ai", summaries: CollectionSummary[]): void {
  const key = getCollectionListCacheKey(ownerKind);
  if (key) writeSiteCache(key, summaries);
}

export function collectionListsEqual(left: CollectionSummary[], right: CollectionSummary[]): boolean {
  return siteCacheValuesEqual(left, right);
}

export function clearCollectionListCache(): void {
  clearSiteCacheNamespace("collection-list");
}
