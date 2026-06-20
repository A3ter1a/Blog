import type { ReactNode } from "react";

type PageWidth = "compact" | "normal" | "wide" | "workspace";
type PageTopPadding = "nav" | "content" | "none";

const widthClasses: Record<PageWidth, string> = {
  compact: "max-w-4xl",
  normal: "max-w-6xl",
  wide: "max-w-7xl",
  workspace: "max-w-[104rem]",
};

const topPaddingClasses: Record<PageTopPadding, string> = {
  nav: "pt-24",
  content: "pt-6",
  none: "pt-0",
};

export type PageStat = {
  label: string;
  value: ReactNode;
  tone?: string;
};

export function PageShell({
  children,
  width = "wide",
  topPadding = "nav",
  className = "",
}: {
  children: ReactNode;
  width?: PageWidth;
  topPadding?: PageTopPadding;
  className?: string;
}) {
  return (
    <main className={`min-h-screen bg-surface pb-20 ${topPaddingClasses[topPadding]} ${className}`}>
      <div className={`mx-auto w-full px-4 sm:px-6 lg:px-8 ${widthClasses[width]}`}>
        {children}
      </div>
    </main>
  );
}

export function PageHeader({
  eyebrow,
  icon,
  title,
  description,
  actions,
  stats,
  width = "wide",
}: {
  eyebrow?: string;
  icon?: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
  stats?: PageStat[];
  width?: PageWidth;
}) {
  return (
    <section className="border-b border-outline-variant/20 bg-surface-container-low/72 pt-20">
      <div className={`mx-auto w-full px-4 py-5 sm:px-6 sm:py-7 lg:px-8 ${widthClasses[width]}`}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            {eyebrow && (
              <div className="eyebrow-chip mb-3 px-3 py-1 text-xs">
                {icon}
                {eyebrow}
              </div>
            )}
            <h1 className="font-headline text-2xl font-bold leading-tight text-on-surface sm:text-3xl md:text-4xl">
              {title}
            </h1>
            {description && (
              <p className="mt-2 max-w-2xl text-sm leading-6 text-on-surface-variant">
                {description}
              </p>
            )}
          </div>

          {(actions || stats) && (
            <div className="flex min-w-0 flex-col gap-3 lg:min-w-[22rem] lg:items-end">
              {actions}
              {stats && <StatStrip stats={stats} />}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function StatStrip({
  stats,
  className = "",
}: {
  stats: PageStat[];
  className?: string;
}) {
  if (stats.length === 0) return null;

  return (
    <div className={`grid w-full grid-cols-2 gap-2 rounded-2xl border border-outline-variant/15 bg-surface-container-lowest/90 p-2 shadow-ambient md:grid-cols-4 ${className}`}>
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-xl bg-surface-container-low px-3 py-2 text-center">
          <div className={`text-base font-bold md:text-lg ${stat.tone ?? "text-primary"}`}>
            {stat.value}
          </div>
          <div className="mt-0.5 text-[11px] text-on-surface-variant">
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SectionPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`surface-panel p-4 ${className}`}>
      {children}
    </section>
  );
}
