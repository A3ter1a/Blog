"use client";

import { getActiveAiAccountSlot } from "@/lib/auth-session-slot";
import type { CollectionAvailableNote, CollectionOwnerKind, CollectionSummary } from "@/lib/collections-contract";

const CACHE_PREFIX = "asteroid-collection-workspace:";
export const COLLECTION_WORKSPACE_CACHE_TTL_MS = 5 * 60 * 1000;
const COLLECTION_WORKSPACE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type CollectionWorkspaceSnapshot = {
  collections: CollectionSummary[];
  availableNotes: CollectionAvailableNote[];
  role: "admin" | "ai" | null;
  cachedAt: number;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getCacheStorages(): StorageLike[] {
  if (typeof window === "undefined") return [];

  const storages: StorageLike[] = [];
  // localStorage survives an in-app browser view being folded and rebuilt.
  // sessionStorage remains the first choice for the current tab, so a newer
  // in-tab snapshot wins over an older persistent snapshot when both exist.
  for (const name of ["sessionStorage", "localStorage"] as const) {
    try {
      const storage = window[name];
      if (storage && !storages.includes(storage)) storages.push(storage);
    } catch {
      // Private browsing and restricted webviews can deny either storage.
    }
  }
  return storages;
}

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
  return `${CACHE_PREFIX}${getActiveAiAccountSlot() ?? "default"}`;
}

export function readCollectionWorkspaceCache(): CollectionWorkspaceSnapshot | null {
  const key = getCollectionWorkspaceCacheKey();
  for (const storage of getCacheStorages()) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const cached = normalizeSnapshot(JSON.parse(raw));
      if (!cached) continue;
      if (Date.now() - cached.cachedAt > COLLECTION_WORKSPACE_CACHE_MAX_AGE_MS) {
        storage.removeItem(key);
        continue;
      }
      return cached;
    } catch {
      // Ignore malformed entries and continue with the other storage.
    }
  }
  return null;
}

export function writeCollectionWorkspaceCache(snapshot: Omit<CollectionWorkspaceSnapshot, "cachedAt">): void {
  const key = getCollectionWorkspaceCacheKey();
  const value = JSON.stringify({ ...snapshot, cachedAt: Date.now() });
  for (const storage of getCacheStorages()) {
    try {
      storage.setItem(key, value);
    } catch {
      // Ignore private-mode and quota failures; the network path remains usable.
    }
  }
}

export function clearCollectionWorkspaceCache(): void {
  const key = getCollectionWorkspaceCacheKey();
  for (const storage of getCacheStorages()) {
    try {
      storage.removeItem(key);
    } catch {
      // Ignore restricted browser contexts.
    }
  }
}
