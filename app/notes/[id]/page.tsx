import type { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import type { Chapter, Note } from "@/lib/types";
import { NoteReaderClient, type CollectionReaderNavigation } from "@/components/notes/NoteReaderClient";
import {
  getCachedPublicChapters,
  getCachedPublishedCollection,
  getCachedPublishedNote,
} from "@/lib/server-public-cache";
import {
  SITE_NAME,
  createNoIndexMetadata,
  getNoteDescription,
  getShareableImageUrl,
} from "@/lib/site-metadata";
import { isPreloadTimeout, withTimeout } from "@/lib/with-timeout";
import { toIsoDateString } from "@/lib/utils";
import { getCollectionIdFromReturnPath, getSafeNotesReturnPath } from "@/lib/note-routes";

// Public note pages are ISR-friendly. The client reader still performs a
// stale-while-revalidate refresh so a returning reader can paint immediately
// from its local snapshot while newly published content propagates.
export const revalidate = 60;

type NoteReaderPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
};

type InitialNotePayload = {
  note: Note | null;
  chapters: Chapter[];
  chaptersLoaded: boolean;
  loadError: boolean;
};

const getPublishedNote = getCachedPublishedNote;
const SERVER_PRELOAD_TIMEOUT_MS = 1_500;

async function getInitialNote(noteId: string): Promise<InitialNotePayload> {
  try {
    const note = await withTimeout(getPublishedNote(noteId), SERVER_PRELOAD_TIMEOUT_MS);

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
      const chapters = await withTimeout(getCachedPublicChapters(noteId), SERVER_PRELOAD_TIMEOUT_MS);
      return {
        note,
        chapters,
        chaptersLoaded: true,
        loadError: false,
      };
    } catch (error) {
      if (!isPreloadTimeout(error)) console.error("Failed to preload note chapters:", error);
      return {
        note,
        chapters: [],
        chaptersLoaded: false,
        loadError: false,
      };
    }
  } catch (error) {
    if (!isPreloadTimeout(error)) console.error("Failed to preload note:", error);
    return {
      note: null,
      chapters: [],
      chaptersLoaded: false,
      loadError: true,
    };
  }
}

export async function generateMetadata(
  { params }: NoteReaderPageProps,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { id } = await params;
  let note: Note | null;
  try {
    note = await withTimeout(getPublishedNote(id), SERVER_PRELOAD_TIMEOUT_MS);
  } catch (error) {
    // Metadata must not turn a temporary data-source failure into a route-level
    // error page. The reader itself has a recoverable loading state and retry.
    if (!isPreloadTimeout(error)) console.error("Failed to preload note metadata:", error);
    return createNoIndexMetadata({
      title: "笔记",
      description: "Asteroid 学习笔记。",
      path: `/notes/${id}`,
    });
  }

  if (!note) {
    return createNoIndexMetadata({
      title: "笔记不存在",
      description: "这篇内容可能尚未发布、已经移除，或当前没有公开访问权限。",
      path: `/notes/${id}`,
    });
  }

  const description = getNoteDescription(note);
  const shareImage = getShareableImageUrl(note.coverImage);
  const previousImages = (await parent).openGraph?.images ?? [];

  return {
    title: note.title,
    description,
    alternates: {
      canonical: `/notes/${note.id}`,
    },
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      title: note.title,
      description,
      url: `/notes/${note.id}`,
      publishedTime: toIsoDateString(note.createdAt),
      modifiedTime: toIsoDateString(note.updatedAt),
      tags: note.tags,
      images: [
        {
          url: shareImage,
          alt: note.coverImage ? note.title : "Asteroid",
        },
        ...previousImages,
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: note.title,
      description,
      images: [shareImage],
    },
  };
}

export default async function NoteReaderPage({ params, searchParams }: NoteReaderPageProps) {
  const { id } = await params;
  const rawReturnPath = (await searchParams).from;
  const returnPath = Array.isArray(rawReturnPath) ? rawReturnPath[0] : rawReturnPath;
  const backHref = getSafeNotesReturnPath(returnPath);
  const collectionId = getCollectionIdFromReturnPath(backHref);
  const preferHistoryBack = Boolean(returnPath && returnPath === backHref);
  const [initialData, collection] = await Promise.all([
    getInitialNote(id),
    collectionId
      ? withTimeout(getCachedPublishedCollection(collectionId), SERVER_PRELOAD_TIMEOUT_MS).catch((error: unknown) => {
          if (!isPreloadTimeout(error)) console.error("Failed to preload collection navigation:", error);
          return null;
        })
      : Promise.resolve(null),
  ]);

  if (!initialData.loadError && !initialData.note) {
    notFound();
  }

  let collectionNavigation: CollectionReaderNavigation | null = null;
  if (collection && initialData.note) {
    const readableItems = collection.items.filter((item) => item.note?.isPublished && item.note.type !== "problem");
    const currentIndex = readableItems.findIndex((item) => item.note?.id === initialData.note?.id);
    if (currentIndex >= 0) {
      const previous = readableItems[currentIndex - 1]?.note;
      const next = readableItems[currentIndex + 1]?.note;
      collectionNavigation = {
        collectionTitle: collection.title,
        returnHref: `/collections/${collection.id}`,
        previous: previous ? { id: previous.id, title: previous.title, isPublished: previous.isPublished } : undefined,
        next: next ? { id: next.id, title: next.title, isPublished: next.isPublished } : undefined,
      };
    }
  }

  return (
    <NoteReaderClient
      noteId={id}
      initialNote={initialData.note}
      initialChapters={initialData.chapters}
      initialChaptersLoaded={initialData.chaptersLoaded}
      initialLoadError={initialData.loadError}
      backHref={backHref}
      preferHistoryBack={preferHistoryBack}
      collectionNavigation={collectionNavigation}
    />
  );
}
