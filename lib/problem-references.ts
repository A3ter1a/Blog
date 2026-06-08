export type ProblemReference = {
  noteId: string;
  selection: string;
  numbers: number[];
  raw: string;
};

export type ProblemReferenceContentSegment =
  | { type: "markdown"; content: string }
  | { type: "reference"; reference: ProblemReference };

const PROBLEM_REFERENCE_PATTERN = /<!--\s*asteroid-problems:([A-Za-z0-9_-]+):([0-9,\s，、-]+)\s*-->/g;

export function parseProblemSelection(selection: string): number[] {
  const seen = new Set<number>();
  const numbers: number[] = [];
  const parts = selection
    .replace(/[，、]/g, ",")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < 1) continue;

      const from = Math.min(start, end);
      const to = Math.max(start, end);
      for (let value = from; value <= to; value++) {
        if (!seen.has(value)) {
          seen.add(value);
          numbers.push(value);
        }
      }
      continue;
    }

    const value = Number(part);
    if (!Number.isInteger(value) || value < 1 || seen.has(value)) continue;
    seen.add(value);
    numbers.push(value);
  }

  return numbers.sort((a, b) => a - b);
}

export function formatProblemSelection(numbers: number[]): string {
  const sorted = Array.from(new Set(numbers.filter((value) => Number.isInteger(value) && value > 0)))
    .sort((a, b) => a - b);
  const ranges: string[] = [];

  for (let index = 0; index < sorted.length; index++) {
    const start = sorted[index];
    let end = start;

    while (sorted[index + 1] === end + 1) {
      end = sorted[index + 1];
      index++;
    }

    ranges.push(start === end ? String(start) : `${start}-${end}`);
  }

  return ranges.join(",");
}

export function createProblemReferenceMarker(noteId: string, numbers: number[]): string {
  const selection = formatProblemSelection(numbers);
  return selection ? `<!--asteroid-problems:${noteId}:${selection}-->` : "";
}

export function splitProblemReferenceContent(content: string): ProblemReferenceContentSegment[] {
  const segments: ProblemReferenceContentSegment[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(PROBLEM_REFERENCE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ type: "markdown", content: content.slice(lastIndex, index) });
    }

    const noteId = match[1];
    const selection = match[2].trim();
    const numbers = parseProblemSelection(selection);
    if (noteId && numbers.length > 0) {
      segments.push({
        type: "reference",
        reference: {
          noteId,
          selection: formatProblemSelection(numbers),
          numbers,
          raw: match[0],
        },
      });
    } else {
      segments.push({ type: "markdown", content: match[0] });
    }

    lastIndex = index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: "markdown", content: content.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: "markdown", content }];
}

export function extractProblemReferenceNoteIds(content: string): string[] {
  const ids = splitProblemReferenceContent(content)
    .filter((segment): segment is Extract<ProblemReferenceContentSegment, { type: "reference" }> => segment.type === "reference")
    .map((segment) => segment.reference.noteId);

  return Array.from(new Set(ids));
}
