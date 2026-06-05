import { NextRequest, NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai-client";
import { DEFAULT_DEEPSEEK_MODEL } from "@/lib/ai-config";
import { parseAIJson } from "@/lib/ai-json";
import { getMath3ChapterById } from "@/lib/math3-practice";
import { requireAdminRequest, resolveAIKey } from "@/lib/server-admin-auth";

export const runtime = "nodejs";
export const maxDuration = 90;

const MAX_PROBLEMS_PER_REQUEST = 25;

interface ClassifyProblemInput {
  id: string;
  type?: string;
  difficulty?: string;
  question: string;
  answer?: string;
  explanation?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeProblems(value: unknown): ClassifyProblemInput[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((item) => ({
      id: getString(item.id).trim(),
      type: getString(item.type).trim(),
      difficulty: getString(item.difficulty).trim(),
      question: getString(item.question).trim(),
      answer: getString(item.answer).trim(),
      explanation: getString(item.explanation).trim(),
    }))
    .filter((item) => item.id && item.question)
    .slice(0, MAX_PROBLEMS_PER_REQUEST);
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

export async function POST(req: NextRequest) {
  try {
    const adminError = await requireAdminRequest(req);
    if (adminError) return adminError;

    const { chapterId: rawChapterId, problems: rawProblems, apiKey: clientApiKey, model: clientModel } = await req.json();
    const chapterId = getString(rawChapterId).trim();
    const chapterResult = getMath3ChapterById(chapterId);
    const problems = normalizeProblems(rawProblems);

    if (!chapterResult) {
      return NextResponse.json({ error: "无效的数三章节" }, { status: 400 });
    }
    if (problems.length === 0) {
      return NextResponse.json({ error: "没有可标记的题目" }, { status: 400 });
    }

    const apiKey = resolveAIKey("deepseek", clientApiKey);
    const model = typeof clientModel === "string" && clientModel.trim()
      ? clientModel.trim()
      : DEFAULT_DEEPSEEK_MODEL;

    if (!apiKey) {
      return NextResponse.json({ error: "DeepSeek API key 未配置" }, { status: 400 });
    }

    const pointList = chapterResult.chapter.points
      .map((point) => `- ${point.id}: ${point.title}（${point.difficulty}；关键词：${point.tags.join("、") || "无"}）`)
      .join("\n");
    const problemList = problems
      .map((problem, index) => [
        `题目 ${index + 1}`,
        `id: ${problem.id}`,
        `type: ${problem.type || "unknown"}`,
        `difficulty: ${problem.difficulty || "unknown"}`,
        `question: ${problem.question}`,
        problem.answer ? `answer: ${problem.answer}` : "",
        problem.explanation ? `explanation: ${problem.explanation}` : "",
      ].filter(Boolean).join("\n"))
      .join("\n\n");

    const systemPrompt = `你是考研数学三题目知识点标记助手。

任务：只在给定章节内，给每道题选择最相关的知识点 id。

规则：
- 只能从提供的 knowledge points 中选择 id，不能自造 id。
- 每道题选择 0-3 个知识点，优先选主考点，不要把所有相关概念都塞进去。
- 如果题目无法判断，pointIds 返回空数组，confidence 给 0.3 以下。
- 知识点只是章节内辅助标记，不要为了凑标签而过度细分。
- 严格返回 JSON 对象，不要返回 Markdown 代码块。

输出结构：
{
  "items": [
    {
      "id": "题目 id",
      "pointIds": ["知识点 id"],
      "confidence": 0.85,
      "reason": "一句话说明依据"
    }
  ]
}`;

    const userPrompt = `章节：
${chapterResult.area.title} / ${chapterResult.chapter.title}

可选知识点：
${pointList}

待标记题目：
${problemList}`;

    const { content, tokensUsed } = await callDeepSeek(
      apiKey,
      model,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.15, maxTokens: 3000, responseFormat: "json_object" }
    );

    let parsed: unknown;
    try {
      parsed = parseAIJson(content);
    } catch {
      return NextResponse.json(
        { error: "AI 返回格式解析失败，请重试", rawContent: content },
        { status: 422 }
      );
    }

    const rawItems = isRecord(parsed) && Array.isArray(parsed.items) ? parsed.items : [];
    const validProblemIds = new Set(problems.map((problem) => problem.id));
    const validPointIds = new Set(chapterResult.chapter.points.map((point) => point.id));
    const classifications = rawItems
      .filter(isRecord)
      .map((item) => {
        const id = getString(item.id).trim();
        const pointIds = Array.isArray(item.pointIds)
          ? Array.from(new Set(item.pointIds.filter((pointId): pointId is string =>
              typeof pointId === "string" && validPointIds.has(pointId)
            ))).slice(0, 3)
          : [];

        return {
          id,
          pointIds,
          confidence: clampConfidence(item.confidence),
          reason: getString(item.reason).trim(),
        };
      })
      .filter((item) => validProblemIds.has(item.id));

    const classifiedIds = new Set(classifications.map((item) => item.id));
    for (const problem of problems) {
      if (!classifiedIds.has(problem.id)) {
        classifications.push({
          id: problem.id,
          pointIds: [],
          confidence: 0,
          reason: "AI 未返回该题标记",
        });
      }
    }

    return NextResponse.json({ classifications, tokensUsed, success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "数三知识点标记失败";
    console.error("[Math3Classify] Error:", message);
    return NextResponse.json(
      { error: message, success: false },
      { status: 500 }
    );
  }
}
