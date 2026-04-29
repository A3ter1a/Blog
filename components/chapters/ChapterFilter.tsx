'use client';

import type { Chapter } from '@/lib/types';
import { Layers } from 'lucide-react';

interface ChapterFilterProps {
  chapters: Chapter[];
  selectedId?: string;
  onSelect: (chapterId: string | undefined) => void;
  className?: string;
}

export function ChapterFilter({ chapters, selectedId, onSelect, className = '' }: ChapterFilterProps) {
  if (chapters.length === 0) return null;

  const topLevel = chapters.filter(c => !c.parentId);

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/10">
        <Layers className="w-4 h-4 text-on-surface-variant" />
        <span className="text-xs font-bold text-on-surface">章节筛选</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onSelect(undefined)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            !selectedId
              ? 'editorial-gradient text-on-primary shadow-ambient'
              : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
          }`}
        >
          全部
        </button>
        {topLevel.map(chapter => (
          <button
            key={chapter.id}
            onClick={() => onSelect(chapter.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedId === chapter.id
                ? 'editorial-gradient text-on-primary shadow-ambient'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {chapter.name}
          </button>
        ))}
      </div>
    </div>
  );
}
