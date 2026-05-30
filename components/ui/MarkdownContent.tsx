"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import katex from "katex";
import GithubSlugger from "github-slugger";
import { renderMarkdownToHtml } from "@/lib/markdown";
import "katex/dist/katex.min.css";

interface MarkdownContentProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
  compact?: boolean;
}

export function processContent(container: HTMLElement) {
  const slugger = new GithubSlugger();
  const headings = container.querySelectorAll("h1, h2, h3, h4, h5, h6");
  headings.forEach((heading) => {
    const text = heading.textContent || "";
    heading.id = slugger.slug(text);
  });

  const processInlineMath = (textNode: Text) => {
    const text = textNode.textContent || "";
    if (!/\$(?!\$).+?\$(?!\$)/.test(text)) return;

    const parent = textNode.parentNode;
    if (!parent) return;

    const parts = text.split(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g);
    if (parts.length === 1) return;

    const fragment = document.createDocumentFragment();
    parts.forEach((part, index) => {
      if (index % 2 === 0) {
        if (part) fragment.appendChild(document.createTextNode(part));
        return;
      }

      const span = document.createElement("span");
      span.className = "katex-inline";
      try {
        span.innerHTML = katex.renderToString(part.trim(), {
          throwOnError: false,
          displayMode: false,
        });
        fragment.appendChild(span);
      } catch {
        fragment.appendChild(document.createTextNode(`$${part}$`));
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
          try {
            span.innerHTML = katex.renderToString(
              part.replace(/[\n\r]+/g, " ").trim(),
              { throwOnError: false, displayMode: true }
            );
            fragment.appendChild(span);
          } catch {
            fragment.appendChild(document.createTextNode(`$$${part}$$`));
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
  }, [htmlContent]);

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
  }, [htmlContent]);

  return (
    <div
      ref={containerRef}
      className={`markdown-surface ${compact ? "markdown-compact" : ""} ${className}`}
      style={style}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}
