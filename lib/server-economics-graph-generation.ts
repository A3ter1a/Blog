import "server-only";

import { callDeepSeek } from "./ai-client";
import {
  buildEconomicsGraphMarkdown,
  economicsGraphTemplateSummaries,
  normalizeEconomicsGraphAIDraft,
} from "./economics-graph-ai";

function parseJsonObject(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI 没有返回 JSON 对象");
    return JSON.parse(match[0]);
  }
}

export async function generateEconomicsGraph(input: {
  apiKey: string;
  model: string;
  prompt: string;
  signal?: AbortSignal;
}) {
  const systemPrompt = `你是宏微观经济学图像结构化助手。你只为博客的 econgraph 交互图选择模板，不生成 SVG、HTML、React 代码。

可用模板和元素：
${JSON.stringify(economicsGraphTemplateSummaries, null, 2)}

必须只返回 JSON 对象，格式：
{
  "template": "可用模板中的一个 id",
  "title": "不超过 30 个汉字的图名",
  "focus": ["元素 id"],
  "rationale": "为什么选择这个模板，1 到 2 句话",
  "reviewNotes": ["用户插入前应检查的点"]
}

规则：
- template 必须来自可用模板 id。
- focus 只能使用该模板下存在的元素 id，最多 6 个。
- 优先选择标题和元素语义与需求最贴合的专属模板，不要用通用模板替代已有专属模板。
- 只有在确实没有专属模板时，才使用 demand-supply、monopoly-mr-mc 或 cost-curves。
- 不确定时选择最接近的模板，并在 reviewNotes 里提醒用户审查。`;
  const { content, tokensUsed } = await callDeepSeek(
    input.apiKey,
    input.model,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: `曲线需求：${input.prompt}` },
    ],
    { temperature: 0.18, maxTokens: 1100, responseFormat: "json_object", signal: input.signal },
  );
  const normalized = normalizeEconomicsGraphAIDraft(parseJsonObject(content));
  if (!normalized.ok) throw new Error(normalized.message);
  return {
    draft: normalized.draft,
    markdown: buildEconomicsGraphMarkdown(normalized.draft.spec),
    tokensUsed,
  };
}
