import { NextRequest, NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai-client";
import { DEFAULT_DEEPSEEK_MODEL } from "@/lib/ai-config";
import { parseAIJson } from "@/lib/ai-json";
import {
  getMath3ChapterPromptContext,
  normalizeMath3ChapterAssignments,
  type Math3ProblemClassifyInput,
} from "@/lib/math3-classification";
import { requireAdminRequest, resolveAIKey } from "@/lib/server-admin-auth";

export const runtime = "nodejs";
export const maxDuration = 90;

const MAX_PROBLEMS_PER_REQUEST = 8;
const MAX_FIELD_LENGTH = 1200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value.trim() : String(value).trim();
}

function truncateField(value: string): string {
  if (value.length <= MAX_FIELD_LENGTH) return value;
  return `${value.slice(0, MAX_FIELD_LENGTH)}\n...(已截断)`;
}

function normalizeProblemInputs(value: unknown): Math3ProblemClassifyInput[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, MAX_PROBLEMS_PER_REQUEST).flatMap((raw, index): Math3ProblemClassifyInput[] => {
    const item = isRecord(raw) ? raw : {};
    const id = getString(item.id);
    const question = truncateField(getString(item.question));
    if (!id || !question) return [];

    const rawOptions = Array.isArray(item.options) ? item.options : [];
    const options = rawOptions.flatMap((rawOption, optionIndex): Array<{ label: string; content: string }> => {
      const option = isRecord(rawOption) ? rawOption : {};
      const content = truncateField(isRecord(rawOption) ? getString(option.content) : getString(rawOption));
      if (!content) return [];
      return [{
        label: getString(option.label) || String.fromCharCode(65 + optionIndex),
        content,
      }];
    });

    return [{
      id,
      index: Number(item.index) || index + 1,
      type: getString(item.type) || "calculation",
      question,
      answer: truncateField(getString(item.answer)),
      options,
    }];
  });
}

export async function POST(req: NextRequest) {
  try {
    const adminError = await requireAdminRequest(req);
    if (adminError) return adminError;

    const {
      problems: rawProblems,
      apiKey: clientApiKey,
      model: clientModel,
    } = await req.json();
    const problems = normalizeProblemInputs(rawProblems);

    if (problems.length === 0) {
      return NextResponse.json({ error: "没有可归类的题目" }, { status: 400 });
    }

    const apiKey = resolveAIKey("deepseek", clientApiKey);
    const model = typeof clientModel === "string" && clientModel.trim()
      ? clientModel.trim()
      : DEFAULT_DEEPSEEK_MODEL;

    if (!apiKey) {
      return NextResponse.json({ error: "DeepSeek API key 未配置" }, { status: 400 });
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
{
  "assignments": [
    {"problemId":"题目 id","chapterId":"章节 id","confidence":0.0,"reason":"不超过12字的理由"}
  ]
}`;

    const userPrompt = `数学三大纲章节：
${getMath3ChapterPromptContext()}

待归类题目：
${JSON.stringify(problems, null, 2)}

请按题目 id 返回 assignments。`;

    const { content, tokensUsed } = await callDeepSeek(
      apiKey,
      model,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        temperature: 0.1,
        maxTokens: 2600,
        responseFormat: "json_object",
      }
    );

    let parsed: unknown;
    try {
      parsed = parseAIJson(content);
    } catch {
      return NextResponse.json(
        { error: "AI 归类返回格式解析失败，请重试", retryable: true, rawContent: content },
        { status: 422 }
      );
    }

    const assignments = normalizeMath3ChapterAssignments(parsed, problems.map((problem) => problem.id));

    return NextResponse.json({
      assignments,
      tokensUsed,
      success: true,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "数三章节归类失败";
    console.error("[Math3Classify] Error:", message);
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
