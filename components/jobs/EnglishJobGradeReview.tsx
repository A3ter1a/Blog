"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { englishTrainingApi, type EnglishTrainingRoundHistory } from "@/lib/english-training-api";
import { getLatestEnglishRoundRevision } from "@/lib/english-round-history";
import type { EnglishSubjectiveGradeSuggestion } from "@/lib/english-subjective-grade";
import { EnglishGradingFeedback } from "./EnglishGradingFeedback";

export function EnglishJobGradeReview({ result, suggestion }: {
  result: Record<string, unknown>;
  suggestion: EnglishSubjectiveGradeSuggestion;
}) {
  const passageId = typeof result.passageId === "string" ? result.passageId : "";
  const revisionId = typeof result.revisionId === "string" ? result.revisionId : "";
  const roundNo = Number(result.round);
  const [history, setHistory] = useState<EnglishTrainingRoundHistory | null>(null);
  const [verifying, setVerifying] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const refresh = useCallback(async () => {
    setVerifying(true);
    setError("");
    try { setHistory(await englishTrainingApi.getRoundHistory()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "无法核对确认状态，请重试。"); }
    finally { setVerifying(false); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const round = history?.ledgers.find((ledger) => ledger.passageId === passageId)?.rounds.find((item) => item.round === roundNo);
  const revision = round?.revisions.find((item) => item.id === revisionId);
  const finalGrade = revision?.grades?.filter((grade) => grade.origin === "user_final").sort((a, b) => b.gradeSeq - a.gradeSeq)[0];
  const currentRevision = getLatestEnglishRoundRevision(round);
  const canConfirm = Boolean(passageId && revisionId && revision && currentRevision?.id === revisionId && round?.status !== "abandoned");

  const confirm = async (score: number, feedback: string) => {
    if (pending.current || verifying || !canConfirm) return;
    pending.current = true;
    setConfirming(true);
    setError("");
    try {
      const latest = await englishTrainingApi.getRoundHistory();
      const latestRound = latest.ledgers.find((ledger) => ledger.passageId === passageId)?.rounds.find((item) => item.round === roundNo);
      const latestRevision = getLatestEnglishRoundRevision(latestRound);
      if (latestRound?.status === "abandoned" || latestRevision?.id !== revisionId) throw new Error("作答版本已更新或重置，请查看最新批改结果。");
      if (latestRevision.grades?.some((grade) => grade.origin === "user_final")) { setHistory(latest); return; }
      const saved = await englishTrainingApi.confirmSubjectiveGrade({ passage: { id: passageId }, revisionId, score, feedback, suggestion });
      setHistory(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "确认失败，请重试。");
    } finally {
      pending.current = false;
      setConfirming(false);
    }
  };

  return <>
    <EnglishGradingFeedback suggestion={suggestion} finalGrade={finalGrade} verifying={verifying} confirming={confirming} error={error || (!verifying && history && !canConfirm && !finalGrade ? "这份批改对应的作答已更新或重置，请查看最新结果。" : undefined)} onConfirm={canConfirm ? (score, feedback) => { void confirm(score, feedback); } : undefined} />
    {error && !confirming && <button type="button" onClick={() => void refresh()} className="control-button min-h-11 px-4 text-sm">重新核对状态</button>}
  </>;
}
