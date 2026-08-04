#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const rootDir = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const COMPLETE_YEARS = Array.from({ length: 20 }, (_, index) => 2007 + index);
const EXPECTED_PROBLEM_COUNTS = Object.fromEntries([
  [2007, 24],
  ...Array.from({ length: 13 }, (_, index) => [2008 + index, 23]),
  ...Array.from({ length: 6 }, (_, index) => [2021 + index, 22]),
]);
const VALID_TYPES = new Set(["choice", "fill", "calculation", "proof", "proof_essay"]);
const FORBIDDEN_KEYS = new Set([
  "analysis",
  "explanation",
  "explanations",
  "source",
  "sourceMark",
  "source_mark",
  "origin",
]);

function usage() {
  return `
Usage:
  node scripts/import-math3-papers.mjs --input data/math-papers/math3-2007-2026.json
  node scripts/import-math3-papers.mjs --input data/math-papers/math3-2007-2026.json --emit-sql data/math-papers/math3-2007-2026.sql --strict-complete
  node scripts/import-math3-papers.mjs --input data/math-papers/math3-2007-2026.json --apply --target production --confirm-year-range 2007-2026 --strict-complete --allow-unverified

Options:
  --input <path>          JSON file. Shape: { "papers": [...] } or an array.
  --apply                 Write fixed math_3 source rows to Supabase.
  --target <name>         Required with --apply: local, staging, or production.
  --confirm-year-range    Required with --apply and must match the input range.
  --emit-sql <path>       Generate additive upsert SQL.
  --emit-sql-dir <path>   Generate one SQL file per year.
  --strict-complete       Require every Math III year and expected problem count.
  --require-verified      Reject any problem marked needs_visual_review.
  --allow-unverified      Explicitly allow visual-review flags during apply.
  --help                  Show this help.

Default mode validates only and never writes to Supabase.
`.trim();
}

function parseArgs(argv) {
  const args = {
    input: "",
    apply: false,
    target: "",
    confirmYearRange: "",
    emitSql: "",
    emitSqlDir: "",
    strictComplete: false,
    requireVerified: false,
    allowUnverified: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      args.input = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--target") {
      args.target = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--confirm-year-range") {
      args.confirmYearRange = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--emit-sql") {
      args.emitSql = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--emit-sql-dir") {
      args.emitSqlDir = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--strict-complete") {
      args.strictComplete = true;
    } else if (arg === "--require-verified") {
      args.requireVerified = true;
    } else if (arg === "--allow-unverified") {
      args.allowUnverified = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`未知参数: ${arg}\n\n${usage()}`);
    }
  }
  return args;
}

function loadLocalEnv() {
  for (const name of [".env.local", ".env"]) {
    const path = resolve(rootDir, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getField(record, camelKey, snakeKey = "") {
  if (!isRecord(record)) return undefined;
  if (Object.hasOwn(record, camelKey)) return record[camelKey];
  if (snakeKey && Object.hasOwn(record, snakeKey)) return record[snakeKey];
  return undefined;
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim()) {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }
  return undefined;
}

function findForbiddenKeys(value, currentPath, errors) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenKeys(item, `${currentPath}[${index}]`, errors));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    const path = currentPath ? `${currentPath}.${key}` : key;
    if (FORBIDDEN_KEYS.has(key)) errors.push(`${path}: 不允许把解析/来源元数据作为结构字段导入`);
    findForbiddenKeys(nested, path, errors);
  }
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeRubric(value, path, errors) {
  if (!Array.isArray(value) && !isRecord(value)) {
    errors.push(`${path}: scoringRubric 必须是非空数组或对象`);
    return [];
  }
  if (Array.isArray(value) && value.length === 0) errors.push(`${path}: scoringRubric 不能为空`);
  if (isRecord(value) && Object.keys(value).length === 0) errors.push(`${path}: scoringRubric 不能为空`);
  return value;
}

