#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { planEnglishTrainingBackfill } from "../lib/english-backfill-contract.ts";

const repositoryRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const backupRoot = resolve(repositoryRoot, ".local-backups", "wp1-b");
const defaultOutput = resolve(repositoryRoot, "fable info", "evidence", "wp5", "02-english-backfill-dry-run.json");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input" || token === "--output") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${token} 缺少路径参数`);
      args[token.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`未知参数：${token}`);
    }
  }
  return args;
}

function isInside(root, candidate) {
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  return candidate === root || candidate.startsWith(prefix);
}

function findLatestAppDataSql() {
  if (!existsSync(backupRoot)) throw new Error("缺少本地 WP1-B 备份目录");
  const candidates = readdirSync(backupRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(backupRoot, entry.name, "app-data.sql"))
    .filter((candidate) => existsSync(candidate))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  if (candidates.length === 0) throw new Error("没有找到可用的 app-data.sql 本地备份");
  return candidates[0];
}

function resolveInputPath(value) {
  const candidate = value
    ? resolve(repositoryRoot, value)
    : findLatestAppDataSql();
  if (!isInside(backupRoot, candidate) || candidate.toLowerCase().split(/[\\/]/).at(-1) !== "app-data.sql") {
    throw new Error("输入只允许使用 .local-backups/wp1-b 下的 app-data.sql");
  }
  if (!existsSync(candidate)) throw new Error(`输入文件不存在：${candidate}`);
  return candidate;
}

function resolveOutputPath(value) {
  const candidate = value
    ? (isAbsolute(value) ? resolve(value) : resolve(repositoryRoot, value))
    : defaultOutput;
  const allowedRoot = resolve(repositoryRoot, "fable info", "evidence", "wp5");
  if (!isInside(allowedRoot, candidate) || !candidate.toLowerCase().endsWith(".json")) {
    throw new Error("输出只允许写入 fable info/evidence/wp5 下的 JSON 文件");
  }
  return candidate;
}

function decodeCopyValue(raw) {
  if (raw === "\\N") return null;
  let output = "";
  for (let index = 0; index < raw.length; index += 1) {
    const current = raw[index];
    if (current !== "\\" || index + 1 >= raw.length) {
      output += current;
      continue;
    }
    const next = raw[index + 1];
    const mapped = { b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", "\\": "\\" }[next];
    if (mapped !== undefined) {
      output += mapped;
      index += 1;
      continue;
    }
    if (next === "x") {
      const hex = raw.slice(index + 2, index + 4);
      if (/^[0-9a-f]{2}$/i.test(hex)) {
        output += String.fromCharCode(Number.parseInt(hex, 16));
        index += 3;
        continue;
      }
    }
    if (/[0-7]/.test(next)) {
      const match = raw.slice(index + 1).match(/^[0-7]{1,3}/)?.[0] ?? next;
      output += String.fromCharCode(Number.parseInt(match, 8));
      index += match.length;
      continue;
    }
    output += next;
    index += 1;
  }
  return output;
}

function parseCopyTables(sql, targetTables) {
  const tables = Object.fromEntries(targetTables.map((table) => [table, []]));
  const lines = sql.replace(/\r\n?/g, "\n").split("\n");
  let active = null;
  let columns = [];

  for (const line of lines) {
    if (!active) {
      const match = line.match(/^COPY public\.([a-z0-9_]+) \(([^)]+)\) FROM stdin;$/i);
      if (match && targetTables.includes(match[1])) {
        active = match[1];
        columns = match[2].split(",").map((column) => column.trim());
      }
      continue;
    }
    if (line === "\\.") {
      active = null;
      columns = [];
      continue;
    }

    const values = line.split("\t").map(decodeCopyValue);
    if (values.length !== columns.length) {
      throw new Error(`COPY ${active} 列数不匹配：预期 ${columns.length}，实际 ${values.length}`);
    }
    tables[active].push(Object.fromEntries(columns.map((column, index) => [column, values[index]])));
  }

  return tables;
}

function requiredText(value, field) {
  if (typeof value !== "string" || !value) throw new Error(`备份字段 ${field} 缺失`);
  return value;
}

function optionalText(value) {
  return typeof value === "string" && value ? value : undefined;
}

function numberValue(value, field) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`备份字段 ${field} 不是有效数字`);
  return parsed;
}

function booleanValue(value) {
  if (value === null) return undefined;
  if (value === "t") return true;
  if (value === "f") return false;
  return undefined;
}

function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = String(selector(value));
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function fingerprint(kind, sourceIds) {
  return createHash("sha256")
    .update(`${kind}\u0000${[...sourceIds].sort().join("\u0000")}`, "utf8")
    .digest("hex");
}

const args = parseArgs(process.argv.slice(2));
const inputPath = resolveInputPath(args.input);
const outputPath = resolveOutputPath(args.output);
const sql = readFileSync(inputPath, "utf8");
const tables = parseCopyTables(sql, [
  "english_attempts",
  "english_attempt_answers",
  "english_passages",
  "english_questions",
]);

