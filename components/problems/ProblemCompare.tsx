'use client';

import { Sparkles, Edit3 } from 'lucide-react';
import type { Problem } from '@/lib/types';
import { problemTypeMap, difficultyMap } from '@/lib/types';

interface ProblemCompareProps {
  original?: Problem;     // AI-extracted
  current?: Problem;      // Currently edited
  showDiff?: boolean;
}

export function ProblemCompare({ original, current, showDiff }: ProblemCompareProps) {
  if (!original && !current) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
        <span className="text-xs font-medium text-amber-700">AI 提取结果</span>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {original && (
          <CompareField label="题目" original={original.question} current={current?.question} />
        )}
        {original?.answer && (
          <CompareField label="答案" original={original.answer} current={current?.answer} />
        )}
        {original?.explanation && (
          <CompareField label="解析" original={original.explanation} current={current?.explanation} />
        )}
      </div>
    </div>
  );
}

function CompareField({ label, original, current }: { label: string; original: string; current?: string }) {
  const hasDiff = current && current !== original;

  return (
    <div className="rounded-lg border border-outline-variant/10 overflow-hidden">
      <div className="px-3 py-1.5 bg-surface-container-low flex items-center justify-between">
        <span className="text-xs font-medium text-on-surface-variant">{label}</span>
        {hasDiff && <Edit3 className="w-3 h-3 text-primary" />}
      </div>
      <div className="p-3 text-sm text-on-surface whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto">
        {original}
      </div>
    </div>
  );
}
