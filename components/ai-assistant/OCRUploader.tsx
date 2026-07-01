'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CheckCircle2, Image as ImageIcon, Loader2, Upload, X, Scan } from 'lucide-react';
import { fileToBase64 } from '@/lib/utils';
import { AIProgressIndicator } from './AIProgressIndicator';
import { AIExtractionResult } from './AIExtractionResult';
import {
  AI_SCAN_CONCURRENT_LIMIT,
  useAIScan,
  type ChapterContextItem,
  type ScanImageInput,
  type ScanImageProgress,
} from '@/hooks/useAIScan';
import type { Problem } from '@/lib/types';
import { dialogMotion, overlayMotion, uiMotion } from '@/lib/motion';

interface OCRUploaderProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: (problems: Problem[]) => void;
  chapterContext?: ChapterContextItem[];
}

const MAX_SCAN_IMAGES = 10;
const MAX_IMAGE_EDGE = 1800;
const JPEG_QUALITY = 0.86;
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片读取失败'));
    image.src = url;
  });
}

async function prepareScanImage(file: File): Promise<ScanImageInput & { previewUrl: string }> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`${file.name} 不是图片文件`);
  }

  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    throw new Error(`${file.name} 暂不支持，请使用 JPG、PNG 或 WebP`);
  }

  const previewUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(previewUrl);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('浏览器无法处理这张图片');

    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    const base64 = dataUrl.split(',')[1];
    if (!base64) throw new Error('图片压缩失败');

    return {
      base64,
      mimeType: 'image/jpeg',
      name: file.name,
      previewUrl,
    };
  } catch {
    const base64 = await fileToBase64(file);
    return {
      base64,
      mimeType: file.type || 'image/jpeg',
      name: file.name,
      previewUrl,
    };
  }
}

