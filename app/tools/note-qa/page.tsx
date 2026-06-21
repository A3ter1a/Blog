import { AdminGate } from "@/components/auth/AdminGate";
import { NoteQA } from "@/components/tools/NoteQA";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const metadata = createNoIndexMetadata({
  title: "笔记问答",
  description: "在已发布笔记和题集中检索答案与来源。",
  path: "/tools/note-qa",
});

export default function NoteQAPage() {
  return (
    <AdminGate>
      <NoteQA />
    </AdminGate>
  );
}
