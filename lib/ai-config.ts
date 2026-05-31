import type { AIConfig } from "./types";

export const AI_CONFIG_STORAGE_KEY = "ai-config";

export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
export const DEFAULT_QWEN_MODEL = "qwen-vl-max";
export const DEFAULT_QWEN_ENDPOINT = "https://dashscope.aliyuncs.com/compatible-mode/v1";

export const ALLOW_CLIENT_AI_KEYS = process.env.NODE_ENV !== "production";

export const DEFAULT_AI_CONFIG: AIConfig = {
  deepseekApiKey: "",
  deepseekModel: DEFAULT_DEEPSEEK_MODEL,
  qwenApiKey: "",
  qwenModel: DEFAULT_QWEN_MODEL,
  qwenApiEndpoint: DEFAULT_QWEN_ENDPOINT,
};

export const DEEPSEEK_MODEL_OPTIONS = [
  { value: "deepseek-v4-flash", label: "DeepSeek V4 Flash (快速)" },
  { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro (高级)" },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function normalizeAIConfig(value: unknown): AIConfig {
  const raw = isRecord(value) ? value : {};

  return {
    deepseekApiKey: asString(raw.deepseekApiKey, DEFAULT_AI_CONFIG.deepseekApiKey),
    deepseekModel: asNonEmptyString(raw.deepseekModel, DEFAULT_AI_CONFIG.deepseekModel),
    qwenApiKey: asString(raw.qwenApiKey, DEFAULT_AI_CONFIG.qwenApiKey),
    qwenModel: asNonEmptyString(raw.qwenModel, DEFAULT_AI_CONFIG.qwenModel),
    qwenApiEndpoint: asNonEmptyString(raw.qwenApiEndpoint, DEFAULT_AI_CONFIG.qwenApiEndpoint),
  };
}

export function sanitizeAIConfig(config: AIConfig): AIConfig {
  const normalized = normalizeAIConfig(config);
  if (ALLOW_CLIENT_AI_KEYS) return normalized;
  return { ...normalized, deepseekApiKey: "", qwenApiKey: "" };
}
