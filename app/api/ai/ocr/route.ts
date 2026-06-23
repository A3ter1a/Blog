import { NextRequest, NextResponse } from 'next/server';
import { callQwenVision } from '@/lib/ai-client';
import { requireAdminRequest, resolveAIKey } from '@/lib/server-admin-auth';
import {
  DEFAULT_QWEN_ENDPOINT,
  DEFAULT_QWEN_MODEL,
  getQwenOcrModelCandidates,
  isQwenOcrModel,
} from '@/lib/ai-config';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeImageMimeType(value: unknown) {
  if (typeof value !== 'string') return 'image/jpeg';
  const mimeType = value.trim().toLowerCase();
  return mimeType.startsWith('image/') ? mimeType : 'image/jpeg';
}

function shouldTryNextOcrModel(message: string) {
  const normalized = message.toLowerCase();
  if (/(401|403|unauthorized|forbidden|api key|access denied|fetch failed|network|timeout|enotfound|econn)/i.test(message)) {
    return false;
  }

  return [
    'quota',
    'free',
    'limit',
    'rate',
    '429',
    'insufficient',
    'balance',
    'exceeded',
    'model',
    'vision',
    'image',
    'multimodal',
  ].some((keyword) => normalized.includes(keyword));
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

    if (!isQwenOcrModel(model)) {
      return NextResponse.json(
        { error: `模型 ${model} 不支持图片输入，不能用于 OCR。请改用 Qwen3.7 Plus 或 Qwen3-VL 系列。` },
        { status: 400 }
      );
    }

    const prompt = `Extract all text from this image. This is likely an exam problem or math question.
Please follow these rules:
1. Preserve ALL mathematical formulas in LaTeX format: inline formulas use $...$, display formulas use $$...$$
2. Maintain the original structure: title/number, question, options, and short answer if visible
3. Keep line breaks between different parts of the problem; do not merge everything into one paragraph
4. Correct only obvious OCR noise, and keep uncertain characters as close to the image as possible
5. Output ONLY the extracted text, no additional commentary
6. For Chinese text, preserve original characters`;

    const modelCandidates = getQwenOcrModelCandidates(model);
    const failures: string[] = [];
    let text = '';
    let usedModel = model;

    for (const candidateModel of modelCandidates) {
      try {
        const result = await callQwenVision(
          apiKey,
          candidateModel,
          endpoint,
          imageBase64,
          prompt,
          mimeType
        );
        text = result.text;
        usedModel = candidateModel;
        break;
      } catch (error: unknown) {
        const message = getErrorMessage(error, 'OCR 识别失败');
        failures.push(`${candidateModel}: ${message}`);
        if (!shouldTryNextOcrModel(message)) break;
      }
    }

    if (!text) {
      throw new Error(failures[failures.length - 1] || 'OCR 识别失败');
    }

    return NextResponse.json({ text, success: true, model: usedModel });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'OCR 识别失败');
    console.error('[OCR] Error:', message);
    return NextResponse.json(
      { error: message, success: false },
      { status: 500 }
    );
  }
}
