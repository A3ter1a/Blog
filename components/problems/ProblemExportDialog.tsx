"use client";

import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Download, X } from 'lucide-react';
import type { Problem } from '@/lib/types';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { problemsToStudyMarkdown, toggleProblemRange } from '@/lib/problem-export';
import { sanitizeFileName } from '@/lib/utils';
import { ProblemQuestionPreview } from './ProblemQuestionPreview';

export function ProblemExportDialog({ problems, title, initialSelectedIds, draft, onClose }: {
  problems: Problem[]; title: string; initialSelectedIds?: string[]; draft: boolean; onClose: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState(() => initialSelectedIds ?? problems.map(problem => problem.id));
  const [includeSolutions, setIncludeSolutions] = useState(false);
  const [visibleCount, setVisibleCount] = useState(12);
  const [message, setMessage] = useState('');
  const [copying, setCopying] = useState(false);
  const anchor = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useDialogFocus({ isOpen: true, onClose, containerRef, initialFocusRef: closeRef });
  const ids = problems.map(problem => problem.id);
  const available = new Set(ids);
  const selected = new Set(selectedIds.filter(id => available.has(id)));
  const allSelected = problems.length > 0 && selected.size === problems.length;
  const content = () => problemsToStudyMarkdown(title, problems, [...selected], includeSolutions);
  const copy = async () => {
    setCopying(true);
    try { await navigator.clipboard.writeText(content()); setMessage(`已复制 ${selected.size} 道题，可粘贴到 ChatGPT。`); }
    catch { setMessage('浏览器未允许复制，请下载 Markdown 文件。'); }
    finally { setCopying(false); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([content()], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sanitizeFileName(title.trim() || '数学题集')}-${selected.size}题.md`;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(`已导出 ${selected.size} 道题。`);
  };
  return createPortal(<div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
    <div ref={containerRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onClick={event => event.stopPropagation()} className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-surface-container-lowest text-on-surface shadow-elevated">
      <div className="flex shrink-0 items-center justify-between border-b border-outline-variant/10 px-4 py-3 sm:px-5">
        <div className="min-w-0"><h2 id={titleId} className="font-headline text-lg font-bold">导出题目</h2><p className="truncate text-xs text-on-surface-variant">{title || '数学题集'}</p></div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭导出" className="control-button h-11 w-11 shrink-0 p-0"><X className="h-5 w-5" /></button>
      </div>
      <div className="shrink-0 space-y-2 border-b border-outline-variant/10 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={allSelected} ref={element => { if (element) element.indeterminate = selected.size > 0 && !allSelected; }} onChange={() => { setSelectedIds(allSelected ? [] : ids); setMessage(''); }} className="h-4 w-4 accent-primary" />全选题集 · {problems.length} 题</label>
          <span className="text-sm font-medium" aria-live="polite">已选 {selected.size} 题</span>
          <button type="button" onClick={() => { setSelectedIds([]); setMessage(''); }} disabled={!selected.size} className="control-button min-h-11 px-3 text-xs">清空选择</button>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={includeSolutions} onChange={event => { setIncludeSolutions(event.target.checked); setMessage(''); }} className="h-4 w-4 accent-primary" />附带答案和解析</label>
        <p className="text-xs leading-5 text-on-surface-variant">保留原题号、公式和全部小问；全选包含尚未显示的题目。{draft ? '导出当前草稿，包含未保存的修改。' : ''}</p>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
        {problems.slice(0, visibleCount).map((problem, index) => <article key={problem.id} className={`surface-card p-3 sm:p-4 ${selected.has(problem.id) ? 'border-primary/45 bg-primary/[0.045]' : ''}`}>
          <label className="mb-2 flex min-h-11 cursor-pointer items-center gap-3 font-semibold"><input aria-label={`选择第 ${index + 1} 题`} type="checkbox" checked={selected.has(problem.id)} onClick={event => {
            const shift = event.shiftKey;
            const start = anchor.current;
            setSelectedIds(current => toggleProblemRange(current, ids, problem.id, start, shift));
            anchor.current = problem.id;
            setMessage('');
          }} onChange={() => {}} className="h-4 w-4 accent-primary" />第 {index + 1} 题</label>
          <ProblemQuestionPreview problem={problem} />
        </article>)}
        {visibleCount < problems.length && <button type="button" onClick={() => setVisibleCount(count => count + 12)} className="control-button min-h-11 w-full text-sm">继续显示 · {Math.min(visibleCount, problems.length)}/{problems.length}</button>}
      </div>
      <div className="shrink-0 border-t border-outline-variant/10 p-4 sm:px-5">
        <p role="status" className="mb-2 text-xs text-on-surface-variant">{message || `将导出 ${selected.size} 道完整题目`}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!selected.size || copying} onClick={() => void copy()} className="control-button control-button-primary min-h-11 flex-1 px-3 text-sm"><Copy className="h-4 w-4" />{copying ? '复制中…' : '复制题目'}</button>
          <button type="button" disabled={!selected.size} onClick={download} className="control-button min-h-11 flex-1 px-3 text-sm"><Download className="h-4 w-4" />下载 Markdown</button>
        </div>
      </div>
    </div>
  </div>, document.body);
}
