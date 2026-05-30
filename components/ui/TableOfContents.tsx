"use client";

import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import katex from "katex";
import { extractTocItems } from "@/lib/markdown";

interface TableOfContentsProps {
  content: string;
  className?: string;
}

function renderInlineMath(text: string): string {
  if (!text.includes("$")) return text;

  const parts = text.split(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g);
  if (parts.length === 1) return text;

  return parts
    .map((part, index) => {
      if (index % 2 === 0) return part;
      try {
        return katex.renderToString(part.trim(), {
          throwOnError: false,
          displayMode: false,
        });
      } catch {
        return `$${part}$`;
      }
    })
    .join("");
}

export function TableOfContents({ content, className = "" }: TableOfContentsProps) {
  const tocItems = useMemo(() => extractTocItems(content), [content]);

  if (tocItems.length === 0) return null;

  const scrollToHeading = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav className={`space-y-1 ${className}`}>
      {tocItems.map((item) => (
        <button
          key={item.id}
          onClick={() => scrollToHeading(item.id)}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-200 hover:bg-surface-container-high group ${
            item.level === 1
              ? "font-semibold text-on-surface"
              : item.level === 2
              ? "font-medium text-on-surface-variant pl-6"
              : "text-on-surface-variant/70 pl-9"
          }`}
        >
          <div className="flex items-center gap-2">
            <ChevronRight className="w-3 h-3 opacity-0 -ml-4 group-hover:opacity-100 transition-opacity" />
            <span dangerouslySetInnerHTML={{ __html: renderInlineMath(item.title) }} />
          </div>
        </button>
      ))}
    </nav>
  );
}
