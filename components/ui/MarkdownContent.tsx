"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import { Markdown } from "tiptap-markdown";
import { ProblemBlock } from "@/lib/problem-block-extension";
import { useEffect, useRef } from "react";
import katex from "katex";

interface MarkdownContentProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
}

export function MarkdownContent({ content, className = "", style }: MarkdownContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline",
        },
      }),
      Highlight.configure({
        multicolor: true,
      }),
      ProblemBlock,
      Markdown.configure({
        html: false,
        breaks: true,
      }),
    ],
    content,
    editable: false,
    immediatelyRender: false,
  });

  // Render LaTeX after editor content is ready
  useEffect(() => {
    if (!editor || !containerRef.current) return;

    const renderLaTeX = () => {
      const container = containerRef.current;
      if (!container) return;

      // Process block math $$...$$
      const walkTextNodes = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || "";
          
          // Replace block math $$...$$
          if (text.includes("$$")) {
            const parent = node.parentNode;
            if (!parent) return;

            const parts = text.split(/\$\$([\s\S]*?)\$\$/);
            if (parts.length === 1) return;

            const fragment = document.createDocumentFragment();
            parts.forEach((part, index) => {
              if (index % 2 === 0) {
                // Regular text
                if (part) fragment.appendChild(document.createTextNode(part));
              } else {
                // LaTeX
                try {
                  const latex = part.replace(/[\n\r]+/g, " ").trim();
                  const span = document.createElement("span");
                  span.className = "katex-display";
                  span.innerHTML = katex.renderToString(latex, {
                    throwOnError: false,
                    displayMode: true,
                  });
                  fragment.appendChild(span);
                } catch {
                  fragment.appendChild(document.createTextNode(`$$${part}$$`));
                }
              }
            });

            parent.replaceChild(fragment, node);
          }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          // Don't process already-rendered KaTeX
          if ((node as Element).classList?.contains("katex")) return;
          
          // Process child nodes
          const children = Array.from(node.childNodes);
          children.forEach(walkTextNodes);
        }
      };

      // Process inline math $...$ (but not $$...$$)
      const processInlineMath = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || "";
          
          // Match $...$ but not $$...$$
          const inlineMathRegex = /(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g;
          if (!inlineMathRegex.test(text)) return;
          inlineMathRegex.lastIndex = 0;

          const parent = node.parentNode;
          if (!parent) return;

          const parts = text.split(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g);
          if (parts.length === 1) return;

          const fragment = document.createDocumentFragment();
          parts.forEach((part, index) => {
            if (index % 2 === 0) {
              if (part) fragment.appendChild(document.createTextNode(part));
            } else {
              try {
                const latex = part.trim();
                const span = document.createElement("span");
                span.className = "katex";
                span.innerHTML = katex.renderToString(latex, {
                  throwOnError: false,
                  displayMode: false,
                });
                fragment.appendChild(span);
              } catch {
                fragment.appendChild(document.createTextNode(`$${part}$`));
              }
            }
          });

          parent.replaceChild(fragment, node);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          if ((node as Element).classList?.contains("katex")) return;
          const children = Array.from(node.childNodes);
          children.forEach(processInlineMath);
        }
      };

      walkTextNodes(container);
      processInlineMath(container);
    };

    // Wait for editor to render
    const timeout = setTimeout(renderLaTeX, 100);
    return () => clearTimeout(timeout);
  }, [editor, content]);

  if (!editor) return null;

  return (
    <div
      ref={containerRef}
      className={`markdown-content prose prose-sm max-w-none ${className}`}
      style={{ fontSize: style?.fontSize || "inherit" }}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
