'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Problem } from '@/lib/types';
import {
  AI_CONFIG_STORAGE_KEY,
  DEFAULT_AI_CONFIG,
  DEFAULT_DEEPSEEK_MODEL,
  normalizeAIConfig,
} from '@/lib/ai-config';
import { readJsonStorage } from '@/lib/browser-storage';
import { useJobCenter } from '@/components/jobs/JobCenter';
import { extractProblemOcrJobResult, type ProblemOcrJobResult } from '@/lib/problem-ocr-contract';

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

function buildCompletedScanState(result: ProblemOcrJobResult): ScanState {
  return {
    stage: 'complete',
    progress: 100,
    ocrText: result.captures.at(-1)?.ocrText,
    currentImage: result.totalImages,
    totalImages: result.totalImages,
    completedImages: result.completedImages,
    failedImages: result.failedImages,
    extractedProblems: result.extractedProblems,
    imageProgress: result.imageProgress,
    warnings: result.warnings,
  };
}

const PROGRESS_START = 5;

function getAIConfig() {
  return readJsonStorage(AI_CONFIG_STORAGE_KEY, DEFAULT_AI_CONFIG, normalizeAIConfig);
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

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export interface ChapterContextItem {
  id: string;
  name: string;
}

export function useAIScan(targetId: string) {
  const {
    jobs,
    requestedJobId,
    createProblemOcrJob,
    loadJobResult,
    claimJobResult,
  } = useJobCenter();
  const [scanState, setScanState] = useState<ScanState>({ stage: 'idle', progress: 0 });
  const [isPersistentScan, setIsPersistentScan] = useState(false);
  const activeRunRef = useRef(0);
  const jobIdRef = useRef<string | null>(null);
  const resultLoadRequestedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const current = jobIdRef.current
      ? jobs.find((job) => job.id === jobIdRef.current)
      : undefined;
    const requested = jobs.find((job) => job.id === requestedJobId && job.type === 'problem_ocr' && job.targetId === targetId && !job.resultClaimedAt);
    const resumable = requested ?? current ?? (scanState.stage === 'idle'
      ? jobs.find((job) => (
        job.type === 'problem_ocr'
        && job.targetId === targetId
        && Boolean(job.remoteJobId)
        && !job.resultClaimedAt
        && (job.status === 'queued'
          || job.status === 'running'
          || job.status === 'waiting_for_trigger'
          || job.status === 'succeeded')
      ))
      : undefined);
    if (!resumable) return;
    if (resumable.type !== 'problem_ocr' || !resumable.remoteJobId || resumable.resultClaimedAt) return;

    jobIdRef.current = resumable.id;
    queueMicrotask(() => {
      if (jobIdRef.current === resumable.id) setIsPersistentScan(true);
    });

    if (resumable.status === 'queued' || resumable.status === 'running' || resumable.status === 'waiting_for_trigger') {
      queueMicrotask(() => {
        if (jobIdRef.current !== resumable.id) return;
        setScanState((previous) => ({
          ...previous,
          stage: 'scanning',
          progress: resumable.progress ?? Math.max(previous.progress, PROGRESS_START),
          currentImage: resumable.progressTotal
            ? Math.min((resumable.progressCurrent ?? 0) + 1, resumable.progressTotal)
            : previous.currentImage,
          totalImages: resumable.progressTotal ?? previous.totalImages,
          completedImages: resumable.progressCurrent ?? previous.completedImages ?? 0,
          failedImages: 0,
          error: undefined,
        }));
      });
      return;
    }

    if (resumable.status === 'failed') {
      queueMicrotask(() => {
        if (jobIdRef.current !== resumable.id) return;
        setScanState((previous) => ({
          ...previous,
          stage: 'error',
          progress: resumable.progress ?? previous.progress,
          totalImages: resumable.progressTotal ?? previous.totalImages,
          completedImages: resumable.progressCurrent ?? previous.completedImages,
          error: resumable.error || '题库 OCR 持久任务失败，可在任务中心重试。',
        }));
      });
      return;
    }

    if (resumable.status !== 'succeeded') return;
    const result = extractProblemOcrJobResult(resumable.resultPayload);
    if (result) {
      queueMicrotask(() => {
        if (jobIdRef.current === resumable.id) setScanState(buildCompletedScanState(result));
      });
      return;
    }

    if (resumable.resultPayload) {
      queueMicrotask(() => {
        if (jobIdRef.current !== resumable.id) return;
        setScanState({
          stage: 'error',
          progress: 100,
          error: '题库 OCR 已完成，但结构化结果校验失败；原始任务记录仍保留。',
        });
      });
      return;
    }

    if (!resultLoadRequestedRef.current.has(resumable.id)) {
      resultLoadRequestedRef.current.add(resumable.id);
      void loadJobResult(resumable.id);
    }
  }, [jobs, loadJobResult, requestedJobId, scanState.stage, targetId]);

  const resetScan = useCallback(() => {
    activeRunRef.current += 1;
    jobIdRef.current = null;
    setIsPersistentScan(false);
    setScanState({ stage: 'idle', progress: 0 });
  }, []);

  const startScan = useCallback(async (
    imageInputs: Array<string | ScanImageInput>,
    chapterContext?: ChapterContextItem[]
  ) => {
    const config = getAIConfig();
    const images = normalizeScanInputs(imageInputs);
    const totalImages = images.length;

    if (totalImages === 0) return;

    const runId = activeRunRef.current + 1;
    activeRunRef.current = runId;
    setIsPersistentScan(false);

    setScanState({
      stage: 'uploading',
      progress: PROGRESS_START,
      currentImage: 1,
      totalImages,
      completedImages: 0,
      failedImages: 0,
      warnings: [],
    });

    try {
      const persistentJob = await createProblemOcrJob({
        images: images.map((image) => ({
          base64: image.base64,
          mimeType: image.mimeType === 'image/png' || image.mimeType === 'image/webp'
            ? image.mimeType
            : 'image/jpeg',
          name: image.name || '题目图片',
        })),
        chapterContext: chapterContext ?? [],
        qwenModel: config.qwenModel,
        ocrProvider: config.ocrProvider ?? "deepseek",
        deepseekModel: config.deepseekModel || DEFAULT_DEEPSEEK_MODEL,
        targetId,
      });
      if (activeRunRef.current !== runId) return;
      jobIdRef.current = persistentJob.id;
      setIsPersistentScan(true);
      setScanState({
        stage: 'scanning',
        progress: persistentJob.progress ?? PROGRESS_START,
        currentImage: 1,
        totalImages,
        completedImages: 0,
        failedImages: 0,
        warnings: [],
      });
    } catch (error: unknown) {
      if (activeRunRef.current !== runId) return;
      setScanState({
        stage: 'error',
        progress: 0,
        totalImages,
        completedImages: 0,
        failedImages: 0,
        error: getErrorMessage(error, '题库 OCR 持久任务创建失败'),
      });
      return;
    }
  }, [createProblemOcrJob, targetId]);

  const claimScanResult = useCallback(() => {
    if (jobIdRef.current) claimJobResult(jobIdRef.current);
  }, [claimJobResult]);

  return { scanState, startScan, resetScan, cancelScan: resetScan, claimScanResult, isPersistentScan };
}