function normalizeProblem(raw, year, index, errors, warnings) {
  if (!isRecord(raw)) {
    errors.push(`${year}.problems[${index}]: 题目必须是对象`);
    return null;
  }
  const problemNo = asNumber(getField(raw, "problemNo", "problem_no"));
  const problemType = asString(getField(raw, "problemType", "problem_type"));
  const prompt = asString(getField(raw, "prompt"));
  const standardAnswer = asString(getField(raw, "standardAnswer", "standard_answer"));
  const scoringRubric = normalizeRubric(getField(raw, "scoringRubric", "scoring_rubric"), `${year}.problems[${index}].scoringRubric`, errors);
  const maxScore = asNumber(getField(raw, "maxScore", "max_score"));
  const contentVersion = asNumber(getField(raw, "contentVersion", "content_version")) ?? 1;
  const quality = asString(getField(raw, "quality")) || "verified";
  const qualityFlags = getField(raw, "qualityFlags", "quality_flags");

  if (!Number.isInteger(problemNo) || problemNo < 1) errors.push(`${year}.problems[${index}].problemNo: 必须是正整数`);
  if (!VALID_TYPES.has(problemType)) errors.push(`${year}.problems[${index}].problemType: 类型无效`);
  if (prompt.length < 8) errors.push(`${year}.problems[${index}].prompt: 题面为空或过短`);
  if (standardAnswer.length < 2) errors.push(`${year}.problems[${index}].standardAnswer: 参考答案为空或过短`);
  if (!Number.isFinite(maxScore) || maxScore <= 0) errors.push(`${year}.problems[${index}].maxScore: 必须大于 0`);
  if (!Number.isInteger(contentVersion) || contentVersion < 1) errors.push(`${year}.problems[${index}].contentVersion: 必须是正整数`);
  if (!["verified", "needs_visual_review"].includes(quality)) errors.push(`${year}.problems[${index}].quality: 未知质量状态`);
  if (quality === "needs_visual_review") warnings.push(`${year} 第 ${problemNo} 题需要视觉复核`);

  const contentChecksum = sha256(JSON.stringify({
    problemNo,
    problemType,
    prompt,
    standardAnswer,
    scoringRubric,
    maxScore,
  }));
  return {
    problemNo,
    problemType,
    prompt,
    standardAnswer,
    scoringRubric,
    maxScore,
    contentVersion,
    contentChecksum,
    quality,
    qualityFlags,
  };
}

function normalizePaper(raw, index, errors, warnings) {
  if (!isRecord(raw)) {
    errors.push(`papers[${index}]: 试卷必须是对象`);
    return null;
  }
  const examYear = asNumber(getField(raw, "examYear", "exam_year"));
  const paperCode = asString(getField(raw, "paperCode", "paper_code"));
  const title = asString(getField(raw, "title"));
  const sourceChecksum = asString(getField(raw, "sourceChecksum", "source_checksum")).toLowerCase();
  const sourceUrl = asString(getField(raw, "sourceUrl", "source_url")) || null;
  const status = asString(getField(raw, "status")) || "active";
  const quality = asString(getField(raw, "quality")) || "verified";
  const rawProblems = getField(raw, "problems");
  if (!Number.isInteger(examYear) || !COMPLETE_YEARS.includes(examYear)) errors.push(`papers[${index}].examYear: 只允许 2007-2026`);
  if (paperCode !== "math_3") errors.push(`papers[${index}].paperCode: 只允许 math_3`);
  if (!title) errors.push(`papers[${index}].title: 标题不能为空`);
  if (!/^[0-9a-f]{64}$/.test(sourceChecksum)) errors.push(`papers[${index}].sourceChecksum: 必须是 SHA-256`);
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) warnings.push(`${examYear}: sourceUrl 不是 HTTP URL，将保留为来源标记`);
  if (!["active", "archived"].includes(status)) errors.push(`${examYear}.status: 状态无效`);
  if (!Array.isArray(rawProblems)) {
    errors.push(`${examYear}.problems: 必须是数组`);
    return null;
  }
  if (!["verified", "needs_visual_review"].includes(quality)) errors.push(`${examYear}.quality: 未知质量状态`);
  const problems = rawProblems.flatMap((problem, problemIndex) => {
    const normalized = normalizeProblem(problem, examYear, problemIndex, errors, warnings);
    return normalized ? [normalized] : [];
  });
  const problemNos = new Set();
  for (const problem of problems) {
    if (problemNos.has(problem.problemNo)) errors.push(`${examYear}: 第 ${problem.problemNo} 题重复`);
    problemNos.add(problem.problemNo);
  }
  const maxScoreTotal = problems.reduce((sum, problem) => sum + problem.maxScore, 0);
  if (Math.abs(maxScoreTotal - 150) > 0.0001) warnings.push(`${examYear}: 题目分值合计 ${maxScoreTotal}，不是 150`);
  return {
    examYear,
    paperCode,
    title,
    sourceChecksum,
    sourceUrl,
    status,
    quality,
    problems: problems.sort((left, right) => left.problemNo - right.problemNo),
  };
}

