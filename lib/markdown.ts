import GithubSlugger from "github-slugger";
import katex from "katex";
import markdownit from "markdown-it";
import markdownitMark from "markdown-it-mark";
import {
  decodeLatexHtmlEntities,
  preprocessDashedSep,
  preprocessLatex,
  postprocessDashedSepAsHtml,
  restoreLatexEscapedControlChars,
  restoreLatexLineBreaks,
  separateCollapsedInlineMathSpans,
} from "@/lib/utils";
import type { Problem } from "@/lib/types";

const md = markdownit({
  html: false,
  breaks: true,
  linkify: true,
}).use(markdownitMark);

export interface TocItem {
  id: string;
  title: string;
  level: number;
}

type Segment = {
  text: string;
  protected: boolean;
};

type RenderMarkdownOptions = {
  renderMath?: boolean;
};

const LATEX_ENV_NAMES = [
  "align",
  "equation",
  "gather",
  "aligned",
  "split",
  "cases",
  "multline",
  "array",
  "matrix",
  "pmatrix",
  "bmatrix",
  "vmatrix",
  "Vmatrix",
].join("|");

const LATEX_ENV_PATTERN = new RegExp(
  `\\\\begin\\{(${LATEX_ENV_NAMES})\\*?\\}[\\s\\S]*?\\\\end\\{\\1\\*?\\}`,
);

function hasProseText(content: string): boolean {
  return /[\u3400-\u9fff，。；：、（）《》“”]/.test(content)
    || /\b(where|when|if|then|for|with|and|or)\b/i.test(content);
}

function splitInlineEnvironmentWithText(content: string): string {
  return content.replace(/(?<!\$)\$(?!\$)([\s\S]*?)(?<!\$)\$(?!\$)/g, (full, body: string) => {
    const trimmed = body.trim();
    if (!trimmed) return full;

    const envMatch = trimmed.match(LATEX_ENV_PATTERN);
    if (!envMatch || envMatch.index === undefined) return full;

    const envStart = envMatch.index;
    const envEnd = envStart + envMatch[0].length;
    const before = trimmed.slice(0, envStart).trim();
    const after = trimmed.slice(envEnd).trim();

    if (!before && !after) return `$${trimmed}$`;
    if (![before, after].some((part) => part && hasProseText(part))) return full;

    return [
      before,
      `$${envMatch[0].trim()}$`,
      after,
    ].filter(Boolean).join(" ");
  });
}

function normalizeLatexInput(content: string): string {
  return splitInlineEnvironmentWithText(
    separateCollapsedInlineMathSpans(restoreLatexEscapedControlChars(content)),
  );
}

