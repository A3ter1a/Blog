import { Layers3 } from "lucide-react";
import { CollectionCard } from "@/components/collections/CollectionCard";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { createPageMetadata } from "@/lib/site-metadata";
import type { CollectionSummary } from "@/lib/collections-contract";
import { getCachedPublishedCollectionSummaries } from "@/lib/server-public-cache";

export const metadata = createPageMetadata({
  title: "合集",
  description: "按章节、主题或知识点持续整理的文章合集。",
  path: "/collections",
  keywords: ["文章合集", "讲义目录", "知识点整理"],
});

export const revalidate = 60;

export default async function CollectionsPage() {
  let collections: CollectionSummary[] = [];
  if (process.env.ASTEROID_OFFLINE_BUILD !== "1") {
    try {
      collections = await getCachedPublishedCollectionSummaries();
    } catch (error) {
      console.warn("Failed to load collections:", error);
    }
  }

  return (
    <>
      <PageHeader
        width="wide"
        template="library"
        eyebrow="持续整理"
        icon={<Layers3 className="h-3.5 w-3.5" />}
        title="合集"
        description="一篇一篇加入，保留每篇内容的独立阅读体验。合集本身只是目录，不改变原有笔记格式。"
      />
      <PageShell width="wide" topPadding="content" template="library">
        {collections.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {collections.map((collection) => <CollectionCard key={collection.id} collection={collection} />)}
          </div>
        ) : (
          <section className="surface-panel border-dashed p-12 text-center">
            <Layers3 className="mx-auto h-10 w-10 text-primary/35" />
            <h2 className="mt-4 font-headline text-xl font-bold text-on-surface">还没有公开合集</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-on-surface-variant">合集会在管理员发布后出现在这里；草稿和 AI 私有合集不会混入公开目录。</p>
          </section>
        )}
      </PageShell>
    </>
  );
}
