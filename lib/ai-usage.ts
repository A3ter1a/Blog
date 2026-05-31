"use client";

import type { AIUsageStats } from './types';
import { readJsonStorage, removeStorage, writeJsonStorage } from './browser-storage';

const STORAGE_KEY = 'ai-usage-stats';

function getDefaultStats(): AIUsageStats {
  return {
    deepseek: { totalTokens: 0, totalCost: 0 },
    qwen: { totalImages: 0, totalCost: 0 },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function normalizeUsageStats(value: unknown): AIUsageStats {
  const parsed = isRecord(value) ? value : {};
  const deepseek = isRecord(parsed.deepseek) ? parsed.deepseek : {};
  const qwen = isRecord(parsed.qwen) ? parsed.qwen : {};

  return {
    deepseek: {
      totalTokens: getNumber(deepseek.totalTokens),
      totalCost: getNumber(deepseek.totalCost),
      lastUsed: getString(deepseek.lastUsed),
    },
    qwen: {
      totalImages: getNumber(qwen.totalImages),
      totalCost: getNumber(qwen.totalCost),
      lastUsed: getString(qwen.lastUsed),
    },
  };
}

export function getUsageStats(): AIUsageStats {
  return readJsonStorage(STORAGE_KEY, getDefaultStats(), normalizeUsageStats);
}

export function recordDeepSeekUsage(tokens: number): void {
  const stats = getUsageStats();
  // DeepSeek pricing: ~¥1/1M tokens (approximate)
  stats.deepseek.totalTokens += tokens;
  stats.deepseek.totalCost = Number((stats.deepseek.totalTokens / 1_000_000).toFixed(4));
  stats.deepseek.lastUsed = new Date().toISOString();
  writeJsonStorage(STORAGE_KEY, stats);
}

export function recordQwenUsage(imageCount: number = 1): void {
  const stats = getUsageStats();
  // Qwen Vision pricing: ~¥0.002/image (approximate)
  stats.qwen.totalImages += imageCount;
  stats.qwen.totalCost = Number((stats.qwen.totalImages * 0.002).toFixed(4));
  stats.qwen.lastUsed = new Date().toISOString();
  writeJsonStorage(STORAGE_KEY, stats);
}

export function resetUsageStats(): void {
  removeStorage(STORAGE_KEY);
}
