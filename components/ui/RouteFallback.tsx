import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type RouteFallbackProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  retryLabel?: string;
  onRetry?: () => void;
};

export function RouteFallback({
  eyebrow,
  title,
  description,
  icon: Icon,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  retryLabel,
  onRetry,
}: RouteFallbackProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 pb-20 pt-24 sm:px-6">
      <section className="surface-panel w-full max-w-2xl p-6 text-center sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <div className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-primary/70">
          {eyebrow}
        </div>
        <h1 className="mt-3 font-headline text-3xl font-bold leading-tight text-on-surface sm:text-4xl">
          {title}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-on-surface-variant sm:text-base">
          {description}
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {onRetry && retryLabel && (
            <button
              type="button"
              onClick={onRetry}
              className="control-button control-button-primary h-10 px-4 text-sm"
            >
              {retryLabel}
            </button>
          )}
          {primaryHref && primaryLabel && (
            <Link href={primaryHref} className="control-button h-10 px-4 text-sm">
              {primaryLabel}
            </Link>
          )}
          {secondaryHref && secondaryLabel && (
            <Link href={secondaryHref} className="rounded-lg px-3 py-2 text-sm font-semibold text-on-surface-variant transition-all duration-300 ease-out hover:bg-primary/10 hover:text-primary">
              {secondaryLabel}
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
