import {
  economicsTerms,
  getEconomicsTermAliases,
  type EconomicsTerm,
} from "@/lib/economics-glossary";

export type EconomicsTextSegment =
  | { type: "text"; text: string }
  | { type: "term"; text: string; term: EconomicsTerm };

type TermAlias = {
  alias: string;
  lowerAlias: string;
  latin: boolean;
  term: EconomicsTerm;
};

const LATIN_EDGE_PATTERN = /[A-Za-z0-9]/;

function escapeAlias(alias: string): string {
  return alias.trim();
}

function isLatinAlias(alias: string): boolean {
  return /^[A-Za-z0-9\s-]+$/.test(alias);
}

const termAliases: TermAlias[] = economicsTerms
  .flatMap((term) =>
    getEconomicsTermAliases(term).map((alias) => ({
      alias: escapeAlias(alias),
      lowerAlias: escapeAlias(alias).toLowerCase(),
      latin: isLatinAlias(alias),
      term,
    })),
  )
  .filter((item) => item.alias.length > 1)
  .sort((a, b) => b.alias.length - a.alias.length);

function hasLatinEdge(value: string | undefined): boolean {
  return Boolean(value && LATIN_EDGE_PATTERN.test(value));
}

function hasBoundary(text: string, index: number, length: number, latin: boolean): boolean {
  if (!latin) return true;
  return !hasLatinEdge(text[index - 1]) && !hasLatinEdge(text[index + length]);
}

function findTermAt(text: string, lowerText: string, index: number): TermAlias | undefined {
  for (const item of termAliases) {
    if (!lowerText.startsWith(item.lowerAlias, index)) continue;
    if (!hasBoundary(text, index, item.alias.length, item.latin)) continue;
    return item;
  }

  return undefined;
}

export function splitEconomicsTermText(text: string): EconomicsTextSegment[] {
  if (!text.trim()) return [{ type: "text", text }];

  const lowerText = text.toLowerCase();
  const segments: EconomicsTextSegment[] = [];
  let cursor = 0;
  let bufferStart = 0;

  while (cursor < text.length) {
    const match = findTermAt(text, lowerText, cursor);
    if (!match) {
      cursor += 1;
      continue;
    }

    if (bufferStart < cursor) {
      segments.push({ type: "text", text: text.slice(bufferStart, cursor) });
    }

    const end = cursor + match.alias.length;
    segments.push({ type: "term", text: text.slice(cursor, end), term: match.term });
    cursor = end;
    bufferStart = cursor;
  }

  if (bufferStart < text.length) {
    segments.push({ type: "text", text: text.slice(bufferStart) });
  }

  return segments.length > 0 ? segments : [{ type: "text", text }];
}
