"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Layers3, ListOrdered, Loader2 } from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import type { CollectionDetail } from "@/lib/collections-contract";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { subjectMap, typeMap } from "@/lib/types";
import { getNoteReadPath } from "@/lib/note-routes";
import {
  collectionDetailsEqual,
  readCollectionDetailCache,
  writeCollectionDetailCache,
} from "@/lib/collection-detail-cache";

type CollectionDetailClientProps = {
  id: string;
  initialCollection: CollectionDetail | null;
};

type CollectionDetailResponse = {
  collection?: CollectionDetail;
};

export function CollectionDetailClient({
  id,
  initialCollection,
}: CollectionDetailClientProps) {
  const cachedInitial = initialCollection ? null : readCollectionDetailCache(id);
  const [fetchedCollection, setFetchedCollection] = useState<CollectionDetail | null>(cachedInitial?.value ?? null);
  const [loading, setLoading] = useState(!initialCollection && !cachedInitial);
  const [loadError, setLoadError] = useState<string | null>(null);
  const collection = fetchedCollection ?? initialCollection;

  useEffect(() => {
    let cancelled = false;
    const cached = readCollectionDetailCache(id);
    if (initialCollection) writeCollectionDetailCache(initialCollection);
    const shouldRefresh = !initialCollection || !cached || cached.stale;

    if (!shouldRefresh) return () => { cancelled = true; };

    const timer = window.setTimeout(() => {
      void (async () => {
        if (!initialCollection && !cached) setLoading(true);
        try {
          // The API applies Supabase RLS to the active browser session. This
          // lets an AI account read its own private collection without making
          // the public server page expose draft rows.
          const response = await fetchWithAuth(`/api/collections/${encodeURIComponent(id)}`, {
            cache: "no-store",
          });
          const payload = await response.json().catch(() => null) as CollectionDetailResponse | null;
          if (!response.ok || !payload?.collection) {
            throw new Error("合集不存在或尚未发布");
          }
          if (cancelled) return;
          const next = payload.collection;
          writeCollectionDetailCache(next);
          setFetchedCollection((current) => collectionDetailsEqual(current, next) ? current : next);
          setLoadError(null);
        } catch (error: unknown) {
          if (cancelled) return;
          if (!initialCollection && !cached) setFetchedCollection(null);
          setLoadError(error instanceof Error ? error.message : "合集加载失败");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [id, initialCollection]);

  if (loading) {
    return (
      <PageShell width="normal">
        <section className="surface-panel mx-auto flex max-w-xl items-center justify-center gap-3 p-10 text-center text-sm text-on-surface-variant">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
          正在读取合集…
        </section>
      </PageShell>
    );
  }

  if (!collection) {
    return (
      <PageShell width="normal">
        <section className="surface-panel mx-auto max-w-xl p-10 text-center">
          <Layers3 className="mx-auto h-10 w-10 text-primary/35" />
          <h1 className="mt-4 font-headline text-2xl font-bold text-on-surface">{loadError ?? "合集不存在或尚未发布"}</h1>
          <Link href="/collections" className="control-button control-button-primary mt-5 inline-flex px-4 py-2.5 text-sm">返回合集目录</Link>
        </section>
      </PageShell>
    );
  }

  const backHref = collection.isPublished ? "/collections" : "/notes";

  return (
    <>
      <PageHeader
        width="wide"
        template="library"
        eyebrow="合集"
        icon={<Layers3 className="h-3.5 w-3.5" />}
        title={collection.title}
        description={collection.description || "按顺序阅读合集中的每一篇内容。"}
        actions={<Link href={backHref} className="control-button inline-flex items-center gap-2 px-3 py-2 text-sm"><ArrowLeft className="h-4 w-4" />{collection.isPublished ? "返回合集" : "返回 AI 笔记"}</Link>}
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
            <p className="py-10 text-center text-sm text-on-surface-variant">{collection.isPublished ? "这个合集还没有加入公开内容。" : "这个合集还没有加入内容。"}</p>
          )}
        </section>
      </PageShell>
    </>
  );
}