function validateComplete(papers, errors) {
  const byYear = new Map(papers.map((paper) => [paper.examYear, paper]));
  for (const year of COMPLETE_YEARS) {
    const paper = byYear.get(year);
    if (!paper) {
      errors.push(`strict-complete: 缺少 ${year} 年数学三`);
      continue;
    }
    const expectedCount = EXPECTED_PROBLEM_COUNTS[year];
    const expectedNos = Array.from({ length: expectedCount }, (_, index) => index + 1);
    const actualNos = paper.problems.map((problem) => problem.problemNo);
    if (paper.problems.length !== expectedCount) errors.push(`strict-complete: ${year} 应有 ${expectedCount} 题，当前 ${paper.problems.length} 题`);
    for (const problemNo of expectedNos) {
      if (!actualNos.includes(problemNo)) errors.push(`strict-complete: ${year} 缺少第 ${problemNo} 题`);
    }
    const total = paper.problems.reduce((sum, problem) => sum + problem.maxScore, 0);
    if (Math.abs(total - 150) > 0.0001) errors.push(`strict-complete: ${year} 分值合计应为 150，当前 ${total}`);
  }
}

function normalizeInput(raw, args) {
  const errors = [];
  const warnings = [];
  findForbiddenKeys(raw, "", errors);
  const rawPapers = Array.isArray(raw) ? raw : Array.isArray(raw?.papers) ? raw.papers : [raw];
  const papers = rawPapers.flatMap((paper, index) => {
    const normalized = normalizePaper(paper, index, errors, warnings);
    return normalized ? [normalized] : [];
  });
  const keys = new Set();
  for (const paper of papers) {
    const key = `${paper.examYear}:${paper.paperCode}`;
    if (keys.has(key)) errors.push(`${key}: 试卷重复`);
    keys.add(key);
    if (args.requireVerified && paper.quality !== "verified") errors.push(`${paper.examYear}: 试卷尚未完成视觉复核`);
    if (args.requireVerified) {
      for (const problem of paper.problems) {
        if (problem.quality !== "verified") errors.push(`${paper.examYear} 第 ${problem.problemNo} 题尚未完成视觉复核`);
      }
    }
  }
  if (args.strictComplete) validateComplete(papers, errors);
  if (errors.length > 0) {
    const detail = errors.slice(0, 100).map((error) => `- ${error}`).join("\n");
    const suffix = errors.length > 100 ? `\n... 另有 ${errors.length - 100} 个错误` : "";
    throw new Error(`数学三真题 JSON 校验失败:\n${detail}${suffix}`);
  }
  return { papers, warnings };
}

function getYearRange(papers) {
  const years = papers.map((paper) => paper.examYear).sort((left, right) => left - right);
  return years.length ? `${years[0]}-${years[years.length - 1]}` : "";
}

function assertApplyConfirmation(args, papers) {
  if (!args.apply) return;
  if (!["local", "staging", "production"].includes(args.target)) throw new Error("--apply 必须同时提供 --target local|staging|production");
  if (args.confirmYearRange !== getYearRange(papers)) throw new Error(`--apply 必须同时提供 --confirm-year-range ${getYearRange(papers)}`);
  if (!args.allowUnverified && papers.some((paper) => paper.quality !== "verified" || paper.problems.some((problem) => problem.quality !== "verified"))) {
    throw new Error("存在 needs_visual_review 内容；apply 必须显式添加 --allow-unverified，或先完成视觉复核");
  }
}

function sqlString(value) {
  const text = String(value ?? "");
  let tag = "ASTEROID_MATH3";
  let suffix = 0;
  while (text.includes(`$${tag}$`)) {
    suffix += 1;
    tag = `ASTEROID_MATH3_${suffix}`;
  }
  return `$${tag}$${text}$${tag}$`;
}

function sqlNumber(value) {
  if (!Number.isFinite(value)) throw new Error(`SQL 数字非法: ${value}`);
  return String(value);
}

