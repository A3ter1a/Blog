import { NotesClient } from "@/components/notes/NotesClient";
import { NOTES_PAGE_SIZE } from "@/lib/notes-query";
import { createPageMetadata } from "@/lib/site-metadata";
import type { Note, NoteAuthorKind, NoteType, Subject } from "@/lib/types";
import type { CollectionSummary } from "@/lib/collections-contract";
import {
  getCachedPublishedCollectionSummaries,
  getCachedPublishedNoteSummaries,
} from "@/lib/server-public-cache";

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

type NotesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type InitialDirectoryState = {
  directoryKind: NoteAuthorKind;
  searchQuery: string;
  selectedType: NoteType | "all";
  selectedSubject: Subject | "all";
  sortOrder: "desc" | "asc";
};

function getFirstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseInitialDirectoryState(
  searchParams: Record<string, string | string[] | undefined>,
): InitialDirectoryState {
  const directory = getFirstSearchParam(searchParams.directory);
  const type = getFirstSearchParam(searchParams.type);
  const subject = getFirstSearchParam(searchParams.subject);
  const sort = getFirstSearchParam(searchParams.sort);

  return {
    directoryKind: directory === "ai" ? "ai" : "human",
    searchQuery: (getFirstSearchParam(searchParams.q) ?? "").trim().slice(0, 100),
    selectedType: type === "note" || type === "problem" || type === "essay" ? type : "all",
    selectedSubject: subject === "math" || subject === "english" || subject === "politics" || subject === "economics"
      ? subject
      : "all",
    sortOrder: sort === "asc" ? "asc" : "desc",
  };
}

async function getInitialNotes(authorKind: NoteAuthorKind): Promise<InitialNotesPayload> {
  if (process.env.ASTEROID_OFFLINE_BUILD === "1") {
    return { notes: [], hasMoreNotes: false, loadError: true, collections: [] };
  }

  const [notesResult, collectionsResult] = await Promise.all([
    preloadWithTimeout(
      getCachedPublishedNoteSummaries({
        authorKind,
        sortOrder: "desc",
        limit: NOTES_PAGE_SIZE + 1,
        offset: 0,
      }),
      [],
      "notes",
    ),
    preloadWithTimeout(
      getCachedPublishedCollectionSummaries(),
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

export default async function NotesPage({ searchParams }: NotesPageProps) {
  const initialDirectory = parseInitialDirectoryState(await searchParams);
  const initialNotes = await getInitialNotes(initialDirectory.directoryKind);

  return (
    <NotesClient
      initialNotes={initialNotes.notes}
      initialHasMoreNotes={initialNotes.hasMoreNotes}
      initialLoadError={initialNotes.loadError}
      initialCollections={initialNotes.collections}
      initialDirectoryKind={initialDirectory.directoryKind}
      initialSearchQuery={initialDirectory.searchQuery}
      initialSelectedType={initialDirectory.selectedType}
      initialSelectedSubject={initialDirectory.selectedSubject}
      initialSortOrder={initialDirectory.sortOrder}
    />
  );
}
