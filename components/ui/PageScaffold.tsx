import type { ReactNode } from "react";

type PageWidth = "compact" | "normal" | "wide" | "workspace";
type PageTopPadding = "nav" | "content" | "none";
type PageTemplate = "default" | "library" | "reader" | "workspace" | "training";

const widthClasses: Record<PageWidth, string> = {
  compact: "page-frame--compact",
  normal: "page-frame--normal",
  wide: "page-frame--wide",
  workspace: "page-frame--workspace",
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
  template = "default",
  className = "",
}: {
  children: ReactNode;
  width?: PageWidth;
  topPadding?: PageTopPadding;
  template?: PageTemplate;
  className?: string;
}) {
  return (
    <main
      className={`page-shell page-template-${template} ${topPaddingClasses[topPadding]} ${className}`}
      data-page-template={template}
    >
      <div className={`page-frame ${widthClasses[width]}`}>
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
  template = "default",
}: {
  eyebrow?: string;
  icon?: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
  stats?: PageStat[];
  width?: PageWidth;
  template?: PageTemplate;
}) {
  return (
    <section
      className={`page-header page-template-${template}`}
      data-page-template={template}
    >
      <div className={`page-frame ${widthClasses[width]}`}>
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
    <dl className={`page-stat-strip ${className}`}>
      {stats.map((stat) => (
        <div key={stat.label} className="page-stat">
          <dd className={`text-base font-bold md:text-lg ${stat.tone ?? "text-primary"}`}>
            {stat.value}
          </dd>
          <dt className="mt-0.5 text-[11px] text-on-surface-variant">
            {stat.label}
          </dt>
        </div>
      ))}
    </dl>
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
