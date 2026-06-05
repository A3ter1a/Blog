import GithubSlugger from "github-slugger";
import markdownit from "markdown-it";
import markdownitMark from "markdown-it-mark";
import { preprocessDashedSep, preprocessLatex, postprocessDashedSepAsHtml } from "@/lib/utils";
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

function restoreLatexControlChars(content: string): string {
  return content
    .replace(/\u0008/g, "\\b")
    .replace(/\u000c(?=[A-Za-z])/g, "\\f")
    .replace(/\u0009(?=[A-Za-z])/g, "\\t")
    .replace(/\u000d(?=[A-Za-z])/g, "\\r");
}

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
  return splitInlineEnvironmentWithText(restoreLatexControlChars(content));
}

function splitProtectedBlocks(content: string): Segment[] {
  const segments: Segment[] = [];
  const pattern = /(```[\s\S]*?```|~~~[\s\S]*?~~~|\$\$[\s\S]*?\$\$|`[^`\n]*`|\$[^$\n]*?\$)/g;
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

function repairUnprotectedMarkdown(text: string): string {
  let next = text.replace(/\r\n?/g, "\n");

  next = next.replace(/[ \t]+$/gm, "");
  next = next.replace(/^\s{0,3}(#{1,6})([^\s#])/gm, "$1 $2");
  next = next.replace(/^\s{0,3}([*+-])([^\s*+-])/gm, "$1 $2");
  next = next.replace(/^\s{0,3}(\d+)\.([^\s])/gm, "$1. $2");
  next = next.replace(/^\s{0,3}>([^\s>])/gm, "> $1");
  next = next.replace(/\*\*\s+([^*\n]+?)\s+\*\*/g, "**$1**");
  next = next.replace(/(?<!\*)\*\s+([^*\n]+?)\s+\*(?!\*)/g, "*$1*");
  next = next.replace(/\$\s+([^$\n]+?)\s+\$/g, "$$$1$$");
  next = next.replace(/\\\[/g, "$$").replace(/\\\]/g, "$$");
  next = next.replace(/\\\(/g, "$").replace(/\\\)/g, "$");

  next = next.replace(/(^|\n)(#{1,6} .+)(?=\n(?!\n))/g, "$1$2\n");
  next = next.replace(/(^|\n)([*+-] .+(?:\n[*+-] .+)*)\n(?!\n|[*+-] )/g, "$1$2\n\n");
  next = next.replace(/(^|\n)(\d+\. .+(?:\n\d+\. .+)*)\n(?!\n|\d+\. )/g, "$1$2\n\n");

  return next;
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

export function renderMarkdownToHtml(content: string): string {
  const html = md.render(normalizeMarkdownForRender(content));
  return postprocessDashedSepAsHtml(html);
}

export function extractTocItems(content: string): TocItem[] {
  const slugger = new GithubSlugger();
  const tokens = md.parse(normalizeMarkdownForRender(content), {});
  const items: TocItem[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== "heading_open") continue;
    const level = Number(token.tag.slice(1));
    if (!Number.isFinite(level) || level < 1 || level > 6) continue;

    const inline = tokens[i + 1];
    if (inline?.type !== "inline") continue;

    const title = inline.content.trim();
    if (!title) continue;

    items.push({
      id: slugger.slug(title),
      title,
      level,
    });
  }

  return items;
}
