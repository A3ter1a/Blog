import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { callDeepSeek } from "./ai-client";
import { parseAIJson } from "./ai-json";
import { resolveAIProviderRoute } from "./ai-provider-routing";
import {
  buildEnglishSubjectiveGradeBreakdown,
  normalizeEnglishSubjectiveGradeSuggestion,
  type EnglishSubjectiveGradeSuggestion,
} from "./english-subjective-grade";
import type { EnglishPassageRoundLedger } from "./english-round-history";
import {
  getEnglishTrainingPersistenceMode,
  loadEnglishTrainingCoreLedgers,
  runEnglishSubjectiveSubmission,
} from "./server-english-training-core";
import type { Database } from "./database.types";

export type EnglishSubjectiveGradeStage = {
  phase: string;
  statusText: string;
  progressCurrent: number;
  progressTotal: number;
};

export type EnglishSubjectiveGradeJobResult = {
  resultVersion: 1;
  passageId: string;
  round: 1 | 2 | 3;
  revisionId: string;
  mode: "dual" | "shared";
  ledgers: EnglishPassageRoundLedger[];
  suggestion?: EnglishSubjectiveGradeSuggestion;
  tokensUsed: number;
  model: string;
  idempotent: boolean;
};

export function normalizeEnglishSubjectiveAnswers(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, answer]) => (
    key.length <= 80 && typeof answer === "string" ? [[key, answer.slice(0, 20_000)]] : []
  )));
}

function hasRevision(ledgers: EnglishPassageRoundLedger[], revisionId: string): boolean {
  return ledgers.some((ledger) => ledger.rounds.some((round) => round.revisions.some((revision) => revision.id === revisionId)));
}

