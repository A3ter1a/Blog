import { NextRequest, NextResponse } from 'next/server';
import { callDeepSeek } from '@/lib/ai-client';
import { requireAdminRequest, resolveAIKey } from '@/lib/server-admin-auth';
import {
  DEFAULT_DEEPSEEK_MODEL,
  DEFAULT_QWEN_ENDPOINT,
  DEFAULT_QWEN_MODEL,
  QWEN_OCR_MODEL_OPTIONS,
  isQwenOcrModel,
} from '@/lib/ai-config';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

// Connection test endpoint — validates API keys for DeepSeek and Qwen
export async function GET(req: NextRequest) {
  const adminError = await requireAdminRequest(req);
  if (adminError) return adminError;

  return NextResponse.json({
    success: true,
    deepseekConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
    qwenConfigured: Boolean(process.env.QWEN_API_KEY),
  });
}

export async function POST(req: NextRequest) {
  try {
    const adminError = await requireAdminRequest(req);
    if (adminError) return adminError;

    const { provider, apiKey: clientApiKey, model: clientModel, endpoint: clientEndpoint } = await req.json();

    // Prefer server-side env vars, fall back to client-provided keys
    const apiKey = provider === 'deepseek'
      ? resolveAIKey('deepseek', clientApiKey)
      : resolveAIKey('qwen', clientApiKey);
    const model = typeof clientModel === 'string' && clientModel.trim()
      ? clientModel.trim()
      : (provider === 'deepseek' ? DEFAULT_DEEPSEEK_MODEL : DEFAULT_QWEN_MODEL);
    const endpoint = typeof clientEndpoint === 'string' && clientEndpoint.trim()
      ? clientEndpoint.trim()
      : DEFAULT_QWEN_ENDPOINT;

    if (!provider || !apiKey) {
      return NextResponse.json({ error: '缺少必要参数 (provider, apiKey)' }, { status: 400 });
    }

    if (provider === 'deepseek') {
      // Test DeepSeek: send a minimal chat completion
      const { tokensUsed } = await callDeepSeek(
        apiKey,
        model,
        [{ role: 'user', content: 'Hi' }],
        { maxTokens: 5 }
      );
      return NextResponse.json({ success: true, tokensUsed });
    }

    if (provider === 'qwen') {
      if (!isQwenOcrModel(model)) {
        return NextResponse.json(
          { error: `模型 ${model} 不支持图片输入，不能用于 OCR。` },
          { status: 400 }
        );
      }

      // Test Qwen: fetch models list from DashScope
      const baseUrl = endpoint.replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        const apiMessage = isRecord(error) && isRecord(error.error) && typeof error.error.message === 'string'
          ? error.error.message
          : undefined;
        throw new Error(apiMessage || `Qwen API error: ${res.status}`);
      }

      const data: unknown = await res.json();
      const models = isRecord(data) && Array.isArray(data.data) ? data.data : [];
      const modelList = models
        .map((modelInfo) => (isRecord(modelInfo) && typeof modelInfo.id === 'string' ? modelInfo.id : null))
        .filter((id): id is string => Boolean(id && isQwenOcrModel(id)));
      const ocrModelList = Array.from(new Set([
        ...QWEN_OCR_MODEL_OPTIONS.map((option) => option.value),
        ...modelList,
      ]));
      return NextResponse.json({ success: true, modelList: ocrModelList });
    }

    return NextResponse.json({ error: `未知的 provider: ${provider}` }, { status: 400 });
  } catch (error: unknown) {
    const message = getErrorMessage(error, '连接测试失败');
    console.error('[Config Test] Error:', message);
    return NextResponse.json(
      { error: message, success: false },
      { status: 500 }
    );
  }
}
