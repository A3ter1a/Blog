import type { Chapter } from "@/lib/types";

const LATEX_LINE_BREAK_MARKER = "AsteroidLatexLineBreakToken";
const MATH_SPAN_SPLIT_PATTERN = /(\$\$[\s\S]*?\$\$|(?<!\$)\$(?!\$)(?:(?!\n\s*\n)[\s\S])*?(?<!\$)\$(?!\$))/;
const LATEX_ENV_NAMES = "align|equation|gather|aligned|split|cases|multline|array|matrix|pmatrix|bmatrix|vmatrix|Vmatrix";
const LATEX_ENV_START_PATTERN = new RegExp(`\\\\begin\\{(?:${LATEX_ENV_NAMES})\\*?\\}`);
const BARE_LATEX_ENV_PATTERN = new RegExp(
  `\\\\begin\\{(${LATEX_ENV_NAMES})\\*?\\}[\\s\\S]*?\\\\end\\{\\1\\*?\\}`,
  "g"
);
const BARE_LATEX_COMMAND_PATTERN = /(?<!\$)(\\(?!begin\b|end\b)[a-zA-Z]+(?:\{[^}]*\})?)(?!\$)/g;
const COLLAPSED_INLINE_MATH_PATTERN = /(?<!\$)\$(?!\$)([^$\n]+?)\$\$(?!\$)([^$\n]+?)\$(?!\$)/g;
const SIMPLE_MISSING_LOWER_BOUND_PATTERN = /\\(int|sum|prod)\s*\{([^{}\n]+)\}\s*(?=\^)/g;
const SIMPLE_MISSING_LIMIT_BOUND_PATTERN = /\\lim\s*\{([^{}\n]+)\}/g;

function protectLatexLineBreaks(content: string): string {
  return content.replace(/\\{2,3}(?![A-Za-z])/g, LATEX_LINE_BREAK_MARKER);
}

export function restoreLatexLineBreaks(content: string): string {
  return content
    .replaceAll(LATEX_LINE_BREAK_MARKER, "\\\\")
    .replace(/\\{3,}(?![A-Za-z])/g, "\\\\");
}

export function separateCollapsedInlineMathSpans(content: string): string {
  let next = content;
  let previous: string;

  do {
    previous = next;
    next = next.replace(COLLAPSED_INLINE_MATH_PATTERN, (full, left: string, right: string) => {
      const leftMath = left.trim();
      const rightMath = right.trim();
      if (!leftMath || !rightMath) return full;

      return `$${leftMath}$ $${rightMath}$`;
    });
  } while (next !== previous);

  return next;
}

function isInsideDollarMath(content: string, offset: number): boolean {
  let inSingleDollar = false;
  let inDoubleDollar = false;

  for (let index = 0; index < offset; index += 1) {
    if (content[index] !== "$" || content[index - 1] === "\\") continue;

    if (content[index + 1] === "$") {
      if (!inSingleDollar) {
        inDoubleDollar = !inDoubleDollar;
      }
      index += 1;
      continue;
    }

    if (!inDoubleDollar) {
      inSingleDollar = !inSingleDollar;
    }
  }

  return inSingleDollar || inDoubleDollar;
}

function normalizeMathSpanForMarkdown(segment: string): string {
  let next = protectLatexLineBreaks(segment)
    .replace(SIMPLE_MISSING_LOWER_BOUND_PATTERN, "\\$1_{$2}")
    .replace(SIMPLE_MISSING_LIMIT_BOUND_PATTERN, "\\lim_{$1}");

  if (next.startsWith("$$") || LATEX_ENV_START_PATTERN.test(next)) {
    next = next.replace(/\n/g, " ");
  }

  return next
    .replace(/(?<!\\)\[/g, "\\[")
    .replace(/(?<!\\)\]/g, "\\]")
    .replace(/\\\{/g, "\\lbrace{}")
    .replace(/\\\}/g, "\\rbrace{}");
}

function wrapBareLatexEnvironments(segment: string): string {
  return segment.replace(BARE_LATEX_ENV_PATTERN, (match) => {
    const collapsed = protectLatexLineBreaks(match).replace(/\n/g, " ");
    return `$$ ${collapsed} $$`;
  });
}