function sqlJson(value) {
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

function buildSql(papers) {
  const lines = [
    "-- Math III fixed paper source import.",
    "-- Additive upsert only: no notes, attempts, grades, or RAG tables are touched.",
    "begin;",
    "",
  ];
  for (const paper of papers) {
    lines.push(
      "insert into public.math_papers (exam_year, paper_code, title, source_checksum, source_url, status)",
      `values (${sqlNumber(paper.examYear)}, ${sqlString(paper.paperCode)}, ${sqlString(paper.title)}, ${sqlString(paper.sourceChecksum)}, ${paper.sourceUrl ? sqlString(paper.sourceUrl) : "null"}, ${sqlString(paper.status)})`,
      "on conflict (exam_year, paper_code) do update set",
      "  title = excluded.title,",
      "  source_checksum = excluded.source_checksum,",
      "  source_url = excluded.source_url,",
      "  status = excluded.status,",
      "  updated_at = now();",
      "",
    );
    for (const problem of paper.problems) {
      lines.push(
        "insert into public.math_paper_problems (math_paper_id, problem_no, problem_type, prompt, standard_answer, scoring_rubric, max_score, content_version, content_checksum)",
        "select id,",
        `  ${sqlNumber(problem.problemNo)}, ${sqlString(problem.problemType)}, ${sqlString(problem.prompt)}, ${sqlString(problem.standardAnswer)},`,
        `  ${sqlJson(problem.scoringRubric)}, ${sqlNumber(problem.maxScore)}, ${sqlNumber(problem.contentVersion)}, ${sqlString(problem.contentChecksum)}`,
        "from public.math_papers",
        `where exam_year = ${sqlNumber(paper.examYear)} and paper_code = ${sqlString(paper.paperCode)}`,
        "on conflict (math_paper_id, problem_no) do update set",
        "  problem_type = excluded.problem_type,",
        "  prompt = excluded.prompt,",
        "  standard_answer = excluded.standard_answer,",
        "  scoring_rubric = excluded.scoring_rubric,",
        "  max_score = excluded.max_score,",
        "  content_version = excluded.content_version,",
        "  content_checksum = excluded.content_checksum,",
        "  updated_at = now();",
        "",
      );
    }
  }
  lines.push("commit;", "");
  return lines.join("\n");
}

async function upsertToSupabase(papers) {
  loadLocalEnv();
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl) throw new Error("缺少 SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) throw new Error("正式导入需要 SUPABASE_SERVICE_ROLE_KEY；不要使用 anon key 导入固定真题");
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  let problemCount = 0;
  for (const paper of papers) {
    const { data: paperRow, error: paperError } = await supabase.from("math_papers").upsert({
      exam_year: paper.examYear,
      paper_code: paper.paperCode,
      title: paper.title,
      source_checksum: paper.sourceChecksum,
      source_url: paper.sourceUrl,
      status: paper.status,
      updated_at: new Date().toISOString(),
    }, { onConflict: "exam_year,paper_code" }).select("id").single();
    if (paperError) throw paperError;
    const rows = paper.problems.map((problem) => ({
      math_paper_id: paperRow.id,
      problem_no: problem.problemNo,
      problem_type: problem.problemType,
      prompt: problem.prompt,
      standard_answer: problem.standardAnswer,
      scoring_rubric: problem.scoringRubric,
      max_score: problem.maxScore,
      content_version: problem.contentVersion,
      content_checksum: problem.contentChecksum,
      updated_at: new Date().toISOString(),
    }));
    const { error: problemError } = await supabase.from("math_paper_problems").upsert(rows, { onConflict: "math_paper_id,problem_no" });
    if (problemError) throw problemError;
    problemCount += rows.length;
  }
  return { papers: papers.length, problems: problemCount };
}

function printSummary(papers, warnings) {
  const problems = papers.flatMap((paper) => paper.problems);
  const visualProblems = problems.filter((problem) => problem.quality !== "verified").length;
  console.log(`试卷: ${papers.length}`);
  console.log(`题目: ${problems.length}`);
  console.log(`视觉复核标记: ${visualProblems}`);
  console.log(`年份: ${getYearRange(papers) || "无"}`);
  if (warnings.length > 0) {
    console.log("提醒:");
    for (const warning of warnings.slice(0, 30)) console.log(`- ${warning}`);
    if (warnings.length > 30) console.log(`- ... 另有 ${warnings.length - 30} 条提醒`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.input) throw new Error(`缺少 --input\n\n${usage()}`);
  const inputPath = resolve(rootDir, args.input);
  if (!existsSync(inputPath)) throw new Error(`找不到输入文件: ${inputPath}`);
  const raw = JSON.parse(readFileSync(inputPath, "utf8"));
  const { papers, warnings } = normalizeInput(raw, args);
  assertApplyConfirmation(args, papers);
  printSummary(papers, warnings);

  if (args.emitSql) {
    const outputPath = resolve(rootDir, args.emitSql);
    outputPath && mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, buildSql(papers), "utf8");
    console.log(`已生成 SQL: ${outputPath}`);
  }
  if (args.emitSqlDir) {
    const outputDir = resolve(rootDir, args.emitSqlDir);
    mkdirSync(outputDir, { recursive: true });
    for (const paper of [...papers].sort((left, right) => left.examYear - right.examYear)) {
      const outputPath = resolve(outputDir, `math3-${paper.examYear}.sql`);
      writeFileSync(outputPath, buildSql([paper]), "utf8");
      console.log(`已生成分块 SQL: ${outputPath}`);
    }
  }
  if (args.apply) {
    const result = await upsertToSupabase(papers);
    console.log(`导入完成: papers=${result.papers}, problems=${result.problems}`);
  } else if (!args.emitSql && !args.emitSqlDir) {
    console.log("当前是 dry-run，没有写入数据库。正式导入请加 --apply，或生成 SQL 后再执行。");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
