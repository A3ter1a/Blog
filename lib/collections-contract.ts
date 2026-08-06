import type { Subject } from "./types";

export type CollectionOwnerKind = "human" | "ai";

export type CollectionSummary = {
  id: string;
  ownerUserId: string;
  ownerKind: CollectionOwnerKind;
  aiProfileId: string | null;
  title: string;
  description: string;
  subject: Subject | null;
  coverImage: string | null;
  isPublished: boolean;
  itemCount: number;
  /** Public directory payloads may include the ordered member note IDs. */
  orderedNoteIds?: string[];
  createdAt: string;
  updatedAt: string;
};

export type CollectionItem = {
  id: string;
  collectionId: string;
  noteId: string;
  sortOrder: number;
  addedByUserId: string;
  createdAt: string;
  updatedAt: string;
  note: {
    id: string;
    type: "note" | "problem" | "essay";
    title: string;
    subject: Subject | null;
    tags: string[];
    coverImage: string | null;
    createdAt: string;
    updatedAt: string;
    isPublished: boolean;
  } | null;
};

export type CollectionDetail = CollectionSummary & {
  items: CollectionItem[];
};

export type CollectionAvailableNote = {
  id: string;
  type: "note" | "problem" | "essay";
  title: string;
  subject: Subject | null;
  tags: string[];
  coverImage: string | null;
  createdAt: string;
  updatedAt: string;
  isPublished: boolean;
};

export type CollectionMutationInput = {
  title?: unknown;
  description?: unknown;
  subject?: unknown;
  coverImage?: unknown;
  isPublished?: unknown;
};

export const COLLECTION_LIMIT = 100;
export const COLLECTION_ITEM_LIMIT = 500;

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function normalizeCollectionTitle(value: unknown, fallback = "未命名合集"): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.slice(0, 180) || fallback;
}

export function normalizeCollectionDescription(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 2000);
}

export function normalizeCollectionSubject(value: unknown): Subject | null {
  return value === "math" || value === "english" || value === "politics" || value === "economics"
    ? value
    : null;
}

export function normalizeCollectionCoverImage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, 2000) : null;
}

export function normalizeCollectionPublished(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeCollectionSortOrder(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(Math.trunc(value), 1_000_000));
}
