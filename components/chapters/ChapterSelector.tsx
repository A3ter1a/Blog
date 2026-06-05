'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, Layers } from 'lucide-react';
import type { Chapter } from '@/lib/types';
import { chaptersApi } from '@/lib/chapters-api';
import { getChildChapters, getRootChapters } from '@/lib/chapter-utils';

interface ChapterSelectorProps {
  noteId?: string;
  value?: string;
  onChange: (chapterId: string | undefined) => void;
  className?: string;
  placement?: 'top' | 'bottom';
}

export function ChapterSelector({ noteId, value, onChange, className = '', placement = 'bottom' }: ChapterSelectorProps) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const loadChapters = useCallback(async () => {
    try {
      const data = noteId ? await chaptersApi.getByNoteId(noteId) : await chaptersApi.getTemplates();
      setChapters(data);
    } catch { /* ignore */ }
  }, [noteId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadChapters();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadChapters]);

  const selected = chapters.find(c => c.id === value);
  const topLevel = getRootChapters(chapters);
  const dropdownPlacementClass = placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1';
  const getChildren = useCallback(
    (parentId: string) => getChildChapters(chapters, parentId),
    [chapters],
  );

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
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="field-control flex h-10 w-full items-center justify-between px-3 text-sm text-on-surface-variant hover:bg-surface-container-lowest"
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
          <div className={`surface-panel absolute ${dropdownPlacementClass} left-0 right-0 z-20 max-h-60 overflow-y-auto py-1`}>
            <button
              type="button"
              onClick={handleClear}
              className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-surface-container-low ${!value ? 'font-medium text-primary' : 'text-on-surface-variant/60'}`}
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
        type="button"
        onClick={() => onSelect(chapter.id)}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-container-low ${
          isSelected ? 'bg-primary/5 font-medium text-primary' : 'text-on-surface-variant'
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
