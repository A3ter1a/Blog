"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import { ProblemBlock } from "@/lib/problem-block-extension";
import { useRef, useCallback, useState, useEffect, useMemo } from "react";
import katex from "katex";
import GithubSlugger from "github-slugger";
import markdownit from "markdown-it";
import markdownitMark from "markdown-it-mark";
import { preprocessLatex } from "@/lib/utils";
import "katex/dist/katex.min.css";

interface MarkdownContentProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Process DOM nodes after TipTap renders:
 * 1. Add heading IDs for TOC navigation
 * 2. Render LaTeX formulas via KaTeX
 */
export function processContent(container: HTMLElement) {
  // Add IDs to heading elements for TOC navigation
  const slugger = new GithubSlugger();
  const headings = container.querySelectorAll("h1, h2, h3");
  headings.forEach((heading) => {
    const text = heading.textContent || "";
    const id = slugger.slug(text);
    heading.id = id;
  });

  // Helper: process inline math ($...$) in a single text node
  const processInlineMath = (textNode: Text) => {
    const text = textNode.textContent || "";
    if (!/\$(?!\$).+?\$(?!\$)/.test(text)) return;

    const parent = textNode.parentNode;
    if (!parent) return;

    const parts = text.split(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g);
    if (parts.length === 1) return;

    const frag = document.createDocumentFragment();
    parts.forEach((part, i) => {
      if (i % 2 === 0) {
        if (part) frag.appendChild(document.createTextNode(part));
      } else {
        try {
          const span = document.createElement("span");
          span.className = "katex";
          span.innerHTML = katex.renderToString(part.trim(), {
            throwOnError: false,
            displayMode: false,
          });
          frag.appendChild(span);
        } catch {
          frag.appendChild(document.createTextNode(`$${part}$`));
        }
      }
    });
    parent.replaceChild(frag, textNode);
  };

  // Process LaTeX in text nodes (skip nodes inside already-processed KaTeX spans)
  const processNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      if (!text.includes("$")) return; // Fast path: no LaTeX

      const parent = node.parentNode;
      if (!parent) return;
      // Skip if already inside a KaTeX-rendered node
      if ((parent as Element).classList?.contains("katex") ||
          (parent as Element).classList?.contains("katex-display")) {
        return;
      }

      // Process display math: $$...$$
      if (text.includes("$$")) {
        const parts = text.split(/\$\$([\s\S]*?)\$\$/);
        if (parts.length === 1) {
          // No complete $$...$$ pair (edge case: lone $$), fall through to inline
          processInlineMath(node as Text);
          return;
        }
        const frag = document.createDocumentFragment();
        parts.forEach((part, i) => {
          if (i % 2 === 0) {
            if (part) frag.appendChild(document.createTextNode(part));
          } else {
            try {
              const span = document.createElement("span");
              span.className = "katex-display";
              span.innerHTML = katex.renderToString(
                part.replace(/[\n\r]+/g, " ").trim(),
                { throwOnError: false, displayMode: true }
              );
              frag.appendChild(span);
            } catch {
              frag.appendChild(document.createTextNode(`$$${part}$$`));
            }
          }
        });
        parent.replaceChild(frag, node);

        // Fix: process inline math in remaining text nodes after display math replacement.
        // Previously we returned early here, which skipped $...$ inside text portions
        // that coexist with $$...$$ in the same text node.
        Array.from(frag.childNodes).forEach((child) => {
          if (child.nodeType === Node.TEXT_NODE) {
            processInlineMath(child as Text);
          }
        });
        return; // Node is replaced
      }

      // Process inline math: $...$  (but not $$...$$)
      processInlineMath(node as Text);
      return;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Skip already-processed KaTeX nodes and their descendants
      const el = node as Element;
      if (el.classList?.contains("katex") ||
          el.classList?.contains("katex-display") ||
          el.classList?.contains("katex-html")) {
        return;
      }
      // Process child nodes
      Array.from(node.childNodes).forEach(processNode);
    }
  };

  processNode(container);
}

export function MarkdownContent({ content, className = "", style }: MarkdownContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);

  // Preprocess LaTeX, then render Markdown to HTML with markdown-it
  // This bypasses tiptap-markdown's onBeforeCreate which can have timing issues
  const htmlContent = useMemo(() => {
    const md = markdownit({ html: false, breaks: true }).use(markdownitMark);
    return md.render(preprocessLatex(content));
  }, [content]);

  const handleEditorReady = useCallback(() => {
    // Use double requestAnimationFrame to ensure DOM is settled after TipTap render
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (containerRef.current) {
          processContent(containerRef.current);
          setIsReady(true);
        }
      });
    });
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false }),
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-primary underline" },
      }),
      Highlight.configure({ multicolor: true }),
      ProblemBlock,
    ],
    content: htmlContent,
    editable: false,
    onCreate: handleEditorReady,
    onUpdate: handleEditorReady,
  }, [htmlContent]);

  // Retry: Re-process content after initial render to catch any formulas
  // that TipTap may have deferred (e.g., inside nested node views)
  useEffect(() => {
    if (!isReady) return;
    const timer = setTimeout(() => {
      if (containerRef.current) {
        processContent(containerRef.current);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [isReady, htmlContent]);

  if (!editor) return null;

  return (
    <div
      ref={containerRef}
      className={`prose prose-sm max-w-none ${className}`}
      style={{ fontSize: style?.fontSize || "inherit" }}
    >
      <EditorContent
        editor={editor}
        className="[&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:mb-4
          [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-bold [&_.ProseMirror_h2]:mb-3
          [&_.ProseMirror_h3]:text-lg [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:mb-2
          [&_.ProseMirror_h4]:text-base [&_.ProseMirror_h4]:font-semibold [&_.ProseMirror_h4]:mb-2
          [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:ml-6 [&_.ProseMirror_ul]:my-2
          [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:ml-6 [&_.ProseMirror_ol]:my-2
          [&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-primary/30
          [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_blockquote]:my-2
          [&_.ProseMirror_code]:bg-surface-container-high [&_.ProseMirror_code]:px-1.5 [&_.ProseMirror_code]:py-0.5
          [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:text-sm
          [&_.ProseMirror_pre]:bg-surface-container-high [&_.ProseMirror_pre]:p-4
          [&_.ProseMirror_pre]:rounded-lg [&_.ProseMirror_pre]:overflow-x-auto [&_.ProseMirror_pre]:my-3
          [&_.ProseMirror_a]:text-primary [&_.ProseMirror_a]:underline
          [&_.ProseMirror_hr]:my-4 [&_.ProseMirror_hr]:border-outline-variant/20
          [&_.ProseMirror_mark]:rounded-sm [&_.ProseMirror_mark]:px-1 [&_.ProseMirror_mark]:py-0.5"
      />
    </div>
  );
}
