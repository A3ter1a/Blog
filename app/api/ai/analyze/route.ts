import { NextRequest, NextResponse } from 'next/server';
import { callDeepSeek } from '@/lib/ai-client';
import { parseAIJson } from '@/lib/ai-json';
import { requireAdminRequest, resolveAIKey } from '@/lib/server-admin-auth';
import { DEFAULT_DEEPSEEK_MODEL } from '@/lib/ai-config';
import { repairProblemMarkdownFields } from '@/lib/markdown';
import { extractOptions } from '@/lib/utils';
import type { Difficulty, Problem, ProblemType } from '@/lib/types';

const ALLOWED_TYPES = new Set(['choice', 'fill', 'calculation', 'proof', 'proofEssay']);
const ALLOWED_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
type ExtractedProblem = Partial<Problem> & { suggestedChapter?: string | null; confidence?: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toString(value: unknown) {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value.trim() : String(value);
}

function clampConfidence(value: unknown) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return 0.5;
  return Math.min(1, Math.max(0, confidence));
}

function extractProblemsFromParsed(parsed: unknown) {
  const parsedObject = isRecord(parsed) ? parsed : {};

  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsedObject.problems)) return parsedObject.problems;
  if (parsedObject.question || parsedObject.type) return [parsedObject];

  return [];
}

function normalizeProblems(parsed: unknown): ExtractedProblem[] {
  return extractProblemsFromParsed(parsed).flatMap((problem) => {
    const p = isRecord(problem) ? problem : {};
    const type = toString(p.type);
    const difficulty = toString(p.difficulty);
    const normalizedType = (ALLOWED_TYPES.has(type) ? type : 'calculation') as ProblemType;
    const normalizedDifficulty = (ALLOWED_DIFFICULTIES.has(difficulty) ? difficulty : 'medium') as Difficulty;
    const question = toString(p.question);
    if (!question) return [];

    const options = Array.isArray(p.options)
      ? p.options
          .map((rawOption, index) => {
            const option = isRecord(rawOption) ? rawOption : {};
            const content = isRecord(rawOption) ? option.content : rawOption;
            return {
              label: toString(option.label || String.fromCharCode(65 + index)),
              content: toString(content),
            };
          })
          .filter((option) => option.content.trim())
      : undefined;

    return [repairProblemMarkdownFields({
      question,
      answer: toString(p.answer),
      explanation: '',
      type: normalizedType,
      difficulty: normalizedDifficulty,
      suggestedChapter: p.suggestedChapter ? toString(p.suggestedChapter) : null,
      options: normalizedType === 'choice' ? (options?.length ? options : extractOptions(question)) : undefined,
      confidence: clampConfidence(p.confidence),
    })];
  });
}

