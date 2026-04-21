"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Loader2, CheckCircle2, XCircle, AlertCircle, X, Wand2 } from "lucide-react";
import type { Problem } from "@/lib/types";
import { chatWithAI } from "@/lib/ai";
import { useToast } from "@/components/ui/Toast";
import { DiffViewer } from "@/components/ui/DiffViewer";

interface ProblemCheckerProps {
  problem: Problem;
  index: number;
  onUpdate: (updates: Partial<Problem>) => void;
}

interface CheckResult {
  status: "pass" | "warning" | "error";
  message: string;
  suggestion?: string;
}

interface FixSuggestion {
  field: keyof Problem;
  original: string;
  fixed: string;
  reason: string;
}

export function ProblemChecker({ problem, index, onUpdate }: ProblemCheckerProps) {
  const toast = useToast();
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [fixSuggestions, setFixSuggestions] = useState<FixSuggestion[]>([]);
  const [isFixing, setIsFixing] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [diffOriginal, setDiffOriginal] = useState("");
  const [diffFixed, setDiffFixed] = useState("");
  const [pendingField, setPendingField] = useState<keyof Problem | null>(null);
  const [currentSuggestionIdx, setCurrentSuggestionIdx] = useState(0);

  const handleCheck = async () => {
    setIsChecking(true);
    setResult(null);
    setFixSuggestions([]);

    try {
      const problemText = `题型: ${problem.type}
难度: ${problem.difficulty}
题干: ${problem.question}
答案: ${problem.answer}
解析: ${problem.explanation || "无"}
选项: ${problem.options?.map((o) => `${o.label}. ${o.content}`).join("; ") || "无"}`;

      const prompt = `请检查以下题目的完整性和质量，返回 JSON 格式的检查结果。

检查要求：
1. 题干描述是否清晰完整
2. 答案是否正确（对于选择题，答案是否在选项中）
3. 解析是否充分详细
4. 难度标注是否合理
5. 格式是否规范（如 LaTeX 公式格式）

题目信息：
${problemText}

请返回 JSON 对象：
{
  "status": "pass" | "warning" | "error",
  "message": "检查结果简述",
  "suggestion": "改进建议（如果有）"
}

只返回 JSON，不要其他内容。`;

      const response = await chatWithAI(prompt, problemText);

      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const checkResult = JSON.parse(jsonMatch[0]) as CheckResult;
          setResult(checkResult);
        } else {
          setResult({ status: "warning", message: "AI 返回格式异常" });
        }
      } catch {
        setResult({ status: "warning", message: "AI 返回格式异常" });
      }
    } catch (error: any) {
      toast.error("检查失败");
      setResult({ status: "error", message: error.message });
    } finally {
      setIsChecking(false);
    }
  };

  const handleFix = async () => {
    setIsFixing(true);

    try {
      const problemText = `题型: ${problem.type}
难度: ${problem.difficulty}
题干: ${problem.question}
答案: ${problem.answer}
解析: ${problem.explanation || "无"}
选项: ${problem.options?.map((o) => `${o.label}. ${o.content}`).join("; ") || "无"}`;

      const prompt = `以下题目存在问题，请分析并给出修正建议。

题目信息：
${problemText}

问题描述：
${result?.message}
${result?.suggestion ? `改进建议：${result.suggestion}` : ""}

请分析哪些字段需要修改，并返回 JSON 数组，每个元素包含：
- field: 需要修改的字段名（question/answer/explanation/difficulty）
- original: 原始内容
- fixed: 修正后的内容
- reason: 修改原因

只返回 JSON 数组，不要其他内容。`;

      const response = await chatWithAI(prompt, problemText);

      try {
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const suggestions = JSON.parse(jsonMatch[0]) as FixSuggestion[];
          setFixSuggestions(suggestions);

          if (suggestions.length > 0) {
            setCurrentSuggestionIdx(0);
            const first = suggestions[0];
            setDiffOriginal(String(problem[first.field] || ""));
            setDiffFixed(first.fixed);
            setPendingField(first.field);
            setShowDiff(true);
          }
        } else {
          toast.error("AI 返回格式异常");
        }
      } catch {
        toast.error("解析修正建议失败");
      }
    } catch (error: any) {
      toast.error("修正失败");
    } finally {
      setIsFixing(false);
    }
  };

  const handleApplyDiff = () => {
    if (pendingField) {
      onUpdate({ [pendingField]: diffFixed } as Partial<Problem>);
      toast.success("已应用修正");
    }
    setShowDiff(false);

    // 显示下一个建议
    const nextIdx = currentSuggestionIdx + 1;
    if (nextIdx < fixSuggestions.length) {
      setCurrentSuggestionIdx(nextIdx);
      const next = fixSuggestions[nextIdx];
      setDiffOriginal(String(problem[next.field] || ""));
      setDiffFixed(next.fixed);
      setPendingField(next.field);
      setShowDiff(true);
    } else {
      setPendingField(null);
      setFixSuggestions([]);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pass":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "warning":
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case "error":
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case "pass":
        return "bg-green-500/10 border-green-500/20";
      case "warning":
        return "bg-yellow-500/10 border-yellow-500/20";
      case "error":
        return "bg-red-500/10 border-red-500/20";
      default:
        return "";
    }
  };

  return (
    <>
      {/* 自检按钮 */}
      <button
        onClick={handleCheck}
        disabled={isChecking}
        className="p-2 rounded-lg hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors"
        title="AI 自检"
      >
        {isChecking ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Shield className="w-4 h-4" />
        )}
      </button>

      {/* 检查结果 - 显示在题目下方 */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className={`mt-3 mx-4 p-3 rounded-lg border ${getStatusBg(result.status)}`}>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex-shrink-0">{getStatusIcon(result.status)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        result.status === "error"
                          ? "bg-red-500/20 text-red-400"
                          : result.status === "warning"
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "bg-green-500/20 text-green-400"
                      }`}
                    >
                      {result.status === "error" ? "错误" : result.status === "warning" ? "警告" : "通过"}
                    </span>
                    <button
                      onClick={() => {
                        setResult(null);
                        setFixSuggestions([]);
                      }}
                      className="p-1 rounded hover:bg-black/10 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-sm text-on-surface mt-2">{result.message}</p>
                  {result.suggestion && (
                    <p className="text-xs text-on-surface-variant/60 mt-1">{result.suggestion}</p>
                  )}

                  {/* 修正按钮 */}
                  {result.status !== "pass" && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={handleFix}
                        disabled={isFixing}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-xs font-medium disabled:opacity-50"
                      >
                        {isFixing ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Wand2 className="w-3 h-3" />
                        )}
                        AI 修正
                      </button>
                    </div>
                  )}

                  {/* 剩余修正建议 */}
                  {fixSuggestions.length > 1 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-on-surface-variant">
                        还有 {fixSuggestions.length - currentSuggestionIdx - 1} 个修正建议
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Diff Viewer */}
      <DiffViewer
        isOpen={showDiff}
        onClose={() => {
          setShowDiff(false);
          setPendingField(null);
        }}
        original={diffOriginal}
        polished={diffFixed}
        onApply={handleApplyDiff}
      />
    </>
  );
}
