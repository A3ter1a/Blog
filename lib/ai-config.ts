import type { AIConfig } from "./types";

export const AI_CONFIG_STORAGE_KEY = "ai-config";

export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
export const DEFAULT_QWEN_MODEL = "qwen3.7-plus";
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

export const QWEN_OCR_MODEL_OPTIONS = [
  { value: "qwen3.7-plus", label: "Qwen3.7 Plus (多模态推荐)" },
  { value: "qwen-vl-ocr", label: "Qwen VL OCR (专业文字提取)" },
  { value: "qwen3-vl-32b-thinking", label: "Qwen3-VL 32B Thinking (OCR 稳定)" },
  { value: "qwen3-vl-30b-a3b-thinking", label: "Qwen3-VL 30B A3B Thinking (轻量备用)" },
  { value: "qwen3-vl-235b-a22b-thinking", label: "Qwen3-VL 235B A22B Thinking (强力备用)" },
] as const;

const QWEN_OCR_FALLBACK_MODELS = QWEN_OCR_MODEL_OPTIONS.map((option) => option.value);

const QWEN_OCR_COMPATIBLE_MODELS = new Set([
  ...QWEN_OCR_FALLBACK_MODELS,
  "qwen-vl-max",
  "qwen-vl-plus",
  "qwen-vl-ocr",
  "qwen-vl-ocr-latest",
]);

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

export function isQwenOcrModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  if (QWEN_OCR_COMPATIBLE_MODELS.has(normalized)) return true;

  return [
    /^qwen3-vl-/,
    /^qwen2\.5-vl-/,
    /^qwen-vl-ocr(?:-|$)/,
    /^qwen3\.(5|6|7)-plus$/,
  ].some((pattern) => pattern.test(normalized));
}

export function getQwenOcrModelCandidates(preferredModel: string): string[] {
  const preferred = preferredModel.trim();
  if (!preferred || !isQwenOcrModel(preferred)) return [];

  return Array.from(new Set([preferred, ...QWEN_OCR_FALLBACK_MODELS]));
}
