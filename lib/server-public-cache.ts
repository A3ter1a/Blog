import "server-only";

import { unstable_cache, revalidateTag } from "next/cache";
import { cache } from "react";
import { chaptersApi } from "@/lib/chapters-api";
import { collectionsApi } from "@/lib/collections-api";
import { aiProfilesApi, notesApi, profileApi } from "@/lib/supabase";
import type { CollectionDetail, CollectionSummary } from "@/lib/collections-contract";
import type { Chapter, Note, NoteAuthorKind, Profile } from "@/lib/types";
import type { PublicAiProfile } from "@/lib/ai-profile";

/**
 * Server-side cache for public, session-independent content.
 *
 * Do not add authenticated/owner-scoped reads here. The browser already has
 * a separate account-scoped cache for those views, while this module is safe
 * to share across requests and deployments.
 */
export const PUBLIC_CACHE_TAGS = {
  all: "asteroid:public-content",
  notes: "asteroid:public-notes",
  collections: "asteroid:public-collections",
  chapters: "asteroid:public-chapters",
  profiles: "asteroid:public-profiles",
} as const;

const PUBLIC_CONTENT_REVALIDATE_SECONDS = 60;
const PUBLIC_PROFILE_REVALIDATE_SECONDS = 300;

export type PublicNoteSummaryOptions = {
  authorKind?: NoteAuthorKind;
  sortOrder?: "desc" | "asc";
  limit?: number;
  offset?: number;
};

const getCachedPublishedNoteSummariesInternal = unstable_cache(
  async (
    authorKind: NoteAuthorKind | null,
    sortOrder: "desc" | "asc",
    limit: number | null,
    offset: number,
  ): Promise<Note[]> => notesApi.getSummaries({
    authorKind: authorKind ?? undefined,
    sortOrder,
    limit: limit ?? undefined,
    offset,
    includeCoverImage: false,
  }),
  ["asteroid-public-note-summaries"],
  {
    revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS,
    tags: [PUBLIC_CACHE_TAGS.all, PUBLIC_CACHE_TAGS.notes],
  },
);

const getCachedSitemapNoteSummariesInternal = unstable_cache(
  async (): Promise<Note[]> => notesApi.getSummaries({
    sortOrder: "desc",
    includeCoverImage: false,
  }),
  ["asteroid-public-sitemap-note-summaries"],
  {
    revalidate: 3600,
    tags: [PUBLIC_CACHE_TAGS.all, PUBLIC_CACHE_TAGS.notes],
  },
);

/** React request dedupe prevents metadata/page callers from sharing a query twice. */
export const getCachedPublishedNoteSummaries = cache(
  (options: PublicNoteSummaryOptions = {}) => getCachedPublishedNoteSummariesInternal(
    options.authorKind ?? null,
    options.sortOrder ?? "desc",
    options.limit ?? null,
    options.offset ?? 0,
  ),
);

export const getCachedSitemapNoteSummaries = cache(
  () => getCachedSitemapNoteSummariesInternal(),
);

const getCachedPublishedNoteInternal = unstable_cache(
  async (noteId: string): Promise<Note | null> => notesApi.getPublishedById(noteId),
  ["asteroid-public-note"],
  {
    revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS,
    tags: [PUBLIC_CACHE_TAGS.all, PUBLIC_CACHE_TAGS.notes],
  },
);

export const getCachedPublishedNote = cache(
  (noteId: string) => getCachedPublishedNoteInternal(noteId),
);

const getCachedPublishedCollectionSummariesInternal = unstable_cache(
  async (limit: number): Promise<CollectionSummary[]> => collectionsApi.getPublishedSummaries(limit),
  ["asteroid-public-collection-summaries"],
  {
    revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS,
    tags: [PUBLIC_CACHE_TAGS.all, PUBLIC_CACHE_TAGS.collections],
  },
);

export const getCachedPublishedCollectionSummaries = cache(
  (limit = 100) => getCachedPublishedCollectionSummariesInternal(limit),
);

const getCachedPublishedCollectionInternal = unstable_cache(
  async (collectionId: string): Promise<CollectionDetail | null> => collectionsApi.getPublishedById(collectionId),
  ["asteroid-public-collection"],
  {
    revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS,
    tags: [PUBLIC_CACHE_TAGS.all, PUBLIC_CACHE_TAGS.collections],
  },
);

export const getCachedPublishedCollection = cache(
  (collectionId: string) => getCachedPublishedCollectionInternal(collectionId),
);

const getCachedPublicChaptersInternal = unstable_cache(
  async (noteId: string): Promise<Chapter[]> => chaptersApi.getByNoteId(noteId),
  ["asteroid-public-chapters"],
  {
    revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS,
    tags: [PUBLIC_CACHE_TAGS.all, PUBLIC_CACHE_TAGS.chapters],
  },
);

export const getCachedPublicChapters = cache(
  (noteId: string) => getCachedPublicChaptersInternal(noteId),
);

const getCachedPublicProfileInternal = unstable_cache(
  async (): Promise<Profile> => profileApi.get(),
  ["asteroid-public-site-profile"],
  {
    revalidate: PUBLIC_PROFILE_REVALIDATE_SECONDS,
    tags: [PUBLIC_CACHE_TAGS.all, PUBLIC_CACHE_TAGS.profiles],
  },
);

export const getCachedPublicProfile = cache(
  () => getCachedPublicProfileInternal(),
);

const getCachedPublicAiProfileInternal = unstable_cache(
  async (profileId: string): Promise<PublicAiProfile | null> => aiProfilesApi.getById(profileId),
  ["asteroid-public-ai-profile"],
  {
    revalidate: PUBLIC_PROFILE_REVALIDATE_SECONDS,
    tags: [PUBLIC_CACHE_TAGS.all, PUBLIC_CACHE_TAGS.profiles],
  },
);

export const getCachedPublicAiProfile = cache(
  (profileId: string) => getCachedPublicAiProfileInternal(profileId),
);

/**
 * Route handlers call this after a successful public-content mutation. The
 * `max` profile preserves stale-while-revalidate behavior and avoids making a
 * content edit block on a full database refetch.
 */
export function revalidatePublicContent(): void {
  revalidateTag(PUBLIC_CACHE_TAGS.all, "max");
}
