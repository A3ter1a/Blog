export const REVIEW_CHUNK_CHAR_LIMIT = 14_000;

const FENCE_PATTERN = /^\s*(```|~~~)/;
const MARKDOWN_HEADING_PATTERN = /^\s{0,3}#{1,6}\s+\S/;
const NUMBERED_SECTION_HEADING_PATTERN = /^\s*\d+(?:\s*[.．]\s*\d+){1,5}\s+\S/;
const CHAPTER_HEADING_PATTERN = /^\s*第[一二三四五六七八九十百千万0-9]+[章节篇]\s*\S/;
const LONG_LINE_BREAK_PATTERN = /[。；;，,\s]/g;

function getRawLines(content: string): string[] {
  return content.match(/[^\n]*(?:\n|$)/g)?.filter((line) => line.length > 0) ?? [];
}

function countDoubleDollarMarkers(line: string): number {
  let count = 0;
  for (let index = 0; index < line.length - 1; index++) {
    if (line[index] === "\\" && line[index + 1] === "$") {
      index += 1;
      continue;
    }

    if (line[index] === "$" && line[index + 1] === "$") {
      count += 1;
      index += 1;
    }
  }
  return count;
}

function isLikelyHeadingBoundary(rawLine: string): boolean {
  const line = rawLine.replace(/\n$/, "");
  return MARKDOWN_HEADING_PATTERN.test(line)
    || NUMBERED_SECTION_HEADING_PATTERN.test(line)
    || CHAPTER_HEADING_PATTERN.test(line);
}

function splitIntoMarkdownBlocks(markdown: string): string[] {
  const lines = getRawLines(markdown.replace(/\r\n?/g, "\n"));
  const blocks: string[] = [];
  let current = "";
  let fenceMarker: string | null = null;
  let inDisplayMath = false;

  const flush = () => {
    if (!current) return;
    blocks.push(current);
    current = "";
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\n$/, "");
    const trimmedLine = line.trimStart();

    if (!fenceMarker && !inDisplayMath && current.trim() && isLikelyHeadingBoundary(rawLine)) {
      flush();
    }

    current += rawLine;

    const fenceMatch = trimmedLine.match(FENCE_PATTERN);
    if (!inDisplayMath && fenceMatch) {
      if (!fenceMarker) {
        fenceMarker = fenceMatch[1];
      } else if (trimmedLine.startsWith(fenceMarker)) {
        fenceMarker = null;
      }
    }

    if (!fenceMarker && countDoubleDollarMarkers(line) % 2 === 1) {
      inDisplayMath = !inDisplayMath;
    }

    if (!fenceMarker && !inDisplayMath && line.trim() === "") {
      flush();
    }
  }

  flush();
  return blocks;
}

function findLongLineBreak(text: string, limit: number): number {
  LONG_LINE_BREAK_PATTERN.lastIndex = 0;
  let bestIndex = -1;
  let match: RegExpExecArray | null;

  while ((match = LONG_LINE_BREAK_PATTERN.exec(text)) !== null) {
    if (match.index > limit) break;
    if (match.index >= limit * 0.55) {
      bestIndex = match.index + match[0].length;
    }
  }

  return bestIndex > 0 ? bestIndex : limit;
}

function splitLongText(text: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let rest = text;

  while (rest.length > maxChars) {
    const splitIndex = findLongLineBreak(rest, maxChars);
    pieces.push(rest.slice(0, splitIndex));
    rest = rest.slice(splitIndex);
  }

  if (rest) pieces.push(rest);
  return pieces;
}

function splitOversizedBlock(block: string, maxChars: number): string[] {
  if (block.length <= maxChars) return [block];

  const pieces: string[] = [];
  let current = "";

  for (const rawLine of getRawLines(block)) {
    if (rawLine.length > maxChars) {
      if (current) {
        pieces.push(current);
        current = "";
      }
      pieces.push(...splitLongText(rawLine, maxChars));
      continue;
    }

    if (current && current.length + rawLine.length > maxChars) {
      pieces.push(current);
      current = rawLine;
    } else {
      current += rawLine;
    }
  }

  if (current) pieces.push(current);
  return pieces;
}

export function splitMarkdownForReview(
  markdown: string,
  maxChars = REVIEW_CHUNK_CHAR_LIMIT,
): string[] {
  const safeMaxChars = Math.max(4000, Math.floor(maxChars));
  const blocks = splitIntoMarkdownBlocks(markdown)
    .flatMap((block) => splitOversizedBlock(block, safeMaxChars));
  const chunks: string[] = [];
  let current = "";

  for (const block of blocks) {
    if (!block.trim()) continue;

    if (current && current.length + block.length > safeMaxChars) {
      chunks.push(current.trim());
      current = block;
      continue;
    }

    current += block;
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
