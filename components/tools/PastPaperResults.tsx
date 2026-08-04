"use client";

import Link from "next/link";
import { createElement, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, History, Loader2 } from "lucide-react";
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
import { englishTrainingApi } from "@/lib/english-training-api";
import { findUnreconciledEnglishLocalHistory, type EnglishTrainingPersistenceMode } from "@/lib/english-training-core";
import {
  ENGLISH_ROUND_HISTORY_CHANGE_EVENT,
  getEffectiveEnglishRoundResult,
  importLegacyEnglishAttempt,
  readEnglishRoundLedgers,
  upsertEnglishRoundLedger,
  writeEnglishRoundLedgers,
  type EnglishPassageRoundLedger,
  type EnglishRoundRevision,
} from "@/lib/english-round-history";

type ResultTab = "english" | "math";
type EnglishResultView = "type" | "paper";

type EnglishEffectivePassage = {
  passage: EnglishResultPassage;
  ledger: EnglishPassageRoundLedger;
  round: 1 | 2 | 3;
  revision: EnglishRoundRevision;
};

const objectiveSections: EnglishSection[] = ["reading", "cloze", "new_type"];
const sectionOrder: EnglishSection[] = ["reading", "cloze", "new_type", "translation", "writing"];

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
  const [data, setData] = useState<EnglishResultsData>({ passages: [] });
  const [activeTab, setActiveTab] = useState<ResultTab>("english");
  const [englishView, setEnglishView] = useState<EnglishResultView>("type");
  const [roundLedgers, setRoundLedgers] = useState<EnglishPassageRoundLedger[]>([]);
  const [persistenceMode, setPersistenceMode] = useState<EnglishTrainingPersistenceMode>("legacy");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [results, roundHistory] = await Promise.all([
          englishResultsApi.getResultsData(),
          englishTrainingApi.getRoundHistory(),
        ]);
        if (cancelled) return;
        setData(results);
        setPersistenceMode(roundHistory.mode);
        const stored = readEnglishRoundLedgers();
        if (roundHistory.mode !== "legacy") {
          const unreconciled = findUnreconciledEnglishLocalHistory(stored, roundHistory.ledgers);
          if (unreconciled.length > 0) {
            const passageCount = new Set(unreconciled.map((issue) => issue.passageId)).size;
            throw new Error(`检测到 ${passageCount} 个题组仍有仅存在于本机的三轮或纠正历史。为避免覆盖，需先完成本机历史迁移确认。`);
          }
        }
        const imported = roundHistory.mode === "legacy"
          ? results.passages.reduce((ledgers, passage) => {
            if (!passage.attempt) return ledgers;
            const attempt = passage.attempt;
            const existing = ledgers.find((ledger) => ledger.passageId === passage.id);
            const ledger = importLegacyEnglishAttempt(existing, {
              passageId: passage.id,
              status: attempt.status,
              answers: Object.fromEntries(attempt.answers.map((answer) => [answer.questionId, answer.answer])),
              score: attempt.score,
              maxScore: attempt.maxScore,
              startedAt: attempt.startedAt.toISOString(),
              submittedAt: attempt.submittedAt?.toISOString(),
              updatedAt: attempt.updatedAt.toISOString(),
            });
            return upsertEnglishRoundLedger(ledgers, ledger);
          }, stored)
          : roundHistory.ledgers;
        setRoundLedgers(imported);
        if (roundHistory.mode === "legacy" && JSON.stringify(imported) !== JSON.stringify(stored)) {
          writeEnglishRoundLedgers(imported);
        }
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

  useEffect(() => {
    if (persistenceMode !== "legacy") return;
    const refresh = () => setRoundLedgers(readEnglishRoundLedgers());
    window.addEventListener(ENGLISH_ROUND_HISTORY_CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(ENGLISH_ROUND_HISTORY_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [persistenceMode]);

  const ledgersByPassageId = useMemo(
    () => new Map(roundLedgers.map((ledger) => [ledger.passageId, ledger])),
    [roundLedgers],
  );

  const effectivePassages = useMemo(() => data.passages.flatMap((passage): EnglishEffectivePassage[] => {
    const ledger = ledgersByPassageId.get(passage.id);
    const result = getEffectiveEnglishRoundResult(ledger);
    return ledger && result ? [{ passage, ledger, round: result.round.round, revision: result.revision }] : [];
  }), [data.passages, ledgersByPassageId]);

  const stats = useMemo(() => {
    const objectivePassages = getObjectivePassages(data.passages);
    const submitted = effectivePassages.filter((item) => objectiveSections.includes(item.passage.section));
    const score = submitted.reduce((sum, item) => sum + item.revision.score, 0);
    const maxScore = submitted.reduce((sum, item) => sum + item.revision.maxScore, 0);
    return {
      objectiveTotal: objectivePassages.length,
      submittedTotal: submitted.length,
      score,
      maxScore,
      lost: Math.max(maxScore - score, 0),
      accuracy: getAccuracy(score, maxScore),
    };
  }, [data.passages, effectivePassages]);

  const sectionStats = useMemo(() => {
    return sectionOrder.map((section) => {
      const sectionPassages = data.passages.filter((passage) => passage.section === section);
      const submitted = effectivePassages.filter((item) => item.passage.section === section);
      const score = submitted.reduce((sum, item) => sum + item.revision.score, 0);
      const maxScore = submitted.reduce((sum, item) => sum + item.revision.maxScore, 0);
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
  }, [data.passages, effectivePassages]);

  const paperStats = useMemo(() => {
    const papers = new Map<string, {
      paperId: string;
      year: number;
      total: number;
      completed: number;
      score: number;
      maxScore: number;
    }>();
    for (const passage of getObjectivePassages(data.passages)) {
      const key = passage.paperId || String(passage.year);
      const current = papers.get(key) ?? {
        paperId: key,
        year: passage.year,
        total: 0,
        completed: 0,
        score: 0,
        maxScore: 0,
      };
      current.total += 1;
      const effective = effectivePassages.find((item) => item.passage.id === passage.id);
      if (effective) {
        current.completed += 1;
        current.score += effective.revision.score;
        current.maxScore += effective.revision.maxScore;
      }
      papers.set(key, current);
    }
    return [...papers.values()].sort((left, right) => right.year - left.year);
  }, [data.passages, effectivePassages]);

  const recentHistory = useMemo(() => [...effectivePassages]
    .filter((item) => objectiveSections.includes(item.passage.section))
    .sort((left, right) => right.revision.createdAt.localeCompare(left.revision.createdAt)), [effectivePassages]);

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
            paperStats={paperStats}
            recentHistory={recentHistory}
            persistenceMode={persistenceMode}
            view={englishView}
            onViewChange={setEnglishView}
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
  paperStats,
  recentHistory,
  persistenceMode,
  view,
  onViewChange,
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
  paperStats: Array<{
    paperId: string;
    year: number;
    total: number;
    completed: number;
    score: number;
    maxScore: number;
  }>;
  recentHistory: EnglishEffectivePassage[];
  persistenceMode: EnglishTrainingPersistenceMode;
  view: EnglishResultView;
  onViewChange: (view: EnglishResultView) => void;
}) {
  return (
    <div className="space-y-4">
      <section className="surface-panel p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-headline text-xl font-bold text-on-surface">英语一结果分析</h2>
            <p className="mt-1 text-sm text-on-surface-variant">正式统计自动采用最高已完成轮次的最新有效版本，AI 建议不会混入分数。</p>
          </div>
          <div className="flex gap-2">
            <TabButton active={view === "type"} onClick={() => onViewChange("type")}>按题型</TabButton>
            <TabButton active={view === "paper"} onClick={() => onViewChange("paper")}>按套卷</TabButton>
          </div>
        </div>
        <p className="mt-3 rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-xs leading-5 text-on-surface-variant">
          {persistenceMode === "legacy"
            ? "当前三轮与纠正轨迹来自本机浏览器；旧数据库只保留最近正式结果。完成生产数据迁移前，这些历史不会冒充跨设备同步。"
            : persistenceMode === "dual"
              ? "当前三轮与纠正轨迹来自共享训练核；旧数据库仅保留最高已完成轮次的兼容投影。"
              : "当前三轮与纠正轨迹来自共享训练核，并以追加式修订和正式评分作为统计真源。"}
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      {view === "type" ? (
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
      ) : (
        <section className="surface-panel p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="font-headline text-xl font-bold text-on-surface">年度套卷</h2>
            <p className="mt-1 text-sm text-on-surface-variant">同一年各客观题型合并观察；未完成的题组不计入已得分分母。</p>
          </div>
          {paperStats.length === 0 ? (
            <p className="rounded-lg border border-dashed border-outline-variant/30 px-3 py-8 text-center text-sm text-on-surface-variant">还没有可分析的套卷。</p>
          ) : (
            <div className="space-y-3">
              {paperStats.map((paper) => {
                const accuracy = getAccuracy(paper.score, paper.maxScore);
                return (
                  <div key={paper.paperId} className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xl font-bold tabular-nums text-on-surface">{paper.year} 英语一</div>
                        <div className="mt-1 text-xs text-on-surface-variant">完成 {paper.completed}/{paper.total} 个客观题组</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold text-primary">{formatScore(paper.score)}/{formatScore(paper.maxScore)}</div>
                        <div className="mt-1 text-xs text-on-surface-variant">正确率 {accuracy}%</div>
                      </div>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-container-high">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${paper.maxScore > 0 ? Math.max(accuracy, 4) : 0}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="surface-panel p-4">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <h2 className="font-headline text-base font-bold text-on-surface">三轮与纠正轨迹</h2>
        </div>
        {recentHistory.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-outline-variant/30 px-3 py-8 text-center text-sm text-on-surface-variant">
            还没有提交过客观题。
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {recentHistory.slice(0, 12).map((item) => (
              <div key={item.passage.id} className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-3">
                <Link
                  href={`/tools/english-training?passage=${encodeURIComponent(item.passage.id)}&round=${item.round}&edit=1`}
                  className="block transition-colors hover:text-primary"
                >
                  <div className="flex items-start justify-between gap-3">
                   <div className="min-w-0">
                    <div className="text-sm font-bold text-on-surface">{item.passage.displayTitle}</div>
                    <div className="mt-1 text-xs text-on-surface-variant">
                      当前采用 R{item.round} · v{item.revision.revisionNo}
                    </div>
                  </div>
                  <div className="text-sm font-bold text-primary">
                    {formatScore(item.revision.score)}/{formatScore(item.revision.maxScore)}
                  </div>
                  </div>
                </Link>
                <div className="mt-3 space-y-2 border-t border-outline-variant/15 pt-2">
                  {item.ledger.rounds.map((round) => (
                    <div key={round.round} className="text-xs text-on-surface-variant">
                      <div className="font-semibold text-on-surface">R{round.round} · {formatRoundStatus(round.status)}</div>
                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
                        {round.revisions.length === 0 ? (
                          <span>尚无正式提交</span>
                        ) : round.revisions.map((revision) => (
                          <span key={revision.id}>
                            v{revision.revisionNo} {revision.kind === "correction" ? "纠正" : "提交"} {formatScore(revision.score)}/{formatScore(revision.maxScore)}{revision.gradeOrigin === "ai_suggested" ? "（AI建议，不计分）" : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <Link href={`/tools/english-training?passage=${encodeURIComponent(item.passage.id)}&round=${item.round}&edit=1`} className="mt-2 inline-block text-xs font-semibold text-primary">
                  修改当前轮
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
      </div>
    </div>
  );
}

function formatRoundStatus(status: EnglishPassageRoundLedger["rounds"][number]["status"]): string {
  if (status === "in_progress") return "作答中";
  if (status === "submitted") return "已提交";
  if (status === "sealed") return "已封存";
  return "已放弃";
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
