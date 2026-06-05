import { NextRequest, NextResponse } from 'next/server';
import { callDeepSeek } from '@/lib/ai-client';
import { parseAIJson } from '@/lib/ai-json';
import { requireAdminRequest, resolveAIKey } from '@/lib/server-admin-auth';
import { DEFAULT_DEEPSEEK_MODEL } from '@/lib/ai-config';
import { repairProblemMarkdownFields } from '@/lib/markdown';
import { extractOptions } from '@/lib/utils';
import type { Difficulty, ProblemType } from '@/lib/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clampConfidence(value: unknown) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return 0.5;
  return Math.min(1, Math.max(0, confidence));
}

// DeepSeek analysis endpoint — classifies OCR text into structured Problem array
export async function POST(req: NextRequest) {
  try {
    const adminError = await requireAdminRequest(req);
    if (adminError) return adminError;

    const { ocrText, apiKey: clientApiKey, model: clientModel, chapterContext } = await req.json();

    const apiKey = resolveAIKey('deepseek', clientApiKey);
    const model = typeof clientModel === 'string' && clientModel.trim()
      ? clientModel.trim()
      : DEFAULT_DEEPSEEK_MODEL;

    if (!ocrText || !apiKey) {
      return NextResponse.json({ error: '缺少必要参数 (ocrText, apiKey)' }, { status: 400 });
    }

    const chapterList = Array.isArray(chapterContext) ? chapterContext : [];
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

    let parsed: unknown;
    let totalTokensUsed = tokensUsed;
    try {
      parsed = parseAIJson(content);
    } catch (firstParseError: unknown) {
      try {
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

        totalTokensUsed += repaired.tokensUsed;
        parsed = parseAIJson(repaired.content);
      } catch {
        return NextResponse.json(
          {
            error: 'AI 返回格式解析失败，已尝试自动修复但仍失败',
            parseError: firstParseError instanceof Error ? firstParseError.message : undefined,
            rawContent: content,
          },
          { status: 422 }
        );
      }
    }

    // Normalize: support both {problems:[...]} and legacy single-object responses
    const parsedObject = isRecord(parsed) ? parsed : {};
    let problems: unknown[];
    if (Array.isArray(parsed)) {
      problems = parsed;
    } else if (Array.isArray(parsedObject.problems)) {
      problems = parsedObject.problems;
    } else if (parsedObject.question || parsedObject.type) {
      // Backward compatibility: AI returned a single problem object
      problems = [parsedObject];
    } else {
      problems = [];
    }

    const allowedTypes = new Set(['choice', 'fill', 'calculation', 'proof', 'proofEssay']);
    const allowedDifficulties = new Set(['easy', 'medium', 'hard']);

    const toString = (value: unknown) => {
      if (value === null || value === undefined) return '';
      return typeof value === 'string' ? value.trim() : String(value);
    };

    const normalizedProblems = problems.flatMap((problem) => {
      const p = isRecord(problem) ? problem : {};
      const type = toString(p.type);
      const difficulty = toString(p.difficulty);
      const normalizedType = (allowedTypes.has(type) ? type : 'calculation') as ProblemType;
      const normalizedDifficulty = (allowedDifficulties.has(difficulty) ? difficulty : 'medium') as Difficulty;
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

    return NextResponse.json({
      problems: normalizedProblems,
      tokensUsed: totalTokensUsed,
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