function splitProtectedBlocks(content: string): Segment[] {
  const segments: Segment[] = [];
  const pattern = /(```[\s\S]*?```|~~~[\s\S]*?~~~|\$\$[\s\S]*?\$\$|`[^`\n]*`|(?<!\$)\$(?!\$)(?:(?!\n\s*\n)[\s\S])*?(?<!\$)\$(?!\$))/g;
  let lastIndex = 0;

  for (const match of content.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ text: content.slice(lastIndex, index), protected: false });
    }
    segments.push({ text: match[0], protected: true });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ text: content.slice(lastIndex), protected: false });
  }

  return segments;
}

const MATH_SPAN_TOKEN = "AsteroidMathSpanToken";

function isDollarMathSpan(text: string): boolean {
  return text.startsWith("$") && text.endsWith("$");
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function protectMathSpansForMarkdown(content: string): { content: string; values: string[] } {
  const values: string[] = [];
  const protectedContent = splitProtectedBlocks(content)
    .map((segment) => {
      if (!segment.protected || !isDollarMathSpan(segment.text)) {
        return segment.text;
      }

      const token = `${MATH_SPAN_TOKEN}${values.length}`;
      values.push(segment.text);
      return token;
    })
    .join("");

  return { content: protectedContent, values };
}

function restoreMathSpanTokens(text: string, values: string[], escape = false): string {
  if (values.length === 0) return text;

  return text.replace(new RegExp(`${MATH_SPAN_TOKEN}(\\d+)`, "g"), (full, indexText: string) => {
    const value = values[Number(indexText)];
    if (value === undefined) return full;
    return escape ? escapeHtmlText(value) : value;
  });
}

function renderMathSpanToHtml(value: string): string {
  const displayMode = value.startsWith("$$") && value.endsWith("$$");
  const delimiterLength = displayMode ? 2 : 1;
  const latex = restoreLatexLineBreaks(decodeLatexHtmlEntities(value.slice(delimiterLength, -delimiterLength)))
    .replace(/[\n\r]+/g, displayMode ? " " : "\n")
    .replace(/\\([[\](),.;:!?<>])/g, "$1")
    .trim();

  if (!latex) return escapeHtmlText(value);

  try {
    return `<span class="${displayMode ? "katex-display" : "katex-inline"}">${katex.renderToString(latex, {
      throwOnError: false,
      displayMode,
    })}</span>`;
  } catch {
    return escapeHtmlText(value);
  }
}

function restoreMathSpanTokensAsHtml(text: string, values: string[]): string {
  if (values.length === 0) return text;

  return text.replace(new RegExp(`${MATH_SPAN_TOKEN}(\\d+)`, "g"), (full, indexText: string) => {
    const value = values[Number(indexText)];
    return value === undefined ? full : renderMathSpanToHtml(value);
  });
}

const SIGNED_MATH_LINE_TOKEN = "AsteroidSignedMathLineToken";

function isLikelyStandaloneSignedMath(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed || /[\u3400-\u9fff]/.test(trimmed)) return false;
  if (/\s/.test(trimmed)) return false;
  if (/^[0-9]+(?:[.,][0-9]+)?(?:\/[0-9]+)?$/.test(trimmed)) return true;
  if (/^[A-Za-z]$/.test(trimmed)) return true;
  if (!/[0-9\\$^_{}()[\]*/=<>|]/.test(trimmed)) return false;

  return /^[0-9A-Za-z\\$^_{}()[\].,*/+=<>|\-]+$/.test(trimmed);
}

function protectStandaloneSignedMathLines(text: string): { text: string; values: string[] } {
  const values: string[] = [];
  const protectedText = text.replace(
    /^(\s{0,3})([+-])\s*([^\n]+?)\s*$/gm,
    (full, indent: string, sign: string, body: string) => {
      if (!isLikelyStandaloneSignedMath(body)) return full;

      const token = `${SIGNED_MATH_LINE_TOKEN}${values.length}`;
      values.push(`${sign}${body.trim()}`);
      return `${indent}${token}`;
    },
  );

  return { text: protectedText, values };
}

function restoreStandaloneSignedMathLines(text: string, values: string[]): string {
  return text.replace(new RegExp(`${SIGNED_MATH_LINE_TOKEN}(\\d+)`, "g"), (full, indexText: string) => {
    const value = values[Number(indexText)];
    return value ?? full;
  });
}

function repairUnprotectedMarkdown(text: string): string {
  let next = text.replace(/\r\n?/g, "\n");
  const signedMathLines = protectStandaloneSignedMathLines(next);
  next = signedMathLines.text;

  next = next.replace(/[ \t]+$/gm, "");
  next = next.replace(/^\s{0,3}(#{1,6})([^\s#])/gm, "$1 $2");
  next = next.replace(/^\s{0,3}([*+-])([^\s*+-])/gm, "$1 $2");
  next = next.replace(/^\s{0,3}(\d+)\.([^\s])/gm, "$1. $2");
  next = next.replace(/^\s{0,3}>([^\s>])/gm, "> $1");
  next = next.replace(/\*\*\s+([^*\n]+?)\s+\*\*/g, "**$1**");
  next = next.replace(/(?<!\*)\*\s+([^*\n]+?)\s+\*(?!\*)/g, "*$1*");
  next = next.replace(/\$\s+([^$\n]+?)\s+\$/g, "$$$1$$");

  next = next.replace(/(^|\n)(#{1,6} .+)(?=\n(?!\n))/g, "$1$2\n");
  next = next.replace(/(^|\n)([*+-] .+(?:\n[*+-] .+)*)\n(?!\n|[*+-] )/g, "$1$2\n\n");
  next = next.replace(/(^|\n)(\d+\. .+(?:\n\d+\. .+)*)\n(?!\n|\d+\. )/g, "$1$2\n\n");

  return restoreStandaloneSignedMathLines(next, signedMathLines.values);
}

export function repairMarkdown(content: string): string {
  const repaired = splitProtectedBlocks(normalizeLatexInput(content))
    .map((segment) => segment.protected ? segment.text : repairUnprotectedMarkdown(segment.text))
    .join("");

  return repaired
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function repairProblemMarkdownFields<T extends Partial<Problem>>(problem: T): T {
  return {
    ...problem,
    question: problem.question !== undefined ? repairMarkdown(problem.question) : problem.question,
    answer: problem.answer !== undefined ? repairMarkdown(problem.answer) : problem.answer,
    options: problem.options?.map((option) => ({
      ...option,
      content: repairMarkdown(option.content),
    })),
  };
}

export function normalizeMarkdownForRender(content: string): string {
  return preprocessDashedSep(preprocessLatex(repairMarkdown(content)));
}

export function renderMarkdownToHtml(content: string, options: RenderMarkdownOptions = {}): string {
  const protectedMath = protectMathSpansForMarkdown(normalizeMarkdownForRender(content));
  const html = md.render(protectedMath.content);
  const dashedHtml = postprocessDashedSepAsHtml(html);
  return options.renderMath === false
    ? restoreMathSpanTokens(dashedHtml, protectedMath.values, true)
    : restoreMathSpanTokensAsHtml(dashedHtml, protectedMath.values);
}

export function extractTocItems(content: string): TocItem[] {
  const slugger = new GithubSlugger();
  const protectedMath = protectMathSpansForMarkdown(normalizeMarkdownForRender(content));
  const tokens = md.parse(protectedMath.content, {});
  const items: TocItem[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== "heading_open") continue;
    const level = Number(token.tag.slice(1));
    if (!Number.isFinite(level) || level < 1 || level > 6) continue;

    const inline = tokens[i + 1];
    if (inline?.type !== "inline") continue;

    const title = restoreMathSpanTokens(inline.content, protectedMath.values).trim();
    if (!title) continue;

    items.push({
      id: slugger.slug(title),
      title,
      level,
    });
  }

  return items;
}
