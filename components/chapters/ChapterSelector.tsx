'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, Layers } from 'lucide-react';
import type { Chapter } from '@/lib/types';
import { chaptersApi } from '@/lib/chapters-api';

interface ChapterSelectorProps {
  noteId?: string;
  value?: string;
  onChange: (chapterId: string | undefined) => void;
  className?: string;
}

export function ChapterSelector({ noteId, value, onChange, className = '' }: ChapterSelectorProps) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const loadChapters = useCallback(async () => {
    try {
      const data = noteId ? await chaptersApi.getByNoteId(noteId) : await chaptersApi.getTemplates();
      setChapters(data);
    } catch { /* ignore */ }
  }, [noteId]);

  useEffect(() => { loadChapters(); }, [loadChapters]);

  const selected = chapters.find(c => c.id === value);
  const topLevel = chapters.filter(c => !c.parentId);
  const getChildren = (parentId: string) => chapters.filter(c => c.parentId === parentId);

  const handleSelect = (chapterId: string) => {
    onChange(chapterId === value ? undefined : chapterId);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange(undefined);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 bg-surface-container rounded-lg text-sm text-on-surface-variant hover:bg-surface-container-high transition-colors border border-outline-variant/10"
      >
        <span className="flex items-center gap-2 truncate">
          <Layers className="w-3.5 h-3.5 flex-shrink-0" />
          <span className={selected ? 'text-on-surface font-medium' : ''}>
            {selected ? selected.name : '选择章节'}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-surface-container-lowest rounded-xl shadow-elevated border border-outline-variant/10 py-1 max-h-60 overflow-y-auto">
            <button
              onClick={handleClear}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-surface-container-low transition-colors ${!value ? 'text-primary font-medium' : 'text-on-surface-variant/50'}`}
            >
              无章节
            </button>
            {topLevel.map(chapter => (
              <ChapterOption
                key={chapter.id}
                chapter={chapter}
                depth={0}
                isSelected={chapter.id === value}
                selectedValue={value}
                onSelect={handleSelect}
                getChildren={getChildren}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ChapterOption({ chapter, depth, isSelected, onSelect, getChildren, selectedValue }: {
  chapter: Chapter;
  depth: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
  getChildren: (parentId: string) => Chapter[];
  selectedValue?: string;
}) {
  const children = getChildren(chapter.id);

  return (
    <>
      <button
        onClick={() => onSelect(chapter.id)}
        className={`w-full px-3 py-2 text-left text-sm hover:bg-surface-container-low transition-colors flex items-center gap-2 ${
          isSelected ? 'text-primary font-medium bg-primary/5' : 'text-on-surface-variant'
        }`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        <Layers className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate">{chapter.name}</span>
      </button>
      {children.map(child => (
        <ChapterOption
          key={child.id}
          chapter={child}
          depth={depth + 1}
          isSelected={child.id === selectedValue}
          selectedValue={selectedValue}
          onSelect={onSelect}
          getChildren={getChildren}
        />
      ))}
    </>
  );
}
