import { restoreLatexEscapedControlChars } from "./utils.ts";
import { repairAIJsonText } from "./ai-json-repair.ts";

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function extractBalancedJson(text: string): string | null {
  const source = stripCodeFence(text);
  const start = source.search(/[\[{]/);
  if (start === -1) return null;

  const opener = source[start];
  const closer = opener === '{' ? '}' : ']';
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i++) {
    const char = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      stack.push(char === '{' ? '}' : ']');
      continue;
    }

    if (char === '}' || char === ']') {
      if (stack.pop() !== char) return null;
      if (stack.length === 0 && char === closer) {
        return source.slice(start, i + 1).trim();
      }
    }
  }

  return null;
}

function restoreLatexControlEscapes(value: unknown): unknown {
  if (typeof value === 'string') {
    return restoreLatexEscapedControlChars(value);
  }

  if (Array.isArray(value)) {
    return value.map(restoreLatexControlEscapes);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, restoreLatexControlEscapes(entry)])
    );
  }

  return value;
}

function parseJsonCandidate(candidate: string): unknown {
  const cleaned = stripCodeFence(candidate);
  try {
    return restoreLatexControlEscapes(JSON.parse(cleaned));
  } catch {
    return restoreLatexControlEscapes(JSON.parse(repairAIJsonText(cleaned)));
  }
}

export function parseAIJson(content: string): unknown {
  const candidates = [
    content,
    stripCodeFence(content),
    extractBalancedJson(content),
  ].filter((candidate): candidate is string => Boolean(candidate?.trim()));

  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      return parseJsonCandidate(candidate);
    } catch (error: unknown) {
      errors.push(error instanceof Error ? error.message : 'Unknown parse error');
    }
  }

  throw new Error(errors[0] || 'No valid JSON found in AI response');
}
