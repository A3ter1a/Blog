"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, ChevronDown, ChevronUp } from "lucide-react";
import { Problem, ProblemType, Difficulty, ProblemOption, problemTypeMap, difficultyMap } from "@/lib/types";

interface ProblemEditorProps {
  problems: Problem[];
  onChange: (problems: Problem[]) => void;
}

export function ProblemEditor({ problems, onChange }: ProblemEditorProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProblem, setNewProblem] = useState<Partial<Problem>>({
    type: "calculation",
    difficulty: "medium",
    question: "",
    answer: "",
    explanation: "",
    tags: [],
  });

  const handleAdd = () => {
    if (!newProblem.question?.trim()) return;

    const problem: Problem = {
      id: Date.now().toString(),
      type: (newProblem.type as ProblemType) || "calculation",
      difficulty: (newProblem.difficulty as Difficulty) || "medium",
      question: newProblem.question || "",
      answer: newProblem.answer || "",
      explanation: newProblem.explanation || "",
      tags: newProblem.tags || [],
    };

    onChange([...problems, problem]);
    setNewProblem({
      type: "calculation",
      difficulty: "medium",
      question: "",
      answer: "",
      explanation: "",
      tags: [],
    });
    setShowAddForm(false);
  };

  const handleRemove = (id: string) => {
    onChange(problems.filter(p => p.id !== id));
  };

  return (
    <div className="space-y-4">
      {/* Existing Problems */}
      {problems.map((problem, index) => (
        <ProblemCard
          key={problem.id}
          problem={problem}
          index={index}
          onRemove={() => handleRemove(problem.id)}
        />
      ))}

      {/* Add Form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-surface-container-low rounded-xl p-4 space-y-3 overflow-hidden"
          >
            {/* Type and Difficulty */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-on-surface-variant/60 mb-1 block">题型</label>
                <select
                  value={newProblem.type}
                  onChange={(e) => setNewProblem({ ...newProblem, type: e.target.value as ProblemType })}
                  className="w-full px-3 py-2 bg-surface-container rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {(Object.entries(problemTypeMap) as [ProblemType, string][]).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-on-surface-variant/60 mb-1 block">难度</label>
                <select
                  value={newProblem.difficulty}
                  onChange={(e) => setNewProblem({ ...newProblem, difficulty: e.target.value as Difficulty })}
                  className="w-full px-3 py-2 bg-surface-container rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {(Object.entries(difficultyMap) as [Difficulty, string][]).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Question */}
            <div>
              <label className="text-xs text-on-surface-variant/60 mb-1 block">题目内容</label>
              <textarea
                value={newProblem.question}
                onChange={(e) => setNewProblem({ ...newProblem, question: e.target.value })}
                placeholder="输入题目内容，支持 LaTeX 公式..."
                rows={3}
                className="w-full px-3 py-2 bg-surface-container rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 resize-none placeholder:text-on-surface-variant/40"
              />
            </div>

            {/* Answer */}
            <div>
              <label className="text-xs text-on-surface-variant/60 mb-1 block">答案</label>
              <textarea
                value={newProblem.answer}
                onChange={(e) => setNewProblem({ ...newProblem, answer: e.target.value })}
                placeholder="输入答案..."
                rows={2}
                className="w-full px-3 py-2 bg-surface-container rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 resize-none placeholder:text-on-surface-variant/40"
              />
            </div>

            {/* Explanation */}
            <div>
              <label className="text-xs text-on-surface-variant/60 mb-1 block">解析</label>
              <textarea
                value={newProblem.explanation}
                onChange={(e) => setNewProblem({ ...newProblem, explanation: e.target.value })}
                placeholder="输入解析..."
                rows={2}
                className="w-full px-3 py-2 bg-surface-container rounded-lg text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 resize-none placeholder:text-on-surface-variant/40"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 px-3 py-2 rounded-lg bg-surface-container text-on-surface-variant text-sm hover:bg-surface-container-high transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAdd}
                disabled={!newProblem.question?.trim()}
                className="flex-1 px-3 py-2 rounded-lg editorial-gradient text-on-primary text-sm font-medium disabled:opacity-40 transition-all"
              >
                添加题目
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Button */}
      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full px-4 py-3 rounded-xl border-2 border-dashed border-outline-variant/30 text-on-surface-variant hover:border-primary/50 hover:text-primary transition-all duration-200 flex items-center justify-center gap-2 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          添加题目
        </button>
      )}
    </div>
  );
}

// Internal ProblemCard for editor
function ProblemCard({ problem, index, onRemove }: { problem: Problem; index: number; onRemove: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-surface-container-low rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-container-high transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 rounded-full editorial-gradient text-on-primary text-xs font-bold flex items-center justify-center">
            {index + 1}
          </span>
          <span className="text-sm font-medium text-on-surface line-clamp-1">
            {problem.question}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant">
            {problemTypeMap[problem.type]}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${problem.difficulty === 'easy' ? 'bg-green-100 text-green-700' : problem.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
            {difficultyMap[problem.difficulty]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="p-1 rounded hover:bg-surface-container-highest transition-colors"
          >
            <X className="w-4 h-4 text-on-surface-variant/40 hover:text-red-500" />
          </button>
          {expanded ? <ChevronUp className="w-4 h-4 text-on-surface-variant" /> : <ChevronDown className="w-4 h-4 text-on-surface-variant" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 pb-4 space-y-2 overflow-hidden"
          >
            {problem.answer && (
              <div className="text-sm">
                <span className="text-on-surface-variant/60">答案: </span>
                <span className="text-on-surface">{problem.answer}</span>
              </div>
            )}
            {problem.explanation && (
              <div className="text-sm">
                <span className="text-on-surface-variant/60">解析: </span>
                <span className="text-on-surface">{problem.explanation}</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
