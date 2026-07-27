#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const rootDir = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const localCorpusDir = join(rootDir, ".local-backups", "wp2-markdown-corpus");
const evidenceDir = join(rootDir, "fable info", "evidence", "wp2");
const corpusPath = join(localCorpusDir, "historical-cases.json");
const manifestPath = join(evidenceDir, "01-markdown-corpus-manifest.json");
const minimumCases = 30;

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

function toText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getProblemFields(problems) {
  if (!Array.isArray(problems)) return [];

  return problems.flatMap((problem, problemIndex) => {
    if (!problem || typeof problem !== "object") return [];
    const fields = [
      ["question", problem.question],
      ["answer", problem.answer],
      ["explanation", problem.explanation],
    ];
    if (Array.isArray(problem.options)) {
      problem.options.forEach((option, optionIndex) => {
        fields.push([`option:${optionIndex}`, option?.content]);
      });
    }
    return fields
      .map(([field, value]) => ({ field: `problem:${problemIndex}:${field}`, text: toText(value) }))
      .filter((entry) => entry.text);
  });
}

const signalDefinitions = [
  ["display_math", /\$\$[\s\S]+?\$\$/],
  ["inline_math", /(?<!\$)\$(?!\$)[^$\n]+?\$(?!\$)/],
  ["latex_environment", /\\begin\{(?:align|equation|gather|aligned|split|cases|multline|array|matrix|pmatrix|bmatrix|vmatrix|Vmatrix)\*?\}/],
  ["latex_escape", /(?:\\{2,}(?:frac|sqrt|sum|int|lim|begin|end)|&(?:lt|gt|amp|quot);)/],
  ["collapsed_math", /(?<!\$)\$(?!\$)[^$\n]+?\$\$(?!\$)[^$\n]+?\$(?!\$)/],
  ["signed_math_line", /^\s{0,3}[+-]\s*[0-9A-Za-z\\$^_{}()[\].,*/+=<>|-]+\s*$/m],
  ["fenced_code", /```[\s\S]+?```|~~~[\s\S]+?~~~/],
  ["markdown_table", /^\s*\|.+\|\s*$[\s\S]*?^\s*\|?\s*:?-+/m],
  ["markdown_image", /!\[[^\]\n]*\]\((?:\\.|[^)\n])+\)/],
  ["html_image", /(?:<|&lt;)img\b/i],
  ["heading_or_list", /^(?:\s{0,3}#{1,6}\S|\s{0,3}(?:[*+-]|\d+\.)\S)/m],
];

function extractSnippet(text, match) {
  const index = match.index ?? 0;
  const start = Math.max(0, index - 240);
  const end = Math.min(text.length, index + match[0].length + 360);
  return text.slice(start, end).trim();
}

function scenarioForField(field) {
  if (field === "content") return "article";
  if (field.endsWith(":question")) return "problem";
  if (field.endsWith(":answer")) return "answer";
  if (field.endsWith(":explanation")) return "explanation";
  if (field.includes(":option:")) return "option";
  return "unknown";
}

function collectCandidates(notes) {
  const candidates = [];
  const seen = new Set();

  for (const note of notes) {
    const fields = [
      { field: "content", text: toText(note.content) },
      ...getProblemFields(note.problems),
    ].filter((entry) => entry.text);

    for (const { field, text } of fields) {
      for (const [category, pattern] of signalDefinitions) {
        const match = pattern.exec(text);
        if (!match) continue;
        const input = extractSnippet(text, match);
        const inputHash = sha256(input);
        if (!input || seen.has(inputHash)) continue;
        seen.add(inputHash);
        candidates.push({
          noteId: note.id,
          field,
          scenario: scenarioForField(field),
          category,
          input,
          inputSha256: inputHash,
          charLength: input.length,
        });
      }
    }
  }

  return candidates;
}

function selectDiverseCases(candidates, limit) {
  const byScenarioAndCategory = new Map();
  for (const candidate of candidates) {
    const groupKey = `${candidate.scenario}:${candidate.category}`;
    const group = byScenarioAndCategory.get(groupKey) ?? [];
    group.push(candidate);
    byScenarioAndCategory.set(groupKey, group);
  }

  const selected = [];
  while (selected.length < limit) {
    let added = false;
    for (const groupKey of [...byScenarioAndCategory.keys()].sort()) {
      const group = byScenarioAndCategory.get(groupKey);
      const next = group?.shift();
      if (!next) continue;
      selected.push(next);
      added = true;
      if (selected.length === limit) break;
    }
    if (!added) break;
  }
  return selected;
}

const env = parseEnvFile(join(rootDir, ".env.local"));
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(".env.local 缺少 Supabase 公开只读配置。");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const { data, error } = await supabase
  .from("notes")
  .select("id,content,problems,is_published")
  .eq("is_published", true)
  .order("id", { ascending: true });
if (error) throw error;

const notes = data ?? [];
const candidates = collectCandidates(notes);
const selected = selectDiverseCases(candidates, minimumCases);
if (selected.length < minimumCases) {
  throw new Error(`公开历史内容只提取到 ${selected.length} 条结构性难例，未达到 ${minimumCases} 条门槛。`);
}

const capturedAt = new Date().toISOString();
const cases = selected.map((item, index) => ({
  caseId: `historical-${String(index + 1).padStart(2, "0")}`,
  ...item,
}));
const categoryCounts = Object.fromEntries(
  [...new Set(cases.map((item) => item.category))]
    .sort()
    .map((category) => [category, cases.filter((item) => item.category === category).length]),
);
const scenarioCounts = Object.fromEntries(
  [...new Set(cases.map((item) => item.scenario))]
    .sort()
    .map((scenario) => [scenario, cases.filter((item) => item.scenario === scenario).length]),
);
const candidateScenarioCounts = Object.fromEntries(
  [...new Set(candidates.map((item) => item.scenario))]
    .sort()
    .map((scenario) => [scenario, candidates.filter((item) => item.scenario === scenario).length]),
);

mkdirSync(localCorpusDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });
writeFileSync(corpusPath, `${JSON.stringify({ capturedAt, source: "production-public-readonly", cases }, null, 2)}\n`);
writeFileSync(manifestPath, `${JSON.stringify({
  manifestVersion: 1,
  capturedAt,
  source: "production-public-readonly",
  publicNoteCount: notes.length,
  candidateCount: candidates.length,
  selectedCaseCount: cases.length,
  minimumCaseRequirement: minimumCases,
  categoryCounts,
  scenarioCounts,
  candidateScenarioCounts,
  localCorpusPath: ".local-backups/wp2-markdown-corpus/historical-cases.json",
  cases: cases.map(({ input: _input, ...metadata }) => metadata),
}, null, 2)}\n`);

console.log(`PASS 公开笔记：${notes.length} 篇`);
console.log(`PASS 候选难例：${candidates.length} 条`);
console.log(`PASS 已选历史回归语料：${cases.length} 条`);
console.log(`PASS 正文仅保存在 Git 忽略目录；证据 manifest：${manifestPath}`);
