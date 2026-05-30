'use client';

import { useState, useCallback } from 'react';
import type { Problem, ProblemType, Difficulty, AIConfig, ProblemOption } from '@/lib/types';
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
const PROBLEM_TYPES: ProblemType[] = ['choice', 'fill', 'calculation', 'proof', 'proofEssay'];
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function toProblemType(value: unknown): ProblemType {
  return typeof value === 'string' && PROBLEM_TYPES.includes(value as ProblemType)
    ? value as ProblemType
    : 'calculation';
}

function toDifficulty(value: unknown): Difficulty {
  return typeof value === 'string' && DIFFICULTIES.includes(value as Difficulty)
    ? value as Difficulty
    : 'medium';
}

function toProblemOptions(value: unknown): ProblemOption[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const options = value.flatMap((option): ProblemOption[] => {
    if (!isRecord(option)) return [];
    const label = toOptionalString(option.label);
    const content = toOptionalString(option.content);
    return label && content ? [{ label, content }] : [];
  });

  return options.length > 0 ? options : undefined;
}

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

export interface ChapterContextItem {
  id: string;
  name: string;
}

export function useAIScan() {
  const [scanState, setScanState] = useState<ScanState>({ stage: 'idle', progress: 0 });

  const startScan = useCallback(async (imageBase64s: string[], chapterContext?: ChapterContextItem[]) => {
    const config = getAIConfig();
    if (!config) {
      setScanState({ stage: 'error', progress: 0, error: '请先在设置中配置 AI API Key' });
      return;
    }

    const N = imageBase64s.length;
    if (N === 0) return;

    // Extract chapter names for the API prompt
    const chapterNames = chapterContext?.map(c => c.name) || [];

    try {
      setScanState({ stage: 'uploading', progress: 5, currentImage: 1, totalImages: N });

      // ── Phase 1+2: All images processed in parallel ──
      // Each pipeline: OCR → analyze. N pipelines run concurrently.
      // Total time ≈ max(slowest pipeline) instead of sum.
      let ocrDone = 0;
      let analyzeDone = 0;

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

        const ocrData = await ocrRes.json() as { text?: unknown };
        const rawText = toOptionalString(ocrData.text) || '';
        const ocrText = truncateText(rawText, MAX_OCR_LENGTH);
        recordQwenUsage(1);

        ocrDone++;
        setScanState({
          stage: 'scanning',
          progress: 5 + Math.round((ocrDone / N) * 45),
          currentImage: ocrDone,
          totalImages: N,
          ocrText,
        });

        // Step B: Analyze
        const analyzeRes = await fetch('/api/ai/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ocrText,
            apiKey: config.deepseekApiKey,
            model: config.deepseekModel || 'deepseek-v4-flash',
            chapterContext: chapterNames,
          }),
          signal: AbortSignal.timeout(FETCH_TIMEOUT),
        });

        if (!analyzeRes.ok) {
          const err = await analyzeRes.json().catch(() => ({}));
          throw new Error(err.error || `第 ${i + 1} 张图片分析失败`);
        }

        const analyzeData = await analyzeRes.json() as {
          tokensUsed?: unknown;
          problems?: unknown;
        };
        if (analyzeData.tokensUsed) {
          recordDeepSeekUsage(Number(analyzeData.tokensUsed));
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
        return rawProblems.map((p: unknown): Partial<Problem> => {
          const problemData = isRecord(p) ? p : {};
          // Resolve suggestedChapter name → chapterId
          let chapterId: string | undefined;
          const suggestedChapter = toOptionalString(problemData.suggestedChapter);
          if (suggestedChapter && chapterContext) {
            const name = suggestedChapter.trim();
            const match = chapterContext.find(
              c => c.name === name ||
                   c.name.includes(name) ||
                   name.includes(c.name)
            );
            if (match) chapterId = match.id;
          }
          return {
            type: toProblemType(problemData.type),
            difficulty: toDifficulty(problemData.difficulty),
            question: toOptionalString(problemData.question) || '',
            answer: toOptionalString(problemData.answer) || '',
            explanation: toOptionalString(problemData.explanation) || '',
            tips: toOptionalString(problemData.tips),
            options: toProblemOptions(problemData.options),
            tags: [],
            chapterId,
            aiResult: {
              rawQuestion: ocrText,
              rawAnswer: '',
              rawExplanation: '',
              confidence: typeof problemData.confidence === 'number' ? problemData.confidence : 0.5,
            },
          };
        });
      });

      const results = await Promise.all(pipelines);
      const allProblems = results.flat();

      setScanState({
        stage: 'complete',
        progress: 100,
        extractedProblems: allProblems,
      });
    } catch (error: unknown) {
      const errorName = error instanceof Error ? error.name : '';
      const errorMessage = error instanceof Error ? error.message : '';
      const msg = errorName === 'AbortError' || errorName === 'TimeoutError'
        ? `AI 扫描超时（超过 ${FETCH_TIMEOUT / 60000} 分钟），请重试或使用更小的图片`
        : (errorMessage || '未知错误');
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
