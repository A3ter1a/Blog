import type { Metadata } from "next";
import { AdminGate } from "@/components/auth/AdminGate";
import { NoteQA } from "@/components/tools/NoteQA";

export const metadata: Metadata = {
  title: "笔记问答 - Asteroid",
  description: "基于已发布笔记和题集片段进行轻量 AI 问答。",
};

export default function NoteQAPage() {
  return (
    <AdminGate>
      <NoteQA />
    </AdminGate>
  );
}
