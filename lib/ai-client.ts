// AI API client — server-side wrappers for DeepSeek and Qwen Vision
// Called only from app/api/ai/* route handlers, never from client directly.

// OpenAI-compatible chat completion (DeepSeek)
export async function callDeepSeek(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  options?: { temperature?: number; maxTokens?: number; responseFormat?: string }
): Promise<{ content: string; tokensUsed: number }> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.maxTokens ?? 4096,
    stream: false,
  };

  if (options?.responseFormat === 'json_object') {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error?.message || `DeepSeek API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';
  const tokensUsed = data.usage?.total_tokens || 0;

  return { content, tokensUsed };
}

// Qwen Vision API (DashScope compatible-mode)
export async function callQwenVision(
  apiKey: string,
  model: string,
  endpoint: string,
  imageBase64: string,
  prompt: string
): Promise<{ text: string }> {
  const baseUrl = endpoint.replace(/\/+$/, '');

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
      max_tokens: 4096,
      stream: false,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error?.message || `Qwen API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';

  return { text };
}
