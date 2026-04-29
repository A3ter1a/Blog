'use client';

import { useMemo } from 'react';
import { Layers, BookOpen, TrendingUp } from 'lucide-react';
import type { Problem } from '@/lib/types';
import { problemTypeMap } from '@/lib/types';

interface ChapterStatsViewProps {
  problems: Problem[];
  chapterName?: string;
}

export function ChapterStatsView({ problems, chapterName }: ChapterStatsViewProps) {
  const stats = useMemo(() => {
    const total = problems.length;
    const typeCount: Record<string, number> = {};
    const difficultyCount: Record<string, number> = {};

    problems.forEach(p => {
      typeCount[p.type] = (typeCount[p.type] || 0) + 1;
      difficultyCount[p.difficulty] = (difficultyCount[p.difficulty] || 0) + 1;
    });

    return { total, typeCount, difficultyCount };
  }, [problems]);

  if (problems.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
      {/* Total */}
      <div className="bg-surface-container-lowest rounded-xl p-4 shadow-ambient">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-on-surface-variant/60">{chapterName || '章节题目'}</p>
            <p className="text-2xl font-bold text-on-surface">{stats.total}</p>
          </div>
        </div>
      </div>

      {/* Type distribution */}
      <div className="bg-surface-container-lowest rounded-xl p-4 shadow-ambient">
        <div className="flex items-center gap-3 mb-2">
          <Layers className="w-5 h-5 text-primary-container" />
          <p className="text-xs text-on-surface-variant/60">题型</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(stats.typeCount).map(([type, count]) => (
            <span key={type} className="px-2 py-0.5 rounded-md bg-surface-container-high text-xs text-on-surface-variant">
              {problemTypeMap[type as keyof typeof problemTypeMap]} {count}
            </span>
          ))}
        </div>
      </div>

      {/* Difficulty distribution */}
      <div className="bg-surface-container-lowest rounded-xl p-4 shadow-ambient">
        <div className="flex items-center gap-3 mb-2">
          <TrendingUp className="w-5 h-5 text-amber-500" />
          <p className="text-xs text-on-surface-variant/60">难度</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(stats.difficultyCount).map(([diff, count]) => {
            const colors: Record<string, string> = {
              easy: 'bg-green-100 text-green-700',
              medium: 'bg-amber-100 text-amber-700',
              hard: 'bg-red-100 text-red-700',
            };
            const labels: Record<string, string> = { easy: '基础', medium: '中等', hard: '困难' };
            return (
              <span key={diff} className={`px-2 py-0.5 rounded-md text-xs font-medium ${colors[diff] || ''}`}>
                {labels[diff] || diff} {count}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
