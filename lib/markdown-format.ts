const FENCED_CODE_PATTERN = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g;
const MARKDOWN_IMAGE_PATTERN = /!\[[^\]\n]*\]\((?:\\.|[^)\n])+\)/g;
const COLLAPSED_IMAGE_HEADING_PATTERN = /(!\[[^\]\n]*\]\((?:\\.|[^)\n])+\))(?=#{1,6}\s)/g;
const IMAGE_BEFORE_HEADING_PATTERN = /(!\[[^\]\n]*\]\((?:\\.|[^)\n])+\))[ \t]*\n(?=#{1,6}\s)/g;
const HTML_IMAGE_PATTERN = /<img\b[^>]*>/gi;

function mapOutsideFencedCode(content: string, mapper: (segment: string) => string): string {
  let lastIndex = 0;
  let result = "";

  for (const match of content.matchAll(FENCED_CODE_PATTERN)) {
    const index = match.index ?? 0;
    result += mapper(content.slice(lastIndex, index));
    result += match[0];
    lastIndex = index + match[0].length;
  }

  return result + mapper(content.slice(lastIndex));
}

export function normalizeMarkdownImageBlocks(content: string): string {
  return mapOutsideFencedCode(content, (segment) => segment
    .replace(COLLAPSED_IMAGE_HEADING_PATTERN, "$1\n\n")
    .replace(IMAGE_BEFORE_HEADING_PATTERN, "$1\n\n"));
}

export function getMarkdownTextStats(content: string): {
  wordCount: number;
  characterCount: number;
} {
  const textOnly = mapOutsideFencedCode(content, (segment) => segment
    .replace(MARKDOWN_IMAGE_PATTERN, "")
    .replace(HTML_IMAGE_PATTERN, ""));

  return {
    wordCount: textOnly.replace(/\s/g, "").length,
    characterCount: textOnly.length,
  };
}
