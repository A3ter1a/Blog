"use client";

import { Problem, difficultyMap } from "@/lib/types";

interface ProblemListProps {
  problems: Problem[];
}

export function ProblemList({ problems }: ProblemListProps) {
  const scrollToProblem = (index: number) => {
    const element = document.getElementById(`problem-${index}`);
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
          const difficultyColors: Record<string, string> = {
            easy: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
            medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
            hard: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
          };

          return (
            <button
              key={problem.id}
              onClick={() => scrollToProblem(index + 1)}
              className={`flex flex-col items-center justify-center p-3 rounded-lg transition-all duration-200 group ${
                difficultyColors[problem.difficulty] || "bg-surface-container-high text-on-surface-variant"
              }`}
            >
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
