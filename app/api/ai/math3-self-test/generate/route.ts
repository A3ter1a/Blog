import { NextRequest, NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai-client";
import { DEFAULT_DEEPSEEK_MODEL } from "@/lib/ai-config";
import { parseAIJson } from "@/lib/ai-json";
import { resolveAIProviderRoute } from "@/lib/ai-provider-routing";
import {
  getMath3RealPaperProfile,
  parseMath3AuditBatch,
  selectMath3FinalGateQuestionIndexes,
  validateMath3SelfTestPaper,
  type Math3AuditCorrection,
} from "@/lib/math3-paper-verification";
import {
  getMath3KnowledgePromptContext,
  getMath3SelfTestConfig,
  math3SelfTestDifficultyMeta,
  normalizeMath3SelfTestPaper,
  type Math3SelfTestDifficulty,
  type Math3SelfTestMode,
  type Math3SelfTestQuestion,
  type Math3SelfTestVerification,
} from "@/lib/math3-self-test";
import { normalizeMarkdownForWrite } from "@/lib/content-contract";
import { requireAdminRequest, resolveAIKey } from "@/lib/server-admin-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

const AREA_LABELS = {
  calculus: "微积分",
  "linear-algebra": "线性代数",
  "probability-statistics": "概率论与数理统计",
} as const;

const DIFFICULTY_LABELS = {
  easy: "基础",
  medium: "常规",
  hard: "区分",
} as const;

class PaperRejectedError extends Error {
  constructor(message: string, readonly tokensUsed = 0) {
    super(message);
    this.name = "PaperRejectedError";
  }
}

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
      question: normalizeMarkdownForWrite(question.question, "ai"),
      answer: normalizeMarkdownForWrite(question.answer, "ai"),
      explanation: normalizeMarkdownForWrite(question.explanation, "ai"),
      options: question.options?.map((option) => ({
        ...option,
        content: normalizeMarkdownForWrite(option.content, "ai"),
      })),
      rubricSteps: question.rubricSteps.map((step) => ({
        ...step,
        expected: normalizeMarkdownForWrite(step.expected, "ai"),
      })),
    })),
  };
}

function buildAuditSystemPrompt(areaLabel: string, allowCorrections: boolean): string {
  const correctionPolicy = allowCorrections
    ? "发现问题时，将修正后的完整题目对象放进 correctedQuestions。修正后必须重新从头验算最终版本；仍有疑问就把整组 status 设为 failed。"
    : "这是二次终审，不允许再修改题目，correctedQuestions 必须为空。发现任何仍需修正或无法确认的问题，都必须把整组 status 设为 failed。";
  return `你是独立于命题过程的考研数学三审校员，本次只审校${areaLabel}题。你不能相信候选答案或解析，必须逐题从头求解，再与候选内容核对。

逐题检查：
1. 题干条件是否充分、符号与定义域是否完整，是否只有唯一确定答案；
2. 选择题四个选项是否互斥且只有一个正确答案；
3. 答案、推导、计算、证明是否正确，不能只检查最终结果；
4. 解答题 rubricSteps 是否覆盖关键过程，分值之和是否等于题目分值；
5. 是否在数学三大纲范围内，并符合给定题号的基础/常规/区分难度；
6. Markdown LaTeX 是否完整，不得留下歧义、占位文字或待确认内容。

${correctionPolicy}不要为了让试卷通过而猜测。

严格返回 JSON 对象，不要输出 markdown 代码块：
{
  "status": "passed" | "failed",
  "summary": "审校结论；失败时明确指出题号和原因",
  "correctedQuestions": [{"index": 1, "question": {"完整题目对象": "保留所有字段"}}],
  "audits": [
    {
      "index": 1,
      "status": "passed" | "failed",
      "independentResult": "独立求得的最终结论或答案摘要",
      "confidence": 0.0,
      "recheckedAfterCorrection": true,
      "issues": [],
      "checks": {
        "wellPosed": true,
        "withinSyllabus": true,
        "uniqueAnswer": true,
        "answerCorrect": true,
        "derivationCorrect": true,
        "rubricCorrect": true,
        "difficultyFit": true,
        "notationComplete": true
      }
    }
  ]
}

audits 必须覆盖输入中的每一道题。recheckedAfterCorrection 表示已经验算输入题目的最终版本；没有修改的题也必须在复算后填 true。只有所有检查均为 true、confidence 不低于 0.9、issues 为空时才能 passed。`;
}

