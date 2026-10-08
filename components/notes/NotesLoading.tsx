"use client";

import Link from "next/link";
import { ArrowLeft, FileText, Sparkles } from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { useNoteNavigationPreview } from "@/components/notes/NoteNavigation";
import { useSearchParams } from "next/navigation";
import { getSafeNotesReturnPath } from "@/lib/note-routes";
import { getReadingWidthClass, useReadingPreferences } from "@/lib/useReadingPreferences";
import { useTabletLandscape } from "@/hooks/useTabletLandscape";
import { subjectMap, typeMap } from "@/lib/types";

function Pulse({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-surface-container-high ${className}`} />;
}

export function NotesGridSkeleton() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" role="status" aria-label="正在加载笔记">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="surface-panel overflow-hidden">
          <div className="aspect-[16/9] bg-surface-container-low">
            <Pulse className="h-full w-full rounded-none" />
          </div>
          <div className="space-y-3 p-5">
            <Pulse className="h-5 w-4/5" />
            <Pulse className="h-4 w-full" />
            <Pulse className="h-4 w-2/3" />
            <div className="flex gap-2 pt-2"><Pulse className="h-5 w-14" /><Pulse className="h-5 w-16" /></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function NotesDirectoryLoading() {
  return (
    <>
      <PageHeader
        width="wide"
        template="library"
        title="文章与题集"
        actions={(
          <div className="inline-grid grid-cols-2 gap-1 rounded-xl border border-outline-variant/25 bg-surface-container-low p-1" aria-hidden="true">
            <span className="control-button min-h-11 border-transparent px-3 text-sm"><FileText className="h-4 w-4" />我的笔记</span>
            <span className="control-button min-h-11 border-transparent px-3 text-sm"><Sparkles className="h-4 w-4" />AI 笔记</span>
          </div>
        )}
      />
      <PageShell width="wide" topPadding="content" template="library">
        <section className="surface-panel mb-6 p-5" aria-hidden="true">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <Pulse className="h-[58px] w-full" />
            <div className="flex min-h-11 items-center justify-between gap-3 lg:justify-end">
              <Pulse className="h-4 w-20" /><Pulse className="h-11 w-20" />
            </div>
          </div>
        </section>
        <NotesGridSkeleton />
      </PageShell>
    </>
  );
}

export function NoteReaderLoading({ backHref = "/notes" }: { backHref?: string }) {
  const preview = useNoteNavigationPreview();
  const searchParams = useSearchParams();
  const { preferences } = useReadingPreferences();
  const isTabletLandscape = useTabletLandscape();
  const title = preview?.title ?? "正在加载笔记正文";
  const type = preview ? typeMap[preview.type] : null;
  const subject = preview?.subject ? subjectMap[preview.subject] : null;
  const isProblem = preview?.type === "problem";
  const tabletArticleReader = isTabletLandscape && !isProblem;
  const showSidebar = !isProblem && !tabletArticleReader && preferences.tocPosition !== "hidden";
  const widthClass = isProblem ? "" : getReadingWidthClass(preferences.contentWidth);
  const leftSidebar = showSidebar && preferences.tocPosition === "left";
  const currentReturnPath = searchParams.get("from");
  const safeBackHref = currentReturnPath ? getSafeNotesReturnPath(currentReturnPath) : backHref;

  return (
    <main className={`page-template-reader min-h-screen bg-surface pb-20 pt-20 ${tabletArticleReader ? "is-tablet-landscape-reader" : ""}`} data-page-template="reader">
      <div className="reader-toolbar sticky top-20 z-30 border-b border-outline-variant/20 bg-surface/80 backdrop-blur-xl">
        <div className="page-frame page-frame--wide flex flex-wrap items-center justify-between gap-3 py-3">
          <Link href={safeBackHref} className="control-button min-h-11 px-3 text-sm">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />返回
          </Link>
          <div className="flex gap-2" aria-hidden="true"><Pulse className="h-11 w-11" /><Pulse className="h-11 w-11" /></div>
        </div>
      </div>
      {preview?.hasCover && <div className="page-frame page-frame--wide mb-6"><Pulse className="mt-2 h-11 w-28" /></div>}
      <div className="page-frame page-frame--wide grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        <div className={`min-w-0 ${showSidebar ? "lg:col-span-9" : "lg:col-span-12"} ${leftSidebar ? "lg:order-last" : ""}`}>
          <header className={`surface-panel reader-title-block p-6 sm:p-8 ${widthClass}`}>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-lg border border-outline-variant/20 bg-surface-container-low px-2.5 py-1 text-xs text-on-surface-variant">{type ?? "笔记"}</span>
              {subject && <span className="tag-chip px-2.5 py-1 text-xs">{subject}</span>}
            </div>
            <h1 className="mb-4 font-headline text-2xl font-bold leading-tight text-on-surface sm:text-3xl md:text-4xl">{title}</h1>
            <p className="flex min-h-7 items-center text-sm text-on-surface-variant" role="status">正在读取正文…</p>
          </header>
          <div className={`mt-6 space-y-4 ${widthClass}`} aria-hidden="true">
            <Pulse className="h-5 w-full" /><Pulse className="h-5 w-11/12" /><Pulse className="h-5 w-4/5" /><Pulse className="h-32 w-full" />
          </div>
        </div>
        {showSidebar && <aside className={`hidden lg:col-span-3 lg:block ${leftSidebar ? "lg:order-first" : ""}`} aria-hidden="true"><div className="surface-panel h-52 animate-pulse bg-surface-container-low" /></aside>}
      </div>
    </main>
  );
}
