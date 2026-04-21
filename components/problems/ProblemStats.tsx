"use client";

import { useMemo } from "react";
import { BarChart3, BookOpen, TrendingUp } from "lucide-react";
import type { Problem } from "@/lib/types";
import { problemTypeMap, difficultyMap } from "@/lib/types";

interface ProblemStatsProps {
  problems: Problem[];
}

export function ProblemStats({ problems }: ProblemStatsProps) {
  const stats = useMemo(() => {
    const total = problems.length;
    const typeCount: Record<string, number> = {};
    const difficultyCount: Record<string, number> = {};

    problems.forEach((p) => {
      typeCount[p.type] = (typeCount[p.type] || 0) + 1;
      difficultyCount[p.difficulty] = (difficultyCount[p.difficulty] || 0) + 1;
    });

    return { total, typeCount, difficultyCount };
  }, [problems]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      {/* Total */}
      <div className="bg-surface-container-lowest rounded-xl p-5 shadow-ambient">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl editorial-gradient flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-6 h-6 text-on-primary" />
          </div>
          <div className="flex flex-col">
            <p className="text-sm font-bold text-on-surface-variant">题目总数</p>
            <p className="text-3xl font-bold text-on-surface">{stats.total}</p>
          </div>
        </div>
      </div>

      {/* By Type */}
      <div className="bg-surface-container-lowest rounded-xl p-5 shadow-ambient">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary-container/20 flex items-center justify-center flex-shrink-0">
            <BarChart3 className="w-6 h-6 text-primary-container" />
          </div>
          <div className="flex flex-col">
            <p className="text-sm font-bold text-on-surface-variant">题型分布</p>
            <div className="flex gap-2 mt-1 flex-wrap">
              {Object.entries(stats.typeCount).map(([type, count]) => (
                <span key={type} className="text-[11px] text-on-surface-variant/70">
                  {problemTypeMap[type as keyof typeof problemTypeMap]}{count}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* By Difficulty */}
      <div className="bg-surface-container-lowest rounded-xl p-5 shadow-ambient">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-6 h-6 text-amber-600" />
          </div>
          <div className="flex flex-col">
            <p className="text-sm font-bold text-on-surface-variant">难度分布</p>
            <div className="flex gap-2 mt-1 flex-wrap">
              {Object.entries(stats.difficultyCount).map(([diff, count]) => {
                const diffColors: Record<string, string> = {
                  easy: "bg-green-100 text-green-700",
                  medium: "bg-amber-100 text-amber-700",
                  hard: "bg-red-100 text-red-700",
                };
                return (
                  <span
                    key={diff}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${
                      diffColors[diff] || "bg-surface-container-high text-on-surface-variant"
                    }`}
                  >
                    {difficultyMap[diff as keyof typeof difficultyMap]} {count}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
