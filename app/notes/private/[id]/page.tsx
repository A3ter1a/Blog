import type { Metadata } from "next";
import { AdminGate } from "@/components/auth/AdminGate";
import { NoteReaderClient } from "@/components/notes/NoteReaderClient";
import { getSafeNotesReturnPath } from "@/lib/note-routes";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = createNoIndexMetadata({
  title: "私人笔记",
  description: "仅供已登录管理员查看的私人学习内容。",
});

type PrivateNoteReaderPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
};

export default async function PrivateNoteReaderPage({ params, searchParams }: PrivateNoteReaderPageProps) {
  const { id } = await params;
  const rawReturnPath = (await searchParams).from;
  const returnPath = Array.isArray(rawReturnPath) ? rawReturnPath[0] : rawReturnPath;
  const backHref = getSafeNotesReturnPath(returnPath);
  const preferHistoryBack = Boolean(returnPath && returnPath === backHref);

  return (
    <AdminGate>
      <NoteReaderClient
        noteId={id}
        initialNote={null}
        accessScope="owner"
        backHref={backHref}
        preferHistoryBack={preferHistoryBack}
      />
    </AdminGate>
  );
}
