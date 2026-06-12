import type { Metadata } from "next";
import { AdminGate } from "@/components/auth/AdminGate";
import { NoteQA } from "@/components/tools/NoteQA";

export const metadata: Metadata = {
  title: "笔记问答 - Asteroid",
  description: "在已发布笔记和题集中检索答案与来源。",
};

export default function NoteQAPage() {
  return (
    <AdminGate>
      <NoteQA />
    </AdminGate>
  );
}
