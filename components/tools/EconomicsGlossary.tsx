"use client";

import { createElement, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpenText,
  Languages,
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
        description="按英文原词、国内译名和考研表达整理微观经济学概念。"
        actions={(
          <Link href="/tools" className="control-button h-10 px-3 text-sm">
            <ArrowLeft className="h-4 w-4" />
            返回工具
          </Link>
        )}
        stats={stats}
      />

      <PageShell width="wide" topPadding="content">
        <section className="surface-panel p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {categoryFilters.map((item) => createElement("button", {
                key: item.value,
                type: "button",
                onClick: () => setCategory(item.value),
                className: `control-button h-10 px-3 text-sm ${
                  category === item.value ? "control-button-selected" : ""
                }`,
              }, item.label))}
            </div>
            <label className="relative block w-full lg:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="field-control h-10 w-full px-9 text-sm"
                placeholder="搜索英文、中文或解释"
              />
            </label>
          </div>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          {filteredTerms.length === 0 ? (
            <div className="surface-panel col-span-full flex min-h-64 items-center justify-center p-6 text-sm text-on-surface-variant">
              没有匹配的术语。
            </div>
          ) : (
            filteredTerms.map((term) => createElement(EconomicsTermCard, {
              key: term.id,
              termId: term.id,
            }))
          )}
        </section>
      </PageShell>
    </>
  );
}

function EconomicsTermCard({ termId }: { termId: string }) {
  const term = getEconomicsTermById(termId);
  if (!term) return null;

  const relatedTerms = term.related
    .map(getEconomicsTermById)
    .filter((related): related is EconomicsTerm => Boolean(related))
    .slice(0, 4);

  return (
    <article className="surface-panel flex min-h-full flex-col p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="econ-category-chip">
              {economicsCategoryLabels[term.category]}
            </span>
            <span className="text-xs text-on-surface-variant">{term.chapter}</span>
          </div>
          <h2 className="mt-3 font-headline text-2xl font-bold leading-tight text-on-surface">
            {term.english}
          </h2>
          <p className="mt-1 text-lg font-semibold text-primary">{term.chinese}</p>
        </div>
        <Languages className="h-5 w-5 shrink-0 text-primary" />
      </div>

      <div className="mt-4 grid gap-3">
        <GlossaryField
          icon={<BookOpenText className="h-4 w-4" />}
          label="贴近原意"
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
      </div>

      {relatedTerms.length > 0 && (
        <div className="mt-auto pt-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-on-surface-variant">
            <Network className="h-3.5 w-3.5" />
            关联概念
          </div>
          <div className="flex flex-wrap gap-2">
            {relatedTerms.map((related) => createElement("span", {
              key: related.id,
              className: "tag-chip px-2.5 py-1 text-xs",
            }, related.chinese))}
          </div>
        </div>
      )}
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
    <div className="rounded-lg border border-outline-variant/20 bg-surface-container-low p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-primary">
        {icon}
        {label}
      </div>
      <p className="text-sm leading-6 text-on-surface">{value}</p>
    </div>
  );
}
