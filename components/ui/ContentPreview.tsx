"use client";

import { useRef, useEffect, useMemo, useState } from "react";
import markdownit from "markdown-it";
import markdownitMark from "markdown-it-mark";
import { preprocessLatex, preprocessDashedSep, postprocessDashedSepAsHtml } from "@/lib/utils";
import { processContent } from "./MarkdownContent";
import "katex/dist/katex.min.css";

// Reusable markdown-it instance (no state, so safe at module level)
const md = markdownit({ html: false, breaks: true }).use(markdownitMark);

interface ContentPreviewProps {
  content: string;
  className?: string;
}

/**
 * Lightweight live preview component for rendering Markdown.
 * Renders directly with markdown-it + KaTeX — avoids TipTap overhead.
 *
 * Uses a single-phase render with double-requestAnimationFrame to ensure
 * the DOM is painted before KaTeX processing. Unlike MarkdownContent
 * (which uses TipTap and needs a 200ms retry for deferred node views),
 * ContentPreview renders synchronously into innerHTML so a single
 * pass is sufficient — no retry needed.
 */
export function ContentPreview({ content, className = "" }: ContentPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const processedHtmlRef = useRef<string>("");

  // Preprocess LaTeX + render Markdown to HTML (memoized)
  const htmlContent = useMemo(() => {
    const processed = preprocessLatex(content);
    const markdown = preprocessDashedSep(processed);
    const html = md.render(markdown);
    return postprocessDashedSepAsHtml(html);
  }, [content]);

  // Single-phase render: set innerHTML, then process KaTeX after DOM settles.
  // Uses 80ms debounce to batch rapid keystrokes without visible lag.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      if (htmlContent === processedHtmlRef.current) return;

      // Replace content — this clears previous KaTeX output
      containerRef.current.innerHTML = htmlContent;
      processedHtmlRef.current = htmlContent;

      // Double rAF ensures the DOM is fully painted before KaTeX processing
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (containerRef.current) {
            processContent(containerRef.current);
          }
        });
      });
    }, 80);

    return () => clearTimeout(timer);
  }, [htmlContent]);

  return (
    <div
      ref={containerRef}
      className={`prose max-w-none
        [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4
        [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mb-3
        [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mb-2
        [&_h4]:text-base [&_h4]:font-semibold [&_h4]:mb-2
        [&_hr]:my-4 [&_hr]:border-outline-variant/20
        [&_hr.dashed-separator]:my-6 [&_hr.dashed-separator]:border-0 [&_hr.dashed-separator]:border-t [&_hr.dashed-separator]:border-dashed [&_hr.dashed-separator]:border-outline-variant/30
        [&_mark]:rounded-sm [&_mark]:px-1 [&_mark]:py-0.5
        ${className}`}
    />
  );
}
