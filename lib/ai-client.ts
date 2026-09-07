import { DEFAULT_DEEPSEEK_OCR_MODEL, DEEPSEEK_OCR_ENDPOINT } from "./ai-config.ts";

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
): Promise<{ content: string; tokensUsed: number; finishReason?: string }> {
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

  const finishReason = data.choices?.[0]?.finish_reason;
  return { content, tokensUsed, ...(typeof finishReason === "string" ? { finishReason } : {}) };
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
  mimeType: string = 'image/jpeg',
  signal?: AbortSignal,
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
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180_000)]) : AbortSignal.timeout(180_000),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error?.message || `Qwen API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';

  return { text };
}


export async function callDeepSeekVision(apiKey: string, imageBase64: string, prompt: string, mimeType = "image/jpeg", signal?: AbortSignal): Promise<{ text: string; tokensUsed: number }> {
  if (!apiKey.trim() || !imageBase64.trim()) throw new Error("DeepSeek OCR 缺少图片或 API Key");
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mimeType)) throw new Error("DeepSeek OCR 不支持此图片格式");
  if (imageBase64.length > 44 * 1024 * 1024) throw new Error("图片过大，请压缩或分图后重试");
  const response = await fetch(DEEPSEEK_OCR_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: DEFAULT_DEEPSEEK_OCR_MODEL, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: "original" } }] }], thinking: { type: "disabled" }, max_tokens: 8192, stream: false }), signal: createDeepSeekSignal(signal) });
  if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error?.message || `DeepSeek OCR 请求失败 (${response.status})`); }
  const data = await response.json();
  if (data.choices?.[0]?.finish_reason === "length") throw new Error("DeepSeek OCR 文字输出被截断，请按题目裁图后重试");
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("DeepSeek OCR 未返回有效文字，请检查图片或切换 Qwen OCR");
  return { text: text.trim(), tokensUsed: Number(data.usage?.total_tokens) || 0 };
}
