import { NextRequest, NextResponse } from 'next/server';
import { callQwenVision } from '@/lib/ai-client';
import { requireAdminRequest, resolveAIKey } from '@/lib/server-admin-auth';
import { DEFAULT_QWEN_ENDPOINT, DEFAULT_QWEN_MODEL } from '@/lib/ai-config';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeImageMimeType(value: unknown) {
  if (typeof value !== 'string') return 'image/jpeg';
  const mimeType = value.trim().toLowerCase();
  return mimeType.startsWith('image/') ? mimeType : 'image/jpeg';
}

// Qwen Vision OCR endpoint — extracts text from problem images
export async function POST(req: NextRequest) {
  try {
    const adminError = await requireAdminRequest(req);
    if (adminError) return adminError;

    const { imageBase64, mimeType: clientMimeType, apiKey: clientApiKey, model: clientModel, endpoint: clientEndpoint } = await req.json();

    const apiKey = resolveAIKey('qwen', clientApiKey);
    const model = typeof clientModel === 'string' && clientModel.trim()
      ? clientModel.trim()
      : DEFAULT_QWEN_MODEL;
    const endpoint = typeof clientEndpoint === 'string' && clientEndpoint.trim()
      ? clientEndpoint.trim()
      : DEFAULT_QWEN_ENDPOINT;
    const mimeType = normalizeImageMimeType(clientMimeType);

    if (!imageBase64 || !apiKey) {
      return NextResponse.json({ error: '缺少必要参数 (imageBase64, apiKey)' }, { status: 400 });
    }

    const prompt = `Extract all text from this image. This is likely an exam problem or math question.
Please follow these rules:
1. Preserve ALL mathematical formulas in LaTeX format: inline formulas use $...$, display formulas use $$...$$
2. Maintain the original structure: title/number, question, options, and short answer if visible
3. Keep line breaks between different parts of the problem; do not merge everything into one paragraph
4. Correct only obvious OCR noise, and keep uncertain characters as close to the image as possible
5. Output ONLY the extracted text, no additional commentary
6. For Chinese text, preserve original characters`;

    const { text } = await callQwenVision(
      apiKey,
      model,
      endpoint,
      imageBase64,
      prompt,
      mimeType
    );

    return NextResponse.json({ text, success: true });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'OCR 识别失败');
    console.error('[OCR] Error:', message);
    return NextResponse.json(
      { error: message, success: false },
      { status: 500 }
    );
  }
}