async function auditQuestionGroup(
  apiKey: string,
  reviewerModel: string,
  areaLabel: string,
  questions: Math3SelfTestQuestion[],
  options: { allowCorrections: boolean },
): Promise<{ tokensUsed: number; corrections: Math3AuditCorrection[]; checkedQuestions: number }> {
  const { content, tokensUsed } = await callDeepSeek(
    apiKey,
    reviewerModel,
    [
      { role: "system", content: buildAuditSystemPrompt(areaLabel, options.allowCorrections) },
      {
        role: "user",
        content: `下面是待审校题目。请只依据数学推导判断，不要沿用候选答案的思路。\n${JSON.stringify(questions)}`,
      },
    ],
    {
      temperature: 0,
      maxTokens: Math.max(4500, questions.length * 900),
      responseFormat: "json_object",
      reasoningEffort: "max",
      thinking: "enabled",
    },
  );

  let parsed: unknown;
  try {
    parsed = parseAIJson(content);
  } catch {
    throw new PaperRejectedError(`${areaLabel}独立审校返回格式无效，试卷未保存`, tokensUsed);
  }

  try {
    const result = parseMath3AuditBatch(
      parsed,
      questions.map((question) => question.index),
      { allowCorrections: options.allowCorrections },
    );
    return { tokensUsed, corrections: result.corrections, checkedQuestions: result.checkedQuestions };
  } catch (error) {
    const message = error instanceof Error ? error.message : `${areaLabel}独立审校失败`;
    throw new PaperRejectedError(`${areaLabel}：${message}`, tokensUsed);
  }
}

