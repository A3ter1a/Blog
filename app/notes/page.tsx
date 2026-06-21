import { NotesClient } from "@/components/notes/NotesClient";
import { NOTES_PAGE_SIZE } from "@/lib/notes-query";
import { createPageMetadata } from "@/lib/site-metadata";
import { notesApi } from "@/lib/supabase";
import type { Note } from "@/lib/types";

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
};

async function getInitialNotes(): Promise<InitialNotesPayload> {
  try {
    const data = await notesApi.getSummaries({
      sortOrder: "desc",
      limit: NOTES_PAGE_SIZE + 1,
      offset: 0,
      includeCoverImage: false,
    });

    return {
      notes: data.slice(0, NOTES_PAGE_SIZE),
      hasMoreNotes: data.length > NOTES_PAGE_SIZE,
      loadError: false,
    };
  } catch (error) {
    console.error("Failed to preload notes:", error);
    return {
      notes: [],
      hasMoreNotes: false,
      loadError: true,
    };
  }
}

export default async function NotesPage() {
  const initialNotes = await getInitialNotes();

  return (
    <NotesClient
      initialNotes={initialNotes.notes}
      initialHasMoreNotes={initialNotes.hasMoreNotes}
      initialLoadError={initialNotes.loadError}
    />
  );
}
