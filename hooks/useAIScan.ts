'use client';

import { useState, useCallback } from 'react';
import type { Problem, ProblemType, Difficulty, AIConfig } from '@/lib/types';
import { recordDeepSeekUsage, recordQwenUsage } from '@/lib/ai-usage';

export type ScanStage = 'idle' | 'uploading' | 'scanning' | 'analyzing' | 'complete' | 'error';

export interface ScanState {
  stage: ScanStage;
  progress: number; // 0-100
  ocrText?: string;
  extractedProblems?: Partial<Problem>[];
  error?: string;
}

const STORAGE_KEY = 'ai-config';

function getAIConfig(): AIConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function useAIScan() {
  const [scanState, setScanState] = useState<ScanState>({ stage: 'idle', progress: 0 });

  const startScan = useCallback(async (imageBase64: string, chapterContext?: string[]) => {
    const config = getAIConfig();
    if (!config) {
      setScanState({ stage: 'error', progress: 0, error: '请先在设置中配置 AI API Key' });
      return;
    }

    try {
      // Stage 1: Uploading
      setScanState({ stage: 'uploading', progress: 10 });

      // Stage 2: OCR Scanning
      setScanState({ stage: 'scanning', progress: 20 });
      const ocrRes = await fetch('/api/ai/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          apiKey: config.qwenApiKey,
          model: config.qwenModel,
          endpoint: config.qwenApiEndpoint || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        }),
        signal: AbortSignal.timeout(120000),
      });

      if (!ocrRes.ok) {
        const err = await ocrRes.json().catch(() => ({}));
        throw new Error(err.error || 'OCR 识别失败');
      }

      const ocrData = await ocrRes.json();
      const ocrText = ocrData.text || '';
      recordQwenUsage(1);

      setScanState({ stage: 'scanning', progress: 50, ocrText });

      // Stage 3: DeepSeek Analysis
      setScanState({ stage: 'analyzing', progress: 60, ocrText });

      const analyzeRes = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ocrText,
          apiKey: config.deepseekApiKey,
          model: config.deepseekModel || 'deepseek-v4-flash',
          chapterContext,
        }),
        signal: AbortSignal.timeout(120000),
      });

      if (!analyzeRes.ok) {
        const err = await analyzeRes.json().catch(() => ({}));
        throw new Error(err.error || '题目分析失败');
      }

      const analyzeData = await analyzeRes.json();
      if (analyzeData.tokensUsed) {
        recordDeepSeekUsage(analyzeData.tokensUsed);
      }

      const rawProblems = Array.isArray(analyzeData.problems) ? analyzeData.problems : [];
      const extractedProblems: Partial<Problem>[] = rawProblems.map((p: any) => ({
        type: (p.type as ProblemType) || 'calculation',
        difficulty: (p.difficulty as Difficulty) || 'medium',
        question: p.question || '',
        answer: p.answer || '',
        explanation: p.explanation || '',
        tips: p.tips,
        options: Array.isArray(p.options) ? p.options : undefined,
        tags: [p.suggestedChapter].filter(Boolean),
        aiResult: {
          rawQuestion: ocrText,
          rawAnswer: '',
          rawExplanation: '',
          confidence: typeof p.confidence === 'number' ? p.confidence : 0.5,
        },
      }));

      setScanState({
        stage: 'complete',
        progress: 100,
        ocrText,
        extractedProblems,
      });
    } catch (error: any) {
      const msg = error.name === 'AbortError' || error.name === 'TimeoutError'
        ? 'AI 扫描超时（超过 2 分钟），请重试或使用更小的图片'
        : (error.message || '未知错误');
      setScanState({
        stage: 'error',
        progress: 0,
        error: msg,
      });
    }
  }, []);

  const resetScan = useCallback(() => {
    setScanState({ stage: 'idle', progress: 0 });
  }, []);

  return { scanState, startScan, resetScan };
}
