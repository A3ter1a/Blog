import type { Problem } from "./types.ts";
import { normalizeMarkdownSyntax } from "./markdown-normalizer.ts";

export const CONTENT_NORMALIZATION_RULE_VERSION = "asteroid-markdown-v1";

export type ContentOrigin =
  | "editor"
  | "import"
  | "ocr"
  | "ai"
  | "migration"
  | "unknown";

export type MarkdownRiskCode =
  | "unbalanced_display_math"
  | "unbalanced_inline_math"
  | "collapsed_display_math"
  | "latex_environment_outside_math"
  | "normalization_changed_math";

export type MarkdownRisk = {
  code: MarkdownRiskCode;
  severity: "review" | "high";
  message: string;
};

export type MarkdownNormalizationResult = {
  normalized: string;
  changed: boolean;
  requiresReview: boolean;
  ruleVersion: string;
  origin: ContentOrigin;
  risks: MarkdownRisk[];
};

const FENCED_CODE_PATTERN = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g;
const LATEX_ENV_PATTERN = /\\begin\{(?:align|equation|gather|aligned|split|cases|multline|array|matrix|pmatrix|bmatrix|vmatrix|Vmatrix)\*?\}/g;

function countUnescapedMarkers(content: string, marker: "$" | "$$"): number {
  let count = 0;
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\\") {
      index += 1;
      continue;
    }

    if (marker === "$$" && content.slice(index, index + 2) === "$$") {
      count += 1;
      index += 1;
      continue;
    }

    if (
      marker === "$"
      && content[index] === "$"
      && content[index - 1] !== "$"
      && content[index + 1] !== "$"
    ) {
      count += 1;
    }
  }

  return count;
}

function stripMathSpans(content: string): string {
  return content
    .replace(/\$\$[\s\S]*?\$\$/g, "")
    .replace(/(?<!\$)\$(?!\$)(?:(?!\n\s*\n)[\s\S])*?(?<!\$)\$(?!\$)/g, "");
}

export function analyzeMarkdownRisks(source: string, normalized = source): MarkdownRisk[] {
  const risks: MarkdownRisk[] = [];
  const unprotected = source.replace(FENCED_CODE_PATTERN, "");

  if (countUnescapedMarkers(unprotected, "$$") % 2 !== 0) {
    risks.push({
      code: "unbalanced_display_math",
      severity: "high",
      message: "存在未配对的 $$ 展示公式标记，必须人工确认。",
    });
  }

  if (countUnescapedMarkers(unprotected, "$") % 2 !== 0) {
    risks.push({
      code: "unbalanced_inline_math",
      severity: "high",
      message: "存在未配对的 $ 行内公式标记，必须人工确认。",
    });
  }

  if (/\$\$[^$\n]+\$\$\$\$/.test(unprotected)) {
    risks.push({
      code: "collapsed_display_math",
      severity: "review",
      message: "检测到相邻展示公式粘连，迁移前应核对是否需要分行。",
    });
  }

  const outsideMath = stripMathSpans(unprotected);
  if (LATEX_ENV_PATTERN.test(outsideMath)) {
    risks.push({
      code: "latex_environment_outside_math",
      severity: "high",
      message: "检测到位于数学定界符之外的 LaTeX 环境，不能自动改写。",
    });
  }
  LATEX_ENV_PATTERN.lastIndex = 0;

  const sourceMath = source.match(/\\[A-Za-z]+|\$+/g)?.join("|") ?? "";
  const normalizedMath = normalized.match(/\\[A-Za-z]+|\$+/g)?.join("|") ?? "";
  if (sourceMath !== normalizedMath) {
    risks.push({
      code: "normalization_changed_math",
      severity: "high",
      message: "规范化改变了公式控制序列或定界符，必须保留原文并人工确认。",
    });
  }

  return risks;
}

export function normalizeMarkdownSource(
  source: string,
  origin: ContentOrigin = "unknown",
): MarkdownNormalizationResult {
  const candidate = normalizeMarkdownSyntax(source);
  const risks = analyzeMarkdownRisks(source, candidate);
  const requiresReview = risks.some((risk) => risk.severity === "high");
  const normalized = requiresReview ? source : candidate;
  return {
    normalized,
    changed: normalized !== source,
    requiresReview,
    ruleVersion: CONTENT_NORMALIZATION_RULE_VERSION,
    origin,
    risks,
  };
}

export function normalizeMarkdownForWrite(
  source: string,
  origin: ContentOrigin = "unknown",
): string {
  return normalizeMarkdownSource(source, origin).normalized;
}

export function normalizeProblemForWrite<T extends Partial<Problem>>(
  problem: T,
  origin: ContentOrigin = "unknown",
): T {
  const normalizeOptional = (value: string | undefined) => (
    value === undefined ? undefined : normalizeMarkdownForWrite(value, origin)
  );

  return {
    ...problem,
    question: normalizeOptional(problem.question),
    answer: normalizeOptional(problem.answer),
    explanation: normalizeOptional(problem.explanation),
    tips: normalizeOptional(problem.tips),
    options: problem.options?.map((option) => ({
      ...option,
      content: normalizeMarkdownForWrite(option.content, origin),
    })),
  };
}
