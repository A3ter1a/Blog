"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import katex from "katex";
import GithubSlugger from "github-slugger";
import { renderMarkdownToHtml } from "@/lib/markdown";
import { restoreLatexLineBreaks } from "@/lib/utils";
import "katex/dist/katex.min.css";

interface MarkdownContentProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
  compact?: boolean;
}

const DISPLAY_MATH_ENV_PATTERN = /\\begin\{(?:align|equation|gather|aligned|split|cases|multline|array|matrix|pmatrix|bmatrix|vmatrix|Vmatrix)\*?\}/;

export function processContent(container: HTMLElement) {
  const slugger = new GithubSlugger();
  const headings = container.querySelectorAll("h1, h2, h3, h4, h5, h6");
  headings.forEach((heading) => {
    const text = heading.textContent || "";
    heading.id = slugger.slug(text);
  });

  const processInlineMath = (textNode: Text) => {
    const text = textNode.textContent || "";
    if (!/\$(?!\$)[\s\S]+?\$(?!\$)/.test(text)) return;

    const parent = textNode.parentNode;
    if (!parent) return;

    const parts = text.split(/(?<!\$)\$(?!\$)([\s\S]+?)(?<!\$)\$(?!\$)/g);
    if (parts.length === 1) return;

    const fragment = document.createDocumentFragment();
    parts.forEach((part, index) => {
      if (index % 2 === 0) {
        if (part) fragment.appendChild(document.createTextNode(part));
        return;
      }

      const latex = restoreLatexLineBreaks(part).trim();
      const displayMode = DISPLAY_MATH_ENV_PATTERN.test(latex);
      const span = document.createElement("span");
      span.className = displayMode ? "katex-display" : "katex-inline";
      try {
        span.innerHTML = katex.renderToString(latex, {
          throwOnError: false,
          displayMode,
        });
        fragment.appendChild(span);
      } catch {
        fragment.appendChild(document.createTextNode(`$${latex}$`));
      }
    });

    parent.replaceChild(fragment, textNode);
  };

  const processNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      if (!text.includes("$")) return;

      const parent = node.parentNode as Element | null;
      if (!parent) return;
      if (
        parent.closest(".katex, .katex-display, .katex-html, code, pre")
      ) {
        return;
      }

      if (text.includes("$$")) {
        const parts = text.split(/\$\$([\s\S]*?)\$\$/);
        if (parts.length === 1) {
          processInlineMath(node as Text);
          return;
        }

        const fragment = document.createDocumentFragment();
        parts.forEach((part, index) => {
          if (index % 2 === 0) {
            if (part) fragment.appendChild(document.createTextNode(part));
            return;
          }

          const span = document.createElement("span");
          span.className = "katex-display";
          const latex = restoreLatexLineBreaks(part).replace(/[\n\r]+/g, " ").trim();
          try {
            span.innerHTML = katex.renderToString(
              latex,
              { throwOnError: false, displayMode: true }
            );
            fragment.appendChild(span);
          } catch {
            fragment.appendChild(document.createTextNode(`$$${latex}$$`));
          }
        });

        parent.replaceChild(fragment, node);
        return;
      }

      processInlineMath(node as Text);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    if (element.closest(".katex, .katex-display, .katex-html, code, pre")) return;
    Array.from(node.childNodes).forEach(processNode);
  };

  processNode(container);
}

export function MarkdownContent({
  content,
  className = "",
  style,
  compact = false,
}: MarkdownContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const htmlContent = useMemo(() => renderMarkdownToHtml(content), [content]);

  useLayoutEffect(() => {
    if (containerRef.current) {
      processContent(containerRef.current);
    }
  });

  useEffect(() => {
    const process = () => {
      if (containerRef.current) {
        processContent(containerRef.current);
      }
    };

    const frame = requestAnimationFrame(process);
    const lateFrame = window.setTimeout(process, 120);
    const animationFrame = window.setTimeout(process, 320);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(lateFrame);
      window.clearTimeout(animationFrame);
    };
  });

  return (
    <div
      ref={containerRef}
      className={`markdown-surface ${compact ? "markdown-compact" : ""} ${className}`}
      style={style}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}
