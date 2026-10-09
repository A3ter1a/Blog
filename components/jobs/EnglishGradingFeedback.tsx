"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import type { EnglishSubjectiveGradeSuggestion } from "@/lib/english-subjective-grade";

export function EnglishGradingFeedback({ suggestion, finalGrade, confirming = false, verifying = false, error, onConfirm }: {
  suggestion: EnglishSubjectiveGradeSuggestion;
  finalGrade?: { score: number; feedback?: string };
  confirming?: boolean;
  verifying?: boolean;
  error?: string;
  onConfirm?: (score: number, feedback: string) => void;
}) {
  const [score, setScore] = useState(String(suggestion.score));
  const numericScore = Number(score);
  const groups = [
    { title: "做得较好", items: suggestion.strengths },
    { title: "需要修正", items: suggestion.issues },
    { title: "修改建议", items: suggestion.suggestions },
  ].filter((group) => group.items.length > 0);

  return <section aria-label="AI 批改建议" className="english-grading-feedback text-sm text-on-surface">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant/25 bg-surface-container-low p-4">
      <div><p className="font-semibold">{finalGrade ? "正式得分" : "AI 建议分"}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-primary">{finalGrade?.score ?? suggestion.score}<span className="text-base text-on-surface-variant"> / {suggestion.maxScore}</span></p></div>
      <p className="text-on-surface-variant" role="status">{finalGrade ? "已确认，已计入正式成绩" : verifying ? "正在核对确认状态…" : "确认后计入正式成绩"}</p>
    </div>
    <div><h3 className="font-semibold">总评</h3><p className="mt-1 whitespace-pre-wrap break-words">{finalGrade?.feedback ?? suggestion.feedback}</p></div>
    {groups.map((group) => <div key={group.title} className="english-grading-group rounded-xl border border-outline-variant/25 bg-surface-container-low">
      <h3 className="font-semibold">{group.title}</h3>
      <ul className="english-grading-points">{group.items.map((item, index) => <li key={index} className="whitespace-pre-wrap break-words">{item}</li>)}</ul>
    </div>)}
    {error && <p role="alert" className="text-error">{error}</p>}
    {onConfirm && !finalGrade && <div className="english-grading-confirm">
      <label className="text-sm font-semibold">最终分<div className="mt-2 flex items-center gap-2"><input aria-label="最终分" type="number" min={0} max={suggestion.maxScore} step={0.5} value={score} onChange={(event) => setScore(event.target.value)} disabled={confirming || verifying} className="field-control w-24 px-3 py-2 text-sm" /><span className="font-normal text-on-surface-variant">/ {suggestion.maxScore}</span></div></label>
      <button type="button" disabled={confirming || verifying || !score.trim() || !Number.isFinite(numericScore) || numericScore < 0 || numericScore > suggestion.maxScore || !suggestion.feedback.trim()} onClick={() => onConfirm(numericScore, suggestion.feedback)} className="control-button control-button-primary min-h-11 px-5 text-sm">{confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{confirming ? "正在确认…" : "确认正式终分"}</button>
    </div>}
  </section>;
}
