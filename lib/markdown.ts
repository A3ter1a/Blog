import GithubSlugger from "github-slugger";
import markdownit from "markdown-it";
import markdownitMark from "markdown-it-mark";
import { preprocessDashedSep, preprocessLatex, postprocessDashedSepAsHtml } from "@/lib/utils";

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
  const repaired = splitProtectedBlocks(content)
    .map((segment) => segment.protected ? segment.text : repairUnprotectedMarkdown(segment.text))
    .join("");

  return repaired
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
