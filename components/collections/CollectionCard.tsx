"use client";

import Link from "next/link";
import { Layers3, ListOrdered } from "lucide-react";
import type { CollectionSummary } from "@/lib/collections-contract";
import { subjectMap } from "@/lib/types";

export function CollectionCard({
  collection,
  onOpen,
  isExpanded = false,
}: {
  collection: CollectionSummary;
  /** AI directory uses an in-place disclosure; public directory keeps its URL. */
  onOpen?: () => void;
  isExpanded?: boolean;
}) {
  const className = "surface-card group flex min-h-[13.5rem] flex-col overflow-hidden text-left";
  const content = (
    <>
      <div className="relative flex h-28 items-end overflow-hidden bg-surface-container-low px-5 pb-4">
        {collection.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- cover images are user-provided persisted URLs.
          <img src={collection.coverImage} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover opacity-80 transition duration-300 group-hover:scale-[1.03]" />
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.16] via-primary/[0.05] to-transparent" />
            <Layers3 className="absolute right-5 top-5 h-12 w-12 text-primary/20" aria-hidden="true" />
          </>
        )}
        <span className="relative z-10 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-surface-container-lowest/90 px-2.5 py-1 text-xs font-semibold text-primary shadow-sm">
          <Layers3 className="h-3.5 w-3.5" />合集
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="line-clamp-2 font-headline text-lg font-bold leading-snug text-on-surface transition-colors group-hover:text-primary">
            {collection.title}
          </h2>
          {collection.subject && <span className="shrink-0 rounded-lg border border-primary/20 bg-primary/5 px-2 py-1 text-[11px] font-semibold text-primary">{subjectMap[collection.subject]}</span>}
        </div>
        {collection.description && <p className="mt-2 line-clamp-2 text-sm leading-6 text-on-surface-variant">{collection.description}</p>}
        <div className="mt-auto flex items-center gap-3 pt-4 text-xs text-on-surface-variant">
          <span className="inline-flex items-center gap-1.5"><ListOrdered className="h-3.5 w-3.5" />{collection.itemCount} 篇内容</span>
          <span className="ml-auto text-primary transition-transform group-hover:translate-x-1">{isExpanded ? "收起 ↑" : onOpen ? "原位展开 →" : "查看 →"}</span>
        </div>
      </div>
    </>
  );

  if (onOpen) {
    return <button type="button" aria-expanded={isExpanded} onClick={onOpen} className={className}>{content}</button>;
  }

  return <Link href={`/collections/${encodeURIComponent(collection.id)}`} className={className}>{content}</Link>;
}
