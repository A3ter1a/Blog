"use client";

import { Bookmark } from "lucide-react";
import { difficultyMap, type Problem, type ProblemPracticeStatus } from "@/lib/types";
import { getPracticeProblemKey } from "@/lib/math3-practice";

interface ProblemListProps {
  problems: Problem[];
  noteId?: string;
  statusMap?: Record<string, ProblemPracticeStatus>;
}

export function ProblemList({ problems, noteId, statusMap = {} }: ProblemListProps) {
  const scrollToProblem = (problemId: string) => {
    const element = document.getElementById(`problem-${problemId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (problems.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-outline-variant/10">
        <span className="text-xs font-bold text-on-surface">题目列表</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {problems.map((problem, index) => {
          const status = noteId ? statusMap[getPracticeProblemKey(noteId, problem.id)] : undefined;
          const difficultyColors: Record<string, string> = {
            easy: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
            medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
            hard: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
          };

          return (
            <button
              key={problem.id}
              onClick={() => scrollToProblem(problem.id)}
              className={`group relative flex flex-col items-center justify-center rounded-lg p-3 transition-all duration-200 ${
                difficultyColors[problem.difficulty] || "bg-surface-container-high text-on-surface-variant"
              } ${status?.isMarked ? "ring-2 ring-amber-400/60" : ""}`}
            >
              {status?.isMarked && (
                <Bookmark className="absolute right-1.5 top-1.5 h-3 w-3 fill-amber-500 text-amber-500" />
              )}
              <span className="text-lg font-bold mb-1">
                {index + 1}
              </span>
              <span className="text-xs font-medium">
                {difficultyMap[problem.difficulty]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
