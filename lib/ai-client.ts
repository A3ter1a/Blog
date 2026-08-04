// AI API client — server-side wrappers for DeepSeek and Qwen Vision
// Called only from app/api/ai/* route handlers, never from client directly.

export type DeepSeekReasoningEffort = "high" | "max";
export type DeepSeekThinkingMode = "enabled" | "disabled";

export type DeepSeekRequestOptions = {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: string;
  reasoningEffort?: DeepSeekReasoningEffort;
  thinking?: DeepSeekThinkingMode;
  signal?: AbortSignal;
};

function createDeepSeekSignal(signal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(180_000);
  if (!signal) return timeoutSignal;
  if (signal.aborted) return AbortSignal.abort(signal.reason);
  return AbortSignal.any([signal, timeoutSignal]);
}

function applyDeepSeekOptions(body: Record<string, unknown>, options?: DeepSeekRequestOptions): void {
  if (options?.reasoningEffort) {
    body.reasoning_effort = options.reasoningEffort;
  }

  if (options?.thinking) {
    body.thinking = { type: options.thinking };
  }

  if (options?.responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }
}

// OpenAI-compatible chat completion (DeepSeek)
export async function callDeepSeek(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  options?: DeepSeekRequestOptions,
): Promise<{ content: string; tokensUsed: number }> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.maxTokens ?? 4096,
    stream: false,
  };

  applyDeepSeekOptions(body, options);

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: createDeepSeekSignal(options?.signal),
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

/**
 * Open a DeepSeek SSE stream. The caller owns parsing the stream so route
 * handlers can prepend retrieval metadata and expose a stable event contract
 * to the browser without leaking the upstream response directly.
 */
export async function openDeepSeekStream(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  options?: DeepSeekRequestOptions,
): Promise<Response> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.maxTokens ?? 4096,
    stream: true,
    stream_options: { include_usage: true },
  };

  applyDeepSeekOptions(body, options);

  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: createDeepSeekSignal(options?.signal),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error?.message || `DeepSeek API error: ${res.status} ${res.statusText}`);
  }

  if (!res.body) {
    throw new Error("DeepSeek API 未返回可读取的流");
  }

  return res;
}

// Qwen Vision API (DashScope compatible-mode)
export async function callQwenVision(
  apiKey: string,
  model: string,
  endpoint: string,
  imageBase64: string,
  prompt: string,
  mimeType: string = 'image/jpeg'
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
                url: `data:${mimeType};base64,${imageBase64}`,
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
    signal: AbortSignal.timeout(180000),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error?.message || `Qwen API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';

  return { text };
}
