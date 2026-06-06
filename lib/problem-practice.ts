import type { PracticeResult, ProblemPracticeStatus } from "./types";
import { getPracticeProblemKey } from "./math3-practice";

export type PracticeFilter = "all" | "review" | "wrong" | "unpracticed" | "unmastered" | "mastered";

export const PRACTICE_FILTERS: Array<{ value: PracticeFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "review", label: "待回看" },
  { value: "wrong", label: "答错" },
  { value: "unpracticed", label: "未刷" },
  { value: "unmastered", label: "未掌握" },
  { value: "mastered", label: "已掌握" },
];

export function getRoundLabel(round: number): string {
  const labels = ["未刷", "一刷", "二刷", "三刷", "四刷", "五刷"];
  return labels[round] ?? `${round} 刷`;
}

export function getResultLabel(result?: PracticeResult): string {
  if (result === "correct") return "最近答对";
  if (result === "wrong") return "最近答错";
  if (result === "skipped") return "已跳过";
  return "未作答";
}

export function getStatusTone(status?: ProblemPracticeStatus): string {
  if (!status || status.round === 0) return "bg-surface-container-high text-on-surface-variant";
  if (status.lastResult === "wrong") return "bg-red-50 text-red-700";
  if (status.isMastered) return "bg-green-50 text-green-700";
  if (status.lastResult === "correct") return "bg-primary/10 text-primary";
  return "bg-amber-50 text-amber-700";
}

export function isPracticed(status?: ProblemPracticeStatus): boolean {
  return (status?.round ?? 0) > 0;
}

export function isReviewStatus(status?: ProblemPracticeStatus): boolean {
  return status?.lastResult === "wrong" || status?.lastResult === "skipped";
}

export function matchesPracticeFilter(
  status: ProblemPracticeStatus | undefined,
  filter: PracticeFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "review") return isReviewStatus(status);
  if (filter === "wrong") return status?.lastResult === "wrong";
  if (filter === "unpracticed") return !isPracticed(status);
  if (filter === "unmastered") return !status?.isMastered;
  return Boolean(status?.isMastered);
}

export function toPracticeStatusMap(statuses: ProblemPracticeStatus[]): Record<string, ProblemPracticeStatus> {
  return Object.fromEntries(
    statuses.map((status) => [getPracticeProblemKey(status.noteId, status.problemId), status])
  );
}
