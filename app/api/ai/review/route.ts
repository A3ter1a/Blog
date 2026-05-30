import { NextRequest, NextResponse } from 'next/server';
import { callDeepSeek } from '@/lib/ai-client';
import { parseAIJson } from '@/lib/ai-json';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export async function POST(req: NextRequest) {
  try {
    const { problem, apiKey: clientApiKey, model: clientModel } = await req.json();

    const apiKey = process.env.DEEPSEEK_API_KEY || clientApiKey;
    const model = clientModel || 'deepseek-v4-flash';

    if (!problem || !apiKey) {
      return NextResponse.json({ error: '缺少必要参数 (problem, apiKey)' }, { status: 400 });
    }

    const systemPrompt = `You are a math problem quality reviewer. Review the given problem and provide a structured assessment. Focus on:

1. **Explanation quality**: Is the explanation clear, well-structured, and logically broken into steps? Does it use proper Markdown formatting? Is it easy for a student to follow?

2. **Answer correctness**: Does the answer match the question? Is it mathematically correct?

3. **Tag accuracy**: Are the tags appropriate for the problem content? Are any important tags missing?

4. **Difficulty assessment**: Is the difficulty level (easy/medium/hard) appropriate for this problem?

5. **Type correctness**: Is the problem type (choice/fill/calculation/proof/proofEssay) correctly assigned?

6. **Tips**: If tips are provided, are they helpful? If not provided, could useful tips be added?

Output a JSON object with this structure:
{
  "summary": "one-sentence overall assessment",
  "hasIssues": true or false,
  "suggestions": [
    {
      "field": "explanation" | "answer" | "type" | "difficulty" | "tags" | "tips" | "general",
      "issue": "description of the issue",
      "suggestion": "specific fix or improvement (for text fields, provide the exact replacement text)"
    }
  ]
}

Rules:
- Be honest but constructive — flag real problems, don't nitpick formatting minutiae
- For "explanation" field suggestions: if the explanation is a wall of text without steps, provide a properly formatted replacement with numbered steps (步骤1：..., 步骤2：..., etc.)
- For "type" field suggestions: value must be one of "choice", "fill", "calculation", "proof", "proofEssay"
- For "difficulty" field suggestions: value must be one of "easy", "medium", "hard"
- If everything looks good, set hasIssues to false and suggestions to an empty array
- Preserve LaTeX formulas ($...$ or $$...$$) in any suggested text`;

    const userPrompt = `Please review this math problem:

Question: ${problem.question || '(empty)'}

Answer: ${problem.answer || '(empty)'}

Explanation: ${problem.explanation || '(empty)'}

Type: ${problem.type || 'calculation'}

Difficulty: ${problem.difficulty || 'medium'}

Tags: ${Array.isArray(problem.tags) ? problem.tags.join(', ') : (problem.tags || '(none)')}

Tips: ${problem.tips || '(none)'}`;

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
