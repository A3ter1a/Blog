"use client";

import { MarkdownContent } from "./MarkdownContent";

interface ContentPreviewProps {
  content: string;
  className?: string;
}

export function ContentPreview({ content, className = "" }: ContentPreviewProps) {
  return <MarkdownContent content={content} className={className} />;
}
