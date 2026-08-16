import { splitProtectedMarkdownBlocks } from "./markdown-normalizer.ts";

export const AI_HIGHLIGHT_MAX_DENSITY_PER_1000_CHARS = 14;
export const AI_HIGHLIGHT_MAX_COVERAGE_RATIO = 0.18;
export const AI_HIGHLIGHT_MIN_TERM_LENGTH = 2;

export type AiHighlightIssue = {
  code: "highlight_density_high" | "highlight_coverage_high" | "highlight_duplicate_term" | "highlight_adjacent";
  severity: "warning";
  message: string;
};

export type AiHighlightAnalysis = {
  terms: string[];
  count: number;
  highlightedCharacterCount: number;
  proseCharacterCount: number;
  densityPerThousand: number;
  coverageRatio: number;
  issues: AiHighlightIssue[];
};

const HIGHLIGHT_PATTERN = /==\s*(?:\{#[0-9a-fA-F]{6}\})?([\s\S]*?)\s*==/g;

function normalizeTerm(value: string): string {
  return value
    .replace(/\{#[0-9a-fA-F]{6}\}/g, "")
    .replace(/[\*_~`>#\[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getProseCharacterCount(value: string): number {
  return value
    .replace(/<!--(?:[\s\S]*?)-->/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}(?:[-*+] |\d+\. |> )/gm, "")
    .replace(/\s+/g, "")
    .length;
}

export function extractAiHighlightTerms(markdown: string): string[] {
  const terms: string[] = [];
  for (const segment of splitProtectedMarkdownBlocks(markdown.replace(/\r\n?/g, "\n"))) {
    if (segment.protected) continue;
    for (const match of segment.text.matchAll(HIGHLIGHT_PATTERN)) {
      const term = normalizeTerm(match[1] ?? "");
      if (term.length < AI_HIGHLIGHT_MIN_TERM_LENGTH || terms.includes(term)) continue;
      terms.push(term.slice(0, 120));
    }
  }
  return terms.slice(0, 80);
}

export function analyzeAiHighlights(markdown: string): AiHighlightAnalysis {
  const source = markdown.replace(/\r\n?/g, "\n");
  const terms: string[] = [];
  let count = 0;
  let highlightedCharacterCount = 0;
  let proseCharacterCount = 0;
  let adjacent = false;

  for (const segment of splitProtectedMarkdownBlocks(source)) {
    if (segment.protected) continue;
    const plainSegment = segment.text
      .replace(/<!--(?:[\s\S]*?)-->/g, "")
      .replace(HIGHLIGHT_PATTERN, (_full, body: string) => normalizeTerm(body));
    proseCharacterCount += getProseCharacterCount(plainSegment);
    const matches = Array.from(segment.text.matchAll(HIGHLIGHT_PATTERN));
    count += matches.length;
    for (const match of matches) {
      const term = normalizeTerm(match[1] ?? "");
      if (term.length < AI_HIGHLIGHT_MIN_TERM_LENGTH) continue;
      highlightedCharacterCount += term.replace(/\s+/g, "").length;
      if (!terms.includes(term)) terms.push(term.slice(0, 120));
    }
    if (/==\s*(?:\{#[0-9a-fA-F]{6}\})?[^=\n]+==\s*==/.test(segment.text)) adjacent = true;
  }

  const densityPerThousand = proseCharacterCount > 0 ? (count / proseCharacterCount) * 1000 : 0;
  const coverageRatio = proseCharacterCount > 0 ? highlightedCharacterCount / proseCharacterCount : 0;
  const issues: AiHighlightIssue[] = [];
  const duplicateCount = count - terms.length;
  if (densityPerThousand > AI_HIGHLIGHT_MAX_DENSITY_PER_1000_CHARS) {
    issues.push({
      code: "highlight_density_high",
      severity: "warning",
      message: `高亮 ${count} 处，密度约 ${densityPerThousand.toFixed(1)} 处/千字；建议只保留定义、机制和易错点。`,
    });
  }
  if (coverageRatio > AI_HIGHLIGHT_MAX_COVERAGE_RATIO) {
    issues.push({
      code: "highlight_coverage_high",
      severity: "warning",
      message: `高亮覆盖约 ${(coverageRatio * 100).toFixed(1)}% 正文；建议降低高亮面积，避免阅读节奏被打断。`,
    });
  }
  if (duplicateCount > 0) {
    issues.push({
      code: "highlight_duplicate_term",
      severity: "warning",
      message: `有 ${duplicateCount} 处高亮词重复出现；请确认是否确实需要重复强调。`,
    });
  }
  if (adjacent) {
    issues.push({
      code: "highlight_adjacent",
      severity: "warning",
      message: "检测到相邻高亮，建议合并为一个完整知识点或只保留核心词。",
    });
  }

  return {
    terms: terms.slice(0, 80),
    count,
    highlightedCharacterCount,
    proseCharacterCount,
    densityPerThousand,
    coverageRatio,
    issues,
  };
}

