import type { Metadata } from "next";
import { Math3KnowledgeCatalog } from "@/components/tools/Math3KnowledgeCatalog";

export const metadata: Metadata = {
  title: "数三知识目录 - Asteroid",
  description: "按考研数学三考纲章节整理的知识点目录，支持难度筛选和重点加星。",
};

export default function Math3CatalogPage() {
  return <Math3KnowledgeCatalog />;
}
