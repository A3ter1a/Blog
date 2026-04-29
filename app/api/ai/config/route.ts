import { NextRequest, NextResponse } from 'next/server';
import { callDeepSeek } from '@/lib/ai-client';

// Connection test endpoint — validates API keys for DeepSeek and Qwen
export async function POST(req: NextRequest) {
  try {
    const { provider, apiKey: clientApiKey, model: clientModel, endpoint: clientEndpoint } = await req.json();

    // Prefer server-side env vars, fall back to client-provided keys
    const apiKey = provider === 'deepseek'
      ? (process.env.DEEPSEEK_API_KEY || clientApiKey)
      : (process.env.QWEN_API_KEY || clientApiKey);
    const model = clientModel || (provider === 'deepseek' ? 'deepseek-v4-flash' : 'qwen-vl-max');
    const endpoint = clientEndpoint || 'https://dashscope.aliyuncs.com/compatible-mode/v1';

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
        throw new Error(error.error?.message || `Qwen API error: ${res.status}`);
      }

      const data = await res.json();
      const modelList = data.data?.map((m: any) => m.id).filter((id: string) => id.startsWith('qwen')) || [];
      return NextResponse.json({ success: true, modelList });
    }

    return NextResponse.json({ error: `未知的 provider: ${provider}` }, { status: 400 });
  } catch (error: any) {
    console.error('[Config Test] Error:', error.message);
    return NextResponse.json(
      { error: error.message || '连接测试失败', success: false },
      { status: 500 }
    );
  }
}
