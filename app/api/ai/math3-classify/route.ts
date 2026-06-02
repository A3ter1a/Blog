import { NextRequest, NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai-client";
import { parseAIJson } from "@/lib/ai-json";
import { DEFAULT_DEEPSEEK_MODEL } from "@/lib/ai-config";
import { requireAdminRequest, resolveAIKey } from "@/lib/server-admin-auth";
import {
  math3KnowledgeAreas,
  type Math3KnowledgeArea,
  type Math3KnowledgeAreaId,
  type Math3KnowledgeChapter,
  type Math3KnowledgePoint,
} from "@/lib/math3-knowledge";

const MAX_CONTENT_CHARS = 2200;
const MAX_PROBLEM_COUNT = 12;
const MAX_PROBLEM_CHARS = 700;

interface NormalizedProblemSet {
  title: string;
  content: string;
  tags: string[];
  problems: Array<{
    question: string;
    answer: string;
    explanation: string;
    tags: string[];
  }>;
}

interface Math3ClassificationRecommendation {
  areaId: Math3KnowledgeAreaId;
  chapterId: string;
  pointIds: string[];
  confidence: number;
  reason: string;
  evidence: string[];
}

const chapterIndex = new Map<string, { area: Math3KnowledgeArea; chapter: Math3KnowledgeChapter }>();
const pointIndex = new Map<string, { chapterId: string; point: Math3KnowledgePoint }>();

for (const area of math3KnowledgeAreas) {
  for (const chapter of area.chapters) {
    chapterIndex.set(chapter.id, { area, chapter });
    for (const pointItem of chapter.points) {
      pointIndex.set(pointItem.id, { chapterId: chapter.id, point: pointItem });
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value.trim() : String(value).trim();
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map(toStringValue).filter(Boolean))
  );
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...(已截断)`;
}

function clampConfidence(value: unknown): number {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return 0.5;
  return Math.min(1, Math.max(0, confidence));
}

function normalizeProblemSet(value: unknown): NormalizedProblemSet | null {
  const raw = isRecord(value) ? value : {};
  const title = toStringValue(raw.title);
  if (!title) return null;

  const rawProblems = Array.isArray(raw.problems) ? raw.problems : [];
  const problems = rawProblems.slice(0, MAX_PROBLEM_COUNT).flatMap((item) => {
    const problem = isRecord(item) ? item : {};
    const question = truncateText(toStringValue(problem.question), MAX_PROBLEM_CHARS);
    if (!question) return [];

    return [{
      question,
      answer: truncateText(toStringValue(problem.answer), 240),
      explanation: truncateText(toStringValue(problem.explanation), 320),
      tags: toStringArray(problem.tags).slice(0, 8),
    }];
  });

  return {
    title,
    content: truncateText(toStringValue(raw.content), MAX_CONTENT_CHARS),
    tags: toStringArray(raw.tags).slice(0, 16),
    problems,
  };
}

function buildCatalogText(): string {
  return math3KnowledgeAreas.map((area) => {
    const chapters = area.chapters.map((chapter) => {
      const points = chapter.points
        .map((pointItem) => `${pointItem.id}: ${pointItem.title}（${pointItem.tags.join("、") || "无标签"}）`)
        .join("\n");
      return `Chapter ${chapter.id}: ${chapter.title}\n${points}`;
    }).join("\n");

    return `Area ${area.id}: ${area.title}\n${chapters}`;
  }).join("\n\n");
}

function buildProblemSetText(problemSet: NormalizedProblemSet): string {
  const problems = problemSet.problems.map((problem, index) => [
    `题目 ${index + 1}: ${problem.question}`,
    problem.answer ? `答案: ${problem.answer}` : "",
    problem.explanation ? `解析: ${problem.explanation}` : "",
    problem.tags.length > 0 ? `题目标签: ${problem.tags.join("、")}` : "",
  ].filter(Boolean).join("\n")).join("\n\n");

  return [
    `题集标题: ${problemSet.title}`,
    problemSet.tags.length > 0 ? `题集标签: ${problemSet.tags.join("、")}` : "",
    problemSet.content ? `题集正文摘要: ${problemSet.content}` : "",
    problems ? `题目样本:\n${problems}` : "题目样本: 暂无，只能根据标题和标签判断。",
  ].filter(Boolean).join("\n\n");
}

function normalizeRecommendation(value: unknown): Math3ClassificationRecommendation | null {
  const raw = isRecord(value) ? value : {};
  const chapterId = toStringValue(raw.chapterId);
  const chapterMatch = chapterIndex.get(chapterId);
  if (!chapterMatch) return null;

  const rawPointIds = [
    ...toStringArray(raw.pointIds),
    toStringValue(raw.pointId),
  ].filter(Boolean);
  const pointIds = Array.from(new Set(rawPointIds))
    .filter((pointId) => pointIndex.get(pointId)?.chapterId === chapterId)
    .slice(0, 6);

  return {
    areaId: chapterMatch.area.id,
    chapterId,
    pointIds,
    confidence: clampConfidence(raw.confidence),
    reason: toStringValue(raw.reason) || "AI 未给出详细理由。",
    evidence: toStringArray(raw.evidence).slice(0, 4),
  };
}

function normalizeRecommendations(value: unknown): Math3ClassificationRecommendation[] {
  const raw = isRecord(value) ? value : {};
  const items = Array.isArray(raw.recommendations)
    ? raw.recommendations
    : Array.isArray(value)
      ? value
      : [raw];

  const recommendations: Math3ClassificationRecommendation[] = [];
  const seenChapters = new Set<string>();

  for (const item of items) {
    const recommendation = normalizeRecommendation(item);
    if (!recommendation || seenChapters.has(recommendation.chapterId)) continue;
    seenChapters.add(recommendation.chapterId);
    recommendations.push(recommendation);
    if (recommendations.length >= 3) break;
  }

  return recommendations;
}

export async function POST(req: NextRequest) {
  try {
    const adminError = await requireAdminRequest(req);
    if (adminError) return adminError;

    const body = await req.json().catch(() => null);
    const rawBody = isRecord(body) ? body : {};
    const problemSet = normalizeProblemSet(rawBody.problemSet);
    const apiKey = resolveAIKey("deepseek", rawBody.apiKey);
    const model = typeof rawBody.model === "string" && rawBody.model.trim()
      ? rawBody.model.trim()
      : DEFAULT_DEEPSEEK_MODEL;

    if (!problemSet) {
      return NextResponse.json({ error: "缺少有效题集信息", success: false }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: "DeepSeek API key 未配置", success: false }, { status: 400 });
    }

    const systemPrompt = `你是考研数学三题集归类助手。你要根据题集标题、标签、题目样本和 2025 数三考纲目录，判断这个题集最适合放到哪个知识目录章节，并给出人工审核用的依据。

只返回 JSON，不要输出 Markdown 代码块。JSON 结构必须是：
{
  "recommendations": [
    {
      "areaId": "calculus | linear-algebra | probability-statistics",
      "chapterId": "必须从目录里选择的 chapter id",
      "pointIds": ["必须从该章节里选择的 point id，最多 6 个"],
      "confidence": 0.0 到 1.0,
      "reason": "中文说明为什么这样归类",
      "evidence": ["中文依据，引用题集标题/题目关键词/公式特征"]
    }
  ]
}

规则：
- 最多给 3 个推荐，按可信度从高到低排序。
- chapterId 和 pointIds 必须使用下方目录中真实存在的 id，不能编造。
- 如果题集覆盖范围很大，选择最主要章节；可把其它可能章节作为第二、第三推荐。
- 如果题目样本不足，也要给出保守建议，并降低 confidence。
- reason 和 evidence 用中文。

数三目录：
${buildCatalogText()}`;

    const { content, tokensUsed } = await callDeepSeek(
      apiKey,
      model,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: buildProblemSetText(problemSet) },
      ],
      { temperature: 0.2, maxTokens: 2200, responseFormat: "json_object" }
    );

    let parsed: unknown;
    let totalTokensUsed = tokensUsed;

    try {
      parsed = parseAIJson(content);
    } catch (firstParseError: unknown) {
      try {
        const repaired = await callDeepSeek(
          apiKey,
          model,
          [
            { role: "system", content: "你修复 JSON。只返回一个合法 JSON 对象。" },
            {
              role: "user",
              content: `把下面内容修复成合法 JSON，结构必须是 {"recommendations":[{"areaId":"","chapterId":"","pointIds":[],"confidence":0.5,"reason":"","evidence":[]}]}。\n\n${content}`,
            },
          ],
          { temperature: 0, maxTokens: 1600, responseFormat: "json_object" }
        );
        totalTokensUsed += repaired.tokensUsed;
        parsed = parseAIJson(repaired.content);
      } catch {
        return NextResponse.json(
          {
            error: "AI 归类结果解析失败",
            parseError: firstParseError instanceof Error ? firstParseError.message : undefined,
            rawContent: content,
            success: false,
          },
          { status: 422 }
        );
      }
    }

    const recommendations = normalizeRecommendations(parsed);

    return NextResponse.json({
      recommendations,
      tokensUsed: totalTokensUsed,
      success: true,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "数三题集归类失败";
    console.error("[Math3Classify] Error:", message);
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
