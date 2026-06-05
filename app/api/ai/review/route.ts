import { NextRequest, NextResponse } from 'next/server';
import { callDeepSeek } from '@/lib/ai-client';
import { parseAIJson } from '@/lib/ai-json';
import { requireAdminRequest, resolveAIKey } from '@/lib/server-admin-auth';
import { DEFAULT_DEEPSEEK_MODEL } from '@/lib/ai-config';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export async function POST(req: NextRequest) {
  try {
    const adminError = await requireAdminRequest(req);
    if (adminError) return adminError;

    const { problem, apiKey: clientApiKey, model: clientModel } = await req.json();

    const apiKey = resolveAIKey('deepseek', clientApiKey);
    const model = typeof clientModel === 'string' && clientModel.trim()
      ? clientModel.trim()
      : DEFAULT_DEEPSEEK_MODEL;

    if (!problem || !apiKey) {
      return NextResponse.json({ error: '缺少必要参数 (problem, apiKey)' }, { status: 400 });
    }

    const systemPrompt = `You are a math problem quality reviewer. Review the given problem and provide a structured assessment. Focus only on the problem stem and short answer:

1. **Question quality**: Is the question complete, readable, and mathematically unambiguous?

2. **Answer correctness**: Does the short answer match the question? Is it mathematically correct?

3. **Choice options**: For choice problems, are the options complete and consistent with the answer?

4. **Difficulty assessment**: Is the difficulty level (easy/medium/hard) appropriate for this problem?

5. **Type correctness**: Is the problem type (choice/fill/calculation/proof/proofEssay) correctly assigned?

Output a JSON object with this structure:
{
  "summary": "one-sentence overall assessment",
  "hasIssues": true or false,
  "suggestions": [
    {
      "field": "question" | "answer" | "type" | "difficulty" | "general",
      "issue": "description of the issue",
      "suggestion": "specific fix or improvement (for text fields, provide the exact replacement text)"
    }
  ]
}

Rules:
- Be honest but constructive — flag real problems, don't nitpick formatting minutiae
- Do not generate explanations, hints, or detailed solution steps
- Keep answer suggestions short. For choice problems, answer should usually be a letter such as "A"
- For "type" field suggestions: value must be one of "choice", "fill", "calculation", "proof", "proofEssay"
- For "difficulty" field suggestions: value must be one of "easy", "medium", "hard"
- If everything looks good, set hasIssues to false and suggestions to an empty array
- Preserve LaTeX formulas ($...$ or $$...$$) in any suggested text`;

    const userPrompt = `Please review this math problem:

Question: ${problem.question || '(empty)'}

Answer: ${problem.answer || '(empty)'}

Options: ${Array.isArray(problem.options) ? JSON.stringify(problem.options) : '(none)'}

Type: ${problem.type || 'calculation'}

Difficulty: ${problem.difficulty || 'medium'}`;

    const { content, tokensUsed } = await callDeepSeek(
      apiKey,
      model,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.3, maxTokens: 2048, responseFormat: 'json_object' }
    );

    let parsed: unknown;
    try {
      parsed = parseAIJson(content);
    } catch {
      return NextResponse.json(
        { error: 'AI 返回格式解析失败，请重试', rawContent: content },
        { status: 422 }
      );
    }
    const review = isRecord(parsed) ? parsed : {};

    return NextResponse.json({
      review: {
        summary: getString(review.summary),
        hasIssues: typeof review.hasIssues === 'boolean' ? review.hasIssues : false,
        suggestions: Array.isArray(review.suggestions) ? review.suggestions : [],
      },
      tokensUsed,
      success: true,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'AI 检查失败';
    console.error('[Review] Error:', message);
    return NextResponse.json(
      { error: message, success: false },
      { status: 500 }
    );
  }
}
