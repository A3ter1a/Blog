"use client";

import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { preprocessLatex } from "@/lib/utils";
import GithubSlugger from "github-slugger";
import katex from "katex";

interface TOCItem {
  id: string;
  title: string;
  level: number;
}

interface TableOfContentsProps {
  content: string;
  className?: string;
}

// Render inline $...$ math in a text string to KaTeX HTML
function renderInlineMath(text: string): string {
  if (!text.includes("$")) return text;
  const parts = text.split(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g);
  if (parts.length === 1) return text;
  return parts
    .map((part, i) => {
      if (i % 2 === 0) return part;
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
  const tocItems = useMemo(() => {
    const items: TOCItem[] = [];
    const slugger = new GithubSlugger();
    
    // Process content the same way as MarkdownContent
    const processedContent = preprocessLatex(content);
    const lines = processedContent.split("\n");
    
    lines.forEach((line) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const title = match[2].trim();
        
        // Generate ID using github-slugger (same as rehype-slug)
        const id = slugger.slug(title);
        
        items.push({ id, title, level });
      }
    });
    
    return items;
  }, [content]);

  if (tocItems.length === 0) {
    return null;
  }

  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
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
