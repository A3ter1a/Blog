'use client';

import { motion } from 'framer-motion';
import { Upload, Scan, Brain, Check, X, Loader } from 'lucide-react';
import type { ScanStage } from '@/hooks/useAIScan';

interface AIProgressIndicatorProps {
  stage: ScanStage;
  progress: number;
}

const stages: { key: ScanStage; label: string; icon: any }[] = [
  { key: 'uploading', label: '上传图片', icon: Upload },
  { key: 'scanning', label: 'OCR 识别', icon: Scan },
  { key: 'analyzing', label: 'AI 分析', icon: Brain },
  { key: 'complete', label: '完成', icon: Check },
  { key: 'error', label: '失败', icon: X },
];

export function AIProgressIndicator({ stage, progress }: AIProgressIndicatorProps) {
  if (stage === 'idle') return null;

  const currentIdx = stages.findIndex(s => s.key === stage);

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
        <motion.div
          className="h-full editorial-gradient rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Stage steps */}
      <div className="flex items-center justify-between">
        {stages.map((s, i) => {
          const isActive = i <= currentIdx && stage !== 'error';
          const isCurrent = i === currentIdx;
          const isError = stage === 'error' && i === currentIdx;

          return (
            <div key={s.key} className="flex flex-col items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                isError ? 'bg-red-100 text-red-600' :
                isActive ? 'editorial-gradient text-on-primary' :
                'bg-surface-container-high text-on-surface-variant/30'
              }`}>
                {isCurrent && (stage === 'scanning' || stage === 'analyzing') ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <s.icon className="w-4 h-4" />
                )}
              </div>
              <span className={`text-[10px] font-medium ${isActive || isError ? 'text-on-surface' : 'text-on-surface-variant/30'}`}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
