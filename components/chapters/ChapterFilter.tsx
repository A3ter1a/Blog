'use client';

import type { Chapter } from '@/lib/types';
import { Layers } from 'lucide-react';

interface ChapterFilterProps {
  chapters: Chapter[];
  selectedId?: string;
  onSelect: (chapterId: string | undefined) => void;
  className?: string;
}

function ChapterNode({
  chapter,
  allChapters,
  selectedId,
  onSelect,
  depth = 0,
}: {
  chapter: Chapter;
  allChapters: Chapter[];
  selectedId?: string;
  onSelect: (id: string) => void;
  depth?: number;
}) {
  const children = allChapters.filter(c => c.parentId === chapter.id);

  return (
    <div>
      <button
        onClick={() => onSelect(chapter.id)}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all w-full text-left ${
          selectedId === chapter.id
            ? 'editorial-gradient text-on-primary shadow-ambient'
            : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
        }`}
        style={{ marginLeft: `${depth * 16}px`, width: `calc(100% - ${depth * 16}px)` }}
      >
        {chapter.name}
      </button>
      {children.length > 0 && (
        <div className="mt-1">
          {children.map(child => (
            <ChapterNode
              key={child.id}
              chapter={child}
              allChapters={allChapters}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
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
      <div className="space-y-1">
        <button
          onClick={() => onSelect(undefined)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all w-full text-left ${
            !selectedId
              ? 'editorial-gradient text-on-primary shadow-ambient'
              : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
          }`}
        >
          全部
        </button>
        {topLevel.map(chapter => (
          <ChapterNode
            key={chapter.id}
            chapter={chapter}
            allChapters={chapters}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
