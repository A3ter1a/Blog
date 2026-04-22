"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import { preprocessLatex } from "@/lib/utils";

interface MarkdownContentProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
}

export function MarkdownContent({ content, className = "", style }: MarkdownContentProps) {
  const processedContent = preprocessLatex(content);

  return (
    <div className={`markdown-content ${className}`} style={{ fontSize: style?.fontSize || 'inherit' }}>
      <ReactMarkdown
        remarkPlugins={[[remarkMath, { singleDollarTextMath: true }]]}
        rehypePlugins={[[rehypeKatex, { strict: 'ignore' }], rehypeSlug]}
        components={{
          p: ({ children, ...props }) => (
            <p {...props} className="mb-4 last:mb-0 leading-relaxed">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc ml-6 mb-4 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal ml-6 mb-4 space-y-1">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic">{children}</em>
          ),
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            return isInline ? (
              <code className="px-1.5 py-0.5 bg-black/5 dark:bg-white/10 rounded text-sm font-mono">
                {children}
              </code>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="bg-black/5 dark:bg-white/5 rounded-lg p-4 mb-4 overflow-x-auto text-sm">
              {children}
            </pre>
          ),
          h1: ({ children, ...props }) => (
            <h1 {...props} className="text-3xl font-bold mt-8 mb-4 font-headline scroll-mt-24">{children}</h1>
          ),
          h2: ({ children, ...props }) => (
            <h2 {...props} className="text-2xl font-bold mt-6 mb-3 font-headline scroll-mt-24">{children}</h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 {...props} className="text-xl font-bold mt-5 mb-2 font-headline scroll-mt-24">{children}</h3>
          ),
          h4: ({ children, ...props }) => (
            <h4 {...props} className="text-lg font-bold mt-4 mb-2 scroll-mt-24">{children}</h4>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary/30 pl-4 py-2 mb-4 text-on-surface-variant italic">
              {children}
            </blockquote>
          ),
          hr: () => (
            <hr className="my-6 border-outline-variant/20" />
          ),
          a: ({ href, children }) => (
            <a href={href} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
