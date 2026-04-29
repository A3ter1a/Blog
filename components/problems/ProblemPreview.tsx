'use client';

import type { Problem } from '@/lib/types';
import { problemTypeMap, difficultyMap } from '@/lib/types';
import { AlertCircle, Check } from 'lucide-react';

interface ProblemPreviewProps {
  problem: Partial<Problem>;
  className?: string;
}

export function ProblemPreview({ problem, className = '' }: ProblemPreviewProps) {
  const missingFields: string[] = [];
  if (!problem.question?.trim()) missingFields.push('题目内容');
  if (!problem.answer?.trim()) missingFields.push('答案');

  const isValid = missingFields.length === 0;

  return (
    <div className={`rounded-xl border bg-surface-container-low overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-outline-variant/10">
        <span className="text-xs font-medium text-on-surface-variant">题目预览</span>
        {isValid ? (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <Check className="w-3.5 h-3.5" /> 完整
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-amber-600">
            <AlertCircle className="w-3.5 h-3.5" />
            缺少: {missingFields.join('、')}
          </span>
        )}
      </div>

      {/* Content preview */}
      <div className="p-4 space-y-2 text-sm">
        {/* Type + Difficulty badges */}
        <div className="flex gap-2">
          <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium">
            {problemTypeMap[problem.type || 'calculation'] || '未知'}
          </span>
          <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${
            problem.difficulty === 'easy' ? 'bg-green-100 text-green-700' :
            problem.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-700' :
            'bg-red-100 text-red-700'
          }`}>
            {difficultyMap[problem.difficulty || 'medium'] || '未知'}
          </span>
        </div>

        {/* Question snippet */}
        {problem.question && (
          <p className="text-on-surface leading-relaxed line-clamp-3">
            {problem.question}
          </p>
        )}

        {/* Options */}
        {problem.options && problem.options.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {problem.options.map(opt => (
              <span key={opt.label} className="px-2 py-0.5 rounded bg-surface-container-highest text-xs">
                {opt.label}. {opt.content}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
