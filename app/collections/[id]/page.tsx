import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Layers3, ListOrdered } from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { collectionsApi } from "@/lib/collections-api";
import { subjectMap, typeMap } from "@/lib/types";
import { getNoteReadPath } from "@/lib/note-routes";
import { createPageMetadata } from "@/lib/site-metadata";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (process.env.ASTEROID_OFFLINE_BUILD === "1") return createPageMetadata({ title: "合集", description: "持续整理的文章合集。", path: `/collections/${id}` });
  try {
    const collection = await collectionsApi.getPublishedById(id);
    return createPageMetadata({
      title: collection?.title ?? "合集",
      description: collection?.description || "持续整理的文章合集。",
      path: `/collections/${id}`,
    });
  } catch {
    return createPageMetadata({ title: "合集", description: "持续整理的文章合集。", path: `/collections/${id}` });
  }
}

export default async function CollectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const collection = process.env.ASTEROID_OFFLINE_BUILD === "1" ? null : await collectionsApi.getPublishedById(id).catch(() => null);

  if (!collection) {
    return (
      <PageShell width="normal">
        <section className="surface-panel mx-auto max-w-xl p-10 text-center">
          <Layers3 className="mx-auto h-10 w-10 text-primary/35" />
          <h1 className="mt-4 font-headline text-2xl font-bold text-on-surface">合集不存在或尚未发布</h1>
          <Link href="/collections" className="control-button control-button-primary mt-5 inline-flex px-4 py-2.5 text-sm">返回合集目录</Link>
        </section>
      </PageShell>
    );
  }

  return (
    <>
      <PageHeader
        width="wide"
        template="library"
        eyebrow="合集"
        icon={<Layers3 className="h-3.5 w-3.5" />}
        title={collection.title}
        description={collection.description || "按顺序阅读合集中的每一篇内容。"}
        actions={<Link href="/collections" className="control-button inline-flex items-center gap-2 px-3 py-2 text-sm"><ArrowLeft className="h-4 w-4" />返回合集</Link>}
      />
      <PageShell width="wide" topPadding="content" template="library">
        <section className="surface-panel p-5">
          <div className="mb-5 flex flex-wrap items-center gap-3 text-sm text-on-surface-variant">
            <span className="inline-flex items-center gap-1.5"><ListOrdered className="h-4 w-4 text-primary" />{collection.items.length} 篇内容</span>
            {collection.subject && <span className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary">{subjectMap[collection.subject]}</span>}
          </div>
          {collection.items.length > 0 ? (
            <ol className="space-y-3">
              {collection.items.map((item, index) => item.note ? (
                <li key={item.id}>
                  <Link href={getNoteReadPath({ id: item.note.id, isPublished: item.note.isPublished })} className="group flex items-center gap-4 rounded-2xl border border-outline-variant/15 bg-surface-container-low px-4 py-4 transition hover:border-primary/35 hover:bg-primary/[0.04]">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">{String(index + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-headline text-base font-semibold text-on-surface group-hover:text-primary">{item.note.title}</span><span className="mt-1 block text-xs text-on-surface-variant">{typeMap[item.note.type]}{item.note.subject ? ` · ${subjectMap[item.note.subject]}` : ""}</span></span>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-on-surface-variant transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                  </Link>
                </li>
              ) : null)}
            </ol>
          ) : (
            <p className="py-10 text-center text-sm text-on-surface-variant">这个合集还没有加入公开内容。</p>
          )}
        </section>
      </PageShell>
    </>
  );
}
