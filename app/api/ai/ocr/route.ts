import { NextRequest, NextResponse } from 'next/server';
import { callQwenVision } from '@/lib/ai-client';

// Qwen Vision OCR endpoint — extracts text from problem images
export async function POST(req: NextRequest) {
  try {
    const { imageBase64, apiKey: clientApiKey, model: clientModel, endpoint: clientEndpoint } = await req.json();

    // Prefer server-side env vars, fall back to client-provided keys
    const apiKey = process.env.QWEN_API_KEY || clientApiKey;
    const model = clientModel || 'qwen-vl-max';
    const endpoint = clientEndpoint || 'https://dashscope.aliyuncs.com/compatible-mode/v1';

    if (!imageBase64 || !apiKey) {
      return NextResponse.json({ error: '缺少必要参数 (imageBase64, apiKey)' }, { status: 400 });
    }

    const prompt = `Extract all text from this image. This is likely an exam problem or math question.
Please follow these rules:
1. Preserve ALL mathematical formulas in LaTeX format: inline formulas use $...$, display formulas use $$...$$
2. Maintain the original structure: question, options (if any), answer hints
3. Output ONLY the extracted text, no additional commentary
4. For Chinese text, preserve original characters`;

    const { text } = await callQwenVision(
      apiKey,
      model,
      endpoint,
      imageBase64,
      prompt
    );

    return NextResponse.json({ text, success: true });
  } catch (error: any) {
    console.error('[OCR] Error:', error.message);
    return NextResponse.json(
      { error: error.message || 'OCR 识别失败', success: false },
      { status: 500 }
    );
  }
}
