import { normalizeMarkdownImageBlocks } from "./markdown-format.ts";
import {
  restoreLatexEscapedControlChars,
  separateCollapsedInlineMathSpans,
} from "./utils.ts";

export type MarkdownSegment = {
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

    return [before, `$${envMatch[0].trim()}$`, after].filter(Boolean).join(" ");
  });
}

function normalizeLatexInput(content: string): string {
  return splitInlineEnvironmentWithText(
    separateCollapsedInlineMathSpans(restoreLatexEscapedControlChars(content)),
  );
}

export function splitProtectedMarkdownBlocks(content: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
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

const SIGNED_MATH_LINE_TOKEN = "AsteroidSignedMathLineToken";
const LIST_MARKER_SPACE_TOKEN = "AsteroidListMarkerSpaceToken";

function isLikelyStandaloneSignedMath(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed || /[\u3400-\u9fff]/.test(trimmed)) return false;
  if (/\s/.test(trimmed)) return false;
  if (/^[0-9]+(?:[.,][0-9]+)?(?:\/\d+)?$/.test(trimmed)) return true;
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
  return text.replace(new RegExp(`${SIGNED_MATH_LINE_TOKEN}(\\d+)`, "g"), (full, indexText: string) => (
    values[Number(indexText)] ?? full
  ));
}

function protectListMarkerTrailingSpaces(text: string): string {
  return text.replace(/^(\s{0,3}(?:[*+-]|\d+\.))[ \t]+$/gm, `$1${LIST_MARKER_SPACE_TOKEN}`);
}

function restoreListMarkerTrailingSpaces(text: string): string {
  return text.replaceAll(LIST_MARKER_SPACE_TOKEN, "");
}

function repairUnprotectedMarkdown(text: string): string {
  let next = text.replace(/\r\n?/g, "\n");
  const signedMathLines = protectStandaloneSignedMathLines(next);
  next = signedMathLines.text;

  next = protectListMarkerTrailingSpaces(next);
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

  return restoreListMarkerTrailingSpaces(
    restoreStandaloneSignedMathLines(next, signedMathLines.values),
  );
}

export function normalizeMarkdownSyntax(content: string): string {
  const repaired = splitProtectedMarkdownBlocks(normalizeLatexInput(content))
    .map((segment) => segment.protected ? segment.text : repairUnprotectedMarkdown(segment.text))
    .join("");

  return normalizeMarkdownImageBlocks(repaired)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
