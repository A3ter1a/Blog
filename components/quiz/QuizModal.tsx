"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Brain, Loader2, CheckCircle2, XCircle, ChevronRight, RotateCcw } from "lucide-react";
import { generateQuiz } from "@/lib/ai";
import { MarkdownContent } from "@/components/ui/MarkdownContent";

interface QuizQuestion {
  question: string;
  type: "choice" | "fill" | "short";
  options?: Array<{ label: string; content: string }>;
  answer: string;
  explanation: string;
}

interface QuizModalProps {
  content: string;
  onClose: () => void;
}

export function QuizModal({ content, onClose }: QuizModalProps) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAnswer, setShowAnswer] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [userAnswer, setUserAnswer] = useState("");
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Generate quiz on mount
  useEffect(() => {
    loadQuiz();
  }, []);

  const loadQuiz = async () => {
    try {
      setLoading(true);
      setError(null);
      const quiz = await generateQuiz(content, 5);
      if (quiz.length === 0) {
        setError("未能生成题目，请检查笔记内容是否足够");
      } else {
        setQuestions(quiz);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setLoading(false);
    }
  };

  const handleOptionSelect = (option: string) => {
    if (showAnswer) return;
    setSelectedOption(option);
  };

  const handleSubmit = () => {
    if (!questions[currentIndex]) return;
    
    const current = questions[currentIndex];
    if (current.type === "choice" && selectedOption) {
      const correct = selectedOption === current.answer;
      setIsCorrect(correct);
      setShowAnswer(true);
    } else if (current.type === "fill" || current.type === "short") {
      setShowAnswer(true);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setShowAnswer(false);
      setSelectedOption(null);
      setUserAnswer("");
      setIsCorrect(null);
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setShowAnswer(false);
    setSelectedOption(null);
    setUserAnswer("");
    setIsCorrect(null);
    loadQuiz();
  };

  const current = questions[currentIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface-container-lowest rounded-2xl shadow-elevated w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-outline-variant/10">
          <div className="flex items-center gap-3">
            <Brain className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold text-on-surface">AI 出题练习</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-container-high text-on-surface-variant transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
              <p className="text-on-surface-variant">正在生成题目...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <XCircle className="w-12 h-12 text-error mx-auto mb-4" />
              <p className="text-on-surface mb-4">{error}</p>
              <button
                onClick={handleRestart}
                className="px-4 py-2 rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition-colors"
              >
                重试
              </button>
            </div>
          ) : questions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-on-surface-variant">暂无题目</p>
            </div>
          ) : (
            <div>
              {/* Progress */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-on-surface-variant">
                  第 {currentIndex + 1} / {questions.length} 题
                </span>
                <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                  {current.type === "choice" ? "选择题" : current.type === "fill" ? "填空题" : "简答题"}
                </span>
              </div>

              {/* Question */}
              <div className="mb-6">
                <MarkdownContent content={current.question} className="text-on-surface" />
              </div>

              {/* Options (for choice questions) */}
              {current.type === "choice" && current.options && (
                <div className="space-y-3 mb-6">
                  {current.options.map((option) => {
                    const isSelected = selectedOption === option.label;
                    const isCorrectOption = option.label === current.answer;
                    const showResult = showAnswer;
                    
                    let optionClass = "border-outline-variant/20 hover:border-primary/30";
                    if (showResult) {
                      if (isCorrectOption) {
                        optionClass = "border-green-500 bg-green-50";
                      } else if (isSelected && !isCorrectOption) {
                        optionClass = "border-red-500 bg-red-50";
                      }
                    } else if (isSelected) {
                      optionClass = "border-primary bg-primary/5";
                    }

                    return (
                      <button
                        key={option.label}
                        onClick={() => handleOptionSelect(option.label)}
                        disabled={showAnswer}
                        className={`w-full p-4 rounded-lg border text-left transition-all ${optionClass} ${
                          showAnswer ? "cursor-default" : "cursor-pointer"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${
                            showResult && isCorrectOption
                              ? "bg-green-500 text-white"
                              : showResult && isSelected && !isCorrectOption
                              ? "bg-red-500 text-white"
                              : isSelected
                              ? "bg-primary text-white"
                              : "bg-surface-container-high text-on-surface-variant"
                          }`}>
                            {showResult && isCorrectOption ? (
                              <CheckCircle2 className="w-4 h-4" />
                            ) : showResult && isSelected && !isCorrectOption ? (
                              <XCircle className="w-4 h-4" />
                            ) : (
                              option.label
                            )}
                          </span>
                          <span className="text-on-surface">{option.content}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Answer input (for fill/short questions) */}
              {(current.type === "fill" || current.type === "short") && !showAnswer && (
                <textarea
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  placeholder="输入你的答案..."
                  className="w-full p-4 rounded-lg border border-outline-variant/20 bg-surface-container-low text-on-surface placeholder:text-on-surface-variant/40 resize-none focus:border-primary focus:outline-none transition-colors"
                  rows={4}
                />
              )}

              {/* Answer reveal */}
              {showAnswer && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 p-4 rounded-lg bg-surface-container-low border border-outline-variant/20"
                >
                  <div className="flex items-center gap-2 mb-2">
                    {current.type === "choice" && (
                      <>
                        {isCorrect ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-600" />
                        )}
                        <span className={`font-semibold ${isCorrect ? "text-green-600" : "text-red-600"}`}>
                          {isCorrect ? "回答正确！" : "回答错误"}
                        </span>
                      </>
                    )}
                    {(current.type === "fill" || current.type === "short") && (
                      <span className="font-semibold text-on-surface">参考答案</span>
                    )}
                  </div>
                  <div className="text-on-surface mb-3">
                    <strong>答案：</strong>
                    <MarkdownContent content={current.answer} />
                  </div>
                  <div className="text-on-surface-variant">
                    <strong>解析：</strong>
                    <MarkdownContent content={current.explanation} />
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!loading && !error && questions.length > 0 && (
          <div className="p-6 border-t border-outline-variant/10 flex justify-between">
            {!showAnswer ? (
              <button
                onClick={handleSubmit}
                disabled={current.type === "choice" && !selectedOption}
                className="px-6 py-2 rounded-lg bg-primary text-on-primary font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                提交答案
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <>
                {currentIndex < questions.length - 1 ? (
                  <button
                    onClick={handleNext}
                    className="px-6 py-2 rounded-lg bg-primary text-on-primary font-medium hover:bg-primary/90 transition-all flex items-center gap-2"
                  >
                    下一题
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleRestart}
                    className="px-6 py-2 rounded-lg bg-surface-container-high text-on-surface-variant font-medium hover:bg-surface-container-highest transition-all flex items-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    重新出题
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
