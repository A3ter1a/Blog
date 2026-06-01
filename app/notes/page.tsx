import { NotesClient } from "@/components/notes/NotesClient";
import { NOTES_PAGE_SIZE } from "@/lib/notes-query";
import { notesApi } from "@/lib/supabase";
import type { Note } from "@/lib/types";

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
