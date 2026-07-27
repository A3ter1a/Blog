import type { NoteType, Subject, Problem, Video } from './types';
import { sanitizeFileName } from './utils';
import { normalizeMarkdownForWrite, normalizeProblemForWrite } from './content-contract';

type FrontMatterValue = string | string[];
type FrontMatter = Record<string, FrontMatterValue>;
type ImportRecord = Record<string, unknown>;

const NOTE_TYPES: NoteType[] = ['note', 'problem', 'essay'];
const SUBJECTS: Subject[] = ['math', 'english', 'politics', 'economics'];
const MAX_IMPORT_NOTES = 100;
const MAX_IMPORT_TITLE_LENGTH = 300;
const MAX_IMPORT_CONTENT_LENGTH = 500_000;
const MAX_IMPORT_TAGS = 30;
const MAX_IMPORT_ARRAY_ITEMS = 500;

function isRecord(value: unknown): value is ImportRecord {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asStringArray(value: unknown, field = 'tags'): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`${field} 必须是字符串数组`);
  }
  if (value.length > MAX_IMPORT_TAGS) {
    throw new Error(`${field} 最多允许 ${MAX_IMPORT_TAGS} 项`);
  }
  return value;
}

function asNoteType(value: unknown): NoteType | undefined {
  return typeof value === 'string' && NOTE_TYPES.includes(value as NoteType) ? value as NoteType : undefined;
}

function asSubject(value: unknown): Subject | undefined {
  return typeof value === 'string' && SUBJECTS.includes(value as Subject) ? value as Subject : undefined;
}

function asDate(value: unknown, field = '日期'): Date | undefined {
  if (value === undefined) return undefined;
  const text = asString(value);
  if (!text) throw new Error(`${field} 必须是有效的日期字符串`);

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} 必须是有效的日期字符串`);
  return date;
}

function asEncodedArray(value: unknown, field: string): unknown[] | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value;

  const text = asString(value);
  if (!text) throw new Error(`${field} 必须是数组或 URL 编码的 JSON 数组`);

  try {
    const decoded = decodeURIComponent(text);
    const parsed = JSON.parse(decoded);
    if (!Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new Error(`${field} 必须是有效的数组`);
  }
}

function asVideos(value: unknown): Video[] | undefined {
  const videos = asEncodedArray(value, 'videos');
  if (!videos) return undefined;
  if (videos.length > MAX_IMPORT_ARRAY_ITEMS) {
    throw new Error(`videos 最多允许 ${MAX_IMPORT_ARRAY_ITEMS} 项`);
  }

  return videos.map((item, index) => {
    if (!isRecord(item)) throw new Error(`videos[${index}] 必须是对象`);
    if (typeof item.id !== 'string' || !item.id.trim()) throw new Error(`videos[${index}].id 必须是非空字符串`);
    if (item.platform !== 'bilibili' && item.platform !== 'youtube') throw new Error(`videos[${index}].platform 仅支持 bilibili 或 youtube`);
    if (typeof item.title !== 'string') throw new Error(`videos[${index}].title 必须是字符串`);
    return item as unknown as Video;
  });
}

function asProblems(value: unknown): Problem[] | undefined {
  const problems = asEncodedArray(value, 'problems');
  if (!problems) return undefined;
  if (problems.length > MAX_IMPORT_ARRAY_ITEMS) {
    throw new Error(`problems 最多允许 ${MAX_IMPORT_ARRAY_ITEMS} 项`);
  }

  return problems.map((item, index) => {
    if (!isRecord(item)) throw new Error(`problems[${index}] 必须是对象`);
    if (typeof item.id !== 'string' || !item.id.trim()) throw new Error(`problems[${index}].id 必须是非空字符串`);
    if (!['choice', 'fill', 'calculation', 'proof', 'proofEssay'].includes(String(item.type))) {
      throw new Error(`problems[${index}].type 不是支持的题型`);
    }
    if (!['easy', 'medium', 'hard'].includes(String(item.difficulty))) {
      throw new Error(`problems[${index}].difficulty 不是支持的难度`);
    }
    for (const field of ['question', 'answer', 'explanation'] as const) {
      if (typeof item[field] !== 'string') throw new Error(`problems[${index}].${field} 必须是字符串`);
    }
    if (!Array.isArray(item.tags) || !item.tags.every((tag) => typeof tag === 'string')) {
      throw new Error(`problems[${index}].tags 必须是字符串数组`);
    }
    if (item.options !== undefined && (!Array.isArray(item.options) || item.options.some((option) => (
      !isRecord(option) || typeof option.label !== 'string' || typeof option.content !== 'string'
    )))) {
      throw new Error(`problems[${index}].options 必须是包含 label 和 content 的数组`);
    }
    return item as unknown as Problem;
  });
}

function validateNoteRecord(record: ImportRecord, index: number) {
  const prefix = `第 ${index + 1} 条`;
  if (record.title !== undefined && typeof record.title !== 'string') throw new Error(`${prefix}.title 必须是字符串`);
  if (record.content !== undefined && typeof record.content !== 'string') throw new Error(`${prefix}.content 必须是字符串`);
  if (typeof record.title === 'string' && record.title.length > MAX_IMPORT_TITLE_LENGTH) throw new Error(`${prefix}.title 超过 ${MAX_IMPORT_TITLE_LENGTH} 个字符`);
  if (typeof record.content === 'string' && record.content.length > MAX_IMPORT_CONTENT_LENGTH) throw new Error(`${prefix}.content 超过 ${MAX_IMPORT_CONTENT_LENGTH} 个字符`);
  if (record.coverImage !== undefined && typeof record.coverImage !== 'string') throw new Error(`${prefix}.coverImage 必须是字符串`);
  asStringArray(record.tags, `${prefix}.tags`);
  asDate(record.createdAt, `${prefix}.createdAt`);
  asDate(record.updatedAt, `${prefix}.updatedAt`);
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
  if (notes.length === 0) throw new Error('导入包为空');
  if (notes.length > MAX_IMPORT_NOTES) throw new Error(`一次最多导入 ${MAX_IMPORT_NOTES} 篇笔记`);

  return notes.map((item: unknown, index) => {
    if (!isRecord(item)) throw new Error(`第 ${index + 1} 条必须是对象`);
    const record = item;
    validateNoteRecord(record, index);

    return {
      title: asString(record.title) || 'Untitled',
      content: normalizeMarkdownForWrite(asString(record.content) || '', 'import'),
      tags: asStringArray(record.tags, `第 ${index + 1} 条.tags`),
      createdAt: asDate(record.createdAt, `第 ${index + 1} 条.createdAt`) || new Date(),
      updatedAt: asDate(record.updatedAt, `第 ${index + 1} 条.updatedAt`) || new Date(),
      coverImage: asString(record.coverImage),
      videos: asVideos(record.videos),
      type: asNoteType(record.type),
      subject: asSubject(record.subject),
      problems: asProblems(record.problems)?.map((problem) => normalizeProblemForWrite(problem, 'import')),
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
    content: normalizeMarkdownForWrite(body, 'import'),
    tags: allTags,
    createdAt,
    updatedAt,
    coverImage: asString(frontMatter.coverImage),
    videos: asVideos(frontMatter.videos),
    type: asNoteType(frontMatter.type),
    subject: asSubject(frontMatter.subject),
    problems: asProblems(frontMatter.problems)?.map((problem) => normalizeProblemForWrite(problem, 'import')),
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
  return content.replace(/\[\[([^\]]+)\]\]/g, (_match, text) => {
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