function normalizeTextOutsideMath(segment: string): string {
  const withConvertedDelimiters = segment
    .replace(/\\\[/g, "$$")
    .replace(/\\\]/g, "$$")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$");

  return withConvertedDelimiters
    .split(MATH_SPAN_SPLIT_PATTERN)
    .map((part, index) => {
      if (index % 2 === 1) return normalizeMathSpanForMarkdown(part);

      const withBareEnvironments = wrapBareLatexEnvironments(part);
      return withBareEnvironments
        .split(MATH_SPAN_SPLIT_PATTERN)
        .map((nestedPart, nestedIndex) => (
          nestedIndex % 2 === 1
            ? normalizeMathSpanForMarkdown(nestedPart)
            : nestedPart.replace(BARE_LATEX_COMMAND_PATTERN, "$$$1$$")
        ))
        .join("");
    })
    .join("");
}

/**
 * Get all descendant chapter IDs for a given chapter (including itself).
 * Traverses the parentId tree recursively with cycle protection.
 */
export function getDescendantIds(chapterId: string, chapters: Chapter[]): Set<string> {
  const result = new Set<string>();
  const visited = new Set<string>();
  const queue = [chapterId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    result.add(current);

    for (const ch of chapters) {
      if (ch.parentId === current && !visited.has(ch.id)) {
        queue.push(ch.id);
      }
    }
  }

  return result;
}

/**
 * Preprocess LaTeX content to ensure proper delimiter format.
 * - Removes spaces between $ and formula content ($ formula $ → $formula$)
 * - Converts \[ \] and \( \) to $$ $$ and $ $  (only OUTSIDE math spans)
 * - Escapes [ and ] inside $...$ and $$...$$ (to prevent markdown-it link parsing)
 * - Wraps bare LaTeX commands (\xi, \theta, \operatorname, etc.) with $...$ outside math spans
 * - Wraps bare LaTeX environments (align, equation, gather, etc.) with $$ if not already wrapped
 *
 * NOTE: \[ and \( inside existing $...$ or $$...$$ spans are NOT converted,
 * because they may be part of bracket escaping from the Markdown serializer.
 */
export function preprocessLatex(content: string): string {
  content = separateCollapsedInlineMathSpans(content);

  // Step 1: Remove spaces between $ and formula content
  // $ formula $ → $formula$
  let changed = true;
  while (changed) {
    const before = content;
    content = content.replace(/\$\s+([^$\n]+?)\s+\$/g, '$$$1$$');
    changed = content !== before;
  }
  content = separateCollapsedInlineMathSpans(content);

  // Step 2: Split into math spans and non-math segments, process each separately
  // Math spans ($...$ or $$...$$) are at odd indices, non-math at even indices
  const segments = content.split(MATH_SPAN_SPLIT_PATTERN);

  for (let i = 0; i < segments.length; i++) {
    if (i % 2 === 1) {
      segments[i] = normalizeMathSpanForMarkdown(segments[i]);
    } else {
      // Non-math content: convert \[ \] and \( \) to $$ $$ and $ $
      // These are guaranteed to be outside math spans
      segments[i] = normalizeTextOutsideMath(segments[i]);

      // Wrap bare LaTeX commands (e.g. \xi, \theta, \operatorname{rank})
      // that appear outside $...$ / $$...$$ delimiters so they get
      // rendered by KaTeX instead of showing as raw "xi" / "theta" text.
      // Exclude \begin and \end which are handled by Step 3.
    }
  }

  content = segments.join('');

  // Step 3: Wrap bare LaTeX environments that are not already inside $$...$$
  content = content.replace(BARE_LATEX_ENV_PATTERN, (match, _envName, offset: number) => {
    if (isInsideDollarMath(content, offset)) return match;

    // Check if preceded by $$ on the same line
    const beforeText = content.substring(0, offset);
    const lastNewline = beforeText.lastIndexOf('\n');
    const textAfterLastNewline = beforeText.substring(lastNewline + 1);
    if (textAfterLastNewline.trimEnd().endsWith('$$')) return match;

    // Check if followed by $$ on the same line
    const afterText = content.substring(offset + match.length);
    const nextNewline = afterText.indexOf('\n');
    const textBeforeNextNewline = nextNewline !== -1
      ? afterText.substring(0, nextNewline).trimStart()
      : afterText.trimStart();
    if (textBeforeNextNewline.startsWith('$$')) return match;

    // Collapse newlines inside the block to prevent markdown-it
    // (configured with breaks:true) from inserting <br> tags that
    // would break KaTeX rendering of matrices and other environments.
    const collapsed = protectLatexLineBreaks(match).replace(/\n/g, ' ');
    return `$$ ${collapsed} $$`;
  });

  return content;
}

