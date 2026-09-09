"use client";

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Download } from 'lucide-react';
import type { Problem } from '@/lib/types';

const ProblemExportDialog = dynamic(() => import('./ProblemExportDialog').then(module => module.ProblemExportDialog), {
  ssr: false,
  loading: () => <span role="status" className="text-xs text-on-surface-variant">正在打开导出…</span>,
});

export function ProblemExportButton({ problems, title, initialSelectedIds, draft = false, label = '导出题目' }: {
  problems: Problem[]; title: string; initialSelectedIds?: string[]; draft?: boolean; label?: string;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" disabled={!problems.length} onClick={() => setOpen(true)} className={`control-button min-h-11 px-3 text-xs ${initialSelectedIds ? 'control-button-primary' : ''}`}><Download className="h-4 w-4" />{label}</button>
    {open && <ProblemExportDialog problems={problems} title={title} initialSelectedIds={initialSelectedIds} draft={draft} onClose={() => setOpen(false)} />}
  </>;
}