export function OCRUploader({ isOpen, onClose, onAccept, chapterContext }: OCRUploaderProps) {
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [prepareProgress, setPrepareProgress] = useState<{ total: number; completed: number } | null>(null);
  const { scanState, startScan, resetScan, cancelScan } = useAIScan();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prepareRunRef = useRef(0);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const urls: string[] = [];
    const scanImages: ScanImageInput[] = [];
    const skippedMessages: string[] = [];
    const selectedFiles = files.slice(0, MAX_SCAN_IMAGES);
    const prepareRunId = prepareRunRef.current + 1;
    prepareRunRef.current = prepareRunId;

    setPrepareProgress({ total: selectedFiles.length, completed: 0 });
    setFileError(files.length > MAX_SCAN_IMAGES
      ? `一次最多处理 ${MAX_SCAN_IMAGES} 张图片，已自动忽略多余图片`
      : null
    );

    try {
      for (const file of selectedFiles) {
        try {
          const preparedImage = await prepareScanImage(file);
          if (prepareRunRef.current !== prepareRunId) {
            URL.revokeObjectURL(preparedImage.previewUrl);
            urls.forEach(url => URL.revokeObjectURL(url));
            return;
          }

          scanImages.push({
            base64: preparedImage.base64,
            mimeType: preparedImage.mimeType,
            name: preparedImage.name,
          });
          urls.push(preparedImage.previewUrl);
        } catch (error: unknown) {
          if (prepareRunRef.current !== prepareRunId) {
            urls.forEach(url => URL.revokeObjectURL(url));
            return;
          }

          skippedMessages.push(getErrorMessage(error, `${file.name} 处理失败`));
        } finally {
          if (prepareRunRef.current === prepareRunId) {
            setPrepareProgress((prev) => prev
              ? { ...prev, completed: Math.min(prev.total, prev.completed + 1) }
              : prev
            );
          }
        }
      }

      if (prepareRunRef.current !== prepareRunId) {
        urls.forEach(url => URL.revokeObjectURL(url));
        return;
      }

      if (scanImages.length === 0) {
        throw new Error(skippedMessages[0] || '没有可扫描的图片');
      }

      // Revoke old preview URLs before replacing
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      setPreviewUrls(urls);
      setFileError((prev) => [prev, ...skippedMessages].filter(Boolean).join('；') || null);
      setPrepareProgress(null);
      await startScan(scanImages, chapterContext);
    } catch (err: unknown) {
      if (prepareRunRef.current !== prepareRunId) {
        urls.forEach(url => URL.revokeObjectURL(url));
        return;
      }

      console.error('OCR file processing failed:', err);
      urls.forEach(url => URL.revokeObjectURL(url));
      resetScan();
      setPreviewUrls([]);
      setFileError(getErrorMessage(err, '图片处理失败，请重新选择'));
    } finally {
      if (prepareRunRef.current === prepareRunId) {
        setPrepareProgress(null);
      }
      e.target.value = '';
    }
  };

  const buildProblem = (partial: Partial<Problem>): Problem => ({
    id: crypto.randomUUID(),
    type: partial.type || 'calculation',
    difficulty: partial.difficulty || 'medium',
    question: partial.question || '',
    answer: partial.answer || '',
    explanation: '',
    tips: undefined,
    options: partial.options,
    chapterId: partial.chapterId,
    tags: [],
    aiStatus: 'complete',
    aiResult: partial.aiResult,
  });

  const handleAcceptAll = (acceptedIndices: Set<number> = new Set()) => {
    const problems = scanState.extractedProblems || [];
    const unacceptedProblems = problems.filter((_, index) => !acceptedIndices.has(index));
    if (unacceptedProblems.length === 0) {
      handleClose();
      return;
    }
    onAccept(unacceptedProblems.map(buildProblem));
    handleClose();
  };

  const handleAcceptOne = (index: number) => {
    const p = scanState.extractedProblems?.[index];
    if (!p) return;
    onAccept([buildProblem(p)]);
  };

  const handleClose = () => {
    prepareRunRef.current += 1;
    cancelScan();
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    setPreviewUrls([]);
    setFileError(null);
    setPrepareProgress(null);
    onClose();
  };

  const handleRetry = () => {
    prepareRunRef.current += 1;
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    setPreviewUrls([]);
    setFileError(null);
    setPrepareProgress(null);
    resetScan();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => { previewUrls.forEach(url => URL.revokeObjectURL(url)); };
  }, [previewUrls]);

  if (!isOpen) return null;

  const isPreparing = Boolean(prepareProgress);
  const isProcessing = scanState.stage !== 'idle' && scanState.stage !== 'complete' && scanState.stage !== 'error';
  const isBusy = isPreparing || isProcessing;
  const currentImage = scanState.currentImage || 1;
  const totalImages = scanState.totalImages || 0;
  const completedImages = scanState.completedImages || 0;
  const failedImages = scanState.failedImages || 0;
  const extractedCount = scanState.extractedProblems?.length || 0;
  const preparePercent = prepareProgress
    ? Math.round((prepareProgress.completed / Math.max(1, prepareProgress.total)) * 100)
    : 0;

  return (
    <AnimatePresence>
      <motion.div
        variants={overlayMotion}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: uiMotion.duration.fast, ease: uiMotion.ease.standard }}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={() => { if (!isBusy) handleClose(); }}
      >
        <motion.div
          variants={dialogMotion}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={uiMotion.spring.gentle}
          className="absolute inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-3xl md:h-auto max-h-[90vh] bg-surface-container-lowest rounded-2xl shadow-elevated flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10">
            <h2 className="text-lg font-bold text-on-surface font-headline flex items-center gap-2">
              <Scan className="w-5 h-5 text-primary" />
              AI 扫描题目
            </h2>
            <button
              onClick={handleClose}
              className="motion-ui motion-interactive p-2 rounded-full hover:bg-surface-container-high"
              title={isBusy ? '取消导入' : '关闭'}
            >
              <X className="w-5 h-5 text-on-surface-variant" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Upload zone */}
            {scanState.stage === 'idle' && !isPreparing && (
              <label className="motion-ui motion-interactive flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-outline-variant/30 rounded-xl hover:border-primary/50 hover:bg-primary/[0.02] cursor-pointer">
                <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center">
                  <Upload className="w-8 h-8 text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-on-surface">点击上传题目照片</p>
                  <p className="text-xs text-on-surface-variant/50 mt-1">
                    支持 JPG、PNG、WebP，一次最多 {MAX_SCAN_IMAGES} 张，最多 {AI_SCAN_CONCURRENT_LIMIT} 张并行识别
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            )}

            {isPreparing && prepareProgress && (
              <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low p-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-on-surface">正在准备图片</p>
                      <p className="text-xs text-on-surface-variant/60">
                        {prepareProgress.completed}/{prepareProgress.total}
                      </p>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-container-highest">
                      <div
                        className="motion-ui h-full rounded-full editorial-gradient"
                        style={{ width: `${preparePercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {fileError && (
              <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{fileError}</p>
              </div>
            )}

            {/* Progress */}
            {isProcessing && (
              <div className="space-y-2">
                <AIProgressIndicator stage={scanState.stage} progress={scanState.progress} />
                {totalImages > 1 && (
                  <p className="text-xs text-on-surface-variant/60 text-center">
                    最多 {AI_SCAN_CONCURRENT_LIMIT} 张并行识别，当前更新第 {currentImage}/{totalImages} 张，已完成 {completedImages} 张，失败 {failedImages} 张
                  </p>
                )}
              </div>
            )}

            {/* Previews (multi-image thumbnails) */}
            {previewUrls.length > 0 && (
              <div className={`grid gap-2 ${previewUrls.length > 1 ? 'grid-cols-3 md:grid-cols-5' : 'grid-cols-1'}`}>
                {previewUrls.map((url, i) => (
                  <div key={i} className="rounded-xl overflow-hidden border border-outline-variant/10">
                    {/* eslint-disable-next-line @next/next/no-img-element -- OCR thumbnails use blob URLs created from local files. */}
                    <img
                      src={url}
                      alt={`题目图片 ${i + 1}`}
                      className="w-full max-h-32 object-contain bg-surface-container"
                    />
                  </div>
                ))}
              </div>
            )}

            {scanState.imageProgress && scanState.imageProgress.length > 0 && (
              <ImageProgressList items={scanState.imageProgress} />
            )}

            {/* OCR text preview */}
            {scanState.ocrText && (scanState.stage === 'analyzing' || scanState.stage === 'scanning') && (
              <div className="p-3 rounded-xl bg-surface-container-low">
                <p className="text-xs text-on-surface-variant/60 mb-1">OCR 识别文本</p>
                <p className="text-sm text-on-surface whitespace-pre-wrap line-clamp-6">{scanState.ocrText}</p>
              </div>
            )}

            {/* Error */}
            {scanState.stage === 'error' && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200">
                <p className="text-sm text-red-700">{scanState.error}</p>
                <button
                  onClick={handleRetry}
                  className="mt-2 text-xs text-red-600 underline hover:text-red-800"
                >
                  重新选择图片
                </button>
              </div>
            )}

            {scanState.stage === 'complete' && scanState.warnings && scanState.warnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                <div className="flex gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="space-y-1">
                    {scanState.warnings.slice(0, 3).map((warning, index) => (
                      <p key={index}>{warning}</p>
                    ))}
                    {scanState.warnings.length > 3 && (
                      <p>还有 {scanState.warnings.length - 3} 条提示未显示</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Results */}
            {scanState.stage === 'complete' && scanState.extractedProblems && scanState.extractedProblems.length > 0 && (
              <AIExtractionResult
                extractedProblems={scanState.extractedProblems}
                onAcceptAll={handleAcceptAll}
                onAcceptOne={handleAcceptOne}
                onRetry={handleRetry}
              />
            )}

            {scanState.stage === 'complete' && extractedCount === 0 && (
              <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low p-4 text-center">
                <p className="text-sm font-medium text-on-surface">没有提取到可用题目</p>
                <p className="mt-1 text-xs text-on-surface-variant/60">可以换一张更清晰、只包含题目的图片再试。</p>
                <button
                  onClick={handleRetry}
                  className="motion-ui motion-interactive mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/15"
                >
                  <Upload className="h-3.5 w-3.5" />
                  重新选择图片
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ImageProgressList({ items }: { items: ScanImageProgress[] }) {
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const isWorking = item.status === 'scanning' || item.status === 'analyzing';
        const isComplete = item.status === 'complete';
        const isError = item.status === 'error';

        return (
          <div
            key={item.index}
            className="grid grid-cols-[28px_1fr] gap-2 rounded-xl border border-outline-variant/10 bg-surface-container-low px-3 py-2"
          >
            <div className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full ${
              isComplete ? 'bg-green-100 text-green-700' :
              isError ? 'bg-red-100 text-red-700' :
              isWorking ? 'bg-primary/10 text-primary' :
              'bg-surface-container-high text-on-surface-variant/50'
            }`}>
              {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> :
                isComplete ? <CheckCircle2 className="h-4 w-4" /> :
                isError ? <AlertCircle className="h-4 w-4" /> :
                <ImageIcon className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-medium text-on-surface">{item.name}</p>
                {typeof item.problemCount === 'number' && item.problemCount > 0 && (
                  <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    {item.problemCount} 题
                  </span>
                )}
              </div>
              <p className={`mt-0.5 line-clamp-2 text-xs ${isError ? 'text-red-600' : 'text-on-surface-variant/60'}`}>
                {item.message || '等待处理'}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
