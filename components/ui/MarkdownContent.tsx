"use client";

import { useMemo } from "react";
import MarkdownIt from "markdown-it";
import katex from "katex";

// Create markdown-it instance with standard config
const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: false,
  typographer: false,
});

interface MarkdownContentProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Render Markdown with LaTeX support.
 * Strategy: extract LaTeX blocks first with tokens, render markdown, then restore LaTeX.
 */
function renderMarkdown(content: string): string {
  const latexEntries: { token: string; latex: string; displayMode: boolean }[] = [];
  let counter = 0;

  // Step 1: Extract block math $$...$$
  let text = content.replace(/\$\$([\s\S]*?)\$\$/g, (_match, latex) => {
    const token = `\x00LATEX${counter++}\x00`;
    latexEntries.push({ token, latex: latex.replace(/[\n\r]+/g, " ").trim(), displayMode: true });
    return token;
  });

  // Step 2: Extract inline math $...$ (not $$)
  text = text.replace(/(?<!\$)\$(?!\$)([^\$\n]+?)(?<!\$)\$(?!\$)/g, (_match, latex) => {
    const token = `\x00LATEX${counter++}\x00`;
    latexEntries.push({ token, latex: latex.trim(), displayMode: false });
    return token;
  });

  // Step 3: Render markdown via markdown-it
  let html = md.render(text);

  // Step 4: Restore LaTeX
  latexEntries.forEach(({ token, latex, displayMode }) => {
    try {
      const rendered = katex.renderToString(latex, { throwOnError: false, displayMode });
      html = html.split(token).join(rendered);
    } catch {
      html = html.split(token).join(`<span class="text-red-500">${latex}</span>`);
    }
  });

  return html;
}

export function MarkdownContent({ content, className = "", style }: MarkdownContentProps) {
  const html = useMemo(() => renderMarkdown(content), [content]);

  return (
    <div
      className={`prose prose-sm max-w-none ${className}`}
      style={{ fontSize: style?.fontSize || "inherit" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
