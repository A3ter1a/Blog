'use client';

import { useState, useEffect, useCallback, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Layers } from 'lucide-react';
import type { Chapter } from '@/lib/types';
import { chaptersApi } from '@/lib/chapters-api';
import { getChildChapters, getRootChapters } from '@/lib/chapter-utils';
import { scheduleDeferredClientWork } from '@/lib/deferred-client-work';

interface ChapterSelectorProps {
  noteId?: string;
  chapters?: Chapter[];
  isLoading?: boolean;
  value?: string;
  onChange: (chapterId: string | undefined) => void;
  className?: string;
  placement?: 'top' | 'bottom';
}

const DROPDOWN_MAX_HEIGHT = 300;
const DROPDOWN_MIN_HEIGHT = 140;
const DROPDOWN_MARGIN = 10;

export function ChapterSelector({
  noteId,
  chapters,
  isLoading: isLoadingExternal = false,
  value,
  onChange,
  className = '',
  placement = 'bottom',
}: ChapterSelectorProps) {
  const [loadedChapters, setLoadedChapters] = useState<Chapter[]>([]);
  const [isLoadingLocal, setIsLoadingLocal] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isControlled = chapters !== undefined;
  const displayedChapters = chapters ?? loadedChapters;
  const isLoadingChapters = isControlled ? isLoadingExternal : isLoadingLocal;

  const loadChapters = useCallback(async () => {
    if (isControlled) return;
    setIsLoadingLocal(true);
    try {
      const data = noteId ? await chaptersApi.getByNoteId(noteId) : await chaptersApi.getTemplates();
      setLoadedChapters(data);
    } catch {
      setLoadedChapters([]);
    } finally {
      setIsLoadingLocal(false);
    }
  }, [isControlled, noteId]);

  useEffect(() => {
    if (isControlled) return;
    return scheduleDeferredClientWork(() => {
      void loadChapters();
    });
  }, [isControlled, loadChapters]);

  const selected = displayedChapters.find(c => c.id === value);
  const topLevel = getRootChapters(displayedChapters);
  const getChildren = useCallback(
    (parentId: string) => getChildChapters(displayedChapters, parentId),
    [displayedChapters],
  );

  const updateDropdownPosition = useCallback(() => {
    if (!buttonRef.current || typeof window === 'undefined') return;

    const rect = buttonRef.current.getBoundingClientRect();
    const availableAbove = rect.top - DROPDOWN_MARGIN;
    const availableBelow = window.innerHeight - rect.bottom - DROPDOWN_MARGIN;
    const shouldOpenTop = placement === 'top'
      ? availableAbove > DROPDOWN_MIN_HEIGHT || availableAbove > availableBelow
      : availableBelow < DROPDOWN_MIN_HEIGHT && availableAbove > availableBelow;
    const availableSpace = shouldOpenTop ? availableAbove : availableBelow;
    const maxHeight = Math.max(
      DROPDOWN_MIN_HEIGHT,
      Math.min(DROPDOWN_MAX_HEIGHT, availableSpace - 6),
    );
    const top = shouldOpenTop
      ? Math.max(DROPDOWN_MARGIN, rect.top - maxHeight - 6)
      : Math.min(window.innerHeight - DROPDOWN_MARGIN - DROPDOWN_MIN_HEIGHT, rect.bottom + 6);
    const left = Math.min(
      Math.max(DROPDOWN_MARGIN, rect.left),
      Math.max(DROPDOWN_MARGIN, window.innerWidth - rect.width - DROPDOWN_MARGIN),
    );

    setDropdownStyle({
      left,
      maxHeight,
      position: 'fixed',
      top,
      width: rect.width,
    });
  }, [placement]);

  useLayoutEffect(() => {
    if (isOpen) updateDropdownPosition();
  }, [isOpen, updateDropdownPosition]);

  useEffect(() => {
    if (!isOpen) return;

    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', updateDropdownPosition, true);

    return () => {
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', updateDropdownPosition, true);
    };
  }, [isOpen, updateDropdownPosition]);

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
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="field-control flex h-10 w-full items-center justify-between px-3 text-sm text-on-surface-variant hover:bg-surface-container-lowest"
      >
        <span className="flex items-center gap-2 truncate">
          <Layers className="w-3.5 h-3.5 flex-shrink-0" />
          <span className={selected ? 'text-on-surface font-medium' : ''}>
            {selected ? selected.name : isLoadingChapters ? '加载章节中' : '选择章节'}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[110]" onClick={() => setIsOpen(false)} />
          <div className="surface-panel fixed z-[120] overflow-y-auto py-1 shadow-elevated" style={dropdownStyle}>
            {isLoadingChapters && (
              <div className="px-3 py-2 text-sm text-on-surface-variant/60">
                加载章节中
              </div>
            )}
            <button
              type="button"
              onClick={handleClear}
              className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-surface-container-low ${!value ? 'font-medium text-primary' : 'text-on-surface-variant/60'}`}
            >
              无章节
            </button>
            {!isLoadingChapters && topLevel.length === 0 && (
              <div className="px-3 py-2 text-sm text-on-surface-variant/50">
                暂无章节
              </div>
            )}
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
        </>,
        document.body,
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
