import { redirect } from "next/navigation";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const metadata = createNoIndexMetadata({
  title: "资料检索",
  description: "在已发布笔记和题集中检索内容与来源。",
  path: "/tools/note-qa",
});

export default function NoteQAPage() {
  redirect("/notes");
}
