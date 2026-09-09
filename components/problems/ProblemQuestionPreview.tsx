"use client";

import { useEffect, useId, useRef, useState } from 'react';
import type { Problem } from '@/lib/types';
import { MarkdownContent } from '@/components/ui/MarkdownContent';

/** Reading the complete question never opens an editing form. */
export function ProblemQuestionPreview({ problem }: { problem: Problem }) {
  const [expanded, setExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const element = contentRef.current;
    if (!element || expanded) return;
    const observer = new ResizeObserver(() => setHasOverflow(element.scrollHeight > element.clientHeight + 1));
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded, problem.question, problem.options]);
  return <div className="min-w-0">
    <div ref={contentRef} id={id} className={`${expanded ? '' : 'max-h-48 overflow-hidden'} space-y-3 text-sm leading-7 text-on-surface sm:text-[15px]`}>
      <MarkdownContent content={problem.question || '（无题目内容）'} compact />
      {problem.options?.map((option, index) => <div key={index} className="flex items-start gap-2">
        <span className="shrink-0 font-medium">{option.label}.</span>
        <div className="min-w-0"><MarkdownContent content={option.content} compact /></div>
      </div>)}
    </div>
    {(hasOverflow || expanded) && <button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)} className="control-button mt-2 min-h-11 px-3 text-xs">
      {expanded ? '收起全文' : '查看全文'}
    </button>}
  </div>;
}
