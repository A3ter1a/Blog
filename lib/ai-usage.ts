// AI usage tracker — client-side via localStorage
import type { AIUsageStats } from './types';

const STORAGE_KEY = 'ai-usage-stats';

function getDefaultStats(): AIUsageStats {
  return {
    deepseek: { totalTokens: 0, totalCost: 0 },
    qwen: { totalImages: 0, totalCost: 0 },
  };
}

export function getUsageStats(): AIUsageStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultStats();
    const parsed = JSON.parse(raw);
    return {
      deepseek: {
        totalTokens: parsed.deepseek?.totalTokens || 0,
        totalCost: parsed.deepseek?.totalCost || 0,
        lastUsed: parsed.deepseek?.lastUsed,
      },
      qwen: {
        totalImages: parsed.qwen?.totalImages || 0,
        totalCost: parsed.qwen?.totalCost || 0,
        lastUsed: parsed.qwen?.lastUsed,
      },
    };
  } catch {
    return getDefaultStats();
  }
}

export function recordDeepSeekUsage(tokens: number): void {
  const stats = getUsageStats();
  // DeepSeek pricing: ~¥1/1M tokens (approximate)
  stats.deepseek.totalTokens += tokens;
  stats.deepseek.totalCost = Number((stats.deepseek.totalTokens / 1_000_000).toFixed(4));
  stats.deepseek.lastUsed = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

export function recordQwenUsage(imageCount: number = 1): void {
  const stats = getUsageStats();
  // Qwen Vision pricing: ~¥0.002/image (approximate)
  stats.qwen.totalImages += imageCount;
  stats.qwen.totalCost = Number((stats.qwen.totalImages * 0.002).toFixed(4));
  stats.qwen.lastUsed = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

export function resetUsageStats(): void {
  localStorage.removeItem(STORAGE_KEY);
}
