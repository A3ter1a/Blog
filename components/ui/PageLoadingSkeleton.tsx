type PageLoadingSkeletonProps = {
  title?: string;
  variant?: "grid" | "reader" | "workspace";
};

export function PageLoadingSkeleton({
  title = "正在加载",
  variant = "grid",
}: PageLoadingSkeletonProps) {
  return (
    <>
      <section className="border-b border-outline-variant/20 bg-surface-container-low/72">
        <div className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6">
          <div className="mb-3 h-6 w-28 animate-pulse rounded-md bg-surface-container-high" />
          <div className="h-9 w-48 animate-pulse rounded-md bg-surface-container-high" aria-label={title} />
          <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded bg-surface-container-high" />
        </div>
      </section>

      <main className="min-h-screen bg-surface pb-20 pt-6">
        <section className="mx-auto max-w-7xl px-4 sm:px-6">
        {variant === "reader" ? <ReaderSkeleton /> : variant === "workspace" ? <WorkspaceSkeleton /> : <GridSkeleton />}
        </section>
      </main>
    </>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-lg border border-outline-variant/20 bg-surface-container-lowest"
        >
          <div className="h-44 animate-pulse bg-surface-container-high" />
          <div className="space-y-3 p-5">
            <div className="h-5 w-4/5 animate-pulse rounded bg-surface-container-high" />
            <div className="h-4 w-full animate-pulse rounded bg-surface-container-high" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-surface-container-high" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ReaderSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
      <article className="space-y-4 rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-6">
        <div className="h-8 w-2/3 animate-pulse rounded bg-surface-container-high" />
        {Array.from({ length: 9 }, (_, index) => (
          <div
            key={index}
            className={`h-4 animate-pulse rounded bg-surface-container-high ${index % 3 === 0 ? "w-5/6" : "w-full"}`}
          />
        ))}
      </article>
      <aside className="hidden space-y-3 rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-4 lg:block">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="h-4 animate-pulse rounded bg-surface-container-high" />
        ))}
      </aside>
    </div>
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-4">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-4">
            <div className="h-5 w-28 animate-pulse rounded bg-surface-container-high" />
            <div className="h-10 animate-pulse rounded bg-surface-container-high" />
            <div className="h-10 animate-pulse rounded bg-surface-container-high" />
          </div>
        ))}
      </aside>
      <section className="min-h-[520px] rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-5">
        <div className="mb-5 flex flex-wrap gap-2">
          <div className="h-7 w-20 animate-pulse rounded-full bg-surface-container-high" />
          <div className="h-7 w-20 animate-pulse rounded-full bg-surface-container-high" />
          <div className="h-7 w-20 animate-pulse rounded-full bg-surface-container-high" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className={`h-4 animate-pulse rounded bg-surface-container-high ${index % 2 === 0 ? "w-full" : "w-4/5"}`}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
