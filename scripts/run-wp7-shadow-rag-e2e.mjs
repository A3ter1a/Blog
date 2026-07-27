#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SHADOW_PROJECT_REF = "qyjfcebqjtphlpsvizxo";
const DIMENSIONS = 256;

function readArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    options[argv[index].slice(2)] = argv[index + 1];
    index += 1;
  }
  return options;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseLoginFile(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[line.slice(0, separator).trim().toLowerCase()] = value;
  }
  return { email: values.email ?? values.username ?? "", password: values.password ?? "" };
}

async function fetchJson(url, options = {}, label = "request") {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(60_000) });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = body && typeof body === "object" ? body.message ?? body.error ?? body.hint : text;
    throw new Error(`${label} 失败（${response.status}）：${String(detail ?? "unknown").slice(0, 500)}`);
  }
  return body;
}

function fnv1a(value, seed) {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function tokenHashVector(value) {
  const lower = value.normalize("NFKC").toLowerCase();
  const chinese = lower.match(/[\u4e00-\u9fff]/g) ?? [];
  const tokens = [...(lower.match(/[a-z0-9_]{2,}/g) ?? [])];
  for (let index = 0; index < chinese.length - 1; index += 1) tokens.push(`${chinese[index]}${chinese[index + 1]}`);
  const frequencies = new Map();
  for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  const vector = Array.from({ length: DIMENSIONS }, () => 0);
  for (const [token, count] of frequencies) {
    const weight = 1 + Math.log(count);
    vector[fnv1a(token, 0x811c9dc5) % DIMENSIONS] += (fnv1a(token, 0x9e3779b9) & 1) === 0 ? weight : -weight;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0));
  if (!magnitude) vector[0] = 1;
  else for (let index = 0; index < vector.length; index += 1) vector[index] = Number((vector[index] / magnitude).toFixed(8));
  return vector;
}

