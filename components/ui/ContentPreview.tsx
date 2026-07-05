"use client";

import { ProblemReferenceContent } from "@/components/problems/ProblemReferenceContent";

interface ContentPreviewProps {
  content: string;
  className?: string;
  enableEconomicsTerms?: boolean;
  enableEconomicsGraphs?: boolean;
}

export function ContentPreview({
  content,
  className = "",
  enableEconomicsTerms = false,
  enableEconomicsGraphs = false,
}: ContentPreviewProps) {
  return (
    <ProblemReferenceContent
      content={content}
      className={className}
      loadMode="adminAware"
      enableEconomicsTerms={enableEconomicsTerms}
      enableEconomicsGraphs={enableEconomicsGraphs}
    />
  );
}
