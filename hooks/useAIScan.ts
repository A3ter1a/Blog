'use client';

import { useState, useCallback, useRef, type SetStateAction } from 'react';
import type { Problem, ProblemType, Difficulty, ProblemOption } from '@/lib/types';
import { recordDeepSeekUsage, recordQwenUsage } from '@/lib/ai-usage';
import { buildAuthHeaders } from '@/lib/fetch-with-auth';
import {
  AI_CONFIG_STORAGE_KEY,
  ALLOW_CLIENT_AI_KEYS,
  DEFAULT_AI_CONFIG,
  DEFAULT_DEEPSEEK_MODEL,
  DEFAULT_QWEN_ENDPOINT,
  normalizeAIConfig,
} from '@/lib/ai-config';
import { readJsonStorage } from '@/lib/browser-storage';
import { repairProblemMarkdownFields } from '@/lib/markdown';
import { extractOptions } from '@/lib/utils';

export type ScanStage = 'idle' | 'uploading' | 'scanning' | 'analyzing' | 'complete' | 'error';
export type ScanImageStatus = 'queued' | 'scanning' | 'analyzing' | 'complete' | 'error';

export interface ScanImageInput {
  base64: string;
  mimeType?: string;
  name?: string;
}

export interface ScanImageProgress {
  index: number;
  name: string;
  status: ScanImageStatus;
  message?: string;
  problemCount?: number;
}

export interface ScanState {
  stage: ScanStage;
  progress: number; // 0-100
  ocrText?: string;
  currentImage?: number; // 1-indexed
  totalImages?: number;
  completedImages?: number;
  failedImages?: number;
  extractedProblems?: Partial<Problem>[];
  imageProgress?: ScanImageProgress[];
  warnings?: string[];
  error?: string;
}

