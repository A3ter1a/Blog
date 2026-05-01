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

      // ── Phase 1+2: All images processed in parallel ──
      // Each pipeline: OCR → analyze. N pipelines run concurrently.
      // Total time ≈ max(slowest pipeline) instead of sum.
      let ocrDone = 0;
      let analyzeDone = 0;
      let latestOcrText = '';

      const pipelines = imageBase64s.map(async (imgBase64, i) => {
        // Step A: OCR
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
          throw new Error(err.error || `第 ${i + 1} 张图片 OCR 识别失败`);
        }

        const ocrData = await ocrRes.json();
        const rawText = ocrData.text || '';
        const ocrText = truncateText(rawText, MAX_OCR_LENGTH);
        latestOcrText = ocrText;
        recordQwenUsage(1);

        ocrDone++;
        setScanState(prev => ({
          stage: 'scanning',
          progress: 5 + Math.round((ocrDone / N) * 45),
          currentImage: ocrDone,
          totalImages: N,
          ocrText: latestOcrText,
        }));

        // Step B: Analyze
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
          throw new Error(err.error || `第 ${i + 1} 张图片分析失败`);
        }

        const analyzeData = await analyzeRes.json();
        if (analyzeData.tokensUsed) {
          recordDeepSeekUsage(analyzeData.tokensUsed);
        }

        analyzeDone++;
        setScanState(prev => ({
          stage: 'analyzing',
          progress: 50 + Math.round((analyzeDone / N) * 45),
          currentImage: analyzeDone,
          totalImages: N,
          ocrText: prev.ocrText,
        }));

        const rawProblems = Array.isArray(analyzeData.problems) ? analyzeData.problems : [];
        return rawProblems.map((p: any): Partial<Problem> => ({
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
      });

      const results = await Promise.all(pipelines);
      const allProblems = results.flat();

      setScanState({
        stage: 'complete',
        progress: 100,
        ocrText: latestOcrText,
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
