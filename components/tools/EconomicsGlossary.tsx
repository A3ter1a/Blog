"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpenText,
  Network,
  Search,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import {
  economicsCategoryLabels,
  economicsTerms,
  getEconomicsTermById,
  getEconomicsTermSearchText,
  type EconomicsTerm,
  type EconomicsTermCategory,
} from "@/lib/economics-glossary";

type CategoryFilter = "all" | EconomicsTermCategory;

const categoryFilters: Array<{ value: CategoryFilter; label: string }> = [
  { value: "all", label: "全部" },
  ...Object.entries(economicsCategoryLabels).map(([value, label]) => ({
    value: value as EconomicsTermCategory,
    label,
  })),
];

export function EconomicsGlossary() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");

  const filteredTerms = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return economicsTerms.filter((term) => {
      if (category !== "all" && term.category !== category) return false;
      if (!keyword) return true;
      return getEconomicsTermSearchText(term).toLowerCase().includes(keyword);
    });
  }, [category, query]);

  const stats = useMemo(() => {
    return [
      { label: "术语", value: economicsTerms.length },
      { label: "分类", value: Object.keys(economicsCategoryLabels).length },
      { label: "消费者", value: economicsTerms.filter((term) => term.category === "consumer").length },
      { label: "成本", value: economicsTerms.filter((term) => term.category === "cost").length },
    ];
  }, []);

  return (
    <>
      <PageHeader
        width="wide"
        title="经济学术语"
        description="按英文原词、国内译名和考研表达整理的复习索引；用于辨析语义，不替代教材中的严谨定义。"
        actions={(
          <Link href="/tools" className="control-button h-10 px-3 text-sm">
            <ArrowLeft className="h-4 w-4" />
            返回工具
          </Link>
        )}
        stats={stats}
      />

      <PageShell width="wide" topPadding="content">
        <section className="overflow-hidden border-y border-outline-variant/25 bg-surface-container-lowest">
          <header className="grid gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
            <div>
              <div className="mb-2 flex items-center justify-between gap-4">
                <p className="font-headline text-sm font-semibold tracking-wide text-on-surface">
                  概念索引
                </p>
                <p className="text-xs tabular-nums text-on-surface-variant">
                  {filteredTerms.length} / {economicsTerms.length}
                </p>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1" aria-label="按经济学分类筛选">
                {categoryFilters.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setCategory(item.value)}
                    aria-pressed={category === item.value}
                    className={`border-b py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                      category === item.value
                        ? "border-primary font-bold text-primary"
                        : "border-transparent text-on-surface-variant hover:border-outline-variant hover:text-on-surface"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="relative block border-b border-outline-variant/45 focus-within:border-primary">
              <span className="sr-only">搜索经济学术语</span>
              <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-11 w-full bg-transparent pl-7 pr-2 text-sm text-on-surface outline-none placeholder:text-on-surface-variant/70"
                placeholder="搜索英文、中文或解释"
              />
            </label>
          </header>

          <div className="border-t border-outline-variant/25">
            {filteredTerms.length === 0 ? (
              <div className="flex min-h-64 items-center justify-center px-6 py-16 text-sm text-on-surface-variant">
              没有匹配的术语。
              </div>
            ) : (
              filteredTerms.map((term, index) => (
                <EconomicsTermEntry
                  key={term.id}
                  term={term}
                  index={index}
                  onSelectRelated={(related) => {
                    setCategory("all");
                    setQuery(related.english);
                  }}
                />
              ))
            )}
          </div>
        </section>
      </PageShell>
    </>
  );
}

function EconomicsTermEntry({
  term,
  index,
  onSelectRelated,
}: {
  term: EconomicsTerm;
  index: number;
  onSelectRelated: (term: EconomicsTerm) => void;
}) {
  const relatedTerms = term.related
    .map(getEconomicsTermById)
    .filter((related): related is EconomicsTerm => Boolean(related))
    .slice(0, 4);

  return (
    <article
      id={`term-${term.id}`}
      className="grid gap-6 border-b border-outline-variant/20 px-4 py-6 last:border-b-0 sm:px-6 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:gap-10 lg:py-8"
    >
      <header className="min-w-0 lg:border-r lg:border-outline-variant/20 lg:pr-8">
        <div className="flex items-baseline justify-between gap-3 text-xs text-on-surface-variant">
          <span className="font-mono tabular-nums">{String(index + 1).padStart(2, "0")}</span>
          <span className="text-right">{economicsCategoryLabels[term.category]}</span>
        </div>
        <h2 className="mt-4 font-headline text-2xl font-semibold leading-tight text-on-surface sm:text-3xl">
          {term.english}
        </h2>
        <p className="mt-1 text-lg font-semibold text-primary">{term.chinese}</p>
        <p className="mt-3 border-l border-primary/35 pl-3 text-xs leading-5 text-on-surface-variant">
          {term.chapter}
        </p>
      </header>

      <div className="min-w-0">
        <dl className="border-y border-outline-variant/20">
          <GlossaryField
            icon={<BookOpenText className="h-4 w-4" />}
            label="通俗解释"
            value={term.plainMeaning}
          />
          <GlossaryField
            label="翻译提醒"
            value={term.translationNote}
          />
          <GlossaryField
            label="考研表达"
            value={term.examHint}
          />
        </dl>

        {relatedTerms.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-6 text-on-surface-variant">
            <span className="mr-1 inline-flex items-center gap-1.5 font-semibold text-on-surface">
              <Network className="h-3.5 w-3.5" />
              关联概念
            </span>
            {relatedTerms.map((related, relatedIndex) => (
              <span key={related.id}>
                <button
                  type="button"
                  onClick={() => onSelectRelated(related)}
                  className="underline decoration-outline-variant underline-offset-4 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  {related.chinese}
                </button>
                {relatedIndex < relatedTerms.length - 1 && (
                  <span className="ml-2 text-outline">/</span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function GlossaryField({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-1 border-b border-outline-variant/15 py-3 last:border-b-0 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4">
      <dt className="flex items-center gap-1.5 text-xs font-bold text-primary">
        {icon}
        {label}
      </dt>
      <dd className="text-sm leading-6 text-on-surface">{value}</dd>
    </div>
  );
}
