import { chaptersApi } from "@/lib/chapters-api";
import { notesApi } from "@/lib/supabase";
import type { Chapter, Note } from "@/lib/types";
import { NoteReaderClient } from "@/components/notes/NoteReaderClient";

export const revalidate = 0;

type NoteReaderPageProps = {
  params: Promise<{ id: string }>;
};

type InitialNotePayload = {
  note: Note | null;
  chapters: Chapter[];
  chaptersLoaded: boolean;
  loadError: boolean;
};

async function getInitialNote(noteId: string): Promise<InitialNotePayload> {
  try {
    const note = await notesApi.getById(noteId);
    if (!note) {
      return {
        note: null,
        chapters: [],
        chaptersLoaded: false,
        loadError: false,
      };
    }

    if (note.type !== "problem") {
      return {
        note,
        chapters: [],
        chaptersLoaded: true,
        loadError: false,
      };
    }

    try {
      const chapters = await chaptersApi.getByNoteId(noteId);
      return {
        note,
        chapters,
        chaptersLoaded: true,
        loadError: false,
      };
    } catch (error) {
      console.error("Failed to preload note chapters:", error);
      return {
        note,
        chapters: [],
        chaptersLoaded: false,
        loadError: false,
      };
    }
  } catch (error) {
    console.error("Failed to preload note:", error);
    return {
      note: null,
      chapters: [],
      chaptersLoaded: false,
      loadError: true,
    };
  }
}

export default async function NoteReaderPage({ params }: NoteReaderPageProps) {
  const { id } = await params;
  const initialData = await getInitialNote(id);

  return (
    <NoteReaderClient
      noteId={id}
      initialNote={initialData.note}
      initialChapters={initialData.chapters}
      initialChaptersLoaded={initialData.chaptersLoaded}
      initialLoadError={initialData.loadError}
    />
  );
}
