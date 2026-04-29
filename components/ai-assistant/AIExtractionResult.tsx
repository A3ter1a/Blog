'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, RefreshCw, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import type { Problem, ProblemType } from '@/lib/types';
import { problemTypeMap, difficultyMap } from '@/lib/types';

interface AIExtractionResultProps {
  extractedProblems: Partial<Problem>[];
  onAcceptAll: () => void;
  onAcceptOne: (index: number) => void;
  onRetry: () => void;
}

export function AIExtractionResult({ extractedProblems, onAcceptAll, onAcceptOne, onRetry }: AIExtractionResultProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [acceptedIndices, setAcceptedIndices] = useState<Set<number>>(new Set());

  const handleAcceptOne = (index: number) => {
    setAcceptedIndices(prev => new Set(prev).add(index));
    onAcceptOne(index);
  };

  const allAccepted = extractedProblems.length > 0 && acceptedIndices.size >= extractedProblems.length;

  return (
    <div className="space-y-3">
      {/* Header: count + accept all */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-on-surface-variant">
          共识别 {extractedProblems.length} 道题目
        </span>
        {!allAccepted && (
          <button
            onClick={onAcceptAll}
            className="text-xs font-medium text-primary hover:underline"
          >
            全部采纳
          </button>
        )}
        {allAccepted && (
          <span className="text-xs text-green-600 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            全部已采纳
          </span>
        )}
      </div>

      {/* Problem cards */}
      <div className="space-y-2">
        {extractedProblems.map((problem, index) => (
          <ProblemCard
            key={index}
            index={index}
            problem={problem}
            isExpanded={expandedIndex === index}
            isAccepted={acceptedIndices.has(index)}
            onToggle={() => setExpandedIndex(expandedIndex === index ? null : index)}
            onAccept={() => handleAcceptOne(index)}
          />
        ))}
      </div>

      {/* Bottom actions */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={onAcceptAll}
          disabled={allAccepted || extractedProblems.length === 0}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl editorial-gradient text-on-primary text-sm font-medium hover:opacity-90 transition-all disabled:opacity-40"
        >
          <Check className="w-4 h-4" />
          全部采纳
        </button>
        <button
          onClick={onRetry}
          className="px-3 py-2.5 rounded-xl bg-surface-container-low text-on-surface-variant text-sm hover:bg-surface-container-high transition-colors"
          title="重新扫描"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function ProblemCard({
  index,
  problem,
  isExpanded,
  isAccepted,
  onToggle,
  onAccept,
}: {
  index: number;
  problem: Partial<Problem>;
  isExpanded: boolean;
  isAccepted: boolean;
  onToggle: () => void;
  onAccept: () => void;
}) {
  const confidence = problem.aiResult?.confidence ?? 0.5;
  const confidencePct = Math.round(confidence * 100);

  return (
    <div className={`rounded-xl border overflow-hidden transition-colors ${
      isAccepted
        ? 'border-green-200/40 bg-green-50/30'
        : 'border-outline-variant/10 bg-surface-container-lowest'
    }`}>
      {/* Card header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-container-low/50 transition-colors text-left"
      >
        {/* Number badge */}
        <span className="w-6 h-6 rounded-full editorial-gradient text-on-primary text-xs font-bold flex items-center justify-center shrink-0">
          {index + 1}
        </span>

        {/* Info area */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium">
              {problemTypeMap[problem.type as ProblemType] || '未知题型'}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
              problem.difficulty === 'easy' ? 'bg-green-100 text-green-700' :
              problem.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-700' :
              'bg-red-100 text-red-700'
            }`}>
              {difficultyMap[problem.difficulty || 'medium'] || '中等'}
            </span>
            {isAccepted && (
              <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-[10px] font-medium flex items-center gap-0.5">
                <CheckCircle2 className="w-3 h-3" />
                已采纳
              </span>
            )}
          </div>
          <p className="text-sm text-on-surface line-clamp-2 leading-snug">
            {problem.question || '(无题目内容)'}
          </p>
        </div>

        {/* Confidence mini bar + expand icon */}
        <div className="shrink-0 flex items-center gap-2">
          <div className="w-12">
            <div className="h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  confidence >= 0.8 ? 'bg-green-400' :
                  confidence >= 0.5 ? 'bg-amber-400' :
                  'bg-red-400'
                }`}
                style={{ width: `${confidencePct}%` }}
              />
            </div>
            <p className="text-[10px] text-on-surface-variant/50 text-center mt-0.5">{confidencePct}%</p>
          </div>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-on-surface-variant" /> : <ChevronDown className="w-4 h-4 text-on-surface-variant" />}
        </div>
      </button>

      {/* Expanded details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2 border-t border-outline-variant/5 pt-2">
              {/* Answer */}
              {problem.answer && (
                <div>
                  <span className="text-[10px] font-medium text-on-surface-variant/60">答案</span>
                  <p className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed">{problem.answer}</p>
                </div>
              )}

              {/* Explanation */}
              {problem.explanation && (
                <div>
                  <span className="text-[10px] font-medium text-on-surface-variant/60">解析</span>
                  <p className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed">{problem.explanation}</p>
                </div>
              )}

              {/* Tips */}
              {problem.tips && (
                <div>
                  <span className="text-[10px] font-medium text-on-surface-variant/60">提示</span>
                  <p className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed">{problem.tips}</p>
                </div>
              )}

              {/* Options (choice type) */}
              {Array.isArray(problem.options) && problem.options.length > 0 && (
                <div>
                  <span className="text-[10px] font-medium text-on-surface-variant/60">选项</span>
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    {problem.options.map((opt: any, i: number) => (
                      <span key={i} className="text-xs text-on-surface-variant">
                        <span className="font-medium">{opt.label}.</span> {opt.content}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Accept single button */}
              {!isAccepted && (
                <button
                  onClick={(e) => { e.stopPropagation(); onAccept(); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  采纳此题
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
