import { NextRequest, NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai-client";
import { DEFAULT_DEEPSEEK_MODEL } from "@/lib/ai-config";
import { parseAIJson } from "@/lib/ai-json";
import { getMath3KnowledgePromptContext, getMath3SelfTestConfig, math3SelfTestDifficultyMeta, normalizeMath3SelfTestPaper, type Math3SelfTestDifficulty, type Math3SelfTestMode } from "@/lib/math3-self-test";
import { repairMarkdown } from "@/lib/markdown";
import { requireAdminRequest, resolveAIKey } from "@/lib/server-admin-auth";

export const runtime = "nodejs";
export const maxDuration = 180;

function isMode(value: unknown): value is Math3SelfTestMode {
  return value === "quick" || value === "full";
}

function isDifficulty(value: unknown): value is Math3SelfTestDifficulty {
  return value === "comfort" || value === "simulation" || value === "challenge";
}

function repairPaperMarkdown(paper: ReturnType<typeof normalizeMath3SelfTestPaper>) {
  return {
    ...paper,
    questions: paper.questions.map((question) => ({
      ...question,
      question: repairMarkdown(question.question),
      answer: repairMarkdown(question.answer),
      explanation: repairMarkdown(question.explanation),
      options: question.options?.map((option) => ({
        ...option,
        content: repairMarkdown(option.content),
      })),
      rubricSteps: question.rubricSteps.map((step) => ({
        ...step,
        expected: repairMarkdown(step.expected),
      })),
    })),
  };
}

export async function POST(req: NextRequest) {
  try {
    const adminError = await requireAdminRequest(req);
    if (adminError) return adminError;

    const { mode: rawMode, difficulty: rawDifficulty, apiKey: clientApiKey, model: clientModel } = await req.json();
    const mode = isMode(rawMode) ? rawMode : "quick";
    const difficulty = isDifficulty(rawDifficulty) ? rawDifficulty : "simulation";
    const config = getMath3SelfTestConfig(mode, difficulty);

    const apiKey = resolveAIKey("deepseek", clientApiKey);
    const model = typeof clientModel === "string" && clientModel.trim()
      ? clientModel.trim()
      : DEFAULT_DEEPSEEK_MODEL;

    if (!apiKey) {
      return NextResponse.json({ error: "DeepSeek API key 未配置" }, { status: 400 });
    }

    const questionPlanText = config.questionPlan
      .map((item) => `第 ${item.index} 题：${item.type}，${item.score} 分`)
      .join("\n");
    const coverageText = config.coverageTargets
      .map((item) => `${item.label}(${item.areaId})：约 ${item.targetQuestions} 题`)
      .join("；");

    const systemPrompt = `你是考研数学三命题与阅卷助手。请生成一套原创数学三自测试卷。

硬性要求：
- 题目必须是原创模拟题，不要复制真实考研题、商业题库、网课讲义或网上整题。
- 可以借鉴常见考研数学三题型，但不要使用偏题怪题，不要依赖非常小众的二次结论。
- 全部内容使用中文，公式使用 Markdown LaTeX：行内 $...$，块级 $$...$$。
- 严格输出 JSON 对象，不要输出 markdown 代码块。
- 每道选择题必须有 A/B/C/D 四个选项，answer 只写正确选项字母。
- 填空题 answer 要尽量短，便于自动判分。
- 解答题必须给 rubricSteps，rubricSteps 的 points 总和必须等于该题 score。
- 解答题 explanation 要有清晰步骤，但不要写成无法阅读的长墙。
- knowledgePointIds 必须尽量从给定知识点 id 中选择。

输出结构：
{
  "title": "试卷标题",
  "questions": [
    {
      "type": "choice" | "fill" | "solution",
      "areaId": "calculus" | "linear-algebra" | "probability-statistics",
      "chapterId": "章节 id",
      "knowledgePointIds": ["知识点 id"],
      "difficulty": "easy" | "medium" | "hard",
      "score": 5,
      "question": "题干",
      "options": [{"label":"A","content":"选项内容"}],
      "answer": "答案",
      "explanation": "解析",
      "rubricSteps": [{"label":"步骤 1","points":3,"expected":"本步骤给分点"}]
    }
  ]
}`;

    const userPrompt = `生成配置：
- 模式：${config.modeLabel}
- 难度：${config.difficultyLabel}
- 难度说明：${math3SelfTestDifficultyMeta[difficulty].prompt}
- 时长：${config.durationMinutes} 分钟
- 总分：${config.totalScore} 分
- 覆盖面：${coverageText}

题目计划：
${questionPlanText}

数学三知识点范围：
${getMath3KnowledgePromptContext()}

请严格按题目计划生成 ${config.questionPlan.length} 道题。`;

    const { content, tokensUsed } = await callDeepSeek(
      apiKey,
      model,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        temperature: difficulty === "comfort" ? 0.35 : difficulty === "simulation" ? 0.45 : 0.55,
        maxTokens: mode === "full" ? 14000 : 7000,
        responseFormat: "json_object",
      }
    );

    let parsed: unknown;
    let totalTokensUsed = tokensUsed;
    try {
      parsed = parseAIJson(content);
    } catch {
      const repaired = await callDeepSeek(
        apiKey,
        model,
        [
          { role: "system", content: "你只负责修复 JSON。返回合法 JSON 对象，不要解释。" },
          { role: "user", content: `修复下面的 JSON，保持原题内容，必须有 questions 数组：\n${content}` },
        ],
        { temperature: 0, maxTokens: mode === "full" ? 14000 : 7000, responseFormat: "json_object" }
      );
      totalTokensUsed += repaired.tokensUsed;
      parsed = parseAIJson(repaired.content);
    }

    const paper = repairPaperMarkdown(normalizeMath3SelfTestPaper(parsed, mode, difficulty));
    if (paper.questions.length !== config.questionPlan.length) {
      return NextResponse.json(
        {
          error: `AI 生成题量不完整：需要 ${config.questionPlan.length} 题，实际 ${paper.questions.length} 题。请重新生成。`,
          tokensUsed: totalTokensUsed,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ paper, tokensUsed: totalTokensUsed, success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "数学三自测试卷生成失败";
    console.error("[Math3SelfTestGenerate] Error:", message);
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
