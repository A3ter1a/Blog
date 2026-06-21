import { Math3KnowledgeCatalog } from "@/components/tools/Math3KnowledgeCatalog";
import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "数学三知识目录",
  description: "按考研数学三考纲章节整理的知识点目录，支持难度筛选和重点加星。",
  path: "/tools/math3-catalog",
  keywords: ["数学三", "考研数学", "知识目录", "高等数学", "线性代数", "概率论"],
});

export default function Math3CatalogPage() {
  return <Math3KnowledgeCatalog />;
}