const DASHED_SEP_MARKER = '<!--dashed-sep-->';
const DASHED_SEP_TAG = '<dashed-separator></dashed-separator>';
const DASHED_SEP_PLACEHOLDER = '§DASHEDSEP§';

/** 在 markdown-it 渲染前，将 <!--dashed-sep--> 或 <dashed-separator> 替换为占位符 */
export function preprocessDashedSep(content: string): string {
  if (!content.includes(DASHED_SEP_MARKER) && !content.includes(DASHED_SEP_TAG)) return content;
  return content
    .replaceAll(DASHED_SEP_MARKER, DASHED_SEP_PLACEHOLDER)
    .replaceAll(DASHED_SEP_TAG, DASHED_SEP_PLACEHOLDER);
}

/** 将占位符恢复为 HTML hr 标签（ContentPreview 用）。替换整个 <p> 包裹 */
export function postprocessDashedSepAsHtml(html: string): string {
  if (!html.includes(DASHED_SEP_PLACEHOLDER)) return html;
  return html.replace(
    new RegExp(`<p\\b[^>]*>${DASHED_SEP_PLACEHOLDER}</p>`, 'g'),
    '<hr data-type="dashed" class="dashed-separator">'
  );
}

/** 将占位符恢复为 TipTap 标签（MarkdownContent 用）。替换整个 <p> 包裹，确保 block 节点不在 <p> 内 */
export function postprocessDashedSepAsTag(html: string): string {
  if (!html.includes(DASHED_SEP_PLACEHOLDER)) return html;
  return html.replace(
    new RegExp(`<p\\b[^>]*>${DASHED_SEP_PLACEHOLDER}</p>`, 'g'),
    '<dashed-separator></dashed-separator>'
  );
}

/**
 * Convert a File to a base64 string (data URL without prefix).
 */
export async function fileToBase64(file: File): Promise<string> {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  return new Promise<string>((resolve, reject) => {
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = () => {
      reject(new Error("Failed to read file as base64"));
    };
  });
}

/**
 * Convert a File to a base64 data URL (full string including prefix).
 */
export async function fileToDataUrl(file: File): Promise<string> {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  return new Promise<string>((resolve, reject) => {
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = () => {
      reject(new Error("Failed to read file as data URL"));
    };
  });
}

/**
 * Extract multiple choice options from question content.
 * Matches patterns like "A. option text" or "B、option text"
 */
export function extractOptions(content: string) {
  const options = [];
  const labels = ["A", "B", "C", "D", "E", "F"];

  for (const label of labels) {
    const regex = new RegExp(`${label}[\\.、]\\s*([^\\n]+)`, "i");
    const match = content.match(regex);
    if (match) {
      options.push({ label, content: match[1].trim() });
    }
  }

  return options.length > 0 ? options : undefined;
}

/**
 * Sanitize filename for safe file operations.
 */
export function sanitizeFileName(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '-').substring(0, 100);
}

/**
 * Estimate reading time for text content.
 * Average reading speed: ~300 Chinese characters per minute or ~200 English words per minute.
 * Returns reading time in minutes (minimum 1 minute).
 */
export function estimateReadingTime(content: string): number {
  if (!content || content.trim().length === 0) {
    return 1;
  }

  // Count Chinese characters
  const chineseChars = (content.match(/[\u4e00-\u9fff]/g) || []).length;
  
  // Count English words (approximate)
  const englishWords = content.split(/\s+/).filter(word => word.length > 0).length;
  
  // Calculate time: 300 Chinese chars/min or 200 English words/min
  const chineseTime = chineseChars / 300;
  const englishTime = englishWords / 200;
  
  // Use the maximum of the two (content might be mixed)
  const totalMinutes = Math.max(chineseTime, englishTime);
  
  // Minimum 1 minute
  return Math.max(1, Math.ceil(totalMinutes));
}
