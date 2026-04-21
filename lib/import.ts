import { Note, NoteType, Subject, Problem, ProblemType, Difficulty } from './types';

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
  type?: NoteType;
  subject?: Subject;
  problems?: Problem[];
  raw?: Record<string, any>;
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
  frontMatter: Record<string, any>;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontMatter: {}, body: content };

  const fmText = match[1];
  const body = match[2];

  const frontMatter: Record<string, any> = {};
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

    // Check for key: value
    const colonIndex = line.indexOf(': ');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 2).trim();

      // Parse inline array [a, b, c]
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1);
        const items = value.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
        frontMatter[key] = items;
      } else {
        // Remove quotes
        value = value.replace(/^["']|["']$/g, '');
        frontMatter[key] = value;
        currentKey = key;
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

  return notes.map((item: any) => ({
    title: item.title || 'Untitled',
    content: item.content || '',
    tags: Array.isArray(item.tags) ? item.tags : [],
    createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
    updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date(),
    coverImage: item.coverImage || undefined,
    type: item.type || undefined,
    subject: item.subject || undefined,
    problems: item.problems || undefined,
    raw: item,
  }));
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
      ? frontMatter.tags.split(',').map((t: string) => t.trim())
      : [];
  const allTags = [...new Set([...fmTags, ...inlineTags])];

  return {
    title: frontMatter.title || extractFirstHeading(body) || 'Untitled',
    content: body,
    tags: allTags,
    createdAt: frontMatter.created ? new Date(frontMatter.created) : undefined,
    updatedAt: frontMatter.updated ? new Date(frontMatter.updated) : undefined,
    coverImage: frontMatter.coverImage || undefined,
    type: frontMatter.type || undefined,
    subject: frontMatter.subject || undefined,
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

/**
 * Sanitize filename
 */
function sanitizeFileName(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '-').substring(0, 100);
}
