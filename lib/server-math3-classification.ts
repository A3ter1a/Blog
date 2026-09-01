import "server-only";

import { callDeepSeek } from "./ai-client";
import { parseAIJson } from "./ai-json";
import {
  getMath3ChapterPromptContext,
  normalizeMath3ChapterAssignments,
  type Math3ChapterAssignment,
  type Math3ProblemClassifyInput,
} from "./math3-classification";

export async function classifyMath3Problems(input: {
  apiKey: string;
  model: string;
  problems: Math3ProblemClassifyInput[];
  signal?: AbortSignal;
}): Promise<{ assignments: Math3ChapterAssignment[]; tokensUsed: number; model: string }> {
  if (input.problems.length < 1 || input.problems.length > 8) {
    throw new Error("数学三章节归类每批必须包含 1–8 道题");
  }
  const systemPrompt = `你是考研数学三题目归类助手。任务是把每道题归入一个且仅一个数学三大纲章节。

规则：
- chapterId 必须从给定章节列表中选择，不能自造 id。
- 每道题都必须返回一个 chapterId，assignments 数量必须等于待归类题目数量。
- 综合题按主要考察比例归类：选择解题中占比最高、最核心的章节。
- 只做章节归类，不输出知识点 id，不输出解析。
- 严格返回 JSON 对象，不要输出 markdown 代码块。
- problemId 必须原样复制输入 id。

输出结构：
{"assignments":[{"problemId":"题目 id","chapterId":"章节 id","confidence":0.0,"reason":"不超过12字的理由"}]}`;
  const userPrompt = `数学三大纲章节：
${getMath3ChapterPromptContext()}

待归类题目：
${JSON.stringify(input.problems, null, 2)}

请按题目 id 返回 assignments。`;
  const { content, tokensUsed } = await callDeepSeek(input.apiKey, input.model, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], { temperature: 0.1, maxTokens: 2600, responseFormat: "json_object", signal: input.signal });
  let parsed: unknown;
  try {
    parsed = parseAIJson(content);
  } catch {
    throw new Error("AI 归类返回格式解析失败，请重试");
  }
  const problemIds = input.problems.map((problem) => problem.id);
  const assignments = normalizeMath3ChapterAssignments(parsed, problemIds);
  if (assignments.length !== problemIds.length || new Set(assignments.map((item) => item.problemId)).size !== problemIds.length) {
    throw new Error("AI 没有完整返回本批题目的章节归类");
  }
  return { assignments, tokensUsed, model: input.model };
}
