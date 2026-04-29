import { NextRequest, NextResponse } from 'next/server';
import { callDeepSeek } from '@/lib/ai-client';

// DeepSeek analysis endpoint — classifies OCR text into structured Problem array
export async function POST(req: NextRequest) {
  try {
    const { ocrText, apiKey: clientApiKey, model: clientModel, chapterContext } = await req.json();

    // Prefer server-side env vars, fall back to client-provided keys
    const apiKey = process.env.DEEPSEEK_API_KEY || clientApiKey;
    const model = clientModel || 'deepseek-v4-flash';

    if (!ocrText || !apiKey) {
      return NextResponse.json({ error: '缺少必要参数 (ocrText, apiKey)' }, { status: 400 });
    }

    const chapterList = Array.isArray(chapterContext) ? chapterContext : [];
    const chapterHint = chapterList.length > 0
      ? `\nAvailable chapters: ${chapterList.join(', ')}. Suggest the best matching chapter from this list, or suggest a new chapter name if none match.`
      : '\nSuggest an appropriate chapter name for this problem.';

    const systemPrompt = `You are a math problem classifier. Given OCR-extracted text that may contain ONE or MULTIPLE math problems, output a JSON object with this structure:
{
  "problems": [
    {
      "question": "problem text (preserve LaTeX $...$ or $$...$$)",
      "answer": "answer/solution",
      "explanation": "detailed solution steps",
      "type": "choice" | "fill" | "calculation" | "proof" | "proofEssay",
      "difficulty": "easy" | "medium" | "hard",
      "suggestedChapter": "chapter name or null",
      "tips": "optional solving tips or null",
      "options": [{"label": "A", "content": "option text"}],
      "confidence": 0.0 to 1.0
    }
  ]
}
Rules:
- Separate distinct problems into individual array items
- If only one problem found, still wrap it in the problems array
- Preserve ALL LaTeX formulas ($...$ or $$...$$) in question/answer/explanation
- type: "choice" for multiple-choice, "fill" for fill-in-blank, "calculation" for computation/solving, "proof" for theorem proving, "proofEssay" for proof-based essays
- difficulty: "easy" for basic exercises, "medium" for standard problems, "hard" for challenging/advanced
- options array ONLY for "choice" type, otherwise omit or empty
- If unsure about any field, use your best guess and set lower confidence${chapterHint}`;

    const { content, tokensUsed } = await callDeepSeek(
      apiKey,
      model,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: ocrText },
      ],
      { temperature: 0.3, maxTokens: 4096, responseFormat: 'json_object' }
    );

    let parsed: any;
    try {
      // Clean potential markdown code fences
      const cleaned = content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: 'AI 返回格式解析失败，请重试', rawContent: content },
        { status: 422 }
      );
    }

    // Normalize: support both {problems:[...]} and legacy single-object responses
    let problems: any[];
    if (Array.isArray(parsed.problems)) {
      problems = parsed.problems;
    } else if (parsed.question || parsed.type) {
      // Backward compatibility: AI returned a single problem object
      problems = [parsed];
    } else {
      problems = [];
    }

    return NextResponse.json({
      problems: problems.map((p: any) => ({
        question: p.question || '',
        answer: p.answer || '',
        explanation: p.explanation || '',
        type: p.type || 'calculation',
        difficulty: p.difficulty || 'medium',
        suggestedChapter: p.suggestedChapter || null,
        tips: p.tips || undefined,
        options: Array.isArray(p.options) ? p.options : undefined,
        confidence: typeof p.confidence === 'number' ? p.confidence : 0.5,
      })),
      tokensUsed,
      success: true,
    });
  } catch (error: any) {
    console.error('[Analyze] Error:', error.message);
    return NextResponse.json(
      { error: error.message || '题目分析失败', success: false },
      { status: 500 }
    );
  }
}
