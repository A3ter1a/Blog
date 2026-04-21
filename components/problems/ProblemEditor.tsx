"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, ChevronDown, ChevronUp, Upload, Sparkles, Loader2, Shield } from "lucide-react";
import type { Problem, ProblemType, Difficulty, ProblemOption } from "@/lib/types";
import { problemTypeMap, difficultyMap } from "@/lib/types";
import { BatchUpload } from "./BatchUpload";
import { generateProblemImage } from "@/lib/ai-drawing";
import { useToast } from "@/components/ui/Toast";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { ProblemChecker } from "./ProblemChecker";

interface ProblemEditorProps {
  problems: Problem[];
  onChange: (problems: Problem[]) => void;
}

export function ProblemEditor({ problems, onChange }: ProblemEditorProps) {
  const toast = useToast();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [showBatchUpload, setShowBatchUpload] = useState(false);
  const [generatingImage, setGeneratingImage] = useState<number | null>(null);

  const handleBatchImport = (newProblems: Problem[]) => {
    onChange([...problems, ...newProblems]);
    setShowBatchUpload(false);
  };

  const addProblem = () => {
    const newProblem: Problem = {
      id: Date.now().toString(),
      type: "choice",
      difficulty: "medium",
      question: "",
      options: [
        { label: "A", content: "" },
        { label: "B", content: "" },
        { label: "C", content: "" },
        { label: "D", content: "" },
      ],
      answer: "",
      explanation: "",
      tips: "",
      tags: [],
    };
    onChange([...problems, newProblem]);
    setExpandedIndex(problems.length);
  };

  const removeProblem = (index: number) => {
    const updated = problems.filter((_, i) => i !== index);
    onChange(updated);
    if (expandedIndex === index) setExpandedIndex(null);
    else if (expandedIndex !== null && expandedIndex > index) setExpandedIndex(expandedIndex - 1);
  };

  const updateProblem = (index: number, field: keyof Problem, value: any) => {
    const updated = [...problems];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const updateOption = (problemIndex: number, optionIndex: number, field: keyof ProblemOption, value: string) => {
    const updated = [...problems];
    const options = [...(updated[problemIndex].options || [])];
    options[optionIndex] = { ...options[optionIndex], [field]: value };
    updated[problemIndex] = { ...updated[problemIndex], options };
    onChange(updated);
  };

  const addOption = (problemIndex: number) => {
    const updated = [...problems];
    const currentOptions = updated[problemIndex].options || [];
    const labels = ["A", "B", "C", "D", "E", "F"];
    const nextLabel = labels[currentOptions.length] || String(currentOptions.length + 1);
    updated[problemIndex] = {
      ...updated[problemIndex],
      options: [...currentOptions, { label: nextLabel, content: "" }],
    };
    onChange(updated);
  };

  const removeOption = (problemIndex: number, optionIndex: number) => {
    const updated = [...problems];
    const options = (updated[problemIndex].options || []).filter((_, i) => i !== optionIndex);
    updated[problemIndex] = { ...updated[problemIndex], options };
    onChange(updated);
  };

  const updateTag = (problemIndex: number, tagString: string) => {
    const tags = tagString.split(",").map((t) => t.trim()).filter(Boolean);
    updateProblem(problemIndex, "tags", tags);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-on-surface font-headline">
          题目列表
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setShowBatchUpload(!showBatchUpload)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
              showBatchUpload
                ? "bg-primary text-on-primary"
                : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
            }`}
          >
            <Upload className="w-4 h-4" />
            批量上传
          </button>
          <button
            onClick={addProblem}
            className="px-4 py-2 rounded-lg editorial-gradient text-on-primary text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all duration-200 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            添加题目
          </button>
        </div>
      </div>

      {/* Batch Upload Section */}
      <AnimatePresence>
        {showBatchUpload && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 bg-surface-container-low rounded-xl">
              <BatchUpload onProblemsExtracted={handleBatchImport} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Problem List */}
      <div className="space-y-3">
        <AnimatePresence>
          {problems.map((problem, index) => (
            <motion.div
              key={problem.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-surface-container-low rounded-xl overflow-hidden"
            >
              {/* Problem Header (always visible) */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-surface-container-high transition-colors duration-200"
                onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full editorial-gradient text-on-primary text-sm font-bold flex items-center justify-center">
                    {index + 1}
                  </span>
                  <div className="flex gap-2">
                    <span className="px-2 py-1 rounded-md bg-primary-container/20 text-primary-container text-xs font-medium">
                      {problemTypeMap[problem.type]}
                    </span>
                    <span className="px-2 py-1 rounded-md bg-surface-container-highest text-on-surface-variant text-xs">
                      {difficultyMap[problem.difficulty]}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ProblemChecker
                    problem={problem}
                    index={index}
                    onUpdate={(updates) => {
                      const updated = [...problems];
                      updated[index] = { ...updated[index], ...updates };
                      onChange(updated);
                    }}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeProblem(index);
                    }}
                    className="p-2 rounded-lg hover:bg-red-100 text-on-surface-variant hover:text-red-600 transition-colors duration-200"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {expandedIndex === index ? (
                    <ChevronUp className="w-5 h-5 text-on-surface-variant" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-on-surface-variant" />
                  )}
                </div>
              </div>

              {/* Expanded Editor */}
              <AnimatePresence>
                {expandedIndex === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-4 pt-0 space-y-4">
                      {/* Type & Difficulty */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-on-surface-variant mb-1">题型</label>
                          <CustomSelect
                            options={(Object.keys(problemTypeMap) as ProblemType[]).map((type) => ({
                              value: type,
                              label: problemTypeMap[type],
                            }))}
                            value={problem.type}
                            onChange={(value) => updateProblem(index, "type", value as ProblemType)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-on-surface-variant mb-1">难度</label>
                          <CustomSelect
                            options={(Object.keys(difficultyMap) as Difficulty[]).map((diff) => ({
                              value: diff,
                              label: difficultyMap[diff],
                            }))}
                            value={problem.difficulty}
                            onChange={(value) => updateProblem(index, "difficulty", value as Difficulty)}
                          />
                        </div>
                      </div>

                      {/* Question */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-on-surface-variant">题干</label>
                          <button
                            onClick={async () => {
                              if (!problems[index].question.trim()) return;
                              setGeneratingImage(index);
                              try {
                                const imageUrl = await generateProblemImage(problems[index].question);
                                updateProblem(index, "question", problems[index].question + `\n\n![配图](${imageUrl})`);
                              } catch (err: any) {
                                toast.error("AI 配图生成失败");
                              } finally {
                                setGeneratingImage(null);
                              }
                            }}
                            disabled={generatingImage === index || !problems[index].question.trim()}
                            className="flex items-center gap-1 text-xs text-primary hover:text-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {generatingImage === index ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Sparkles className="w-3 h-3" />
                            )}
                            AI 配图
                          </button>
                        </div>
                        <textarea
                          value={problem.question}
                          onChange={(e) => updateProblem(index, "question", e.target.value)}
                          placeholder="输入题目内容..."
                          rows={4}
                          className="w-full px-3 py-2 bg-surface-container-highest rounded-lg input-soft text-on-surface placeholder:text-on-surface-variant/40 text-sm resize-none font-mono"
                        />
                      </div>

                      {/* Options (for choice) */}
                      {problem.type === "choice" && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-xs font-medium text-on-surface-variant">选项</label>
                            <button
                              onClick={() => addOption(index)}
                              className="text-xs text-primary hover:text-primary-container transition-colors"
                            >
                              + 添加选项
                            </button>
                          </div>
                          <div className="space-y-2">
                            {(problem.options || []).map((opt, optIdx) => (
                              <div key={optIdx} className="flex gap-2">
                                <span className="w-8 h-9 rounded-lg bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">
                                  {opt.label}
                                </span>
                                <input
                                  type="text"
                                  value={opt.content}
                                  onChange={(e) => updateOption(index, optIdx, "content", e.target.value)}
                                  placeholder="选项内容..."
                                  className="flex-1 px-3 py-2 bg-surface-container-highest rounded-lg input-soft text-on-surface placeholder:text-on-surface-variant/40 text-sm"
                                />
                                {(problem.options?.length || 0) > 2 && (
                                  <button
                                    onClick={() => removeOption(index, optIdx)}
                                    className="p-2 rounded-lg hover:bg-red-100 text-on-surface-variant hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Answer */}
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">答案</label>
                        <input
                          type="text"
                          value={problem.answer}
                          onChange={(e) => updateProblem(index, "answer", e.target.value)}
                          placeholder={problem.type === "choice" ? "如：A" : "输入答案..."}
                          className="w-full px-3 py-2 bg-surface-container-highest rounded-lg input-soft text-on-surface placeholder:text-on-surface-variant/40 text-sm"
                        />
                      </div>

                      {/* Explanation */}
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">解析</label>
                        <textarea
                          value={problem.explanation}
                          onChange={(e) => updateProblem(index, "explanation", e.target.value)}
                          placeholder="输入详细解析..."
                          rows={4}
                          className="w-full px-3 py-2 bg-surface-container-highest rounded-lg input-soft text-on-surface placeholder:text-on-surface-variant/40 text-sm resize-none font-mono"
                        />
                      </div>

                      {/* Source */}
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">来源（可选）</label>
                        <input
                          type="text"
                          value={problem.source || ""}
                          onChange={(e) => updateProblem(index, "source", e.target.value)}
                          placeholder="如：2025年考研数学三真题"
                          className="w-full px-3 py-2 bg-surface-container-highest rounded-lg input-soft text-on-surface placeholder:text-on-surface-variant/40 text-sm"
                        />
                      </div>

                      {/* Tips */}
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">提示（可选）</label>
                        <textarea
                          value={problem.tips || ""}
                          onChange={(e) => updateProblem(index, "tips", e.target.value)}
                          placeholder="解题提示、注意事项..."
                          rows={2}
                          className="w-full px-3 py-2 bg-surface-container-highest rounded-lg input-soft text-on-surface placeholder:text-on-surface-variant/40 text-sm resize-none"
                        />
                      </div>

                      {/* Tags */}
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">知识点标签（逗号分隔）</label>
                        <input
                          type="text"
                          value={problem.tags.join(", ")}
                          onChange={(e) => updateTag(index, e.target.value)}
                          placeholder="极限, 连续, 高数"
                          className="w-full px-3 py-2 bg-surface-container-highest rounded-lg input-soft text-on-surface placeholder:text-on-surface-variant/40 text-sm"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>

        {problems.length === 0 && (
          <div className="text-center py-12 text-on-surface-variant/40">
            <p className="text-sm">暂无题目，点击"添加题目"开始创建</p>
          </div>
        )}
      </div>
    </div>
  );
}
