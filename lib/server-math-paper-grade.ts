import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { callDeepSeek } from "./ai-client";
import { parseAIJson } from "./ai-json";
import { resolveAIProviderRoute } from "./ai-provider-routing";
import {
  normalizeMathGradeSuggestion,
  parseMathGradeSource,
  type MathGradeStep,
  type MathGradeSuggestion,
} from "./math-training-core";
import {
  getMathGradeSource,
  getMathTrainingState,
  recordMathAiGrade,
} from "./server-math-training-core";
import type { Database } from "./supabase-schema";

export type MathPaperGradeStage = {
  phase: string;
  statusText: string;
  progressCurrent: number;
  progressTotal: number;
};

type GenerateMathPaperGradeInput = {
  supabase: SupabaseClient<Database>;
  confirmationId: string;
  apiKey: string;
  signal?: AbortSignal;
};

type GenerateAndRecordMathPaperGradeInput = GenerateMathPaperGradeInput & {
  paperId: string;
  commandId: string;
  beforePersist?: () => Promise<void> | void;
  onStage?: (stage: MathPaperGradeStage) => Promise<void> | void;
};

export type MathPaperGradeGenerationResult = {
  suggestion: MathGradeSuggestion;
  tokensUsed: number;
  model: string;
  confirmationId: string;
};

export type MathPaperGradeJobResult = MathPaperGradeGenerationResult & {
  paperId: string;
  gradeId: string;
  idempotent: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((item) => Object.keys(item).length > 0)
    : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizePersistedSteps(value: unknown): MathGradeStep[] {
  return records(value).flatMap((step): MathGradeStep[] => {
    if (typeof step.problemId !== "string" || typeof step.criterion !== "string") return [];
    const earnedScore = Number(step.earnedScore);
    const maxScore = Number(step.maxScore);
    if (!Number.isFinite(earnedScore) || !Number.isFinite(maxScore)) return [];
    return [{
      problemId: step.problemId,
      criterion: step.criterion,
      earnedScore,
      maxScore,
      deductionReason: typeof step.deductionReason === "string" ? step.deductionReason : null,
    }];
  });
}

function findPersistedSuggestion(
  value: unknown,
  gradeId: string,
  confirmationId: string,
): MathPaperGradeGenerationResult | null {
  const state = asRecord(value);
  for (const attempt of records(state.attempts)) {
    for (const confirmation of records(attempt.confirmations)) {
      if (confirmation.id !== confirmationId) continue;
      for (const grade of records(confirmation.grades)) {
        if (grade.id !== gradeId || grade.origin !== "ai_suggested") continue;
        const breakdown = asRecord(grade.breakdown);
        const steps = normalizePersistedSteps(grade.steps);
        const score = Number(grade.score);
        const maxScore = Number(grade.maxScore);
        const feedback = typeof grade.feedback === "string" ? grade.feedback : "";
        if (!steps.length || !Number.isFinite(score) || !Number.isFinite(maxScore) || !feedback) return null;
        return {
          confirmationId,
          model: typeof breakdown.model === "string" ? breakdown.model : "persisted",
          tokensUsed: Number.isFinite(Number(breakdown.tokensUsed)) ? Number(breakdown.tokensUsed) : 0,
          suggestion: {
            score,
            maxScore,
            feedback,
            strengths: strings(breakdown.strengths),
            issues: strings(breakdown.issues),
            suggestions: strings(breakdown.suggestions),
            confidence: Number.isFinite(Number(breakdown.confidence)) ? Number(breakdown.confidence) : 0,
            steps,
          },
        };
      }
    }
  }
  return null;
}

export async function generateMathPaperGradeSuggestion(
  input: GenerateMathPaperGradeInput,
): Promise<MathPaperGradeGenerationResult> {
  const source = parseMathGradeSource(await getMathGradeSource(input.supabase, input.confirmationId));
  const confirmedPages = Array.isArray(source.confirmedPayload.pages)
    ? source.confirmedPayload.pages.map((page, index) => {
      const record = asRecord(page);
      return `答题页 ${index + 1}：\n${typeof record.text === "string" ? record.text : "（空）"}`;
    }).join("\n\n")
    : "";
  if (!confirmedPages.trim()) throw new Error("已确认 OCR 文本为空");

  const problemText = source.problems.map((problem) => [
    `problemId: ${problem.problemId}`,
    `题号：${problem.problemNo}`,
    `题目：${problem.prompt}`,
    `标准答案：${problem.standardAnswer}`,
    `评分细则：${JSON.stringify(problem.scoringRubric)}`,
    `本题满分：${problem.maxScore}`,
  ].join("\n")).join("\n\n");
  const task = resolveAIProviderRoute("deep_reasoning");
  const systemPrompt = `你是严谨的考研数学阅卷老师。你只能依据给定的固定真题、标准答案、评分细则和用户已确认的 OCR 文本评分。你的结果只是建议，用户确认前绝不是正式成绩。

要求：
- 为每道题逐步给分；每个步骤必须绑定原样 problemId。
- 同一题所有步骤 maxScore 之和必须严格等于该题满分；所有题都必须覆盖。
- earnedScore 在 0 到该步骤 maxScore 之间，允许 0.5 分。
- deductionReason 在未满分时说明具体扣分原因；满分时可为 null。
- 不推测 OCR 文本没有表达的步骤，不因最终答案正确而补发过程分。
- feedback、strengths、issues、suggestions 要可读且可操作；confidence 在 0 到 1。
- 只返回 JSON，不要 Markdown。

结构：
{"feedback":"总评","strengths":["优点"],"issues":["问题"],"suggestions":["建议"],"confidence":0,"steps":[{"problemId":"UUID","criterion":"评分点","earnedScore":0,"maxScore":0,"deductionReason":"扣分原因或 null"}]}`;
  const userPrompt = `试卷：${source.examYear ?? "未知年份"} ${source.paperCode ?? "数学"}

固定题源与评分细则：
${problemText}

用户逐页确认后的 OCR 作答：
${confirmedPages}`;
  const { content, tokensUsed } = await callDeepSeek(input.apiKey, task.model, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], { temperature: 0.05, maxTokens: 5000, responseFormat: "json_object", signal: input.signal });
  return {
    suggestion: normalizeMathGradeSuggestion(parseAIJson(content), source.problems),
    tokensUsed,
    model: task.model,
    confirmationId: input.confirmationId,
  };
}

