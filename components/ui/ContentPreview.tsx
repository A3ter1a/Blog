"use client";

import { ProblemReferenceContent } from "@/components/problems/ProblemReferenceContent";

interface ContentPreviewProps {
  content: string;
  className?: string;
}

export function ContentPreview({ content, className = "" }: ContentPreviewProps) {
  return <ProblemReferenceContent content={content} className={className} loadMode="adminAware" />;
}
