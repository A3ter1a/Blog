'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import type { Problem, ProblemType, Difficulty } from '@/lib/types';
import { problemTypeMap, difficultyMap } from '@/lib/types';

interface AIExtractionResultProps {
  extracted: Problem;
  onAccept: () => void;
  onRetry: () => void;
}

export function AIExtractionResult({ extracted, onAccept, onRetry }: AIExtractionResultProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['question']));

  const toggleExpand = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const confidencePct = Math.round((extracted.aiResult?.confidence || 0.7) * 100);

  return (
    <div className="space-y-3">
      {/* Confidence bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-surface-container-highest rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-green-400"
            initial={{ width: 0 }}
            animate={{ width: `${confidencePct}%` }}
            transition={{ duration: 0.5, delay: 0.2 }}
          />
        </div>
        <span className="text-xs font-medium text-on-surface-variant">{confidencePct}% 置信度</span>
      </div>

      {/* Problem type and difficulty tags */}
      <div className="flex gap-2">
        <span className="px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium">
          {problemTypeMap[extracted.type] || '未知题型'}
        </span>
        <span className={`px-2 py-1 rounded-md text-xs font-medium ${
          extracted.difficulty === 'easy' ? 'bg-green-100 text-green-700' :
          extracted.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-700' :
          'bg-red-100 text-red-700'
        }`}>
          {difficultyMap[extracted.difficulty] || '未知难度'}
        </span>
      </div>

      {/* Question preview (always visible) */}
      <SectionPreview
        label="题目"
        content={extracted.question}
        isExpanded={expandedSections.has('question')}
        onToggle={() => toggleExpand('question')}
      />

      {/* Answer */}
      {extracted.answer && (
        <SectionPreview
          label="答案"
          content={extracted.answer}
          isExpanded={expandedSections.has('answer')}
          onToggle={() => toggleExpand('answer')}
        />
      )}

      {/* Explanation */}
      {extracted.explanation && (
        <SectionPreview
          label="解析"
          content={extracted.explanation}
          isExpanded={expandedSections.has('explanation')}
          onToggle={() => toggleExpand('explanation')}
        />
      )}

      {/* Tips */}
      {extracted.tips && (
        <SectionPreview
          label="提示"
          content={extracted.tips}
          isExpanded={expandedSections.has('tips')}
          onToggle={() => toggleExpand('tips')}
        />
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={onAccept}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl editorial-gradient text-on-primary text-sm font-medium hover:opacity-90 transition-all"
        >
          <Check className="w-4 h-4" />
          采纳并添加到题集
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

function SectionPreview({ label, content, isExpanded, onToggle }: {
  label: string;
  content: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-xl border border-outline-variant/10 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-surface-container-low transition-colors"
      >
        <span className="text-xs font-medium text-on-surface-variant">{label}</span>
        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3">
              <p className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed">{content}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