export async function generateAndRecordMathPaperGrade(
  input: GenerateAndRecordMathPaperGradeInput,
): Promise<MathPaperGradeJobResult> {
  const existing = findPersistedSuggestion(
    await getMathTrainingState(input.supabase, input.paperId),
    input.commandId,
    input.confirmationId,
  );
  if (existing) {
    return { ...existing, paperId: input.paperId, gradeId: input.commandId, idempotent: true };
  }

  await input.onStage?.({
    phase: "正在读取确认版本",
    statusText: "正在读取固定真题、评分细则与已确认 OCR 文本",
    progressCurrent: 0,
    progressTotal: 2,
  });
  const generated = await generateMathPaperGradeSuggestion(input);
  await input.onStage?.({
    phase: "正在保存建议分",
    statusText: "模型已返回，正在原子追加 AI 建议到评分账本",
    progressCurrent: 1,
    progressTotal: 2,
  });
  await input.beforePersist?.();
  const persisted = asRecord(await recordMathAiGrade(input.supabase, {
    confirmationId: input.confirmationId,
    commandId: input.commandId,
    score: generated.suggestion.score,
    maxScore: generated.suggestion.maxScore,
    feedback: generated.suggestion.feedback,
    breakdown: {
      strengths: generated.suggestion.strengths,
      issues: generated.suggestion.issues,
      suggestions: generated.suggestion.suggestions,
      confidence: generated.suggestion.confidence,
      model: generated.model,
      tokensUsed: generated.tokensUsed,
    },
    steps: generated.suggestion.steps,
  }));
  const gradeId = typeof persisted.gradeId === "string" ? persisted.gradeId : "";
  if (!gradeId) throw new Error("建议分没有写入评分账本");
  await input.onStage?.({
    phase: "建议分已保存",
    statusText: "AI 建议已追加保存；打开数学真题 OCR 页面逐步核对并确认终分",
    progressCurrent: 2,
    progressTotal: 2,
  });
  return {
    ...generated,
    paperId: input.paperId,
    gradeId,
    idempotent: persisted.idempotent === true,
  };
}