const attempts = tables.english_attempts.map((row) => ({
  id: requiredText(row.id, "english_attempts.id"),
  userId: requiredText(row.user_id, "english_attempts.user_id"),
  passageId: requiredText(row.passage_id, "english_attempts.passage_id"),
  status: requiredText(row.status, "english_attempts.status"),
  score: numberValue(row.score, "english_attempts.score"),
  maxScore: numberValue(row.max_score, "english_attempts.max_score"),
  startedAt: optionalText(row.started_at),
  submittedAt: optionalText(row.submitted_at),
  createdAt: requiredText(row.created_at, "english_attempts.created_at"),
  updatedAt: requiredText(row.updated_at, "english_attempts.updated_at"),
}));
const answers = tables.english_attempt_answers.map((row) => ({
  id: requiredText(row.id, "english_attempt_answers.id"),
  attemptId: requiredText(row.attempt_id, "english_attempt_answers.attempt_id"),
  questionId: requiredText(row.question_id, "english_attempt_answers.question_id"),
  answer: typeof row.answer === "string" ? row.answer : "",
  isCorrect: booleanValue(row.is_correct),
  score: numberValue(row.score, "english_attempt_answers.score"),
  createdAt: requiredText(row.created_at, "english_attempt_answers.created_at"),
  updatedAt: requiredText(row.updated_at, "english_attempt_answers.updated_at"),
}));
const passages = tables.english_passages.map((row) => ({
  id: requiredText(row.id, "english_passages.id"),
  section: requiredText(row.section, "english_passages.section"),
}));
const questions = tables.english_questions.map((row) => ({
  id: requiredText(row.id, "english_questions.id"),
  passageId: requiredText(row.passage_id, "english_questions.passage_id"),
  standardAnswer: typeof row.standard_answer === "string" ? row.standard_answer : "",
  score: numberValue(row.score, "english_questions.score"),
}));

const plan = planEnglishTrainingBackfill({ attempts, answers, passages, questions });
const conflictCounts = countBy(plan.conflicts, (conflict) => conflict.kind);
const objectivePlans = plan.attempts.filter((attempt) => attempt.grades.some((grade) => grade.origin === "system_scored"));
const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: {
    kind: "local_wp1b_production_backup",
    relativePath: relative(repositoryRoot, inputPath).replace(/\\/g, "/"),
    sha256: createHash("sha256").update(sql, "utf8").digest("hex"),
  },
  sourceCounts: plan.sourceCounts,
  sourceDistributions: {
    attemptStatus: countBy(attempts, (attempt) => attempt.status),
    passageSection: countBy(passages, (passage) => passage.section),
  },
  proposedInsertCounts: plan.insertCounts,
  proposedStateCounts: {
    attemptStatus: countBy(plan.attempts, (attempt) => attempt.status),
    objectiveRecomputedAttempts: objectivePlans.length,
    subjectiveOrDraftOnlyAttempts: plan.attempts.length - objectivePlans.length,
  },
  reconciliation: {
    skippedAttempts: plan.sourceCounts.attempts - plan.insertCounts.attempts,
    conflictCount: plan.conflicts.length,
    conflictCounts,
    recomputedScoreDifferenceCount: plan.recomputedScoreDifferences.length,
    recomputedScoreDifferenceSummary: plan.recomputedScoreDifferences.length === 0
      ? { min: 0, max: 0, totalAbsolute: 0 }
      : {
          min: Math.min(...plan.recomputedScoreDifferences.map((item) => item.systemScore - item.legacyScore)),
          max: Math.max(...plan.recomputedScoreDifferences.map((item) => item.systemScore - item.legacyScore)),
          totalAbsolute: plan.recomputedScoreDifferences.reduce(
            (sum, item) => sum + Math.abs(item.systemScore - item.legacyScore),
            0,
          ),
        },
    recomputedScoreDifferences: plan.recomputedScoreDifferences.map((item) => ({
      fingerprint: fingerprint("recomputed_score_difference", [item.sourceAttemptId, item.passageId]),
      section: item.section,
      legacyScore: item.legacyScore,
      legacyMaxScore: item.legacyMaxScore,
      systemScore: item.systemScore,
      systemMaxScore: item.systemMaxScore,
      storedAnswerScore: item.storedAnswerScore,
      storedCorrectCount: item.storedCorrectCount,
      systemCorrectCount: item.systemCorrectCount,
      answerVerdictDifferenceCount: item.answerVerdictDifferenceCount,
      explanation: item.legacyMaxScore !== item.systemMaxScore
        ? "official_max_score_changed"
        : item.legacyScore !== item.storedAnswerScore
          ? "legacy_attempt_total_differs_from_answer_rows"
          : item.answerVerdictDifferenceCount > 0
            ? "current_official_answer_or_normalization_changed"
            : "score_projection_requires_review",
    })),
    anomalyFingerprints: plan.conflicts.map((conflict) => ({
      kind: conflict.kind,
      fingerprint: fingerprint(conflict.kind, conflict.sourceIds),
    })),
  },
  migrationContract: {
    oldAttemptToRound: 1,
    sharedAttemptIdStrategy: "reuse_legacy_attempt_uuid_in_separate_table",
    revisionStrategy: "submitted_attempt_only_revision_1",
    legacyGradeStrategy: "append_legacy_imported_never_delete",
    objectiveGradeStrategy: "append_system_scored_from_current_official_answers",
    subjectiveGradeStrategy: "no_system_score",
    rollbackStrategy: "compatibility_read_switch_no_legacy_delete",
  },
  safety: {
    writesPerformed: 0,
    productionConnections: 0,
    shadowConnections: 0,
    rawAnswersIncludedInEvidence: false,
    userIdsIncludedInEvidence: false,
    sourceIdsIncludedInEvidence: false,
  },
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  output: relative(repositoryRoot, outputPath).replace(/\\/g, "/"),
  sourceCounts: output.sourceCounts,
  proposedInsertCounts: output.proposedInsertCounts,
  conflictCount: output.reconciliation.conflictCount,
  recomputedScoreDifferenceCount: output.reconciliation.recomputedScoreDifferenceCount,
  writesPerformed: 0,
}, null, 2));