const MAX_OCR_LENGTH = 6000;
const FETCH_TIMEOUT = 180000; // 3 min per API call
const MAX_API_ATTEMPTS = 3;
const LARGE_BATCH_THRESHOLD = 7;
const SMALL_BATCH_CONCURRENT_SCANS = 2;
const LARGE_BATCH_CONCURRENT_SCANS = 1;
const PROGRESS_START = 5;
const PROGRESS_SPAN = 90;
const RETRYABLE_STATUS_CODES = new Set([408, 409, 422, 425, 429, 500, 502, 503, 504]);
const RETRY_DELAYS = [900, 1800];
const PROBLEM_TYPES: ProblemType[] = ['choice', 'fill', 'calculation', 'proof', 'proofEssay'];
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toCleanString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function toOptionalString(value: unknown): string | undefined {
  const text = toCleanString(value);
  return text || undefined;
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

function toConfidence(value: unknown): number {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return 0.5;
  return Math.min(1, Math.max(0, confidence));
}

function toProblemOptions(value: unknown): ProblemOption[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const options = value.flatMap((option, index): ProblemOption[] => {
    if (!isRecord(option)) {
      const content = toCleanString(option);
      return content ? [{ label: String.fromCharCode(65 + index), content }] : [];
    }

    const label = toOptionalString(option.label) || String.fromCharCode(65 + index);
    const content = toOptionalString(option.content);
    return content ? [{ label, content }] : [];
  });

  return options.length > 0 ? options : undefined;
}

function getAIConfig() {
  return readJsonStorage(AI_CONFIG_STORAGE_KEY, DEFAULT_AI_CONFIG, normalizeAIConfig);
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '\n...(文本过长已截断)';
}

function normalizeScanInputs(inputs: Array<string | ScanImageInput>): ScanImageInput[] {
  return inputs
    .map((input, index) => {
      if (typeof input === 'string') {
        return { base64: input, mimeType: 'image/jpeg', name: `图片 ${index + 1}` };
      }

      return {
        base64: input.base64,
        mimeType: input.mimeType || 'image/jpeg',
        name: input.name?.trim() || `图片 ${index + 1}`,
      };
    })
    .filter((input) => input.base64.trim());
}

function getApiErrorMessage(value: unknown, fallback: string) {
  if (isRecord(value) && typeof value.error === 'string' && value.error.trim()) {
    return value.error;
  }

  return fallback;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isAbortError(error: unknown) {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function createAbortError() {
  const error = new Error('扫描已取消');
  error.name = 'AbortError';
  return error;
}

function createScanStepError(message: string, retryable: boolean) {
  const error = new Error(message) as Error & { retryable?: boolean };
  error.retryable = retryable;
  return error;
}

function isRetryableError(error: unknown) {
  if (isAbortError(error)) return false;
  if (isRecord(error) && error.retryable === false) return false;
  return true;
}

function getRetryDelay(attempt: number) {
  return RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)];
}

function getAttemptMessage(message: string, attempt: number) {
  if (attempt <= 1) return message;
  return `${message}（重试 ${attempt - 1}/${MAX_API_ATTEMPTS - 1}）`;
}

function getScanWorkerCount(totalImages: number) {
  return totalImages >= LARGE_BATCH_THRESHOLD
    ? LARGE_BATCH_CONCURRENT_SCANS
    : SMALL_BATCH_CONCURRENT_SCANS;
}

function findChapterId(suggestedChapter: string | undefined, chapterContext?: ChapterContextItem[]) {
  if (!suggestedChapter || !chapterContext?.length) return undefined;

  const name = suggestedChapter.trim();
  const normalizedName = name.toLowerCase();
  const match = chapterContext.find((chapter) => {
    const chapterName = chapter.name.trim();
    const normalizedChapterName = chapterName.toLowerCase();
    return normalizedChapterName === normalizedName ||
      normalizedChapterName.includes(normalizedName) ||
      normalizedName.includes(normalizedChapterName);
  });

  return match?.id;
}

function normalizeProblem(
  rawProblem: unknown,
  ocrText: string,
  chapterContext?: ChapterContextItem[]
): Partial<Problem> | null {
  const problemData = isRecord(rawProblem) ? rawProblem : {};
  const question = toCleanString(problemData.question);

  if (!question) return null;

  const type = toProblemType(problemData.type);
  const fallbackOptions = type === 'choice' ? extractOptions(question) : undefined;
  const normalized = repairProblemMarkdownFields({
    type,
    difficulty: toDifficulty(problemData.difficulty),
    question,
    answer: toCleanString(problemData.answer),
    explanation: '',
    tips: undefined,
    options: toProblemOptions(problemData.options) || fallbackOptions,
    tags: [],
    chapterId: findChapterId(toOptionalString(problemData.suggestedChapter), chapterContext),
    aiResult: {
      rawQuestion: ocrText,
      rawAnswer: '',
      rawExplanation: '',
      confidence: toConfidence(problemData.confidence),
    },
  });

  return normalized;
}

export interface ChapterContextItem {
  id: string;
  name: string;
}

export function useAIScan() {
  const [scanState, setScanState] = useState<ScanState>({ stage: 'idle', progress: 0 });
  const activeRunRef = useRef(0);
  const activeControllersRef = useRef<Set<AbortController>>(new Set());

  const abortActiveRequests = useCallback(() => {
    activeControllersRef.current.forEach((controller) => controller.abort());
    activeControllersRef.current.clear();
  }, []);

  const setActiveState = useCallback((runId: number, next: SetStateAction<ScanState>) => {
    if (activeRunRef.current !== runId) return;
    setScanState(next);
  }, []);

  const fetchWithTimeout = useCallback(async (url: string, init: RequestInit, runId: number) => {
    const controller = new AbortController();
    activeControllersRef.current.add(controller);

    const timeoutId = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeoutId);
      activeControllersRef.current.delete(controller);
      if (activeRunRef.current !== runId) controller.abort();
    }
  }, []);

  const resetScan = useCallback(() => {
    activeRunRef.current += 1;
    abortActiveRequests();
    setScanState({ stage: 'idle', progress: 0 });
  }, [abortActiveRequests]);

  const startScan = useCallback(async (
    imageInputs: Array<string | ScanImageInput>,
    chapterContext?: ChapterContextItem[]
  ) => {
    const config = getAIConfig();
    const images = normalizeScanInputs(imageInputs);
    const totalImages = images.length;

    if (totalImages === 0) return;

    abortActiveRequests();
    const runId = activeRunRef.current + 1;
    activeRunRef.current = runId;

    const initialImageProgress = images.map((image, index): ScanImageProgress => ({
      index,
      name: image.name || `图片 ${index + 1}`,
      status: 'queued',
      message: '等待处理',
    }));

    const problemBuckets: Partial<Problem>[][] = images.map(() => []);
    const warnings: string[] = [];
    let nextIndex = 0;
    let completedImages = 0;
    let failedImages = 0;
    let finishedUnits = 0;

    const totalUnits = totalImages * 2;
    const chapterNames = chapterContext?.map((chapter) => chapter.name) || [];

    const addProgressUnits = (
      units: number,
      stage: ScanStage,
      currentImage: number,
      ocrText?: string
    ) => {
      finishedUnits = Math.min(totalUnits, finishedUnits + units);
      const progress = PROGRESS_START + Math.round((finishedUnits / totalUnits) * PROGRESS_SPAN);

      setActiveState(runId, (prev) => ({
        ...prev,
        stage,
        progress: Math.min(99, progress),
        currentImage,
        totalImages,
        ocrText: ocrText ?? prev.ocrText,
      }));
    };

    const updateImageProgress = (index: number, patch: Partial<ScanImageProgress>) => {
      setActiveState(runId, (prev) => ({
        ...prev,
        imageProgress: (prev.imageProgress || initialImageProgress).map((item) => (
          item.index === index ? { ...item, ...patch } : item
        )),
      }));
    };

    const readJsonError = async (response: Response, fallback: string) => {
      const payload = await response.json().catch(() => ({}));
      return getApiErrorMessage(payload, fallback);
    };

    const ensureRunIsActive = () => {
      if (activeRunRef.current !== runId) {
        throw createAbortError();
      }
    };

    const waitBeforeRetry = async (attempt: number) => {
      await new Promise((resolve) => window.setTimeout(resolve, getRetryDelay(attempt)));
      ensureRunIsActive();
    };

    const runStepWithRetry = async <T,>(
      index: number,
      status: ScanImageStatus,
      message: string,
      task: () => Promise<T>
    ): Promise<T> => {
      let lastError: unknown;

      for (let attempt = 1; attempt <= MAX_API_ATTEMPTS; attempt += 1) {
        ensureRunIsActive();
        updateImageProgress(index, { status, message: getAttemptMessage(message, attempt) });

        try {
          return await task();
        } catch (error: unknown) {
          lastError = error;

          if (attempt >= MAX_API_ATTEMPTS || !isRetryableError(error)) {
            throw error;
          }

          await waitBeforeRetry(attempt);
        }
      }

      throw lastError instanceof Error ? lastError : new Error('AI 扫描失败');
    };

    const processImage = async (image: ScanImageInput, index: number) => {
      let unitsDoneForImage = 0;

      try {
        const ocrData = await runStepWithRetry(
          index,
          'scanning',
          '正在识别文字',
          async () => {
            const ocrRes = await fetchWithTimeout('/api/ai/ocr', {
              method: 'POST',
              headers: await buildAuthHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({
                imageBase64: image.base64,
                mimeType: image.mimeType || 'image/jpeg',
                apiKey: ALLOW_CLIENT_AI_KEYS ? config.qwenApiKey : undefined,
                model: config.qwenModel,
                endpoint: config.qwenApiEndpoint || DEFAULT_QWEN_ENDPOINT,
              }),
            }, runId);

            if (!ocrRes.ok) {
              const message = await readJsonError(ocrRes, `第 ${index + 1} 张图片 OCR 识别失败`);
              throw createScanStepError(message, RETRYABLE_STATUS_CODES.has(ocrRes.status));
            }

            return await ocrRes.json() as { text?: unknown };
          }
        );
        const rawText = toCleanString(ocrData.text);
        if (!rawText) {
          throw createScanStepError(`第 ${index + 1} 张图片没有识别到文字，请换一张更清晰的图片`, false);
        }

        const ocrText = truncateText(rawText, MAX_OCR_LENGTH);
        recordQwenUsage(1);
        unitsDoneForImage += 1;
        addProgressUnits(1, 'scanning', index + 1, ocrText);

        const analyzeData = await runStepWithRetry(
          index,
          'analyzing',
          '正在整理成题目',
          async () => {
            const analyzeRes = await fetchWithTimeout('/api/ai/analyze', {
              method: 'POST',
              headers: await buildAuthHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({
                ocrText,
                apiKey: ALLOW_CLIENT_AI_KEYS ? config.deepseekApiKey : undefined,
                model: config.deepseekModel || DEFAULT_DEEPSEEK_MODEL,
                chapterContext: chapterNames,
              }),
            }, runId);

            if (!analyzeRes.ok) {
              const message = await readJsonError(analyzeRes, `第 ${index + 1} 张图片分析失败`);
              throw createScanStepError(message, RETRYABLE_STATUS_CODES.has(analyzeRes.status));
            }

            return await analyzeRes.json() as {
              tokensUsed?: unknown;
              problems?: unknown;
            };
          }
        );
        const tokensUsed = Number(analyzeData.tokensUsed);
        if (Number.isFinite(tokensUsed) && tokensUsed > 0) {
          recordDeepSeekUsage(tokensUsed);
        }

        const rawProblems = Array.isArray(analyzeData.problems) ? analyzeData.problems : [];
        const problems = rawProblems
          .map((problem) => normalizeProblem(problem, ocrText, chapterContext))
          .filter((problem): problem is Partial<Problem> => Boolean(problem));

        unitsDoneForImage += 1;
        addProgressUnits(1, 'analyzing', index + 1, ocrText);
        updateImageProgress(index, {
          status: 'complete',
          message: problems.length > 0 ? `提取到 ${problems.length} 道题` : '未提取到可用题目',
          problemCount: problems.length,
        });

        return problems;
      } catch (error: unknown) {
        const remainingUnits = 2 - unitsDoneForImage;
        if (remainingUnits > 0 && activeRunRef.current === runId) {
          addProgressUnits(remainingUnits, unitsDoneForImage > 0 ? 'analyzing' : 'scanning', index + 1);
        }

        throw error;
      }
    };

    try {
      setActiveState(runId, {
        stage: 'uploading',
        progress: PROGRESS_START,
        currentImage: 1,
        totalImages,
        completedImages: 0,
        failedImages: 0,
        imageProgress: initialImageProgress,
        warnings: [],
      });

      const worker = async () => {
        while (activeRunRef.current === runId) {
          const index = nextIndex;
          nextIndex += 1;
          if (index >= totalImages) return;

          try {
            const problems = await processImage(images[index], index);
            problemBuckets[index] = problems;
            completedImages += 1;

            if (problems.length === 0) {
              warnings.push(`第 ${index + 1} 张图片识别完成，但没有提取到可用题目`);
            }
          } catch (error: unknown) {
            if (activeRunRef.current !== runId) return;

            failedImages += 1;
            const message = isAbortError(error)
              ? `第 ${index + 1} 张图片处理超时，请重试或使用更小、更清晰的图片`
              : getErrorMessage(error, `第 ${index + 1} 张图片处理失败`);

            warnings.push(message);
            updateImageProgress(index, { status: 'error', message });
          } finally {
            if (activeRunRef.current === runId) {
              setActiveState(runId, (prev) => ({
                ...prev,
                completedImages,
                failedImages,
                warnings: warnings.slice(),
              }));
            }
          }
        }
      };

      const workerCount = Math.min(getScanWorkerCount(totalImages), totalImages);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));

      if (activeRunRef.current !== runId) return;

      const allProblems = problemBuckets.flat();
      if (allProblems.length === 0 && failedImages === totalImages) {
        setActiveState(runId, (prev) => ({
          ...prev,
          stage: 'error',
          progress: 0,
          totalImages,
          completedImages,
          failedImages,
          warnings,
          error: warnings[0] || 'AI 扫描失败，请重试',
        }));
        return;
      }

      setActiveState(runId, (prev) => ({
        ...prev,
        stage: 'complete',
        progress: 100,
        totalImages,
        completedImages,
        failedImages,
        extractedProblems: allProblems,
        warnings,
      }));
    } catch (error: unknown) {
      if (activeRunRef.current !== runId) return;

      const msg = isAbortError(error)
        ? `AI 扫描超时（超过 ${FETCH_TIMEOUT / 60000} 分钟），请重试或使用更小的图片`
        : getErrorMessage(error, '未知错误');

      setActiveState(runId, {
        stage: 'error',
        progress: 0,
        totalImages,
        completedImages,
        failedImages,
        imageProgress: initialImageProgress,
        warnings,
        error: msg,
      });
    }
  }, [abortActiveRequests, fetchWithTimeout, setActiveState]);

  return { scanState, startScan, resetScan, cancelScan: resetScan };
}
