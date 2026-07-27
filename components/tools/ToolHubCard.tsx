import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";

export type ToolHubCardItem = {
  id?: string;
  title: string;
  description: string;
  href?: string;
  icon: LucideIcon;
  tone?: string;
  actionLabel?: string;
  disabledLabel?: string;
};

export function ToolHubGrid({ children }: { children: ReactNode }) {
  return (
    <section className="catalog-index mx-auto max-w-4xl">
      {children}
    </section>
  );
}

export function ToolHubCard({ item }: { item: ToolHubCardItem }) {
  const Icon = item.icon;
  const tone = item.tone ?? "border-primary/15 bg-primary/10 text-primary";
  const content = (
    <>
      <span className={`motion-ui flex h-11 w-11 shrink-0 items-center justify-center rounded-md border ${tone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-headline text-lg font-bold text-on-surface group-hover:text-primary sm:text-xl">
          {item.title}
        </h2>
        <p className="mt-1 text-sm leading-6 text-on-surface-variant">
          {item.description}
        </p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2 text-sm font-medium text-primary">
        <span className="hidden sm:inline">
          {item.href ? item.actionLabel ?? "进入" : item.disabledLabel ?? "待接入"}
        </span>
        <ChevronRight className={`motion-icon-shift h-4 w-4 ${item.href ? "group-hover:translate-x-1" : ""}`} />
      </div>
    </>
  );

  const className = `catalog-row group flex min-h-28 items-center gap-4 p-4 text-left sm:p-5 ${
    item.href ? "" : "opacity-60"
  }`;

  if (!item.href) {
    return (
      <div className={className} aria-disabled="true">
        {content}
      </div>
    );
  }

  return (
    <Link href={item.href} className={className}>
      {content}
    </Link>
  );
}
