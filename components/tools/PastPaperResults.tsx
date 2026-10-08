"use client";

import Link from "next/link";
import { createElement, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, History, Loader2 } from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/PageScaffold";
import { useToast } from "@/components/ui/Toast";
import { useLocalReviewMode } from "@/hooks/useAdminAuth";
import {
  ENGLISH_TRAINING_YEARS,
  englishSectionLabels,
  type EnglishSection,
} from "@/lib/english-training";
import {
  englishResultsApi,
  type EnglishResultPassage,
  type EnglishResultsData,
} from "@/lib/english-results-api";
import { englishTrainingApi } from "@/lib/english-training-api";
import { getEnglishReviewFixture } from "@/lib/english-review-fixture";
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

function filterEnglishResultsWindow(data: EnglishResultsData): EnglishResultsData {
  const allowedYears = new Set(ENGLISH_TRAINING_YEARS);
  const passages = data.passages.filter((passage) => allowedYears.has(passage.year));
  return { passages };
}

export function PastPaperResults() {
  const toast = useToast();
  const reviewMode = useLocalReviewMode();
  const [data, setData] = useState<EnglishResultsData>({ passages: [] });
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
        if (reviewMode) {
          const fixture = getEnglishReviewFixture();
          setData(filterEnglishResultsWindow({
            passages: fixture.passages.map((passage) => ({
              ...passage,
              displayTitle: `${passage.year} ${englishSectionLabels[passage.section]} ${passage.title}`,
              questions: fixture.questions.filter((question) => question.passageId === passage.id),
            })),
          }));
          setPersistenceMode("legacy");
          setRoundLedgers(readEnglishRoundLedgers());
          toast.info("本地审查模式已载入英语复盘示例，结果只读取本机训练状态");
          return;
        }
        const [results, roundHistory] = await Promise.all([
          englishResultsApi.getResultsData(),
          englishTrainingApi.getRoundHistory(),
        ]);
        if (cancelled) return;
        const scopedResults = filterEnglishResultsWindow(results);
        setData(scopedResults);
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
          ? scopedResults.passages.reduce((ledgers, passage) => {
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
  }, [reviewMode, toast]);

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
        description="在同一页查看英语与数学真题训练的进度、得分和复盘入口。"
        actions={(
          <Link href="/tools" className="control-button h-10 px-3 text-sm">
            <ArrowLeft className="h-4 w-4" />
            返回工具
          </Link>
        )}
        stats={[
          { label: "英语已提交", value: stats.submittedTotal },
          { label: "英语正确率", value: `${stats.accuracy}%`, tone: "text-green-600" },
          { label: "英语得分", value: `${formatScore(stats.score)}/${formatScore(stats.maxScore)}` },
          { label: "英语丢分", value: formatScore(stats.lost), tone: "text-red-600" },
        ]}
      />

      <PageShell width="workspace" topPadding="content">
        {isLoading ? (
          <InlinePanel>
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span>正在加载真题训练结果。</span>
          </InlinePanel>
        ) : loadError ? (
          <InlinePanel tone="text-red-700">{loadError}</InlinePanel>
        ) : (
          <div className="space-y-5">
            <EnglishResultPanel
              stats={stats}
              sectionStats={sectionStats}
              paperStats={paperStats}
              recentHistory={recentHistory}
              persistenceMode={persistenceMode}
              view={englishView}
              onViewChange={setEnglishView}
            />
            <MathResultPlaceholder />
          </div>
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
            <p className="mt-1 text-sm text-on-surface-variant">正式统计只采用已确认的提交结果，AI 建议不会混入分数。</p>
          </div>
          <div className="flex gap-2">
            <TabButton active={view === "type"} onClick={() => onViewChange("type")}>按题型</TabButton>
            <TabButton active={view === "paper"} onClick={() => onViewChange("paper")}>按套卷</TabButton>
          </div>
        </div>
        <p className="mt-3 rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-xs leading-5 text-on-surface-variant">
          {persistenceMode === "legacy"
            ? "训练结果保存在本机浏览器；数据库只保留最近一次正式结果。"
            : "训练结果来自共享训练核，并以正式评分作为统计真源。"}
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
          <h2 className="font-headline text-base font-bold text-on-surface">提交记录</h2>
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
                  href={`/tools/english-training?passage=${encodeURIComponent(item.passage.id)}&edit=1`}
                  className="block transition-colors hover:text-primary"
                >
                  <div className="flex items-start justify-between gap-3">
                   <div className="min-w-0">
                    <div className="text-sm font-bold text-on-surface">{item.passage.displayTitle}</div>
                    <div className="mt-1 text-xs text-on-surface-variant">
                      当前正式记录 · v{item.revision.revisionNo}
                    </div>
                  </div>
                  <div className="text-sm font-bold text-primary">
                    {formatScore(item.revision.score)}/{formatScore(item.revision.maxScore)}
                  </div>
                  </div>
                </Link>
                <Link href={`/tools/english-training?passage=${encodeURIComponent(item.passage.id)}&edit=1`} className="mt-2 inline-block text-xs font-semibold text-primary">
                  修改答案
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
    <section className="surface-panel p-4 sm:p-5">
      <CheckCircle2 className="h-9 w-9 text-primary" />
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-headline text-xl font-bold text-on-surface">数学真题</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-on-surface-variant">
            数学训练与英语结果放在同一页；数学统计接入后会沿用这里的题型、套卷和错题复盘结构。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/tools/math-training" className="control-button h-10 px-3 text-sm">进入数学训练</Link>
          <Link href="/tools/review" className="control-button h-10 px-3 text-sm">查看错题</Link>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <MetricCard label="已完成套卷" value="待统计" />
        <MetricCard label="正确率" value="待统计" tone="text-on-surface-variant" />
        <MetricCard label="错题复盘" value="从错题入口进入" tone="text-on-surface-variant" />
      </div>
    </section>
  );
}
