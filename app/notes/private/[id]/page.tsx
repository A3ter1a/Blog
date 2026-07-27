import type { Metadata } from "next";
import { AdminGate } from "@/components/auth/AdminGate";
import { NoteReaderClient } from "@/components/notes/NoteReaderClient";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = createNoIndexMetadata({
  title: "私人笔记",
  description: "仅供已登录管理员查看的私人学习内容。",
});

type PrivateNoteReaderPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PrivateNoteReaderPage({ params }: PrivateNoteReaderPageProps) {
  const { id } = await params;

  return (
    <AdminGate>
      <NoteReaderClient
        noteId={id}
        initialNote={null}
        accessScope="owner"
      />
    </AdminGate>
  );
}
