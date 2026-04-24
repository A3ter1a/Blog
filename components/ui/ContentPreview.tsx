"use client";

import { useRef, useEffect } from "react";
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
 */
export function ContentPreview({ content, className = "" }: ContentPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!containerRef.current) return;

      const html = md.render(preprocessLatex(content));
      containerRef.current.innerHTML = html;

      // Process KaTeX formulas and add heading IDs for TOC
      processContent(containerRef.current);
    }, 60); // Short debounce for responsive side-by-side preview
    return () => clearTimeout(timer);
  }, [content]);

  return (
    <div
      ref={containerRef}
      className={`prose prose-sm max-w-none ${className}`}
    />
  );
}
