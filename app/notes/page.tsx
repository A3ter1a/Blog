import { NotesClient } from "@/components/notes/NotesClient";
import { NOTES_PAGE_SIZE } from "@/lib/notes-query";
import { createPageMetadata } from "@/lib/site-metadata";
import { notesApi } from "@/lib/supabase";
import type { Note } from "@/lib/types";
import { collectionsApi } from "@/lib/collections-api";
import type { CollectionSummary } from "@/lib/collections-contract";

export const metadata = createPageMetadata({
  title: "文章与题集",
  description: "检索和阅读 Asteroid 中沉淀的考研笔记、随笔、数学三题集和复盘材料。",
  path: "/notes",
  keywords: ["考研笔记", "数学三题集", "学习复盘", "LaTeX 笔记"],
});

export const revalidate = 60;

const INITIAL_PRELOAD_TIMEOUT_MS = 2_000;

type InitialNotesPayload = {
  notes: Note[];
  hasMoreNotes: boolean;
  loadError: boolean;
  collections: CollectionSummary[];
};

type PreloadResult<T> = {
  value: T;
  failed: boolean;
};

function preloadWithTimeout<T>(
  task: Promise<T>,
  fallback: T,
  label: string,
): Promise<PreloadResult<T>> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: PreloadResult<T>) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const timeoutId = setTimeout(() => finish({ value: fallback, failed: true }), INITIAL_PRELOAD_TIMEOUT_MS);

    task.then(
      (value) => {
        clearTimeout(timeoutId);
        finish({ value, failed: false });
      },
      (error: unknown) => {
        clearTimeout(timeoutId);
        if (!settled) console.error(`Failed to preload ${label}:`, error);
        finish({ value: fallback, failed: true });
      },
    );
  });
}

async function getInitialNotes(): Promise<InitialNotesPayload> {
  if (process.env.ASTEROID_OFFLINE_BUILD === "1") {
    return { notes: [], hasMoreNotes: false, loadError: true, collections: [] };
  }

  const [notesResult, collectionsResult] = await Promise.all([
    preloadWithTimeout(
      notesApi.getSummaries({
        authorKind: "human",
        sortOrder: "desc",
        limit: NOTES_PAGE_SIZE + 1,
        offset: 0,
        includeCoverImage: false,
      }),
      [],
      "notes",
    ),
    preloadWithTimeout(
      collectionsApi.getPublishedSummaries(),
      [],
      "collections",
    ),
  ]);

  const data = notesResult.value;
  const collections = collectionsResult.value;

  return {
    notes: data.slice(0, NOTES_PAGE_SIZE),
    hasMoreNotes: data.length > NOTES_PAGE_SIZE,
    loadError: notesResult.failed,
    collections,
  };
}

export default async function NotesPage() {
  const initialNotes = await getInitialNotes();

  return (
    <NotesClient
    initialNotes={initialNotes.notes}
    initialHasMoreNotes={initialNotes.hasMoreNotes}
    initialLoadError={initialNotes.loadError}
    initialCollections={initialNotes.collections}
  />
  );
}
