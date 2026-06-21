import type { Metadata, ResolvingMetadata } from "next";
import { cache } from "react";
import { chaptersApi } from "@/lib/chapters-api";
import { notesApi } from "@/lib/supabase";
import type { Chapter, Note } from "@/lib/types";
import { NoteReaderClient } from "@/components/notes/NoteReaderClient";
import {
  getNoteDescription,
  getShareableImageUrl,
} from "@/lib/site-metadata";

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

const getPublishedNote = cache(async (noteId: string) => notesApi.getPublishedById(noteId));

async function getInitialNote(noteId: string): Promise<InitialNotePayload> {
  try {
    const note = await getPublishedNote(noteId);

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

export async function generateMetadata(
  { params }: NoteReaderPageProps,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { id } = await params;
  const note = await getPublishedNote(id);

  if (!note) {
    return {
      title: "笔记不存在",
      description: "这篇内容可能尚未发布、已经移除，或当前没有公开访问权限。",
      alternates: {
        canonical: `/notes/${id}`,
      },
      robots: {
        index: false,
        follow: false,
      },
    };
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
      title: note.title,
      description,
      url: `/notes/${note.id}`,
      publishedTime: note.createdAt.toISOString(),
      modifiedTime: note.updatedAt.toISOString(),
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
