import type { Note, NoteType, Problem, Subject } from "@/lib/types";

export type NoteQAScope = "all" | NoteType;

export type NoteQASource = {
  id: string;
  noteId: string;
  noteTitle: string;
  noteType: NoteType;
  subject?: Subject;
  sourceLabel: string;
  excerpt: string;
  href: string;
  score: number;
};

type NoteQAChunk = NoteQASource & {
  content: string;
};

export type NoteQAContextResult = {
  context: string;
  sources: NoteQASource[];
  totalChunks: number;
};

const MAX_QUESTION_LENGTH = 500;
const MAX_CHUNK_CHARS = 900;
const CHUNK_OVERLAP_CHARS = 140;
const MAX_CONTEXT_CHARS = 9000;
const DEFAULT_CONTEXT_LIMIT = 8;

const STOP_TERMS = new Set([
  "这个",
  "那个",
  "什么",
  "怎么",
  "如何",
  "为什么",
  "一下",
  "帮我",
  "笔记",
  "题目",
  "知识",
  "解释",
  "总结",
]);

export function normalizeNoteQAQuestion(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_QUESTION_LENGTH);
}

export function normalizeNoteQAScope(value: unknown): NoteQAScope {
  return value === "note" || value === "problem" || value === "essay" ? value : "all";
}

function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|]/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toExcerpt(value: string, maxLength = 180): string {
  const clean = stripMarkdown(value);
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength)}...`;
}

function tokenize(value: string): string[] {
  const lower = value.toLowerCase();
  const words = lower.match(/[a-z0-9_]{2,}/g) ?? [];
  const chinese = lower.match(/[\u4e00-\u9fff]/g) ?? [];
  const bigrams: string[] = [];

  for (let index = 0; index < chinese.length - 1; index += 1) {
    bigrams.push(`${chinese[index]}${chinese[index + 1]}`);
  }

  return Array.from(new Set([...words, ...bigrams]))
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && !STOP_TERMS.has(term));
}

function splitLongContent(content: string): string[] {
  const clean = stripMarkdown(content);
  if (!clean) return [];
  if (clean.length <= MAX_CHUNK_CHARS) return [clean];

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < clean.length && chunks.length < 12) {
    const next = clean.slice(cursor, cursor + MAX_CHUNK_CHARS);
    chunks.push(next);
    cursor += MAX_CHUNK_CHARS - CHUNK_OVERLAP_CHARS;
  }

  return chunks;
}

function formatProblem(problem: Problem, index: number): string {
  const optionText = problem.options?.length
    ? `\n选项：${problem.options.map((option) => `${option.label}. ${option.content}`).join("；")}`
    : "";

  return `题目 ${index + 1}：${problem.question}${optionText}\n答案：${problem.answer}`;
}

function buildChunksFromNote(note: Note): NoteQAChunk[] {
  const chunks: NoteQAChunk[] = [];
  const base = {
    noteId: note.id,
    noteTitle: note.title,
    noteType: note.type,
    subject: note.subject,
    href: `/notes/${note.id}`,
  };

  splitLongContent(note.content).forEach((content, index) => {
    chunks.push({
      ...base,
      id: `${note.id}:content:${index}`,
      sourceLabel: index === 0 ? "正文" : `正文片段 ${index + 1}`,
      content,
      excerpt: toExcerpt(content),
      score: 0,
    });
  });

  note.problems?.forEach((problem, index) => {
    const content = formatProblem(problem, index);
    chunks.push({
      ...base,
      id: `${note.id}:problem:${problem.id || index}`,
      sourceLabel: `题目 ${index + 1}`,
      content,
      excerpt: toExcerpt(content),
      score: 0,
    });
  });

  return chunks;
}

function scoreChunk(question: string, terms: string[], chunk: NoteQAChunk): number {
  const haystack = `${chunk.noteTitle} ${chunk.sourceLabel} ${chunk.content}`.toLowerCase();
  const title = chunk.noteTitle.toLowerCase();
  let score = 0;

  for (const term of terms) {
    if (title.includes(term)) score += 8;
    if (haystack.includes(term)) score += 2;
  }

  if (question && haystack.includes(question.toLowerCase())) score += 16;
  if (chunk.noteType === "problem") score += 0.5;
  return score;
}

export function buildNoteQAContext(
  notes: Note[],
  question: string,
  scope: NoteQAScope = "all",
  limit = DEFAULT_CONTEXT_LIMIT,
): NoteQAContextResult {
  const scopedNotes = scope === "all" ? notes : notes.filter((note) => note.type === scope);
  const terms = tokenize(question);
  const chunks = scopedNotes.flatMap(buildChunksFromNote);
  const ranked = chunks
    .map((chunk) => ({ ...chunk, score: scoreChunk(question, terms, chunk) }))
    .filter((chunk) => chunk.score > 0 || terms.length === 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, limit));

  const selected = ranked.length > 0 ? ranked : chunks.slice(0, Math.max(1, Math.min(4, limit)));
  let usedChars = 0;
  const contextParts: string[] = [];
  const sources: NoteQASource[] = [];

  selected.forEach((chunk, index) => {
    if (usedChars >= MAX_CONTEXT_CHARS) return;
    const marker = `S${index + 1}`;
    const part = `[${marker}] ${chunk.noteTitle} - ${chunk.sourceLabel}\n${chunk.content}`;
    const remaining = MAX_CONTEXT_CHARS - usedChars;
    const clippedPart = part.length > remaining ? part.slice(0, remaining) : part;

    contextParts.push(clippedPart);
    usedChars += clippedPart.length;
    sources.push({
      id: marker,
      noteId: chunk.noteId,
      noteTitle: chunk.noteTitle,
      noteType: chunk.noteType,
      subject: chunk.subject,
      sourceLabel: chunk.sourceLabel,
      excerpt: chunk.excerpt,
      href: chunk.href,
      score: chunk.score,
    });
  });

  return {
    context: contextParts.join("\n\n---\n\n"),
    sources,
    totalChunks: chunks.length,
  };
}
