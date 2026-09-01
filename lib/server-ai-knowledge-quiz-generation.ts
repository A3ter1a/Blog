import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { callDeepSeek } from "./ai-client";
import { extractAiHighlightTerms } from "./ai-highlight-contract";
import { AiKnowledgeQuizError, createAiKnowledgeQuiz } from "./server-ai-knowledge-quiz";
import type { Database, Tables } from "./supabase-schema";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonObject(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new AiKnowledgeQuizError("AI 没有返回可解析的快测 JSON。", 422);
    return JSON.parse(match[0]);
  }
}

export async function generateAndRecordAiKnowledgeQuiz(input: {
  supabase: SupabaseClient<Database>;
  userId: string;
  profile: Tables<"ai_profiles">;
  proposalId: string;
  quizId: string;
  proposalTitle: string;
  proposalContent: string;
  apiKey: string;
  model: string;
  signal?: AbortSignal;
  beforePersist?: () => Promise<void>;
}) {
  const source = input.proposalContent.slice(0, 120_000);
  const highlightedTerms = extractAiHighlightTerms(source).slice(0, 24);
  const systemPrompt = `你是学习博客的知识点快测生成器。根据给出的讲义 Markdown 生成可审核的自测题，不修改正文。
只返回 JSON 对象：{"title":"...","items":[{"itemType":"single_choice|multiple_choice|true_false|short_answer","question":"...","options":[{"label":"A","text":"..."}],"answer":"A"或["A"]或true/false,"explanation":"...","knowledgePoints":["..."],"difficulty":"easy|medium|hard","sourceHeading":"..."}]}
规则：
- 只使用讲义中明确出现的知识，不补造来源。
- 每题必须有可判定答案、简明解析和至少一个知识点。
- 优先覆盖核心定义、因果关系、公式条件和常见易错点；题目数量 5 到 12 题。
- 讲义中用 ==...== 标出的词是辅助记忆高亮词；如果它们确实表达知识点，优先把原词放进 knowledgePoints，不要凭空扩展术语。
- 选择题答案必须是选项 label；简答题答案应能用短文本判定。
- 不要把答案或解析写进 question；不要生成 Markdown 正文。`;
  const highlightHint = highlightedTerms.length > 0
    ? `\n\n正文高亮词（仅作覆盖提示）：${highlightedTerms.join("、")}`
    : "";
  const { content, tokensUsed } = await callDeepSeek(
    input.apiKey,
    input.model,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: `讲义标题：${input.proposalTitle}${highlightHint}\n\n讲义 Markdown：\n${source}` },
    ],
    { temperature: 0.2, maxTokens: 5200, responseFormat: "json_object", signal: input.signal },
  );
  const payload = parseJsonObject(content);
  await input.beforePersist?.();
  input.signal?.throwIfAborted();
  const created = await createAiKnowledgeQuiz(input.supabase, {
    userId: input.userId,
    profile: input.profile,
    proposalId: input.proposalId,
    quizId: input.quizId,
    title: isRecord(payload) ? payload.title : undefined,
    items: isRecord(payload) ? payload.items : payload,
  });
  return {
    quizId: created.quiz.id,
    itemCount: created.quiz.item_count,
    reviewStatus: created.quiz.review_status,
    tokensUsed,
  };
}
