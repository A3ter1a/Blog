import type { Problem } from './types';

/** Preserve source order and numbering even for a sparse selection. */
export function problemsToStudyMarkdown(title: string, problems: Problem[], selectedIds: readonly string[], includeSolutions = false): string {
  const selected = new Set(selectedIds);
  const entries = problems.flatMap((problem, index) => {
    if (!selected.has(problem.id)) return [];
    const sections = [`## 第 ${index + 1} 题`, problem.question];
    if (problem.options?.length) sections.push(problem.options.map(option => `${option.label}. ${option.content}`).join('\n\n'));
    if (includeSolutions) {
      if (problem.answer?.trim()) sections.push(`### 答案\n\n${problem.answer}`);
      if (problem.explanation?.trim()) sections.push(`### 解析\n\n${problem.explanation}`);
    }
    return [sections.join('\n\n')];
  });
  return [`# ${title.trim() || '数学题集'}`, `共 ${entries.length} 道题，保留原题集题号。`, ...entries].join('\n\n') + '\n';
}

/** Shift extends the clicked checkbox's intended state over the ordered range. */
export function toggleProblemRange(current: readonly string[], orderedIds: readonly string[], id: string, anchor: string | null, shift: boolean): string[] {
  const selected = new Set(current);
  const end = orderedIds.indexOf(id);
  if (end < 0) return [...current];
  const start = anchor === null ? -1 : orderedIds.indexOf(anchor);
  const affected = shift && start >= 0 ? orderedIds.slice(Math.min(start, end), Math.max(start, end) + 1) : [id];
  const remove = selected.has(id);
  for (const key of affected) { if (remove) selected.delete(key); else selected.add(key); }
  return [...selected];
}