export async function POST(req: NextRequest) {
  let totalTokensUsed = 0;
  try {
    const adminError = await requireAdminRequest(req);
    if (adminError) return adminError;

    const { mode: rawMode, difficulty: rawDifficulty, apiKey: clientApiKey, model: clientModel } = await req.json();
    const mode = isMode(rawMode) ? rawMode : "quick";
    const difficulty = isDifficulty(rawDifficulty) ? rawDifficulty : "simulation";
    const config = getMath3SelfTestConfig(mode, difficulty);
    const realPaperProfile = getMath3RealPaperProfile(mode);

    const apiKey = resolveAIKey("deepseek", clientApiKey);
    const generationModel = typeof clientModel === "string" && clientModel.trim()
      ? clientModel.trim()
      : DEFAULT_DEEPSEEK_MODEL;
    const reviewerModel = resolveAIProviderRoute("deep_reasoning").model;

    if (!apiKey) {
      return NextResponse.json({ error: "DeepSeek API key 未配置" }, { status: 400 });
    }

    const questionPlanText = config.questionPlan
      .map((item) => `第 ${item.index} 题：${item.type}，${item.score} 分，${AREA_LABELS[item.targetAreaId]}，${DIFFICULTY_LABELS[item.targetDifficulty]}题`)
      .join("\n");
    const coverageText = config.coverageTargets
      .map((item) => `${item.label}(${item.areaId})：${item.targetQuestions} 题`)
      .join("；");

    const systemPrompt = `你是考研数学三命题老师。请依据近年真题的题型、学科位置、分值和难度曲线，生成一套原创数学三自测试卷。

真题结构基准：${realPaperProfile.label}
${realPaperProfile.description}

硬性要求：
- 题目必须原创，不得复制或改写真实考研题、商业题库、网课讲义或网上整题；只借鉴题型结构与认知难度。
- 严格遵守每个题号指定的题型、分值、学科和难度。难度要体现在推理层数与知识组合，不能靠繁琐计算或生僻技巧伪造。
- 不出偏题、怪题，不依赖小众二次结论；所有条件都必须充分，答案必须唯一可验证。
- 全部内容使用中文，公式使用 Markdown LaTeX：行内 $...$，块级 $$...$$。
- 严格输出 JSON 对象，不要输出 markdown 代码块。
- 每道选择题必须有 A/B/C/D 四个互不重复的选项，answer 只写正确选项字母。
- 填空题 answer 要短且精确，便于自动判分。
- 解答题必须有至少两个 rubricSteps，points 总和必须精确等于该题 score。
- explanation 必须完整推导答案，但避免无关展开。
- chapterId 和 knowledgePointIds 必须从给定知识点 id 中选择，并与题目学科一致。

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

逐题真题风格计划：
${questionPlanText}

数学三知识点范围：
${getMath3KnowledgePromptContext()}

请严格按计划生成 ${config.questionPlan.length} 道题。生成内容随后会被另一组审校调用逐题独立验算，不确定的题会被拒绝。`;

    const { content, tokensUsed: generationTokensUsed } = await callDeepSeek(
      apiKey,
      generationModel,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        temperature: difficulty === "comfort" ? 0.25 : difficulty === "simulation" ? 0.35 : 0.45,
        maxTokens: mode === "full" ? 16000 : 8000,
        responseFormat: "json_object",
      },
    );
    totalTokensUsed += generationTokensUsed;

    let parsed: unknown;
    try {
      parsed = parseAIJson(content);
    } catch {
      const repaired = await callDeepSeek(
        apiKey,
        generationModel,
        [
          { role: "system", content: "你只负责修复 JSON。返回合法 JSON 对象，不要解释。" },
          { role: "user", content: `修复下面的 JSON，保持原题内容，必须有 questions 数组：\n${content}` },
        ],
        { temperature: 0, maxTokens: mode === "full" ? 16000 : 8000, responseFormat: "json_object" },
      );
      totalTokensUsed += repaired.tokensUsed;
      parsed = parseAIJson(repaired.content);
    }

    const draftPaper = repairPaperMarkdown(normalizeMath3SelfTestPaper(
      parsed,
      mode,
      difficulty,
      { enforceRealPaperProfile: true },
    ));
    if (draftPaper.questions.length !== config.questionPlan.length) {
      throw new PaperRejectedError(`命题题量不完整：需要 ${config.questionPlan.length} 题，实际 ${draftPaper.questions.length} 题`);
    }

    const auditGroups = Object.entries(AREA_LABELS).map(([areaId, areaLabel]) => ({
      areaLabel,
      questions: draftPaper.questions.filter((question) => question.areaId === areaId),
    }));
    const settledAuditResults = await Promise.allSettled(
      auditGroups.map((group) => auditQuestionGroup(
        apiKey,
        reviewerModel,
        group.areaLabel,
        group.questions,
        { allowCorrections: true },
      )),
    );
    const auditResults = settledAuditResults.flatMap((result) => {
      if (result.status === "fulfilled") {
        totalTokensUsed += result.value.tokensUsed;
        return [result.value];
      }
      if (result.reason instanceof PaperRejectedError) totalTokensUsed += result.reason.tokensUsed;
      return [];
    });
    const failedAudit = settledAuditResults.find((result) => result.status === "rejected");
    if (failedAudit?.status === "rejected") {
      const message = failedAudit.reason instanceof Error ? failedAudit.reason.message : "独立分科审校失败";
      throw new PaperRejectedError(message);
    }

    const corrections = auditResults.flatMap((result) => result.corrections);
    const correctedByIndex = new Map(corrections.map((correction) => [correction.index, correction.question]));
    if (correctedByIndex.size !== corrections.length) {
      throw new PaperRejectedError("独立审校返回了重复修正题号，试卷未保存");
    }

    const reviewedPaper = repairPaperMarkdown(normalizeMath3SelfTestPaper(
      {
        ...draftPaper,
        questions: draftPaper.questions.map((question) => correctedByIndex.get(question.index) ?? question),
      },
      mode,
      difficulty,
      { enforceRealPaperProfile: true },
    ));
    const structuralIssues = validateMath3SelfTestPaper(reviewedPaper, config.questionPlan);
    if (structuralIssues.length > 0) {
      throw new PaperRejectedError(`最终结构校验未通过：${structuralIssues.slice(0, 5).join("；")}`);
    }

    const finalGateQuestionIndexes = new Set(selectMath3FinalGateQuestionIndexes(
      reviewedPaper.questions,
      correctedByIndex.keys(),
    ));
    const finalGateQuestions = reviewedPaper.questions.filter((question) => finalGateQuestionIndexes.has(question.index));
    try {
      const finalGateResult = await auditQuestionGroup(
        apiKey,
        reviewerModel,
        "高风险题二次终审",
        finalGateQuestions,
        { allowCorrections: false },
      );
      totalTokensUsed += finalGateResult.tokensUsed;
    } catch (error) {
      if (error instanceof PaperRejectedError) {
        totalTokensUsed += error.tokensUsed;
        throw new PaperRejectedError(error.message);
      }
      throw error;
    }

    const verification: Math3SelfTestVerification = {
      status: "verified",
      verifiedAt: new Date().toISOString(),
      profileVersion: realPaperProfile.version,
      profileLabel: realPaperProfile.label,
      reviewMethod: "independent-area-review+high-risk-final-gate",
      checkedQuestions: auditResults.reduce((sum, result) => sum + result.checkedQuestions, 0),
      finalGateQuestions: finalGateQuestions.length,
      correctedQuestionIndexes: [...correctedByIndex.keys()].sort((left, right) => left - right),
    };
    const paper = { ...reviewedPaper, verification };

    return NextResponse.json({ paper, verification, tokensUsed: totalTokensUsed, success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "数学三自测试卷生成失败";
    if (error instanceof PaperRejectedError) {
      console.warn("[Math3SelfTestGenerate] Rejected:", message);
      return NextResponse.json({
        error: `${message}。本次试卷未保存，请重新生成。`,
        tokensUsed: totalTokensUsed,
        success: false,
      }, { status: 422 });
    }
    console.error("[Math3SelfTestGenerate] Error:", message);
    return NextResponse.json({ error: message, tokensUsed: totalTokensUsed, success: false }, { status: 500 });
  }
}
