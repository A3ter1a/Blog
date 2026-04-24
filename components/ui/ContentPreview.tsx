"use client";

import { useRef, useEffect, useMemo, useState } from "react";
import markdownit from "markdown-it";
import { preprocessLatex } from "@/lib/utils";
import { processContent } from "./MarkdownContent";
import "katex/dist/katex.min.css";

// Reusable markdown-it instance (no state, so safe at module level)
const md = markdownit({ html: false, breaks: true });

interface ContentPreviewProps {
  content: string;
  className?: string;
}

/**
 * Lightweight live preview component for rendering Markdown.
 * Unlike MarkdownContent which uses TipTap, this renders directly
 * with markdown-it + KaTeX — avoids the overhead of TipTap editor
 * recreation on every keystroke.
 *
 * Uses the same double-requestAnimationFrame + retry pattern as
 * MarkdownContent to ensure KaTeX formulas are caught reliably.
 */
export function ContentPreview({ content, className = "" }: ContentPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);
  const prevHtmlRef = useRef<string>("");

  // Preprocess LaTeX + render Markdown to HTML (memoized)
  const htmlContent = useMemo(() => {
    return md.render(preprocessLatex(content));
  }, [content]);

  // Primary render: set innerHTML and process KaTeX after DOM settles
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      if (htmlContent === prevHtmlRef.current) return;

      containerRef.current.innerHTML = htmlContent;
      prevHtmlRef.current = htmlContent;

      // Double rAF ensures the DOM is fully painted before KaTeX processing,
      // matching the pattern used in MarkdownContent's handleEditorReady
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (containerRef.current) {
            processContent(containerRef.current);
            setIsReady(true);
          }
        });
      });
    }, 60); // Short debounce for responsive side-by-side preview
    return () => clearTimeout(timer);
  }, [htmlContent]);

  // Retry: Re-process content after initial render to catch any formulas
  // that may have been deferred (matching MarkdownContent retry pattern)
  useEffect(() => {
    if (!isReady) return;
    const timer = setTimeout(() => {
      if (containerRef.current) {
        processContent(containerRef.current);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [isReady, htmlContent]);

  return (
    <div
      ref={containerRef}
      className={`prose prose-sm max-w-none ${className}`}
    />
  );
}
