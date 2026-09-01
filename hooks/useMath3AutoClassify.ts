"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useJobCenter } from "@/components/jobs/JobCenter";
import { useToast } from "@/components/ui/Toast";
import { recordDeepSeekUsage } from "@/lib/ai-usage";
import {
  buildMath3ClassificationInputs,
  calculateMath3ClassificationChecksum,
} from "@/lib/math3-classification-job";
import {
  normalizeMath3ChapterAssignments,
  type Math3ChapterAssignment,
} from "@/lib/math3-classification";
import { setMath3ProblemChapterTag } from "@/lib/math3-practice";
import type { Problem, Subject } from "@/lib/types";

type ClassifyProgress = {
  completed: number;
  failed: number;
  total: number;
};

type UseMath3AutoClassifyOptions = {
  problems: Problem[];
  subject: Subject;
  onChange: (problems: Problem[]) => void;
  targetId: string;
  onResultApplied?: (jobId: string) => void;
};

type Math3AutoClassifyRunOptions = {
  problemIds?: string[];
  scopeLabel?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function useMath3AutoClassify({
  problems,
  subject,
  onChange,
  targetId,
  onResultApplied,
}: UseMath3AutoClassifyOptions) {
  const toast = useToast();
  const {
    jobs,
    createMath3ClassifyJob,
    loadJobResult,
  } = useJobCenter();
  const handledResultJobsRef = useRef(new Set<string>());

  const activeJob = useMemo(() => jobs.find((job) => (
    job.type === "math3_auto_classify"
    && job.targetId === targetId
    && (job.status === "queued" || job.status === "running" || job.status === "waiting_for_trigger")
  )), [jobs, targetId]);
  const isClassifyingMath3 = Boolean(activeJob);
  const math3ClassifyProgress = useMemo<ClassifyProgress | null>(() => activeJob ? {
    completed: activeJob.progressCurrent ?? 0,
    failed: 0,
    total: activeJob.progressTotal ?? 0,
  } : null, [activeJob]);

  useEffect(() => {
    const completedJob = jobs.find((job) => (
      job.type === "math3_auto_classify"
      && job.targetId === targetId
      && job.status === "succeeded"
      && !job.resultClaimedAt
      && !handledResultJobsRef.current.has(job.id)
    ));
    if (!completedJob) return;
    if (!completedJob.resultPayload) {
      void loadJobResult(completedJob.id);
      return;
    }
    const result = asRecord(completedJob.resultPayload);
    const problemIds = Array.isArray(result.problemIds)
      ? result.problemIds.filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
      : [];
    const sourceChecksum = typeof result.sourceChecksum === "string" ? result.sourceChecksum : "";
    const scopeLabel = typeof result.scopeLabel === "string" ? result.scopeLabel : "题目";
    const resultTargetId = typeof result.targetId === "string" ? result.targetId : "";
    if (!problemIds.length || !sourceChecksum || resultTargetId !== targetId) return;

    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      const currentInputs = buildMath3ClassificationInputs(problems, problemIds);
      const currentChecksum = await calculateMath3ClassificationChecksum(currentInputs);
      if (cancelled) return;
      if (currentInputs.length !== problemIds.length || currentChecksum !== sourceChecksum) {
        handledResultJobsRef.current.add(completedJob.id);
        toast.info(`数学三${scopeLabel}在归类期间已被修改；旧结果仍保留在任务中心，未覆盖当前内容`);
        return;
      }
      const assignments = normalizeMath3ChapterAssignments(
        { assignments: result.assignments },
        problemIds,
      );
      if (assignments.length !== problemIds.length) {
        toast.error("数学三归类结果不完整，任务结果已保留，可稍后重试");
        return;
      }
      const assignmentById = new Map<string, Math3ChapterAssignment>(
        assignments.map((assignment) => [assignment.problemId, assignment]),
      );
      let changedCount = 0;
      handledResultJobsRef.current.add(completedJob.id);
      onChange(problems.map((problem) => {
        const assignment = assignmentById.get(problem.id);
        if (!assignment) return problem;
        const nextTags = setMath3ProblemChapterTag(problem.tags, assignment.chapterId);
        if (nextTags.join("|") !== (problem.tags ?? []).join("|")) changedCount += 1;
        return { ...problem, tags: nextTags, aiStatus: "complete" };
      }));
      const tokensUsed = Number(result.tokensUsed);
      if (Number.isFinite(tokensUsed) && tokensUsed > 0) recordDeepSeekUsage(tokensUsed);
      onResultApplied?.(completedJob.id);
      toast.success(`已按数三知识目录归入${scopeLabel}中的 ${changedCount || assignments.length} 道题，请保存题集后生效`);
    })();
    return () => { cancelled = true; };
  }, [jobs, loadJobResult, onChange, onResultApplied, problems, targetId, toast]);

  const handleAutoClassifyMath3 = useCallback(async (options?: Math3AutoClassifyRunOptions) => {
    if (isClassifyingMath3) return;
    if (subject !== "math") {
      toast.info("数三大纲归类只适用于数学题集");
      return;
    }
    if (!targetId) {
      toast.info("编辑目标还在初始化，请稍后再发起归类");
      return;
    }
    const scopedProblemIds = options?.problemIds?.filter(Boolean) ?? [];
    const scopeLabel = options?.scopeLabel ?? (scopedProblemIds.length > 0 ? "选中题目" : "全部题目");
    const inputs = buildMath3ClassificationInputs(problems, scopedProblemIds);
    if (inputs.length === 0) {
      toast.info(scopedProblemIds.length > 0 ? "选中的题目没有可归类内容" : "当前没有可归类的题目");
      return;
    }
    try {
      const sourceChecksum = await calculateMath3ClassificationChecksum(inputs);
      await createMath3ClassifyJob({ problems: inputs, sourceChecksum, scopeLabel, targetId });
      toast.info(`数学三${scopeLabel}归类已并入任务中心；切换页面不会丢失，返回后会先校验题目是否变化`);
    } catch (error) {
      toast.error(`AI 大纲归类任务创建失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  }, [createMath3ClassifyJob, isClassifyingMath3, problems, subject, targetId, toast]);

  return {
    isClassifyingMath3,
    math3ClassifyProgress,
    handleAutoClassifyMath3,
  };
}