function stripMarkdown(value) {
  return String(value ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|]/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function noteChunks(note) {
  const clean = stripMarkdown(note.content);
  if (!clean) return [];
  const baseHref = note.is_published ? `/notes/${note.id}` : `/notes/private/${note.id}`;
  const chunks = [];
  let cursor = 0;
  while (cursor < clean.length && chunks.length < 64) {
    const content = clean.slice(cursor, cursor + 900);
    chunks.push({
      content,
      sourceLabel: chunks.length === 0 ? "正文" : `正文 · 片段 ${chunks.length + 1}`,
      href: baseHref,
      embedding: tokenHashVector(`${note.title}\n正文\n${content}`),
    });
    if (cursor + 900 >= clean.length) break;
    cursor += 760;
  }
  return chunks;
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  process.loadEnvFile(path.resolve(args["env-file"]));
  const resultPath = path.resolve(args.result);
  const login = parseLoginFile(await readFile(path.resolve(args["login-path"]), "utf8"));
  const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  assert(supabaseUrl.hostname === `${SHADOW_PROJECT_REF}.supabase.co`, "拒绝执行：环境未指向 fixed Shadow");
  assert(anonKey && login.email && login.password, "Shadow 登录或 anon key 缺失");

  const auth = await fetchJson(new URL("/auth/v1/token?grant_type=password", supabaseUrl), {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify(login),
  }, "fixed Shadow 登录");
  const accessToken = String(auth?.access_token ?? "");
  const userId = String(auth?.user?.id ?? "");
  assert(accessToken && /^[0-9a-f-]{36}$/i.test(userId), "Shadow 会话无效");
  const headers = { apikey: anonKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  const rest = (pathname, options = {}, label = pathname) => fetchJson(new URL(pathname, supabaseUrl), { ...options, headers: { ...headers, ...(options.headers ?? {}) } }, label);

  const notes = await rest("/rest/v1/notes?select=id,type,title,content,subject,tags,problems,is_published,content_version&order=updated_at.desc&limit=160", {}, "读取私人笔记");
  assert(Array.isArray(notes) && notes.length > 0, "Shadow 没有可索引笔记");
  let createdVersions = 0;
  let unchanged = 0;
  let indexedNotes = 0;
  let indexedChunks = 0;
  let searchSeed = null;
  for (const note of notes) {
    const chunks = noteChunks(note);
    if (!chunks.length) continue;
    const rawText = [`标题：${note.title}`, `类型：${note.type}`, `学科：${note.subject ?? "未分类"}`, `标签：${Array.isArray(note.tags) ? note.tags.join("、") : ""}`, ...chunks.map((chunk) => `\n## ${chunk.sourceLabel}\n${chunk.content}`)].join("\n").trim();
    const sync = await rest("/rest/v1/rpc/sync_private_note_rag", {
      method: "POST",
      body: JSON.stringify({
        p_note_id: note.id,
        p_note_content_version: note.content_version,
        p_checksum: createHash("sha256").update(rawText, "utf8").digest("hex"),
        p_raw_text: rawText,
        p_chunks: chunks,
      }),
    }, `同步笔记 ${note.id}`);
    if (sync?.action === "create_version") createdVersions += 1;
    else if (sync?.action === "unchanged") unchanged += 1;
    else throw new Error("RAG 同步返回未知 action");
    indexedNotes += 1;
    indexedChunks += Number(sync.chunkCount ?? 0);
    if (!searchSeed) searchSeed = { note, content: chunks[0].content };
  }
  assert(indexedNotes > 0 && indexedChunks > 0 && searchSeed, "没有形成持久索引");

  const query = stripMarkdown(searchSeed.note.title || searchSeed.content.slice(0, 24)).slice(0, 80);
  const search = await rest("/rest/v1/rpc/search_private_note_rag", {
    method: "POST",
    body: JSON.stringify({ p_query: query, p_query_embedding: `[${tokenHashVector(query).join(",")}]`, p_note_id: null, p_limit: 8 }),
  }, "混合检索");
  assert(Array.isArray(search) && search.length > 0, "混合检索没有返回来源");
  assert(search.every((row) => typeof row.href === "string" && /^[0-9a-f-]{36}$/i.test(String(row.noteId ?? ""))), "检索来源缺少稳定引用");

  const candidateId = randomUUID();
  const candidate = await rest("/rest/v1/rpc/propose_assistant_memory", {
    method: "POST",
    body: JSON.stringify({ p_command_id: candidateId, p_content: "WP7 E2E 临时候选，仅验证确认门。", p_reason: "持久记忆状态机验证", p_source_path: "/tools" }),
  }, "提出记忆候选");
  assert(candidate?.status === "proposed", "记忆未以 proposed 建立");
  const proposedList = await rest("/rest/v1/rpc/list_assistant_memories", { method: "POST", body: "{}" }, "读取 proposed 记忆");
  assert(Array.isArray(proposedList) && proposedList.some((item) => item.id === candidateId && item.status === "proposed"), "proposed 记忆不可读");
  const accepted = await rest("/rest/v1/rpc/decide_assistant_memory", {
    method: "POST",
    body: JSON.stringify({ p_candidate_id: candidateId, p_decision: "accepted" }),
  }, "接受记忆候选");
  assert(accepted?.status === "accepted" && accepted?.decided_at, "记忆确认未持久化");
  const acceptedList = await rest("/rest/v1/rpc/list_assistant_memories", { method: "POST", body: "{}" }, "读取 accepted 记忆");
  assert(Array.isArray(acceptedList) && acceptedList.some((item) => item.id === candidateId && item.status === "accepted"), "accepted 记忆不可读");

  const result = {
    version: 1,
    ok: true,
    shadowProjectRef: SHADOW_PROJECT_REF,
    userId,
    noteCount: notes.length,
    indexedNotes,
    indexedChunks,
    createdVersions,
    unchanged,
    searchResultCount: search.length,
    stableCitationCount: search.filter((row) => row.href && row.noteId && row.sourceLabel).length,
    memoryCandidateId: candidateId,
    memoryConfirmationPassed: true,
    externalModelCalled: false,
    completedAt: new Date().toISOString(),
  };
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  process.stdout.write(JSON.stringify({ ...result, userId: "[REDACTED]", memoryCandidateId: "[REDACTED]" }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "WP7 Shadow RAG E2E 失败");
  process.exitCode = 1;
});