export async function generateEnglishSubjectiveGradeSuggestion(input: {
  supabase: SupabaseClient<Database>;
  passageId: string;
  answers: Record<string, string>;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<{ suggestion: EnglishSubjectiveGradeSuggestion; tokensUsed: number; model: string }> {
  const { data: passage, error: passageError } = await input.supabase
    .from("english_passages")
    .select("id,year,section,passage_no,title,content,total_score")
    .eq("id", input.passageId)
    .single();
  if (passageError) throw passageError;
  if (passage.section !== "translation" && passage.section !== "writing") {
    throw new Error("只有翻译与写作使用主观评分");
  }
  const { data: questions, error: questionError } = await input.supabase
    .from("english_questions")
    .select("id,question_no,stem,standard_answer,score,sort_order")
    .eq("passage_id", input.passageId)
    .order("sort_order", { ascending: true });
  if (questionError) throw questionError;
  const questionRows = questions ?? [];
  const questionIds = new Set(questionRows.map((question) => question.id));
  if (Object.keys(input.answers).some((questionId) => !questionIds.has(questionId))) {
    throw new Error("答案包含不属于当前题组的题目");
  }
  const maxScore = questionRows.reduce((sum, question) => sum + Number(question.score ?? 0), 0);
  if (questionRows.length === 0 || maxScore <= 0) throw new Error("当前题组缺少有效评分来源");

  const answerText = questionRows.map((question) => [
    `题号：${question.question_no}`,
    `题目：${question.stem || passage.content || "（无）"}`,
    `参考答案：${question.standard_answer || "（无固定答案，请按考研英语一标准评分）"}`,
    `考生作答：${input.answers[question.id] ?? "（未作答）"}`,
    `本题满分：${question.score}`,
  ].join("\n")).join("\n\n");
  const task = resolveAIProviderRoute("deep_reasoning");
  const systemPrompt = `你是严谨的考研英语一阅卷老师，只评阅翻译或写作主观题。你的分数只是建议，用户确认前绝不能视为正式成绩。

要求：
- 严格按题目满分评分，score 在 0 到 ${maxScore} 之间，允许 0.5 分。
- 翻译重点检查信息完整、语义准确、中文表达；写作重点检查任务完成、结构、语言准确与表达质量。
- 明确指出优点、问题和可操作修改建议，不虚构原文中不存在的信息。
- feedback 给出简洁总评；confidence 在 0 到 1。
- 只返回 JSON 对象，不要 Markdown。

结构：
{"score":0,"feedback":"总评","strengths":["优点"],"issues":["问题"],"suggestions":["修改建议"],"confidence":0}`;
  const userPrompt = `题型：${passage.section}
年份：${passage.year}
题组：${passage.passage_no}
标题：${passage.title || "（无）"}

${answerText}`;
  const { content, tokensUsed } = await callDeepSeek(input.apiKey, task.model, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], { temperature: 0.1, maxTokens: 2000, responseFormat: "json_object", signal: input.signal });
  return {
    suggestion: normalizeEnglishSubjectiveGradeSuggestion(parseAIJson(content), maxScore),
    tokensUsed,
    model: task.model,
  };
}

export async function generateAndRecordEnglishSubjectiveGrade(input: {
  supabase: SupabaseClient<Database>;
  userId: string;
  passageId: string;
  round: 1 | 2 | 3;
  answers: Record<string, string>;
  commandId: string;
  apiKey: string;
  signal?: AbortSignal;
  beforePersist?: () => Promise<void> | void;
  onStage?: (stage: EnglishSubjectiveGradeStage) => Promise<void> | void;
}): Promise<EnglishSubjectiveGradeJobResult> {
  const mode = getEnglishTrainingPersistenceMode();
  if (mode === "legacy") throw new Error("主观题确认流需先完成共享训练核迁移");
  const existingLedgers = await loadEnglishTrainingCoreLedgers(input.supabase, input.userId, input.passageId);
  if (hasRevision(existingLedgers, input.commandId)) {
    return {
      resultVersion: 1,
      passageId: input.passageId,
      round: input.round,
      revisionId: input.commandId,
      mode,
      ledgers: existingLedgers,
      tokensUsed: 0,
      model: "persisted",
      idempotent: true,
    };
  }
  await input.onStage?.({
    phase: "正在读取评分来源",
    statusText: "正在读取固定题目、参考答案和本轮作答快照",
    progressCurrent: 0,
    progressTotal: 2,
  });
  const generated = await generateEnglishSubjectiveGradeSuggestion(input);
  await input.onStage?.({
    phase: "正在保存建议分",
    statusText: "模型已返回，正在原子追加主观题作答版本与 AI 建议",
    progressCurrent: 1,
    progressTotal: 2,
  });
  await input.beforePersist?.();
  const recorded = await runEnglishSubjectiveSubmission(input.supabase, {
    passageId: input.passageId,
    round: input.round,
    answers: input.answers,
    commandId: input.commandId,
    score: generated.suggestion.score,
    feedback: generated.suggestion.feedback,
    breakdown: {
      ...buildEnglishSubjectiveGradeBreakdown(generated.suggestion),
      model: generated.model,
      tokensUsed: generated.tokensUsed,
    },
  });
  const record = recorded && typeof recorded === "object" && !Array.isArray(recorded)
    ? recorded as Record<string, unknown>
    : {};
  const revisionId = typeof record.revisionId === "string" ? record.revisionId : input.commandId;
  const ledgers = await loadEnglishTrainingCoreLedgers(input.supabase, input.userId, input.passageId);
  if (!hasRevision(ledgers, revisionId)) throw new Error("共享训练核没有返回刚保存的主观题建议版本");
  await input.onStage?.({
    phase: "建议分已保存",
    statusText: "AI 建议已追加保存；打开英语真题训练核对并确认终分",
    progressCurrent: 2,
    progressTotal: 2,
  });
  return {
    resultVersion: 1,
    passageId: input.passageId,
    round: input.round,
    revisionId,
    mode,
    ledgers,
    suggestion: generated.suggestion,
    tokensUsed: generated.tokensUsed,
    model: generated.model,
    idempotent: record.idempotent === true,
  };
}
