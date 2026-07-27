import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { buildNoteRagChunks, type NoteQASource } from "@/lib/note-qa";
import { buildTokenHashVector, toPgVectorLiteral } from "@/lib/rag-source-adapter";
import type { Note } from "@/lib/types";

type RpcResult = PromiseLike<{ data: unknown; error: unknown }>;
type RpcClient = { rpc: (name: string, args?: Record<string, unknown>) => RpcResult };

function rpcClient(supabase: SupabaseClient<Database>): RpcClient {
  return supabase as unknown as RpcClient;
}

async function runRpc(
  supabase: SupabaseClient<Database>,
  name: string,
  args?: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await rpcClient(supabase).rpc(name, args);
  if (error) throw error;
  return data;
}

function buildRawSourceText(note: Note): string {
  const chunks = buildNoteRagChunks(note);
  return [
    `标题：${note.title}`,
    `类型：${note.type}`,
    `学科：${note.subject ?? "未分类"}`,
    `标签：${note.tags.join("、")}`,
    ...chunks.map((chunk) => `\n## ${chunk.sourceLabel}\n${chunk.content}`),
  ].join("\n").trim();
}

export type NoteRagSyncResult = {
  action: "unchanged" | "create_version";
  sourceDocumentId: string;
  sourceVersionId: string;
  versionNo: number;
  chunkCount: number;
};

function normalizeSyncResult(value: unknown): NoteRagSyncResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("RAG 同步返回无效");
  const row = value as Record<string, unknown>;
  if ((row.action !== "unchanged" && row.action !== "create_version")
    || typeof row.sourceDocumentId !== "string"
    || typeof row.sourceVersionId !== "string"
    || typeof row.versionNo !== "number"
    || typeof row.chunkCount !== "number") throw new Error("RAG 同步返回字段无效");
  return row as NoteRagSyncResult;
}

export async function syncPrivateNoteRag(
  supabase: SupabaseClient<Database>,
  note: Note,
): Promise<NoteRagSyncResult> {
  if (!note.contentVersion || note.contentVersion < 1) throw new Error(`笔记 ${note.id} 缺少 content_version`);
  const chunks = buildNoteRagChunks(note).slice(0, 64);
  if (chunks.length === 0) throw new Error(`笔记 ${note.id} 没有可索引内容`);
  const rawText = buildRawSourceText(note);
  const checksum = createHash("sha256").update(rawText, "utf8").digest("hex");
  return normalizeSyncResult(await runRpc(supabase, "sync_private_note_rag", {
    p_note_id: note.id,
    p_note_content_version: note.contentVersion,
    p_checksum: checksum,
    p_raw_text: rawText,
    p_chunks: chunks.map((chunk) => ({
      content: chunk.content,
      sourceLabel: chunk.sourceLabel,
      href: chunk.href,
      embedding: buildTokenHashVector(`${note.title}\n${chunk.sourceLabel}\n${chunk.content}`),
    })),
  }));
}

export async function syncPrivateNotesRag(
  supabase: SupabaseClient<Database>,
  notes: Note[],
): Promise<{ createdVersions: number; unchanged: number; skipped: number; chunkCount: number }> {
  let createdVersions = 0;
  let unchanged = 0;
  let chunkCount = 0;
  const indexableNotes = notes.filter((note) => buildNoteRagChunks(note).length > 0);
  for (let index = 0; index < indexableNotes.length; index += 6) {
    const batch = await Promise.all(indexableNotes.slice(index, index + 6).map((note) => syncPrivateNoteRag(supabase, note)));
    for (const result of batch) {
      if (result.action === "create_version") createdVersions += 1;
      else unchanged += 1;
      chunkCount += result.chunkCount;
    }
  }
  return { createdVersions, unchanged, skipped: notes.length - indexableNotes.length, chunkCount };
}

type RagSearchRow = Record<string, unknown>;

function optionalSubject(value: unknown): NoteQASource["subject"] {
  return value === "math" || value === "english" || value === "politics" || value === "economics"
    ? value
    : undefined;
}

export async function searchPrivateNoteRag(
  supabase: SupabaseClient<Database>,
  input: { question: string; noteId?: string; limit: number },
): Promise<{ context: string; sources: NoteQASource[]; totalChunks: number }> {
  const raw = await runRpc(supabase, "search_private_note_rag", {
    p_query: input.question,
    p_query_embedding: toPgVectorLiteral(buildTokenHashVector(input.question)),
    p_note_id: input.noteId || null,
    p_limit: input.limit,
  });
  const rows = Array.isArray(raw) ? raw.filter((item): item is RagSearchRow => Boolean(item) && typeof item === "object") : [];
  const sources: NoteQASource[] = [];
  const context: string[] = [];
  rows.forEach((row, index) => {
    const marker = `S${index + 1}`;
    const content = typeof row.content === "string" ? row.content : "";
    const noteId = typeof row.noteId === "string" ? row.noteId : "";
    const noteTitle = typeof row.noteTitle === "string" ? row.noteTitle : "";
    const noteType = row.noteType === "problem" || row.noteType === "essay" ? row.noteType : "note";
    const sourceLabel = typeof row.sourceLabel === "string" ? row.sourceLabel : "正文";
    const href = typeof row.href === "string" ? row.href : `/notes/private/${noteId}`;
    const score = typeof row.score === "number" ? row.score : 0;
    if (!content || !noteId || !noteTitle) return;
    context.push(`[${marker}] ${noteTitle} - ${sourceLabel}\n${content}`);
    sources.push({
      id: marker,
      noteId,
      noteTitle,
      noteType,
      subject: optionalSubject(row.subject),
      sourceLabel,
      excerpt: typeof row.excerpt === "string" ? row.excerpt : content.slice(0, 180),
      href,
      score,
    });
  });
  return { context: context.join("\n\n---\n\n"), sources, totalChunks: rows.length };
}
