import katex from "katex";
import markdownit from "markdown-it";
import { preprocessLatex } from "./utils";

// Reusable markdown-it instances (stateless, safe at module level)
const md = markdownit({ html: false, breaks: true });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FormulaIssue {
  /** Unique identifier for checkbox toggling */
  id: string;
  /** Human-readable issue description in Chinese */
  description: string;
  /** The category of the issue */
  type:
    | "unescaped_brackets"
    | "spaces_in_delimiters"
    | "latex_delimiters"
    | "bare_environment";
  /** The original text snippet (from content) */
  originalText: string;
  /** The corrected text snippet */
  fixedText: string;
  /** Start position in the full content string */
  startIndex: number;
  /** End position in the full content string */
  endIndex: number;
}

export interface RenderedPreview {
  /** HTML string of the original snippet rendered through the raw pipeline */
  beforeHtml: string;
  /** HTML string of the fixed snippet rendered through the normal pipeline */
  afterHtml: string;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/**
 * Scan markdown content for formula formatting issues and return a list of
 * detected problems together with suggested fixes.
 *
 * Only returns issues that have a clear, safe fix.  Already-correct formulas
 * are left untouched.
 */
export function analyzeFormulas(content: string): FormulaIssue[] {
  let counter = 0;
  const nextId = (): string => `fi-${++counter}`;

  const issues: FormulaIssue[] = [];

  // ---- 1. Unescaped brackets inside inline math $...$ -----------------------
  //     $[a,b]$  ->  $\[a,b\]$   (prevents markdown-it link shortcut parsing)
  const inlineMathRe = /\$([^$]+?)\$/g;
  let m: RegExpExecArray | null;
  while ((m = inlineMathRe.exec(content)) !== null) {
    const inner = m[1];
    // Only report if there's a bracket that is NOT already escaped and NOT
    // part of a LaTeX size command like \bigl[ \bigr] \left[ \right]
    const hasUnescapedBracket = /(?<!\\)\[/.test(inner) || /(?<!\\)\]/.test(inner);
    if (!hasUnescapedBracket) continue;

    // Don't flag brackets inside \left[ \right] \bigl[ \bigr] etc.
    // We do a simple check: if EVERY bracket is preceded by a known command
    // we skip this match.
    const bracketPositions: number[] = [];
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === "[" || inner[i] === "]") bracketPositions.push(i);
    }
    const allEscaped = bracketPositions.every((pos) => {
      if (pos === 0) return false;
      const before = inner.substring(Math.max(0, pos - 6), pos);
      return /(?:\\left|\\right|\\bigl|\\bigr|\\Bigl|\\Bigr|\\biggl|\\biggr|\\Biggl|\\Biggr|\\\[|\\\])$/.test(before);
    });
    if (allEscaped) continue;

    const fixedInner = inner
      .replace(/(?<!\\)\[/g, "\\[")
      .replace(/(?<!\\)\]/g, "\\]");

    const start = m.index;
    const end = start + m[0].length;

    issues.push({
      id: nextId(),
      type: "unescaped_brackets",
      description: "方括号未转义",
      originalText: content.substring(start, end),
      fixedText: `$${fixedInner}$`,
      startIndex: start,
      endIndex: end,
    });
  }

  // ---- 2. Spaces between $ and formula content -----------------------------
  //     $ formula $  ->  $formula$
  const spacedRe = /\$\s+([^$\n]+?)\s+\$/g;
  while ((m = spacedRe.exec(content)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    const fixed = `$${m[1]}$`;

    // Don't flag if the "fixed" version is identical (shouldn't happen)
    if (fixed === m[0]) continue;

    issues.push({
      id: nextId(),
      type: "spaces_in_delimiters",
      description: "美元符号与公式间有多余空格",
      originalText: m[0],
      fixedText: fixed,
      startIndex: start,
      endIndex: end,
    });
  }

  // ---- 3. LaTeX delimiter conversion --------------------------------------
  //     \(...\)  ->  $...$
  //     \[...\]  ->  $$...$$
  // Only convert when they appear OUTSIDE of existing $...$ / $$...$$ spans.

  // First split into "math zones" (same approach as preprocessLatex) so we
  // only check non-math segments.
  const segments = content.split(/(\$\$[\s\S]*?\$\$|\$[^$]*?\$)/);

  let offset = 0;
  for (let i = 0; i < segments.length; i++) {
    if (i % 2 === 1) {
      // Math span – skip, delimiters inside math are intentional
      offset += segments[i].length;
      continue;
    }

    // Non-math segment
    const seg = segments[i];

    // \( ... \)
    const parenRe = /\\\([\s\S]*?\\\)/g;
    let pm: RegExpExecArray | null;
    while ((pm = parenRe.exec(seg)) !== null) {
      const start = offset + pm.index;
      const end = start + pm[0].length;
      const inner = pm[0].slice(2, -2); // strip \( and \)
      issues.push({
        id: nextId(),
        type: "latex_delimiters",
        description: "LaTeX 行内公式定界符 \\(...\\) 应替换为 $...$",
        originalText: pm[0],
        fixedText: `$${inner}$`,
        startIndex: start,
        endIndex: end,
      });
    }

    // \[ ... \]
    const bracketRe = /\\\[[\s\S]*?\\\]/g;
    let bm: RegExpExecArray | null;
    while ((bm = bracketRe.exec(seg)) !== null) {
      const start = offset + bm.index;
      const end = start + bm[0].length;
      const inner = bm[0].slice(2, -2); // strip \[ and \]
      issues.push({
        id: nextId(),
        type: "latex_delimiters",
        description: "LaTeX 显示公式定界符 \\[...\\] 应替换为 $$...$$",
        originalText: bm[0],
        fixedText: `$$\n${inner}\n$$`,
        startIndex: start,
        endIndex: end,
      });
    }

    offset += seg.length;
  }

  // ---- 4. Bare LaTeX environments without $$ wrapping --------------------
  //     \begin{align}...\end{align}  that isn't inside $$...$$
  const envNames = [
    "align", "equation", "gather", "aligned", "split",
    "cases", "multline", "array", "matrix", "pmatrix",
    "bmatrix", "vmatrix",
  ];
  const envPattern = new RegExp(
    `\\\\begin\\{(${envNames.join("|")})\\*?\\}[\\s\\S]*?\\\\end\\{\\1\\*?\\}`,
    "g"
  );

  // Re-scan the full content (post segment-aware analysis above).
  // We check whether the environment is already wrapped in $$.
  let em: RegExpExecArray | null;
  while ((em = envPattern.exec(content)) !== null) {
    const start = em.index;
    const end = start + em[0].length;

    // Check if already wrapped: look backwards & forwards for $$ on same line
    const before = content.substring(0, start);
    const lastNL = before.lastIndexOf("\n");
    const afterLine = before.substring(lastNL + 1);
    if (afterLine.trimEnd().endsWith("$$")) continue;

    const after = content.substring(end);
    const nextNL = after.indexOf("\n");
    const beforeNextLine = nextNL === -1 ? after.trimStart() : after.substring(0, nextNL).trimStart();
    if (beforeNextLine.startsWith("$$")) continue;

    issues.push({
      id: nextId(),
      type: "bare_environment",
      description: `LaTeX 环境 \\begin{${em[1]}} 未被 $$ 包裹`,
      originalText: em[0],
      fixedText: `$$\n${em[0]}\n$$`,
      startIndex: start,
      endIndex: end,
    });
  }

  // Sort issues by position in content
  issues.sort((a, b) => a.startIndex - b.startIndex);

  return issues;
}

