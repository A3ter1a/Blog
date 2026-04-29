"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Eye, EyeOff, Lightbulb, Sparkles, Layers } from "lucide-react";
import type { Problem, ProblemType, Difficulty } from "@/lib/types";
import { problemTypeMap, difficultyMap, difficultyColorMap } from "@/lib/types";
import { MarkdownContent } from "@/components/ui/MarkdownContent";

interface ProblemCardProps {
  problem: Problem;
  index: number;
}

export function ProblemCard({ problem, index }: ProblemCardProps) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);

  return (
    <motion.div
      id={`problem-${index + 1}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="bg-surface-container-lowest rounded-xl shadow-ambient overflow-hidden scroll-mt-24"
    >
      {/* Header: Number + Tags */}
      <div className="flex items-center justify-between p-4 border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-full editorial-gradient text-on-primary text-sm font-bold flex items-center justify-center">
            {index + 1}
          </span>
          <div className="flex gap-2">
            <span className="px-2 py-1 rounded-md bg-primary-container/20 text-primary-container text-xs font-medium">
              {problemTypeMap[problem.type]}
            </span>
            <span className={`px-2 py-1 rounded-md text-xs font-medium ${difficultyColorMap[problem.difficulty]}`}>
              {difficultyMap[problem.difficulty]}
            </span>
            {problem.aiStatus === 'complete' && (
              <span className="px-2 py-1 rounded-md bg-amber-100 text-amber-700 text-xs font-medium flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> AI
              </span>
            )}
            {problem.chapterId && (
              <span className="px-2 py-1 rounded-md bg-surface-container-highest text-on-surface-variant text-xs font-medium flex items-center gap-1">
                <Layers className="w-3 h-3" /> 章节
              </span>
            )}
          </div>
        </div>
        {problem.source && (
          <span className="text-xs text-on-surface-variant/60">{problem.source}</span>
        )}
      </div>

      {/* Question */}
      <div className="p-4">
        <div className="text-on-surface leading-relaxed">
          <MarkdownContent content={problem.question} />
        </div>

        {/* Options (for choice questions) */}
        {problem.options && problem.options.length > 0 && (
          <div className="mt-4 space-y-2">
            {problem.options.map((opt) => (
              <div
                key={opt.label}
                className="flex gap-3 p-3 rounded-lg bg-surface-container-low"
              >
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                  {opt.label}
                </span>
                <span className="text-on-surface-variant">
                  <MarkdownContent content={opt.content} />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 px-4 pb-4">
        <button
          onClick={() => setShowAnswer(!showAnswer)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors duration-200"
        >
          {showAnswer ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showAnswer ? "隐藏答案" : "查看答案"}
        </button>
        <button
          onClick={() => setShowExplanation(!showExplanation)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-container-high text-on-surface-variant text-sm font-medium hover:bg-surface-container-highest transition-colors duration-200"
        >
          {showExplanation ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {showExplanation ? "收起解析" : "查看解析"}
        </button>
      </div>

      {/* Answer */}
      <AnimatePresence>
        {showAnswer && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                <span className="text-sm font-bold text-green-700">答案：</span>
                <div className="text-green-600 mt-2">
                  <MarkdownContent content={problem.answer} />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Explanation */}
      <AnimatePresence>
        {showExplanation && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                <span className="text-sm font-bold text-blue-700">解析：</span>
                <div className="text-blue-600 mt-2">
                  <MarkdownContent content={problem.explanation} />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tips */}
      {problem.tips && (
        <div className="px-4 pb-2">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <Lightbulb className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-amber-700 text-sm leading-relaxed">
              <MarkdownContent content={problem.tips} />
            </div>
          </div>
        </div>
      )}

      {/* Tags */}
      {problem.tags.length > 0 && (
        <div className="px-4 pb-4 flex flex-wrap gap-2">
          {problem.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-1 rounded-md bg-surface-container text-on-surface-variant text-xs"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
