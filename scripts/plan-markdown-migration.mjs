#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  CONTENT_NORMALIZATION_RULE_VERSION,
  normalizeMarkdownSource,
} from "../lib/content-contract.ts";

const rootDir = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const localDir = join(rootDir, ".local-backups", "wp2-markdown-migration");
const evidenceDir = join(rootDir, "fable info", "evidence", "wp2");

function parseEnvFile(path) {
  const values = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function collectFields(note) {
  const fields = [{ fieldPath: "content", value: typeof note.content === "string" ? note.content : "" }];
  if (!Array.isArray(note.problems)) return fields;

  note.problems.forEach((problem, problemIndex) => {
    for (const key of ["question", "answer", "explanation", "tips"]) {
      if (typeof problem?.[key] === "string") {
        fields.push({ fieldPath: `problems.${problemIndex}.${key}`, value: problem[key] });
      }
    }
    if (Array.isArray(problem?.options)) {
      problem.options.forEach((option, optionIndex) => {
        if (typeof option?.content === "string") {
          fields.push({
            fieldPath: `problems.${problemIndex}.options.${optionIndex}.content`,
            value: option.content,
          });
        }
      });
    }
  });
  return fields;
}

const env = parseEnvFile(join(rootDir, ".env.local"));
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error(".env.local 缺少 Supabase 公开只读配置。");
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const { data, error } = await supabase
  .from("notes")
  .select("id,title,content,problems,is_published,updated_at")
  .eq("is_published", true)
  .order("id", { ascending: true });
if (error) throw error;

const batchId = `wp2-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
const plannedAt = new Date().toISOString();
const snapshots = [];

for (const note of data ?? []) {
  for (const field of collectFields(note)) {
    const result = normalizeMarkdownSource(field.value, "migration");
    if (!result.changed && result.risks.length === 0) continue;
    snapshots.push({
      noteId: note.id,
      noteTitle: note.title,
      noteUpdatedAt: note.updated_at,
      fieldPath: field.fieldPath,
      batchId,
      ruleVersion: CONTENT_NORMALIZATION_RULE_VERSION,
      beforeText: field.value,
      afterText: result.normalized,
      beforeChecksum: sha256(field.value),
      afterChecksum: sha256(result.normalized),
      aiInvolved: false,
      requiresReview: result.requiresReview,
      risks: result.risks,
      status: "planned",
    });
  }
}

const safeChanges = snapshots.filter((item) => !item.requiresReview && item.beforeChecksum !== item.afterChecksum);
const reviewItems = snapshots.filter((item) => item.requiresReview);
mkdirSync(localDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });
const planPath = join(localDir, `${batchId}.json`);
const manifestPath = join(evidenceDir, "02-markdown-migration-dry-run.json");

writeFileSync(planPath, `${JSON.stringify({
  planVersion: 1,
  batchId,
  plannedAt,
  source: "production-public-readonly",
  snapshots,
}, null, 2)}\n`);
writeFileSync(manifestPath, `${JSON.stringify({
  manifestVersion: 1,
  batchId,
  plannedAt,
  source: "production-public-readonly",
  noteCount: (data ?? []).length,
  inspectedFieldCount: (data ?? []).reduce((sum, note) => sum + collectFields(note).length, 0),
  safeChangeCount: safeChanges.length,
  requiresReviewCount: reviewItems.length,
  unchangedRiskFreeFieldsOmitted: true,
  localPlanPath: `.local-backups/wp2-markdown-migration/${batchId}.json`,
  items: snapshots.map((item) => {
    const metadata = Object.fromEntries(
      Object.entries(item).filter(([key]) => key !== "beforeText" && key !== "afterText" && key !== "noteTitle"),
    );
    return {
      ...metadata,
      noteTitleSha256: sha256(typeof item.noteTitle === "string" ? item.noteTitle : ""),
    };
  }),
}, null, 2)}\n`);

console.log(`PASS 只读扫描公开笔记：${(data ?? []).length} 篇`);
console.log(`PASS 可自动迁移字段：${safeChanges.length} 个`);
console.log(`PASS 必须人工或 AI 复核字段：${reviewItems.length} 个`);
console.log(`PASS 正文差异仅保存于 Git 忽略目录：${planPath}`);
console.log(`PASS 仓库证据：${manifestPath}`);
