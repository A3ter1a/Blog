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
    const [note, chaptersResult] = await Promise.all([
      notesApi.getPublishedById(noteId),
      chaptersApi.getByNoteId(noteId)
        .then((chapters) => ({ chapters, error: null }))
        .catch((error: unknown) => ({ chapters: [] as Chapter[], error })),
    ]);

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

    if (chaptersResult.error) {
      console.error("Failed to preload note chapters:", chaptersResult.error);
      return {
        note,
        chapters: [],
        chaptersLoaded: false,
        loadError: false,
      };
    }

    return {
      note,
      chapters: chaptersResult.chapters,
      chaptersLoaded: true,
      loadError: false,
    };
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
