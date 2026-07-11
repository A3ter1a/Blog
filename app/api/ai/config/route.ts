import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { callDeepSeek } from '@/lib/ai-client';
import { requireAdminRequest, resolveAIKey } from '@/lib/server-admin-auth';
import {
  DEFAULT_DEEPSEEK_MODEL,
  DEFAULT_QWEN_ENDPOINT,
  DEFAULT_QWEN_MODEL,
  QWEN_OCR_MODEL_OPTIONS,
  isOfficialQwenEndpoint,
  isQwenOcrModel,
} from '@/lib/ai-config';
import { getBaiduAccessToken, hasBaiduOcrCredentials } from '@/lib/baidu-unlimited-ocr';

const OCR_DOCUMENT_BUCKET_NAME = 'ocr-documents';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getBearerToken(req: NextRequest): string {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

async function hasDocumentOcrStorageAccess(req: NextRequest) {
  const token = getBearerToken(req);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !supabaseUrl || !supabaseAnonKey) return false;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const { error } = await supabase.storage
    .from(OCR_DOCUMENT_BUCKET_NAME)
    .list('ocr-temp', { limit: 1 });

  return !error;
}

async function assertDocumentOcrStorageAccess(req: NextRequest) {
  if (await hasDocumentOcrStorageAccess(req)) return;
  throw new Error('OCR 临时文件桶 ocr-documents 不可用，请确认已执行 supabase/migrations/0007_document_ocr_storage.sql');
}

// Connection test endpoint — validates API keys for DeepSeek, Qwen, and Baidu OCR.
export async function GET(req: NextRequest) {
  const adminError = await requireAdminRequest(req);
  if (adminError) return adminError;

  const documentOcrStorageConfigured = await hasDocumentOcrStorageAccess(req);

  return NextResponse.json({
    success: true,
    deepseekConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
    qwenConfigured: Boolean(process.env.QWEN_API_KEY),
    baiduOcrConfigured: hasBaiduOcrCredentials(),
    documentOcrStorageConfigured,
  });
}

export async function POST(req: NextRequest) {
  try {
    const adminError = await requireAdminRequest(req);
    if (adminError) return adminError;

    const rawBody: unknown = await req.json().catch(() => ({}));
    const body = isRecord(rawBody) ? rawBody : {};
    const provider = typeof body.provider === 'string' ? body.provider : '';
    const clientApiKey = typeof body.apiKey === 'string' ? body.apiKey : undefined;
    const clientModel = typeof body.model === 'string' ? body.model : undefined;
    const clientEndpoint = typeof body.endpoint === 'string' ? body.endpoint : undefined;

    if (!provider) {
      return NextResponse.json({ error: '缺少必要参数 (provider)' }, { status: 400 });
    }

    if (provider === 'baidu-ocr') {
      if (!hasBaiduOcrCredentials()) {
        return NextResponse.json(
          { error: '缺少百度 OCR 服务端环境变量 BAIDU_OCR_API_KEY 和 BAIDU_OCR_SECRET_KEY' },
          { status: 400 }
        );
      }

      await getBaiduAccessToken();
      await assertDocumentOcrStorageAccess(req);
      return NextResponse.json({ success: true });
    }

    if (provider !== 'deepseek' && provider !== 'qwen') {
      return NextResponse.json({ error: `未知的 provider: ${provider}` }, { status: 400 });
    }

    if (provider === 'qwen' && !isOfficialQwenEndpoint(clientEndpoint)) {
      return NextResponse.json(
        { error: 'Qwen 仅支持官方 DashScope HTTPS 地址，不能使用自定义端点。' },
        { status: 400 },
      );
    }

    // Prefer server-side env vars, fall back to client-provided keys
    const apiKey = provider === 'deepseek'
      ? resolveAIKey('deepseek', clientApiKey)
      : resolveAIKey('qwen', clientApiKey);
    const model = typeof clientModel === 'string' && clientModel.trim()
      ? clientModel.trim()
      : (provider === 'deepseek' ? DEFAULT_DEEPSEEK_MODEL : DEFAULT_QWEN_MODEL);
    // Never use a client-provided address for an authenticated request.
    const endpoint = DEFAULT_QWEN_ENDPOINT;

    if (!apiKey) {
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
  } catch (error: unknown) {
    const message = getErrorMessage(error, '连接测试失败');
    console.error('[Config Test] Error:', message);
    return NextResponse.json(
      { error: message, success: false },
      { status: 500 }
    );
  }
}
