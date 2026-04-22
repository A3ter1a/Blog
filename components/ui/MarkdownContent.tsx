"use client";

import { useMemo } from "react";
import katex from "katex";

interface MarkdownContentProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
}

// Simple Markdown to HTML converter with KaTeX support
function markdownToHtml(md: string): string {
  let html = md;

  // Extract and protect LaTeX blocks
  const latexBlocks: { token: string; latex: string; displayMode: boolean }[] = [];
  let counter = 0;

  // Extract block math $$...$$
  html = html.replace(/\$\$([\s\S]*?)\$\$/g, (match, latex) => {
    const token = `%%LATEX${counter++}%%`;
    latexBlocks.push({ token, latex: latex.trim(), displayMode: true });
    return token;
  });

  // Extract inline math $...$
  html = html.replace(/\$([^\$\n]+?)\$/g, (match, latex) => {
    const token = `%%LATEX${counter++}%%`;
    latexBlocks.push({ token, latex: latex.trim(), displayMode: false });
    return token;
  });

  // Process Markdown
  html = html
    // Escape HTML special chars (but not our tokens)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Headers
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold & Italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr/>')
    // Blockquotes
    .replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
    // Unordered lists
    .replace(/^[\*-] (.+)$/gm, '<li>$1</li>')
    // Ordered lists  
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Wrap list items
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Convert line breaks to paragraphs
  const blocks = html.split(/\n\n+/);
  html = blocks.map(block => {
    block = block.trim();
    if (!block) return '';
    if (block.startsWith('<h') || block.startsWith('<ul') || block.startsWith('<ol') || 
        block.startsWith('<pre') || block.startsWith('<blockquote') || block.startsWith('<hr')) {
      return block;
    }
    // Convert single newlines to <br>
    block = block.replace(/\n/g, '<br/>');
    return `<p>${block}</p>`;
  }).join('\n');

  // Restore LaTeX
  latexBlocks.forEach(({ token, latex, displayMode }) => {
    try {
      const rendered = katex.renderToString(latex, {
        throwOnError: false,
        displayMode,
      });
      html = html.replace(token, rendered);
    } catch (e) {
      html = html.replace(token, `<span class="text-red-500">${latex}</span>`);
    }
  });

  return html;
}

export function MarkdownContent({ content, className = "", style }: MarkdownContentProps) {
  const html = useMemo(() => markdownToHtml(content), [content]);

  return (
    <div
      className={`markdown-content ${className}`}
      style={{ fontSize: style?.fontSize || 'inherit' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
