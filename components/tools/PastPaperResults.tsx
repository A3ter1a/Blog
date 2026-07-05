"use client";

import Link from "next/link";
import { createElement, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { useToast } from "@/components/ui/Toast";
import {
  englishSectionLabels,
  type EnglishSection,
} from "@/lib/english-training";
import {
  englishResultsApi,
  type EnglishResultPassage,
  type EnglishResultsData,
} from "@/lib/english-results-api";

type ResultTab = "english" | "math";

const objectiveSections: EnglishSection[] = ["reading", "cloze", "new_type"];
const sectionOrder: EnglishSection[] = ["reading", "cloze", "new_type", "translation", "writing"];

function isSubmitted(passage: EnglishResultPassage): boolean {
  return passage.attempt?.status === "submitted";
}

function getObjectivePassages(passages: EnglishResultPassage[]): EnglishResultPassage[] {
  return passages.filter((passage) => objectiveSections.includes(passage.section));
}

function getAccuracy(score: number, maxScore: number): number {
  return maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function PastPaperResults() {
  const toast = useToast();
  const [data, setData] = useState<EnglishResultsData>({ passages: [], vocabulary: [] });
  const [activeTab, setActiveTab] = useState<ResultTab>("english");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const results = await englishResultsApi.getResultsData();
        if (cancelled) return;
        setData(results);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "未知错误";
        setLoadError(message);
        toast.error(`真题训练结果加载失败：${message}`);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const stats = useMemo(() => {
    const objectivePassages = getObjectivePassages(data.passages);
    const submitted = objectivePassages.filter(isSubmitted);
    const score = submitted.reduce((sum, passage) => sum + (passage.attempt?.score ?? 0), 0);
    const maxScore = submitted.reduce((sum, passage) => sum + (passage.attempt?.maxScore ?? 0), 0);
    return {
      objectiveTotal: objectivePassages.length,
      submittedTotal: submitted.length,
      score,
      maxScore,
      lost: Math.max(maxScore - score, 0),
      accuracy: getAccuracy(score, maxScore),
    };
  }, [data.passages]);

  const sectionStats = useMemo(() => {
    return sectionOrder.map((section) => {
      const sectionPassages = data.passages.filter((passage) => passage.section === section);
      const submitted = sectionPassages.filter(isSubmitted);
      const score = submitted.reduce((sum, passage) => sum + (passage.attempt?.score ?? 0), 0);
      const maxScore = submitted.reduce((sum, passage) => sum + (passage.attempt?.maxScore ?? 0), 0);
      return {
        section,
        total: sectionPassages.length,
        submitted: submitted.length,
        score,
        maxScore,
        lost: Math.max(maxScore - score, 0),
        accuracy: getAccuracy(score, maxScore),
      };
    });
  }, [data.passages]);

  const submittedPassages = useMemo(
    () => getObjectivePassages(data.passages)
      .filter(isSubmitted)
      .sort((left, right) => right.year - left.year || left.sortOrder - right.sortOrder),
    [data.passages],
  );

  return (
    <>
      <PageHeader
        width="workspace"
        title="真题训练结果"
        description="统计英语、数学真题训练的正确率、得分和丢分分布。"
        actions={(
          <Link href="/tools/past-papers" className="control-button h-10 px-3 text-sm">
            <ArrowLeft className="h-4 w-4" />
            返回真题中心
          </Link>
        )}
        stats={[
          { label: "已提交", value: stats.submittedTotal },
          { label: "正确率", value: `${stats.accuracy}%`, tone: "text-green-600" },
          { label: "得分", value: `${formatScore(stats.score)}/${formatScore(stats.maxScore)}` },
          { label: "丢分", value: formatScore(stats.lost), tone: "text-red-600" },
        ]}
      />

      <PageShell width="workspace" topPadding="content">
        <div className="mb-4 flex flex-wrap gap-2">
          <TabButton active={activeTab === "english"} onClick={() => setActiveTab("english")}>
            英语结果
          </TabButton>
          <TabButton active={activeTab === "math"} onClick={() => setActiveTab("math")}>
            数学结果
          </TabButton>
        </div>

        {isLoading ? (
          <InlinePanel>
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span>正在加载真题训练结果。</span>
          </InlinePanel>
        ) : loadError ? (
          <InlinePanel tone="text-red-700">{loadError}</InlinePanel>
        ) : activeTab === "english" ? (
          <EnglishResultPanel
            stats={stats}
            sectionStats={sectionStats}
            submittedPassages={submittedPassages}
          />
        ) : (
          <MathResultPlaceholder />
        )}
      </PageShell>
    </>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`control-button h-10 px-4 text-sm ${active ? "control-button-selected" : ""}`}
    >
      {children}
    </button>
  );
}

function InlinePanel({
  children,
  tone = "text-on-surface-variant",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <section className={`surface-panel flex min-h-[18rem] items-center justify-center gap-2 p-6 text-sm ${tone}`}>
      {children}
    </section>
  );
}

function EnglishResultPanel({
  stats,
  sectionStats,
  submittedPassages,
}: {
  stats: {
    objectiveTotal: number;
    submittedTotal: number;
    score: number;
    maxScore: number;
    lost: number;
    accuracy: number;
  };
  sectionStats: Array<{
    section: EnglishSection;
    total: number;
    submitted: number;
    score: number;
    maxScore: number;
    lost: number;
    accuracy: number;
  }>;
  submittedPassages: EnglishResultPassage[];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="surface-panel p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-headline text-xl font-bold text-on-surface">英语一总览</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              阅读、完形和新题型的客观题提交结果。
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-primary">{stats.accuracy}%</div>
            <div className="text-xs text-on-surface-variant">
              {formatScore(stats.score)} / {formatScore(stats.maxScore)}
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <MetricCard label="已完成题组" value={`${stats.submittedTotal}/${stats.objectiveTotal}`} />
          <MetricCard label="得分" value={formatScore(stats.score)} />
          <MetricCard label="丢分" value={formatScore(stats.lost)} tone="text-red-600" />
        </div>

        <div className="mt-5 space-y-3">
          {sectionStats.map((item) => createElement(SectionDistribution, {
            key: item.section,
            item,
          }))}
        </div>
      </section>

      <section className="surface-panel p-4">
        <h2 className="font-headline text-base font-bold text-on-surface">最近提交</h2>
        {submittedPassages.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-outline-variant/30 px-3 py-8 text-center text-sm text-on-surface-variant">
            还没有提交过客观题。
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {submittedPassages.slice(0, 12).map((passage) => {
              const attempt = passage.attempt;
              const score = attempt?.score ?? 0;
              const maxScore = attempt?.maxScore ?? 0;
              return createElement("div", {
                key: passage.id,
                className: "rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-3",
              },
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-on-surface">{passage.displayTitle}</div>
                    <div className="mt-1 text-xs text-on-surface-variant">
                      {attempt?.submittedAt ? attempt.submittedAt.toLocaleDateString("zh-CN") : "已提交"}
                    </div>
                  </div>
                  <div className="text-sm font-bold text-primary">
                    {formatScore(score)}/{formatScore(maxScore)}
                  </div>
                </div>,
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({ label, value, tone = "text-primary" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-4">
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      <div className="mt-1 text-xs text-on-surface-variant">{label}</div>
    </div>
  );
}

function SectionDistribution({
  item,
}: {
  item: {
    section: EnglishSection;
    total: number;
    submitted: number;
    score: number;
    maxScore: number;
    lost: number;
    accuracy: number;
  };
}) {
  const width = item.maxScore > 0 ? Math.max(item.accuracy, 4) : 0;
  return (
    <div className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold text-on-surface">{englishSectionLabels[item.section]}</div>
        <div className="text-sm text-on-surface-variant">
          {item.submitted}/{item.total} · {formatScore(item.score)}/{formatScore(item.maxScore)} · 丢 {formatScore(item.lost)}
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function MathResultPlaceholder() {
  return (
    <section className="surface-panel flex min-h-[22rem] flex-col items-center justify-center gap-3 p-6 text-center">
      <CheckCircle2 className="h-9 w-9 text-primary" />
      <h2 className="font-headline text-xl font-bold text-on-surface">数学真题结果待接入</h2>
      <p className="max-w-md text-sm leading-6 text-on-surface-variant">
        数学真题训练接入后，这里会合并正确率、得分和丢分分布。
      </p>
    </section>
  );
}
