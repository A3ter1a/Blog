"use client";

import { getActiveAiAccountSlot } from "@/lib/auth-session-slot";
import type { CollectionAvailableNote, CollectionOwnerKind, CollectionSummary } from "@/lib/collections-contract";
import {
  getSiteCacheKey,
  readSiteCache,
  writeSiteCache,
  clearSiteCache,
} from "@/lib/site-cache";

// The previous implementation used `asteroid-collection-workspace:` in
// localStorage/sessionStorage. The site cache now owns storage, quota
// eviction, and cross-window invalidation while retaining this legacy marker
// in the source for diagnostics and migration notes.
export const COLLECTION_WORKSPACE_CACHE_TTL_MS = 5 * 60 * 1000;
const COLLECTION_WORKSPACE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type CollectionWorkspaceSnapshot = {
  collections: CollectionSummary[];
  availableNotes: CollectionAvailableNote[];
  role: "admin" | "ai" | null;
  cachedAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSubject(value: unknown): CollectionSummary["subject"] {
  return value === "math" || value === "english" || value === "politics" || value === "economics" ? value : null;
}

function isOwnerKind(value: unknown): value is CollectionOwnerKind {
  return value === "human" || value === "ai";
}

function normalizeCollection(value: unknown): CollectionSummary | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.title !== "string") return null;
  if (typeof value.ownerUserId !== "string" || typeof value.itemCount !== "number") return null;
  if (typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") return null;
  return {
    id: value.id,
    ownerUserId: value.ownerUserId,
    ownerKind: isOwnerKind(value.ownerKind) ? value.ownerKind : "human",
    aiProfileId: typeof value.aiProfileId === "string" ? value.aiProfileId : null,
    title: value.title,
    description: typeof value.description === "string" ? value.description : "",
    subject: isSubject(value.subject),
    coverImage: typeof value.coverImage === "string" ? value.coverImage : null,
    isPublished: value.isPublished === true,
    itemCount: Math.max(0, Math.trunc(value.itemCount)),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function normalizeAvailableNote(value: unknown): CollectionAvailableNote | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.title !== "string") return null;
  if (value.type !== "note" && value.type !== "problem" && value.type !== "essay") return null;
  if (typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") return null;
  return {
    id: value.id,
    type: value.type,
    title: value.title,
    subject: isSubject(value.subject),
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string") : [],
    coverImage: typeof value.coverImage === "string" ? value.coverImage : null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    isPublished: value.isPublished === true,
  };
}

function normalizeSnapshot(value: unknown): CollectionWorkspaceSnapshot | null {
  if (!isRecord(value) || !Array.isArray(value.collections) || !Array.isArray(value.availableNotes)) return null;
  if (typeof value.cachedAt !== "number") return null;
  const collections = value.collections.map(normalizeCollection).filter((item): item is CollectionSummary => Boolean(item));
  const availableNotes = value.availableNotes.map(normalizeAvailableNote).filter((item): item is CollectionAvailableNote => Boolean(item));
  return {
    collections,
    availableNotes,
    role: value.role === "admin" || value.role === "ai" ? value.role : null,
    cachedAt: value.cachedAt,
  };
}

export function getCollectionWorkspaceCacheKey(): string {
  const scope = getActiveAiAccountSlot() ? `ai-${getActiveAiAccountSlot()}` : "admin";
  return getSiteCacheKey("collection-workspace", scope);
}

export function readCollectionWorkspaceCache(): CollectionWorkspaceSnapshot | null {
  const cached = readSiteCache<CollectionWorkspaceSnapshot>(
    getCollectionWorkspaceCacheKey(),
    normalizeSnapshot,
    {
      ttlMs: COLLECTION_WORKSPACE_CACHE_TTL_MS,
      maxAgeMs: COLLECTION_WORKSPACE_CACHE_MAX_AGE_MS,
    },
  );
  return cached?.value ?? null;
}

export function writeCollectionWorkspaceCache(snapshot: Omit<CollectionWorkspaceSnapshot, "cachedAt">): void {
  writeSiteCache(getCollectionWorkspaceCacheKey(), { ...snapshot, cachedAt: Date.now() });
}

export function clearCollectionWorkspaceCache(): void {
  clearSiteCache(getCollectionWorkspaceCacheKey());
}