function cleanOcrQuestionText(ocrText: string) {
  return ocrText
    .replace(/^\s*(?:以下是(?:图片中)?(?:提取|识别)到的文字|识别结果|提取结果)\s*[:：]\s*/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isLikelyProblemText(ocrText: string) {
  const text = cleanOcrQuestionText(ocrText);
  if (text.length < 8) return false;
  if (/^\s*(?:无法|未能|没有|看不清|抱歉|sorry)/i.test(text)) return false;

  const hasProblemCue = /(?:求|若|设|已知|证明|计算|解|选择|填空|下列|函数|方程|积分|极限|矩阵|概率|定义|判断|问|答案|例题|题目|试题)/.test(text);
  const hasMathCue = /(?:\\(?:frac|lim|int|sum|sqrt|begin)|[$=≈≤≥<>^_]|[A-F][.、]\s*\S)/.test(text);

  return hasProblemCue || hasMathCue;
}

function inferProblemType(ocrText: string): ProblemType {
  if (/(?:论述|分析说明|简答)/.test(ocrText)) return 'proofEssay';
  if (/(?:证明|证得|证：)/.test(ocrText)) return 'proof';
  if (/(?:填空|_{2,}|____|________|\(\s*\)|（\s*）)/.test(ocrText)) return 'fill';
  if (/[A-F][.、]\s*\S/.test(ocrText)) return 'choice';
  return 'calculation';
}

function buildOcrFallbackProblem(ocrText: string): ExtractedProblem {
  const question = cleanOcrQuestionText(ocrText);
  const type = inferProblemType(question);

  return repairProblemMarkdownFields({
    question,
    answer: '',
    explanation: '',
    type,
    difficulty: 'medium' as Difficulty,
    suggestedChapter: null,
    options: type === 'choice' ? extractOptions(question) : undefined,
    confidence: 0.25,
  });
}

async function parseOrRepairAIJson(
  content: string,
  apiKey: string,
  model: string
): Promise<{ parsed: unknown; tokensUsed: number }> {
  try {
    return { parsed: parseAIJson(content), tokensUsed: 0 };
  } catch (firstParseError: unknown) {
    const repairPrompt = `Repair the following AI output into one valid JSON object only.
It must match this shape: {"problems":[{"question":"","answer":"","type":"calculation","difficulty":"medium","suggestedChapter":null,"options":[],"confidence":0.5}]}.
Keep the original math content. Escape all LaTeX backslashes correctly for JSON strings. Return JSON only.

Broken output:
${content}`;

    const repaired = await callDeepSeek(
      apiKey,
      model,
      [
        { role: 'system', content: 'You repair malformed JSON. Return valid JSON only.' },
        { role: 'user', content: repairPrompt },
      ],
      { temperature: 0, maxTokens: 3072, responseFormat: 'json_object' }
    );

    return {
      parsed: parseAIJson(repaired.content),
      tokensUsed: repaired.tokensUsed,
    };
  }
}

// DeepSeek analysis endpoint — classifies OCR text into structured Problem array
export async function POST(req: NextRequest) {
  try {
    const adminError = await requireAdminRequest(req);
    if (adminError) return adminError;

    const { ocrText: rawOcrText, apiKey: clientApiKey, model: clientModel, chapterContext } = await req.json();
    const ocrText = toString(rawOcrText);

    const apiKey = resolveAIKey('deepseek', clientApiKey);
    const model = typeof clientModel === 'string' && clientModel.trim()
      ? clientModel.trim()
      : DEFAULT_DEEPSEEK_MODEL;

    if (!ocrText || !apiKey) {
      return NextResponse.json({ error: '缺少必要参数 (ocrText, apiKey)' }, { status: 400 });
    }

    const chapterList = Array.isArray(chapterContext)
      ? chapterContext.map(toString).filter(Boolean)
      : [];
    const chapterHint = chapterList.length > 0
      ? `\nAvailable chapters: ${chapterList.join(', ')}. Suggest the best matching chapter from this list, or suggest a new chapter name if none match.`
      : '\nSuggest an appropriate chapter name for this problem.';

    const systemPrompt = `You are a math problem extraction assistant for a Chinese exam-study knowledge base. Given OCR text that may contain ONE or MULTIPLE math problems, extract clean structured problems and output a JSON object with this structure:
{
  "problems": [
    {
      "question": "problem text (preserve LaTeX $...$ or $$...$$)",
      "answer": "short answer only",
      "type": "choice" | "fill" | "calculation" | "proof" | "proofEssay",
      "difficulty": "easy" | "medium" | "hard",
      "suggestedChapter": "chapter name or null",
      "options": [{"label": "A", "content": "option text"}],
      "confidence": 0.0 to 1.0
    }
  ]
}
Rules:
- Separate distinct problems into individual array items
- If only one problem found, still wrap it in the problems array
- If the image contains no usable problem, return {"problems":[]}
- Output Chinese text for answer unless the source is clearly English
- Preserve ALL LaTeX formulas ($...$ or $$...$$) in question and answer
- Correct obvious OCR mistakes only when the intended math/text is clear; do not silently change uncertain content
- If answer is not visible in the OCR text, solve the problem yourself and set confidence lower when the answer is inferred
- The answer must be short. For choice problems, answer should usually be only the option letter, for example "C"
- Do not output explanations, hints, or detailed solution steps
- type: "choice" for multiple-choice, "fill" for fill-in-blank, "calculation" for computation/solving, "proof" for theorem proving, "proofEssay" for proof-based essays
- difficulty: "easy" for basic exercises, "medium" for standard problems, "hard" for challenging/advanced
- For choice problems, move A/B/C/D options into the options array. Use labels without punctuation, for example "A", "B"
- options array ONLY for "choice" type, otherwise omit or empty
- If unsure about any field, use your best guess and set lower confidence
- Return valid JSON only. Do not include markdown fences, comments, or explanatory text outside the JSON object.
- Escape LaTeX backslashes for JSON strings. For example, write "\\\\frac{x}{2}" instead of "\\frac{x}{2}".${chapterHint}`;

    const { content, tokensUsed } = await callDeepSeek(
      apiKey,
      model,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: ocrText },
      ],
      { temperature: 0.2, maxTokens: 3072, responseFormat: 'json_object' }
    );

    let totalTokensUsed = tokensUsed;
    let normalizedProblems: ExtractedProblem[];
    let extractionMode: 'primary' | 'rescue' | 'ocrFallback' = 'primary';

    try {
      const parsedResult = await parseOrRepairAIJson(content, apiKey, model);
      totalTokensUsed += parsedResult.tokensUsed;
      normalizedProblems = normalizeProblems(parsedResult.parsed);
    } catch (error: unknown) {
      return NextResponse.json(
        {
          error: 'AI 返回格式解析失败，已尝试自动修复但仍失败',
          parseError: error instanceof Error ? error.message : undefined,
          rawContent: content,
        },
        { status: 422 }
      );
    }

    const shouldRescueEmptyResult = normalizedProblems.length === 0 && isLikelyProblemText(ocrText);

    if (shouldRescueEmptyResult) {
      const rescuePrompt = `The previous extraction returned no usable problems, but the OCR text appears to contain an exam question.
Extract at least one problem whenever possible. If the OCR is incomplete, keep the visible text as the question, leave answer empty when uncertain, and set confidence between 0.2 and 0.5.
Return valid JSON only with this shape: {"problems":[{"question":"","answer":"","type":"calculation","difficulty":"medium","suggestedChapter":null,"options":[],"confidence":0.3}]}.
Preserve LaTeX delimiters and escape backslashes correctly for JSON strings.${chapterHint}`;

      try {
        const rescue = await callDeepSeek(
          apiKey,
          model,
          [
            { role: 'system', content: rescuePrompt },
            { role: 'user', content: ocrText },
          ],
          { temperature: 0, maxTokens: 2048, responseFormat: 'json_object' }
        );

        totalTokensUsed += rescue.tokensUsed;
        const rescueParsedResult = await parseOrRepairAIJson(rescue.content, apiKey, model);
        totalTokensUsed += rescueParsedResult.tokensUsed;
        const rescueProblems = normalizeProblems(rescueParsedResult.parsed);

        if (rescueProblems.length > 0) {
          normalizedProblems = rescueProblems;
          extractionMode = 'rescue';
        }
      } catch (error: unknown) {
        console.warn('[Analyze] Empty result rescue failed:', error instanceof Error ? error.message : error);
      }
    }

    if (normalizedProblems.length === 0 && shouldRescueEmptyResult) {
      normalizedProblems = [buildOcrFallbackProblem(ocrText)];
      extractionMode = 'ocrFallback';
    }

    const warning = extractionMode === 'ocrFallback'
      ? 'AI 没有稳定拆出结构化题目，已把 OCR 原文作为低置信度题干保留，请人工核对。'
      : extractionMode === 'rescue'
        ? '首次分析为空，已通过补救提取生成题目，请快速核对题干与答案。'
        : undefined;

    return NextResponse.json({
      problems: normalizedProblems,
      tokensUsed: totalTokensUsed,
      extractionMode,
      warning,
      success: true,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '题目分析失败';
    console.error('[Analyze] Error:', message);
    return NextResponse.json(
      { error: message, success: false },
      { status: 500 }
    );
  }
}
