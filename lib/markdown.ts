import GithubSlugger from "github-slugger";
import katex from "katex";
import markdownit from "markdown-it";
import markdownitMark from "markdown-it-mark";
import {
  decodeLatexHtmlEntities,
  normalizeLatexForKatex,
  preprocessDashedSep,
  preprocessLatex,
  postprocessDashedSepAsHtml,
} from "./utils.ts";
import { postprocessColoredHighlightAsHtml } from "./colored-highlight.ts";
import { normalizeMarkdownSyntax, splitProtectedMarkdownBlocks } from "./markdown-normalizer.ts";

const md = markdownit({
  html: false,
  breaks: true,
  linkify: true,
}).use(markdownitMark);

const defaultHeadingOpenRender = md.renderer.rules.heading_open;

md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const inline = tokens[idx + 1];
  const renderEnv = env as { headingSlugger?: GithubSlugger; mathSpanValues?: string[] };
  const slugger = renderEnv.headingSlugger ?? new GithubSlugger();
  renderEnv.headingSlugger = slugger;
  const rawTitle = inline?.type === "inline" ? inline.content.trim() : "";
  const title = restoreMathSpanTokens(rawTitle, renderEnv.mathSpanValues ?? []);

  if (title) {
    token.attrSet("id", slugger.slug(title));
  }

  return defaultHeadingOpenRender
    ? defaultHeadingOpenRender(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options);
};

const IMAGE_WIDTH_TITLE_PATTERN = /^width=(\d{1,3}(?:\.\d+)?%|\d{1,4}px)$/i;
const defaultImageRender = md.renderer.rules.image;

function normalizeImageRenderWidth(title: string | null): string | null {
  const width = title?.match(IMAGE_WIDTH_TITLE_PATTERN)?.[1];
  if (!width) return null;

  const percentMatch = width.match(/^(\d{1,3}(?:\.\d+)?)%$/);
  if (percentMatch) {
    const percent = Number(percentMatch[1]);
    return percent > 0 && percent <= 100 ? width : null;
  }

  const pixelMatch = width.match(/^(\d{1,4})px$/i);
  if (pixelMatch) {
    const pixels = Number(pixelMatch[1]);
    return pixels > 0 && pixels <= 1600 ? width : null;
  }

  return null;
}

md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const width = normalizeImageRenderWidth(token.attrGet("title"));

  if (width) {
    token.attrs = token.attrs?.filter(([name]) => name !== "title") ?? null;
    token.attrSet(
      "style",
      `display:block;margin-left:auto;margin-right:auto;width:${width};height:auto;max-width:100%;`,
    );
  }

  return defaultImageRender
    ? defaultImageRender(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options);
};

export interface TocItem {
  id: string;
  title: string;
  level: number;
}

type RenderMarkdownOptions = {
  renderMath?: boolean;
};

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
  const protectedContent = splitProtectedMarkdownBlocks(content)
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
  const latex = normalizeLatexForKatex(
    decodeLatexHtmlEntities(value.slice(delimiterLength, -delimiterLength)),
    displayMode,
  )
    .replace(/[\n\r]+/g, displayMode ? " " : "\n")
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

export function repairMarkdown(content: string): string {
  return normalizeMarkdownSyntax(content);
}

export function normalizeMarkdownForRender(content: string): string {
  return preprocessDashedSep(preprocessLatex(repairMarkdown(content)));
}

export function renderMarkdownToHtml(content: string, options: RenderMarkdownOptions = {}): string {
  const protectedMath = protectMathSpansForMarkdown(normalizeMarkdownForRender(content));
  const html = md.render(protectedMath.content, {
    headingSlugger: new GithubSlugger(),
    mathSpanValues: protectedMath.values,
  });
  const dashedHtml = postprocessDashedSepAsHtml(postprocessColoredHighlightAsHtml(html));
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
