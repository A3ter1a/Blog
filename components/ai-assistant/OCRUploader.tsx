'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, Scan } from 'lucide-react';
import { fileToBase64 } from '@/lib/utils';
import { AIProgressIndicator } from './AIProgressIndicator';
import { AIExtractionResult } from './AIExtractionResult';
import { useAIScan } from '@/hooks/useAIScan';
import type { Problem } from '@/lib/types';

interface OCRUploaderProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: (problems: Problem[]) => void;
  chapterContext?: string[];
}

export function OCRUploader({ isOpen, onClose, onAccept, chapterContext }: OCRUploaderProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const { scanState, startScan, resetScan } = useAIScan();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const base64 = await fileToBase64(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      await startScan(base64, chapterContext);
    } catch (err: any) {
      console.error('OCR file processing failed:', err);
      resetScan();
      setPreviewUrl(null);
    }
  };

  const buildProblem = (partial: Partial<Problem>): Problem => ({
    id: crypto.randomUUID(),
    type: partial.type || 'calculation',
    difficulty: partial.difficulty || 'medium',
    question: partial.question || '',
    answer: partial.answer || '',
    explanation: partial.explanation || '',
    tips: partial.tips,
    options: partial.options,
    tags: partial.tags || [],
    aiStatus: 'complete',
    aiResult: partial.aiResult,
  });

  const handleAcceptAll = () => {
    const problems = scanState.extractedProblems || [];
    if (problems.length === 0) return;
    onAccept(problems.map(buildProblem));
    handleClose();
  };

  const handleAcceptOne = (index: number) => {
    const p = scanState.extractedProblems?.[index];
    if (!p) return;
    onAccept([buildProblem(p)]);
  };

  const handleClose = () => {
    setPreviewUrl(null);
    resetScan();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="absolute inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-lg md:h-auto max-h-[90vh] bg-surface-container-lowest rounded-2xl shadow-elevated flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10">
            <h2 className="text-lg font-bold text-on-surface font-headline flex items-center gap-2">
              <Scan className="w-5 h-5 text-primary" />
              AI 扫描题目
            </h2>
            <button onClick={handleClose} className="p-2 rounded-full hover:bg-surface-container-high transition-colors">
              <X className="w-5 h-5 text-on-surface-variant" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Upload zone */}
            {scanState.stage === 'idle' && (
              <label className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-outline-variant/30 rounded-xl hover:border-primary/50 hover:bg-primary/[0.02] transition-all cursor-pointer">
                <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center">
                  <Upload className="w-8 h-8 text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-on-surface">点击上传题目照片</p>
                  <p className="text-xs text-on-surface-variant/50 mt-1">支持 JPG、PNG 格式，包含数学公式的图片</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            )}

            {/* Progress */}
            {scanState.stage !== 'idle' && (
              <AIProgressIndicator stage={scanState.stage} progress={scanState.progress} />
            )}

            {/* Preview */}
            {previewUrl && (
              <div className="rounded-xl overflow-hidden border border-outline-variant/10">
                <img src={previewUrl} alt="题目图片" className="w-full max-h-48 object-contain bg-surface-container" />
              </div>
            )}

            {/* OCR text preview */}
            {scanState.ocrText && scanState.stage === 'analyzing' && (
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
                  onClick={resetScan}
                  className="mt-2 text-xs text-red-600 underline hover:text-red-800"
                >
                  重新尝试
                </button>
              </div>
            )}

            {/* Results */}
            {scanState.stage === 'complete' && scanState.extractedProblems && scanState.extractedProblems.length > 0 && (
              <AIExtractionResult
                extractedProblems={scanState.extractedProblems}
                onAcceptAll={handleAcceptAll}
                onAcceptOne={handleAcceptOne}
                onRetry={resetScan}
              />
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