// ---------------------------------------------------------------------------
// Apply fixes
// ---------------------------------------------------------------------------

/**
 * Apply a set of selected issues to the content, returning the fixed content.
 * Issues are applied from end-to-start to preserve indices.
 */
export function applyFixes(
  content: string,
  issues: FormulaIssue[],
): string {
  if (issues.length === 0) return content;

  // Sort descending by startIndex so earlier replacements don't shift later
  // indices.
  const sorted = [...issues].sort((a, b) => b.startIndex - a.startIndex);

  let result = content;
  for (const issue of sorted) {
    const before = result.substring(0, issue.startIndex);
    const after = result.substring(issue.endIndex);
    result = before + issue.fixedText + after;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Preview rendering
// ---------------------------------------------------------------------------

/**
 * Render a LaTeX formula string with KaTeX and return the HTML.
 * Returns null if rendering fails.
 */
function renderKaTeX(formula: string, displayMode: boolean): string | null {
  try {
    return katex.renderToString(formula.trim(), {
      throwOnError: false,
      displayMode,
    });
  } catch {
    return null;
  }
}

/**
 * Extract the mathematical content from inside $...$ or $$...$$ delimiters.
 */
function extractMathContent(text: string): {
  content: string;
  displayMode: boolean;
} | null {
  // $$ ... $$
  const dm = text.match(/^\$\$([\s\S]*?)\$\$$/);
  if (dm) return { content: dm[1], displayMode: true };

  // $ ... $
  const im = text.match(/^\$([^$]*)\$$/);
  if (im) return { content: im[1], displayMode: false };

  // \[ ... \]
  const db = text.match(/^\\\[([\s\S]*?)\\\]$/);
  if (db) return { content: db[1], displayMode: true };

  // \( ... \)
  const ib = text.match(/^\\\(([^)]*)\\\)$/);
  if (ib) return { content: ib[1], displayMode: false };

  return null;
}

/**
 * Generate before/after rendered previews for a formula issue.
 *
 * - `beforeHtml` renders the ORIGINAL text through a raw markdown-it +
 *   KaTeX pipeline (without preprocessLatex) so the user can see the
 *   rendering problem.
 * - `afterHtml` renders the FIXED text through the normal pipeline
 *   (with preprocessLatex) showing the correct output.
 */
export function renderPreview(issue: FormulaIssue): RenderedPreview {
  // --- Before: raw pipeline (no preprocessLatex) ---
  const rawHtml = md.render(issue.originalText);
  // Strip surrounding <p> tags that markdown-it adds for inline content
  const beforeInnerHtml = rawHtml.replace(/^<p>/, "").replace(/<\/p>\n?$/, "");

  // --- After: normal pipeline ---
  const fixedHtml = md.render(preprocessLatex(issue.fixedText));
  const afterInnerHtml = fixedHtml.replace(/^<p>/, "").replace(/<\/p>\n?$/, "");

  // --- KaTeX fallback: if the markdown output still contains raw $ signs,
  //     try rendering the formula directly with KaTeX ---
  const math = extractMathContent(issue.fixedText);
  const kaTexHtml = math ? renderKaTeX(math.content, math.displayMode) : null;

  return {
    beforeHtml: beforeInnerHtml || issue.originalText,
    afterHtml: kaTexHtml || afterInnerHtml || issue.fixedText,
  };
}
