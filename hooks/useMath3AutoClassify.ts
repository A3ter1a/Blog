"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { buildAuthHeaders } from "@/lib/fetch-with-auth";
import { recordDeepSeekUsage } from "@/lib/ai-usage";
import {
  normalizeMath3ChapterAssignments,
  type Math3ChapterAssignment,
} from "@/lib/math3-classification";
import { setMath3ProblemChapterTag } from "@/lib/math3-practice";
import type { Problem, Subject } from "@/lib/types";

const INITIAL_BATCH_SIZE = 6;
const QUESTION_PREVIEW_LIMIT = 1200;
const ANSWER_PREVIEW_LIMIT = 500;
const OPTION_PREVIEW_LIMIT = 500;

type ClassifyItem = {
  problem: Problem;
  index: number;
};

type ClassifyProgress = {
  completed: number;
  failed: number;
  total: number;
};

type UseMath3AutoClassifyOptions = {
  problems: Problem[];
  subject: Subject;
  onChange: (problems: Problem[]) => void;
};

type Math3AutoClassifyRunOptions = {
  problemIds?: string[];
  scopeLabel?: string;
};

type BatchClassifyResult = {
  assignments: Math3ChapterAssignment[];
  tokensUsed: number;
};

class Math3ClassifyRequestError extends Error {
  retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "Math3ClassifyRequestError";
    this.retryable = retryable;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function getNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function trimForClassification(value: string, limit: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, limit)}...(已截断)`;
}

function getPayloadError(payload: unknown): string {
  if (!isRecord(payload)) return "AI 大纲归类失败";
  return getString(payload.error, "AI 大纲归类失败");
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 422 || status === 429 || status >= 500;
}

function splitBatch(batch: ClassifyItem[]): [ClassifyItem[], ClassifyItem[]] {
  const middle = Math.ceil(batch.length / 2);
  return [batch.slice(0, middle), batch.slice(middle)];
}

function getProblemLabel(item: ClassifyItem): string {
  return `第 ${item.index + 1} 题`;
}

async function requestMath3ClassifyBatch(batch: ClassifyItem[]): Promise<BatchClassifyResult> {
  const response = await fetch("/api/ai/math3-classify", {
    method: "POST",
    headers: await buildAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      problems: batch.map(({ problem, index }) => ({
        id: problem.id,
        index: index + 1,
        type: problem.type,
        question: trimForClassification(problem.question, QUESTION_PREVIEW_LIMIT),
        answer: trimForClassification(problem.answer, ANSWER_PREVIEW_LIMIT),
        options: problem.options?.map((option, optionIndex) => ({
          label: option.label || String.fromCharCode(65 + optionIndex),
          content: trimForClassification(option.content, OPTION_PREVIEW_LIMIT),
        })),
      })),
    }),
  });

  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Math3ClassifyRequestError(getPayloadError(payload), isRetryableStatus(response.status));
  }

  return {
    assignments: normalizeMath3ChapterAssignments(
      payload,
      batch.map(({ problem }) => problem.id),
    ),
    tokensUsed: isRecord(payload) ? getNumber(payload.tokensUsed) : 0,
  };
}

export function useMath3AutoClassify({
  problems,
  subject,
  onChange,
}: UseMath3AutoClassifyOptions) {
  const toast = useToast();
  const [isClassifyingMath3, setIsClassifyingMath3] = useState(false);
  const [math3ClassifyProgress, setMath3ClassifyProgress] = useState<ClassifyProgress | null>(null);

  const handleAutoClassifyMath3 = useCallback(async (options?: Math3AutoClassifyRunOptions) => {
    if (isClassifyingMath3) return;
    if (subject !== "math") {
      toast.info("数三大纲归类只适用于数学题集");
      return;
    }

    const scopedProblemIds = options?.problemIds?.filter(Boolean) ?? [];
    const scopedProblemIdSet = scopedProblemIds.length > 0 ? new Set(scopedProblemIds) : null;
    const scopeLabel = options?.scopeLabel ?? (scopedProblemIdSet ? "选中题目" : "全部题目");

    const classifiableItems = problems
      .map((problem, index) => ({ problem, index }))
      .filter(({ problem }) => !scopedProblemIdSet || scopedProblemIdSet.has(problem.id))
      .filter(({ problem }) => problem.question.trim());

    if (classifiableItems.length === 0) {
      toast.info(scopedProblemIdSet ? "选中的题目没有可归类内容" : "当前没有可归类的题目");
      return;
    }

    const assignments = new Map<string, Math3ChapterAssignment>();
    const failures: string[] = [];
    let totalTokensUsed = 0;

    const updateProgress = (completedDelta: number, failedDelta = 0) => {
      setMath3ClassifyProgress((current) => {
        if (!current) return current;
        return {
          total: current.total,
          completed: Math.min(current.total, current.completed + completedDelta),
          failed: current.failed + failedDelta,
        };
      });
    };

    const classifyBatch = async (batch: ClassifyItem[]): Promise<void> => {
      if (batch.length === 0) return;

      try {
        const result = await requestMath3ClassifyBatch(batch);
        totalTokensUsed += result.tokensUsed;

        const returnedIds = new Set<string>();
        for (const assignment of result.assignments) {
          assignments.set(assignment.problemId, assignment);
          returnedIds.add(assignment.problemId);
        }

        const missingItems = batch.filter(({ problem }) => !returnedIds.has(problem.id));
        const acceptedCount = batch.length - missingItems.length;
        if (acceptedCount > 0) updateProgress(acceptedCount);

        if (missingItems.length === 0) return;

        if (missingItems.length < batch.length) {
          await classifyBatch(missingItems);
          return;
        }

        if (batch.length > 1) {
          const [left, right] = splitBatch(batch);
          await classifyBatch(left);
          await classifyBatch(right);
          return;
        }

        failures.push(`${getProblemLabel(batch[0])}：AI 未返回章节`);
        updateProgress(1, 1);
      } catch (error) {
        if (error instanceof Math3ClassifyRequestError && !error.retryable) {
          throw error;
        }

        if (batch.length > 1) {
          const [left, right] = splitBatch(batch);
          await classifyBatch(left);
          await classifyBatch(right);
          return;
        }

        const message = error instanceof Error ? error.message : "未知错误";
        failures.push(`${getProblemLabel(batch[0])}：${message}`);
        updateProgress(1, 1);
      }
    };

    setIsClassifyingMath3(true);
    setMath3ClassifyProgress({ completed: 0, failed: 0, total: classifiableItems.length });

    try {
      for (let start = 0; start < classifiableItems.length; start += INITIAL_BATCH_SIZE) {
        await classifyBatch(classifiableItems.slice(start, start + INITIAL_BATCH_SIZE));
      }

      if (totalTokensUsed > 0) recordDeepSeekUsage(totalTokensUsed);

      if (assignments.size === 0) {
        toast.error("AI 没有返回可用的大纲章节，请重试");
        return;
      }

      let changedCount = 0;
      onChange(problems.map((problem) => {
        const assignment = assignments.get(problem.id);
        if (!assignment) return problem;

        const nextTags = setMath3ProblemChapterTag(problem.tags, assignment.chapterId);
        const changed = nextTags.join("|") !== (problem.tags ?? []).join("|");
        if (changed) changedCount += 1;
        return { ...problem, tags: nextTags, aiStatus: "complete" };
      }));

      if (failures.length > 0) {
        toast.info(`已归入 ${scopeLabel}中的 ${assignments.size} 道题，${failures.length} 道题需要人工检查`);
      } else {
        toast.success(`已按数三知识目录归入 ${scopeLabel}中的 ${changedCount || assignments.size} 道题，请保存题集后生效`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(`AI 大纲归类失败：${message}`);
    } finally {
      setIsClassifyingMath3(false);
      setMath3ClassifyProgress(null);
    }
  }, [isClassifyingMath3, onChange, problems, subject, toast]);

  return {
    isClassifyingMath3,
    math3ClassifyProgress,
    handleAutoClassifyMath3,
  };
}
