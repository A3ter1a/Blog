#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

function read(relativePath) {
  const path = join(root, relativePath);
  if (!existsSync(path)) throw new Error(`缺少 WP7 资产：${relativePath}`);
  return readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const migration = read("supabase/migrations/0021_private_note_rag_and_memory.sql");
const operatorFix = read("supabase/migrations/0022_private_note_rag_operator_fix.sql");
const noteRoute = read("app/api/ai/note-qa/route.ts");
const memoryRoute = read("app/api/assistant/memories/route.ts");
const ragServer = read("lib/server-private-note-rag.ts");
const memoryServer = read("lib/server-assistant-memory.ts");
const vectorAdapter = read("lib/rag-source-adapter.ts");
const assistantDock = read("components/ai-assistant/AssistantDock.tsx");
const shadowRunner = read("scripts/run-wp7-shadow-stage.ps1");
const shadowTypegen = read("scripts/generate-wp7-shadow-types.ps1");
const operatorFixRunner = read("scripts/run-wp7-shadow-search-fix.ps1");
read("scripts/test-wp7-shadow-stage-local.ps1");
const packageJson = JSON.parse(read("package.json"));

assert(/create extension if not exists vector with schema extensions/i.test(migration), "0021 缺少 pgvector");
assert(/create table public\.rag_chunks/i.test(migration), "0021 缺少持久 RAG chunk 表");
assert(/document\.current_version_id = version\.id/i.test(migration), "RAG 搜索未限制到当前 source version");
assert(/reject_rag_chunk_mutation/i.test(migration), "RAG chunk 缺少 append-only 保护");
assert(/using hnsw \(embedding extensions\.vector_cosine_ops\)/i.test(migration), "RAG 缺少 HNSW vector 索引");
assert(/using gin \(search_vector\)/i.test(migration), "RAG 缺少全文索引");
assert(/create table public\.memory_candidates/i.test(migration), "0021 缺少持久记忆候选表");
assert(/status in \('proposed', 'accepted', 'rejected'\)/i.test(migration), "记忆缺少明确确认状态机");
assert(/force row level security/i.test(migration), "WP7 表未强制 RLS");
assert(/security definer\s+set search_path = ''/i.test(migration), "WP7 RPC 未固定空 search_path");
assert(!/\b(?:delete\s+from|truncate\s+table|drop\s+table)\b/i.test(migration), "0021 不得删除表或数据");
assert(/OPERATOR\(extensions\.<=>\)/i.test(operatorFix), "0022 未显式限定 pgvector 运算符 schema");
assert(/security definer\s+set search_path = ''/i.test(operatorFix), "0022 不得放宽 RPC search_path");
assert(!/\b(?:delete\s+from|truncate\s+table|drop\s+table)\b/i.test(operatorFix), "0022 不得删除表或数据");

assert(/getAdminRequestContext\(req\)/.test(noteRoute), "笔记问答未验证管理员 JWT");
assert(/syncPrivateNotesRag/.test(noteRoute) && /searchPrivateNoteRag/.test(noteRoute), "笔记问答未接持久混合检索");
assert(/listAssistantMemories/.test(noteRoute) && !/record\.memoryContext/.test(noteRoute), "提示词记忆必须由服务端读取");
assert(/getAdminRequestContext\(req\)/.test(memoryRoute), "记忆写 Route 未验证管理员 JWT");
assert(/sync_private_note_rag/.test(ragServer) && /search_private_note_rag/.test(ragServer), "服务端 RAG RPC 接线不完整");
assert(/buildTokenHashVector/.test(vectorAdapter) && /RAG_TOKEN_HASH_DIMENSIONS = 256/.test(vectorAdapter), "本地向量契约不完整");
assert(/propose_assistant_memory/.test(memoryServer) && /decide_assistant_memory/.test(memoryServer), "服务端记忆 RPC 接线不完整");
assert(/fetch\("\/api\/assistant\/memories"/.test(assistantDock), "助手 Dock 未接持久记忆 API");
assert(/ASSISTANT_CONVERSATION_STORAGE_PREFIX/.test(assistantDock), "助手对话缺少版本化本地缓存键");
assert(/localStorage\.setItem\(getConversationStorageKey/.test(assistantDock), "助手对话未写入版本化 localStorage");
assert(!/memoryStorage|memoryCandidates|assistantMemories/.test(assistantDock), "助手记忆不得写入本地存储");
assert(/PREVIEW \$ShadowProjectRef WP7 0021 ROLLBACK/.test(shadowRunner), "WP7 Shadow runner 缺少回滚预演门");
assert(/default_transaction_read_only=on/.test(shadowRunner), "WP7 Shadow pre/postflight 未强制只读");
assert(/READ \$ShadowProjectRef WP7 TYPES/.test(shadowTypegen), "WP7 typegen 缺少精确 fixed Shadow 读取门");
assert(/b40918f65d9f4019da23293f1d0c60916aca59a5a9fb8874fff6a0b6350aa327/.test(operatorFixRunner), "0022 runner 未锁定迁移哈希");
assert(/TransactionPreviewRolledBack/.test(operatorFixRunner) && /ProductionTouched=\$false/.test(operatorFixRunner), "0022 runner 缺少回滚预演或生产排除证据");
assert(packageJson.scripts["verify:wp7-rag-assets"], "package.json 缺少 WP7 静态门");
assert(packageJson.scripts["verify:wp7-shadow-stage-local"], "package.json 缺少 WP7 Shadow 本地门");
assert(packageJson.scripts["verify:predeploy"].includes("verify:wp7-rag-assets"), "predeploy 未接入 WP7 静态门");
assert(packageJson.scripts["verify:predeploy"].includes("verify:wp7-shadow-stage-local"), "predeploy 未接入 WP7 Shadow 本地门");

console.log("WP7 persistent private RAG and confirmed memory assets verified");
