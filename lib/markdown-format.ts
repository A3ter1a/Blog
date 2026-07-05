const FENCED_CODE_PATTERN = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g;
const MARKDOWN_IMAGE_PATTERN = /!\[[^\]\n]*\]\((?:\\.|[^)\n])+\)/g;
const COLLAPSED_IMAGE_HEADING_PATTERN = /(!\[[^\]\n]*\]\((?:\\.|[^)\n])+\))(?=#{1,6}\s)/g;
const IMAGE_BEFORE_HEADING_PATTERN = /(!\[[^\]\n]*\]\((?:\\.|[^)\n])+\))[ \t]*\n(?=#{1,6}\s)/g;
const HTML_IMAGE_PATTERN = /<img\b[^>]*>/gi;
const BAIDU_IMAGE_BLOCK_PATTERN = /(?:<div\b[^>]*>\s*)?(<img\b[^>]*>)(?:\s*<\/div>)?/gi;
const ESCAPED_BAIDU_IMAGE_BLOCK_PATTERN = /(?:&lt;div\b[\s\S]*?&gt;\s*)?(&lt;img\b[\s\S]*?(?:\/?&gt;|&gt;))(?:\s*&lt;\/div&gt;)?/gi;
const BAIDU_IMAGE_WIDTH_TITLE_PATTERN = /^width=(\d{1,3}(?:\.\d+)?%|\d{1,4}px)$/i;

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

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/");
}

function getHtmlAttribute(tag: string, name: string): string | null {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'<>` + "`" + `=]+))`, "i");
  const match = tag.match(pattern);
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value ? decodeHtmlEntities(value).trim() : null;
}

function escapeMarkdownImageAlt(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/]/g, "\\]");
}

function normalizeImageWidth(value: string | null): string | null {
  if (!value) return null;
  const width = value.trim();
  if (!BAIDU_IMAGE_WIDTH_TITLE_PATTERN.test(`width=${width}`)) return null;

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

function htmlImageToMarkdown(rawImageTag: string): string | null {
  const imageTag = decodeHtmlEntities(rawImageTag);
  const src = getHtmlAttribute(imageTag, "src");
  if (!src) return null;

  const alt = escapeMarkdownImageAlt(getHtmlAttribute(imageTag, "alt") || "Image");
  const width = normalizeImageWidth(getHtmlAttribute(imageTag, "width"));
  const title = width ? ` "width=${width}"` : "";
  return `\n\n![${alt}](${src}${title})\n\n`;
}

export function normalizeMarkdownImageHtml(content: string): string {
  return mapOutsideFencedCode(content, (segment) => segment
    .replace(ESCAPED_BAIDU_IMAGE_BLOCK_PATTERN, (full, escapedImageTag: string) => {
      return htmlImageToMarkdown(escapedImageTag) ?? full;
    })
    .replace(BAIDU_IMAGE_BLOCK_PATTERN, (full, imageTag: string) => {
      return htmlImageToMarkdown(imageTag) ?? full;
    }));
}

export function normalizeMarkdownImageBlocks(content: string): string {
  return mapOutsideFencedCode(normalizeMarkdownImageHtml(content), (segment) => segment
    .replace(COLLAPSED_IMAGE_HEADING_PATTERN, "$1\n\n")
    .replace(IMAGE_BEFORE_HEADING_PATTERN, "$1\n\n"));
}

export function getMarkdownTextStats(content: string): {
  wordCount: number;
  characterCount: number;
} {
  const textOnly = mapOutsideFencedCode(normalizeMarkdownImageHtml(content), (segment) => segment
    .replace(MARKDOWN_IMAGE_PATTERN, "")
    .replace(HTML_IMAGE_PATTERN, ""));

  return {
    wordCount: textOnly.replace(/\s/g, "").length,
    characterCount: textOnly.length,
  };
}
