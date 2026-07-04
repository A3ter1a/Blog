import { redirect } from "next/navigation";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const metadata = createNoIndexMetadata({
  title: "英语真题训练",
  description: "英语一 2007-2026 真题训练、生词记录和客观题统计。",
  path: "/tools/english-training",
});

export default function EnglishTrainingPage() {
  redirect("/tools/past-papers");
}
