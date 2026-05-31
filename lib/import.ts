import type { NoteType, Subject, Problem, Video } from './types';
import { sanitizeFileName } from './utils';

type FrontMatterValue = string | string[];
type FrontMatter = Record<string, FrontMatterValue>;
type ImportRecord = Record<string, unknown>;

const NOTE_TYPES: NoteType[] = ['note', 'problem', 'essay'];
const SUBJECTS: Subject[] = ['math', 'english', 'politics', 'economics'];

function isRecord(value: unknown): value is ImportRecord {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asNoteType(value: unknown): NoteType | undefined {
  return typeof value === 'string' && NOTE_TYPES.includes(value as NoteType) ? value as NoteType : undefined;
}

function asSubject(value: unknown): Subject | undefined {
  return typeof value === 'string' && SUBJECTS.includes(value as Subject) ? value as Subject : undefined;
}

function asDate(value: unknown): Date | undefined {
  const text = asString(value);
  if (!text) return undefined;

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function asEncodedArray<T>(value: unknown): T[] | undefined {
  if (Array.isArray(value)) return value as T[];

  const text = asString(value);
  if (!text) return undefined;

  try {
    const decoded = decodeURIComponent(text);
    const parsed = JSON.parse(decoded);
    return Array.isArray(parsed) ? parsed as T[] : undefined;
  } catch {
    return undefined;
  }
}

function asVideos(value: unknown): Video[] | undefined {
  return asEncodedArray<Video>(value);
}

function asProblems(value: unknown): Problem[] | undefined {
  return asEncodedArray<Problem>(value);
}

/**
 * Parsed note data from import files
 */
export interface ParsedNote {
  title: string;
  content: string;
  tags: string[];
  createdAt?: Date;
  updatedAt?: Date;
  coverImage?: string;
  videos?: Video[];
  type?: NoteType;
  subject?: Subject;
  problems?: Problem[];
  raw?: ImportRecord | FrontMatter;
}

/**
 * Detect file format from content
 */
export function detectFormat(content: string): 'json' | 'markdown' | 'obsidian' | 'unknown' {
  const trimmed = content.trim();

  // Check for JSON
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not valid JSON
    }
  }

  // Check for Obsidian front matter with Obsidian-specific fields
  if (trimmed.startsWith('---')) {
    const hasObsidianFields = /aliases:|cssclasses:|tags:.*\|/i.test(trimmed);
    if (hasObsidianFields) {
      return 'obsidian';
    }
    return 'markdown';
  }

  return 'unknown';
}

/**
 * Parse YAML front matter from markdown content
 */
export function parseFrontMatter(content: string): {
  frontMatter: FrontMatter;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontMatter: {}, body: content };

  const fmText = match[1];
  const body = match[2];

  const frontMatter: FrontMatter = {};
  const lines = fmText.split('\n');
  let currentKey = '';
  let currentArray: string[] = [];

  for (const line of lines) {
    // Check for array item
    if (line.startsWith('  - ') || line.startsWith('- ')) {
      if (currentKey) {
        const item = line.replace(/^(\s*-\s*)/, '').trim().replace(/^["']|["']$/g, '');
        currentArray.push(item);
        continue;
      }
    }

    // Commit previous array
    if (currentKey && currentArray.length > 0) {
      frontMatter[currentKey] = currentArray;
      currentKey = '';
      currentArray = [];
    }

    // Check for key: value, including array headers like "tags:"
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();

      if (!value) {
        currentKey = key;
        currentArray = [];
        continue;
      }

      // Parse inline array [a, b, c]
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1);
        const items = value.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
        frontMatter[key] = items;
      } else {
        // Remove quotes
        value = value.replace(/^["']|["']$/g, '');
        frontMatter[key] = value;
        currentKey = '';
      }
    }
  }

  // Commit last array
  if (currentKey && currentArray.length > 0) {
    frontMatter[currentKey] = currentArray;
  }

  return { frontMatter, body };
}

/**
 * Import from JSON content
 */
export function importFromJSON(content: string): ParsedNote[] {
  const parsed = JSON.parse(content);
  const notes = Array.isArray(parsed) ? parsed : [parsed];

  return notes.map((item: unknown) => {
    const record = isRecord(item) ? item : {};

    return {
      title: asString(record.title) || 'Untitled',
      content: asString(record.content) || '',
      tags: asStringArray(record.tags),
      createdAt: asDate(record.createdAt) || new Date(),
      updatedAt: asDate(record.updatedAt) || new Date(),
      coverImage: asString(record.coverImage),
      videos: asVideos(record.videos),
      type: asNoteType(record.type),
      subject: asSubject(record.subject),
      problems: asProblems(record.problems),
      raw: record,
    };
  });
}

/**
 * Import from Markdown content (with front matter)
 */
export function importFromMarkdown(content: string): ParsedNote {
  const { frontMatter, body } = parseFrontMatter(content);

  // Extract inline tags from body (#tag)
  const inlineTags = extractInlineTags(body);

  // Merge tags from front matter and inline
  const fmTags = Array.isArray(frontMatter.tags) 
    ? frontMatter.tags 
    : typeof frontMatter.tags === 'string'
      ? frontMatter.tags.split(',').map((t) => t.trim())
      : [];
  const allTags = [...new Set([...fmTags, ...inlineTags])];
  const createdAt = asDate(frontMatter.created);
  const updatedAt = asDate(frontMatter.updated);

  return {
    title: asString(frontMatter.title) || extractFirstHeading(body) || 'Untitled',
    content: body,
    tags: allTags,
    createdAt,
    updatedAt,
    coverImage: asString(frontMatter.coverImage),
    videos: asVideos(frontMatter.videos),
    type: asNoteType(frontMatter.type),
    subject: asSubject(frontMatter.subject),
    problems: asProblems(frontMatter.problems),
    raw: frontMatter,
  };
}

/**
 * Import from Obsidian format (special handling for wiki links)
 */
export function importFromObsidian(content: string): ParsedNote {
  const parsed = importFromMarkdown(content);

  // Convert [[wiki links]] to standard format
  parsed.content = convertObsidianLinks(parsed.content);

  return parsed;
}

/**
 * Convert Obsidian wiki-links to standard Markdown links
 */
export function convertObsidianLinks(content: string): string {
  return content.replace(/\[\[([^\]]+)\]\]/g, (match, text) => {
    // Check for display text: [[Target|Display]]
    const parts = text.split('|');
    if (parts.length === 2) {
      return `[${parts[1]}](${sanitizeFileName(parts[0])}.md)`;
    }
    return `[${text}](${sanitizeFileName(text)}.md)`;
  });
}

/**
 * Extract inline #tags from content
 */
export function extractInlineTags(content: string): string[] {
  const tagRegex = /#([^\s#,;!?.\[\](){}"']+)/g;
  const matches = content.match(tagRegex) || [];
  return matches.map(tag => tag.substring(1));
}

/**
 * Extract the first heading from content
 */
function extractFirstHeading(content: string): string | null {
  const match = content.match(/^#{1,6}\s+(.+)$/m);
  return match ? match[1].trim() : null;
}
