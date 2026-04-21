import JSZip from 'jszip';
import { Note, typeMap, subjectMap, problemTypeMap } from './types';

/**
 * Convert a single note to Markdown format with front matter
 */
export function noteToMarkdown(note: Note): string {
  const frontMatter = `---
title: "${note.title.replace(/"/g, '\\"')}"
type: ${note.type}
${note.subject ? `subject: ${note.subject}` : ''}
tags:
${note.tags.map(tag => `  - "${tag.replace(/"/g, '\\"')}"`).join('\n')}
created: ${note.createdAt.toISOString()}
updated: ${note.updatedAt.toISOString()}
${note.coverImage ? `coverImage: "${note.coverImage}"` : ''}
---

`;

  let content = frontMatter;
  content += `# ${note.title}\n\n`;

  if (note.type === 'problem' && note.problems && note.problems.length > 0) {
    note.problems.forEach((problem, index) => {
      content += `## 题目${index + 1} [${problemTypeMap[problem.type]}] [${problem.difficulty === 'easy' ? '基础' : problem.difficulty === 'medium' ? '中等' : '困难'}]\n\n`;
      content += `**题目**: ${problem.question}\n\n`;

      if (problem.options && problem.options.length > 0) {
        content += '**选项**:\n';
        problem.options.forEach(opt => {
          content += `- ${opt.label}. ${opt.content}\n`;
        });
        content += '\n';
      }

      content += `**答案**: ${problem.answer}\n\n`;
      content += `**解析**: ${problem.explanation}\n\n`;

      if (problem.source) {
        content += `**来源**: ${problem.source}\n\n`;
      }

      if (problem.tips) {
        content += `**提示**: ${problem.tips}\n\n`;
      }

      content += '---\n\n';
    });
  } else {
    content += note.content;
  }

  return content;
}

/**
 * Convert a single note to Obsidian format with wiki-style links
 */
export function noteToObsidian(note: Note, allNotes?: Note[]): string {
  let content = noteToMarkdown(note);

  // Convert [[wiki links]] if allNotes provided
  if (allNotes) {
    content = convertToWikiLinks(content, allNotes);
  }

  return content;
}

/**
 * Convert standard Markdown links to wiki-style [[links]]
 */
function convertToWikiLinks(content: string, allNotes: Note[]): string {
  return content.replace(/\[([^\]]+)\]\([^)]+\)/g, (match, text) => {
    const note = allNotes.find(n => n.title.includes(text) || text.includes(n.title));
    if (note) {
      return `[[${note.title}]]`;
    }
    return match;
  });
}

/**
 * Export notes as JSON and trigger download
 */
export function exportAsJSON(notes: Note[]): void {
  const data = JSON.stringify(notes, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `asteroid-notes-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export notes as Markdown files (single or ZIP for multiple)
 */
export async function exportAsMarkdown(notes: Note[]): Promise<void> {
  if (notes.length === 0) return;

  if (notes.length === 1) {
    // Single note: download as .md
    const content = noteToMarkdown(notes[0]);
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFileName(notes[0].title)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } else {
    // Multiple notes: download as ZIP
    const zip = new JSZip();

    for (const note of notes) {
      const content = noteToMarkdown(note);
      const filename = `${sanitizeFileName(note.title)}.md`;
      zip.file(filename, content);
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `asteroid-notes-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

/**
 * Export notes as Obsidian format (always ZIP for compatibility)
 */
export async function exportAsObsidian(notes: Note[]): Promise<void> {
  if (notes.length === 0) return;

  const zip = new JSZip();

  for (const note of notes) {
    const content = noteToObsidian(note, notes);
    const filename = `${sanitizeFileName(note.title)}.md`;
    zip.file(filename, content);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `asteroid-obsidian-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Sanitize filename for safe file operations
 */
function sanitizeFileName(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '-').substring(0, 100);
}
