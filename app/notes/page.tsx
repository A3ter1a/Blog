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

type InitialNotesPayload = {
  notes: Note[];
  hasMoreNotes: boolean;
  loadError: boolean;
  collections: CollectionSummary[];
};

async function getInitialNotes(): Promise<InitialNotesPayload> {
  if (process.env.ASTEROID_OFFLINE_BUILD === "1") {
    return { notes: [], hasMoreNotes: false, loadError: true, collections: [] };
  }

  let data: Note[] = [];
  let loadError = false;
  try {
    data = await notesApi.getSummaries({
      authorKind: "human",
      sortOrder: "desc",
      limit: NOTES_PAGE_SIZE + 1,
      offset: 0,
      includeCoverImage: false,
    });
  } catch (error) {
    console.error("Failed to preload notes:", error);
    loadError = true;
  }

  let collections: CollectionSummary[] = [];
  try {
    collections = await collectionsApi.getPublishedSummaries();
  } catch (error) {
    // The collection migration is additive; an older deployment must keep its note directory usable.
    console.warn("Failed to preload collections:", error);
  }

  return {
    notes: data.slice(0, NOTES_PAGE_SIZE),
    hasMoreNotes: data.length > NOTES_PAGE_SIZE,
    loadError,
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
