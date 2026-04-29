'use client';

import { useState, useCallback } from 'react';
import type { Problem, ProblemType, Difficulty, AIConfig } from '@/lib/types';
import { recordDeepSeekUsage, recordQwenUsage } from '@/lib/ai-usage';

export type ScanStage = 'idle' | 'uploading' | 'scanning' | 'analyzing' | 'complete' | 'error';

export interface ScanState {
  stage: ScanStage;
  progress: number; // 0-100
  ocrText?: string;
  currentImage?: number; // 1-indexed
  totalImages?: number;
  extractedProblems?: Partial<Problem>[];
  error?: string;
}

const STORAGE_KEY = 'ai-config';
const MAX_OCR_LENGTH = 4000;
const FETCH_TIMEOUT = 180000; // 3 min per API call

function getAIConfig(): AIConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '\n...(文本过长已截断)';
}

export function useAIScan() {
  const [scanState, setScanState] = useState<ScanState>({ stage: 'idle', progress: 0 });

  const startScan = useCallback(async (imageBase64s: string[], chapterContext?: string[]) => {
    const config = getAIConfig();
    if (!config) {
      setScanState({ stage: 'error', progress: 0, error: '请先在设置中配置 AI API Key' });
      return;
    }

    const N = imageBase64s.length;
    if (N === 0) return;

    try {
      setScanState({ stage: 'uploading', progress: 5, currentImage: 0, totalImages: N });

      const allProblems: Partial<Problem>[] = [];
      let lastOcrText = '';

      for (let i = 0; i < N; i++) {
        const imgBase64 = imageBase64s[i];
        const imgNum = i + 1;

        // ── Step A: OCR ──
        const ocrProgress = 5 + Math.round((2 * i / (2 * N)) * 90);
        setScanState({
          stage: 'scanning',
          progress: ocrProgress,
          currentImage: imgNum,
          totalImages: N,
          ocrText: lastOcrText,
        });

        const ocrRes = await fetch('/api/ai/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: imgBase64,
            apiKey: config.qwenApiKey,
            model: config.qwenModel,
            endpoint: config.qwenApiEndpoint || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          }),
          signal: AbortSignal.timeout(FETCH_TIMEOUT),
        });

        if (!ocrRes.ok) {
          const err = await ocrRes.json().catch(() => ({}));
          throw new Error(err.error || `第 ${imgNum} 张图片 OCR 识别失败`);
        }

        const ocrData = await ocrRes.json();
        const rawOcrText = ocrData.text || '';
        const ocrText = truncateText(rawOcrText, MAX_OCR_LENGTH);
        lastOcrText = ocrText;
        recordQwenUsage(1);

        // ── Step B: Analyze ──
        const analyzeProgress = 5 + Math.round(((2 * i + 1) / (2 * N)) * 90);
        setScanState({
          stage: 'analyzing',
          progress: analyzeProgress,
          currentImage: imgNum,
          totalImages: N,
          ocrText,
        });

        const analyzeRes = await fetch('/api/ai/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ocrText,
            apiKey: config.deepseekApiKey,
            model: config.deepseekModel || 'deepseek-v4-flash',
            chapterContext,
          }),
          signal: AbortSignal.timeout(FETCH_TIMEOUT),
        });

        if (!analyzeRes.ok) {
          const err = await analyzeRes.json().catch(() => ({}));
          throw new Error(err.error || `第 ${imgNum} 张图片分析失败`);
        }

        const analyzeData = await analyzeRes.json();
        if (analyzeData.tokensUsed) {
          recordDeepSeekUsage(analyzeData.tokensUsed);
        }

        const rawProblems = Array.isArray(analyzeData.problems) ? analyzeData.problems : [];
        for (const p of rawProblems) {
          allProblems.push({
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
          });
        }
      }

      setScanState({
        stage: 'complete',
        progress: 100,
        ocrText: lastOcrText,
        extractedProblems: allProblems,
      });
    } catch (error: any) {
      const msg = error.name === 'AbortError' || error.name === 'TimeoutError'
        ? `AI 扫描超时（超过 ${FETCH_TIMEOUT / 60000} 分钟），请重试或使用更小的图片`
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
