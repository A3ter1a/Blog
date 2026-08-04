#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const VALID_YEARS = new Set(Array.from({ length: 20 }, (_, index) => 2007 + index));
const VALID_SECTIONS = new Set(["reading", "cloze", "new_type", "translation", "writing"]);
const VALID_PASSAGE_NOS = new Set([
  "text1",
  "text2",
  "text3",
  "text4",
  "cloze",
  "new_type",
  "translation",
  "small_writing",
  "big_writing",
]);
const PASSAGE_NOS_BY_SECTION = {
  reading: new Set(["text1", "text2", "text3", "text4"]),
  cloze: new Set(["cloze"]),
  new_type: new Set(["new_type"]),
  translation: new Set(["translation"]),
  writing: new Set(["small_writing", "big_writing"]),
};
const FORBIDDEN_KEYS = new Set([
  "analysis",
  "explanation",
  "explanations",
  "source",
  "sourceMark",
  "source_mark",
  "origin",
]);
const COMPLETE_YEARS = Array.from({ length: 20 }, (_, index) => 2007 + index);
const COMPLETE_PASSAGE_NOS = [
  "cloze",
  "text1",
  "text2",
  "text3",
  "text4",
  "new_type",
  "translation",
  "small_writing",
  "big_writing",
];

function usage() {
  return `
Usage:
  node scripts/import-english-papers.mjs --input data/english-papers/english1-2007-2026.json
  node scripts/import-english-papers.mjs --input data/english-papers/english1-2007-2026.json --apply --target production --confirm-year-range 2007-2026 --strict-complete
  node scripts/import-english-papers.mjs --input data/english-papers/english1-2007-2026.json --emit-sql data/english-papers/english1-2007-2026.sql --strict-complete
  node scripts/import-english-papers.mjs --input data/english-papers/english1-2007-2026.json --emit-sql-dir data/english-papers/sql-chunks --strict-complete

Options:
  --input <path>          JSON file. Shape can be { "papers": [...] }, [...], or a single paper object.
  --apply                 Write to Supabase. Requires SUPABASE_SERVICE_ROLE_KEY.
  --target <name>         Required with --apply. Use local, staging, or production.
  --confirm-year-range    Required with --apply. Must match the JSON year range, for example 2007-2026.
  --emit-sql <path>       Generate additive upsert SQL for Supabase SQL Editor.
  --emit-sql-dir <path>   Generate one additive upsert SQL file per year.
  --strict-complete       Require English I 2007-2026 with all expected passage groups.
  --allow-empty-content   Permit empty passage content for staged imports.
  --help                  Show this help.

Default mode is dry-run validation only.
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
    allowEmptyContent: false,
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
    } else if (arg === "--allow-empty-content") {
      args.allowEmptyContent = true;
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
    const filePath = resolve(rootDir, name);
    if (!existsSync(filePath)) continue;

    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;

      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
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

function cleanPassageContent(section, content) {
  let cleaned = asString(content)
    .replace(/\r\n?/g, "\n")
    .replace(/\(\s*\)\s*-?\s*11\s*-\s*\(\s*14\s*\)/gi, "")
    .replace(/-\s*11\s*-\s*\(\s*14\s*\)/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (["cloze", "new_type", "translation"].includes(section)) {
    cleaned = cleaned.replace(
      /^(?:directions?|read the following|(?:in\s+)?the following|for questions|you are going to read)[\s\S]*?(?:\(\s*\d+\s+points?\s*\)|on\s+answer\s+sheet(?:\s+\d+)?\.?(?:\s*\(\s*\d+\s+points?\s*\))?)\s*/i,
      "",
    );
  }
  if (section === "new_type") {
    cleaned = cleaned.replace(
      /\s+41\.\s*(?:[A-H]\s*)?42\.\s*(?:[A-H]\s*)?43\.\s*(?:[A-H]\s*)?44\.\s*(?:[A-H]\s*)?45\.\s*(?:[A-H]\s*)?$/i,
      "",
    );
  }
  if (section === "writing") {
    cleaned = cleaned
      .replace(/^\s*\d{2}\.\s*/i, "")
      .replace(/\s+Part\s+[AB]\s*$/i, "")
      .trim();
  }

  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

function cleanQuestionStem(section, questionNo, stem) {
  let cleaned = asString(stem).replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (section === "writing") {
    cleaned = cleaned.replace(new RegExp(`^${questionNo}\\.\\s*`, "i"), "");
    cleaned = cleaned.replace(/\s+Part\s+[AB]\s*$/i, "").trim();
  }
  return cleaned;
}

function questionSortOrder(questionNo, fallback) {
  const numeric = Number(String(questionNo).replace(/[^\d]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function defaultPassageSortOrder(section, passageNo) {
  const order = {
    cloze: 10,
    text1: 20,
    text2: 21,
    text3: 22,
    text4: 23,
    new_type: 40,
    translation: 50,
    small_writing: 60,
    big_writing: 61,
  };
  return order[passageNo] ?? order[section] ?? 999;
}

function defaultQuestionScore(section) {
  if (section === "cloze") return 0.5;
  if (section === "reading" || section === "new_type") return 2;
  if (section === "translation") return 2;
  if (section === "writing") return 10;
  return 0;
}

function isObjectiveSection(section) {
  return section === "reading" || section === "cloze" || section === "new_type";
}

function pathLabel(...parts) {
  return parts.filter((part) => part !== "").join(".");
}

function findForbiddenKeys(value, currentPath, errors) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenKeys(item, `${currentPath}[${index}]`, errors));
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, nested] of Object.entries(value)) {
    const nextPath = currentPath ? `${currentPath}.${key}` : key;
    if (FORBIDDEN_KEYS.has(key)) {
      errors.push(`${nextPath}: 不允许导入解析或来源字段`);
    }
    findForbiddenKeys(nested, nextPath, errors);
  }
}

function normalizeOptions(rawOptions, path, errors) {
  if (!Array.isArray(rawOptions)) return [];

  return rawOptions.map((option, index) => {
    if (!isRecord(option)) {
      errors.push(`${path}.options[${index}]: 选项必须是对象`);
      return { label: "", content: "" };
    }
    const label = asString(getField(option, "label"));
    const content = asString(getField(option, "content"));
    if (!label) errors.push(`${path}.options[${index}].label: 不能为空`);
    if (!content) errors.push(`${path}.options[${index}].content: 不能为空`);
    return { label, content };
  });
}

function normalizeQuestion(rawQuestion, section, questionIndex, path, errors) {
  if (!isRecord(rawQuestion)) {
    errors.push(`${path}: 题目必须是对象`);
    return null;
  }

  const questionNo = asString(getField(rawQuestion, "questionNo", "question_no"));
  const stem = cleanQuestionStem(section, questionNo, getField(rawQuestion, "stem"));
  const options = normalizeOptions(getField(rawQuestion, "options") ?? [], path, errors);
  const standardAnswer = asString(getField(rawQuestion, "standardAnswer", "standard_answer"));
  const score = asNumber(getField(rawQuestion, "score")) ?? defaultQuestionScore(section);
  const sortOrder = asNumber(getField(rawQuestion, "sortOrder", "sort_order"))
    ?? questionSortOrder(questionNo, questionIndex + 1);

  if (!questionNo) errors.push(`${path}.questionNo: 不能为空`);
  if (!stem) errors.push(`${path}.stem: 不能为空`);
  if (isObjectiveSection(section) && options.length === 0) {
    errors.push(`${path}.options: 客观题必须提供选项`);
  }
  if (isObjectiveSection(section) && !standardAnswer) {
    errors.push(`${path}.standardAnswer: 客观题不能为空；翻译和写作由 AI 评分，可留空`);
  }
  if (!Number.isFinite(score) || score <= 0) errors.push(`${path}.score: 必须是正数`);

  return {
    questionNo,
    stem,
    options,
    standardAnswer,
    score,
    sortOrder,
  };
}

function normalizePassage(rawPassage, year, passageIndex, options, path, errors, warnings) {
  if (!isRecord(rawPassage)) {
    errors.push(`${path}: 篇章必须是对象`);
    return null;
  }

  const section = asString(getField(rawPassage, "section"));
  const passageNo = asString(getField(rawPassage, "passageNo", "passage_no"));
  const title = asString(getField(rawPassage, "title"));
  const content = cleanPassageContent(section, getField(rawPassage, "content"));
  const questionsRaw = getField(rawPassage, "questions") ?? [];
  const sortOrder = asNumber(getField(rawPassage, "sortOrder", "sort_order"))
    ?? defaultPassageSortOrder(section, passageNo)
    ?? passageIndex + 1;

  if (!VALID_SECTIONS.has(section)) {
    errors.push(`${path}.section: 必须是 reading/cloze/new_type/translation/writing`);
  }
  if (!VALID_PASSAGE_NOS.has(passageNo)) {
    errors.push(`${path}.passageNo: 篇章号不合法`);
  }
  if (VALID_SECTIONS.has(section) && VALID_PASSAGE_NOS.has(passageNo) && !PASSAGE_NOS_BY_SECTION[section].has(passageNo)) {
    errors.push(`${path}.passageNo: ${passageNo} 不属于 ${section}`);
  }
  const knownMissingClozeOriginal = section === "cloze" && !content;
  if (!content && !options.allowEmptyContent && !knownMissingClozeOriginal) {
    errors.push(`${path}.content: 不能为空。若只是分批占位，使用 --allow-empty-content`);
  }
  if (!Array.isArray(questionsRaw)) {
    errors.push(`${path}.questions: 必须是数组`);
  }

  const questions = Array.isArray(questionsRaw)
    ? questionsRaw
        .map((question, questionIndex) => normalizeQuestion(
          question,
          section,
          questionIndex,
          pathLabel(path, `questions[${questionIndex}]`),
          errors,
        ))
        .filter(Boolean)
    : [];

  const totalScore = asNumber(getField(rawPassage, "totalScore", "total_score"))
    ?? questions.reduce((sum, question) => sum + question.score, 0);

  if (questions.length === 0) errors.push(`${path}.questions: 至少需要 1 道题`);
  if (section === "reading" && questions.length !== 5) {
    warnings.push(`${year} ${passageNo}: 阅读通常应为 5 题，当前 ${questions.length} 题`);
  }
  if (section === "cloze" && questions.length !== 20) {
    warnings.push(`${year} cloze: 完形通常应为 20 题，当前 ${questions.length} 题`);
  }
  if (section === "new_type" && questions.length !== 5) {
    warnings.push(`${year} new_type: 新题型通常应为 5 题，当前 ${questions.length} 题`);
  }
  if (["cloze", "new_type", "translation"].includes(section)
    && /^(?:directions?|read the following|the following|for questions|you are going to read|in the following)\b/i.test(content)) {
    warnings.push(`${year} ${passageNo}: 清洗后仍残留答题说明，请检查原始 OCR`);
  }
  if (/\(\s*\)\s*-?\s*11\s*-\s*\(\s*14\s*\)|-\s*11\s*-\s*\(\s*14\s*\)/i.test(content)) {
    warnings.push(`${year} ${passageNo}: 清洗后仍残留页脚 OCR`);
  }
  if (section === "writing" && questions.some((question) => /^\d{2}\.\s*/.test(question.stem) || /\s+Part\s+[AB]\s*$/i.test(question.stem))) {
    warnings.push(`${year} ${passageNo}: 作文题干仍残留题号或 Part 标记`);
  }
  if (section === "cloze") {
    const blankNumbers = new Set(
      [...content.matchAll(/(?<!\w)(\d{1,2})(?!\w)/g)]
        .map((match) => Number(match[1]))
        .filter((number) => number >= 1 && number <= 20),
    );
    if (blankNumbers.size < 10) {
      warnings.push(`${year} cloze: 清洗后只找到 ${blankNumbers.size} 个编号空，原文可能缺失，暂不应导入生产`);
    }
  }

  return {
    section,
    passageNo,
    title,
    content,
    totalScore,
    sortOrder,
    questions,
  };
}

function normalizePaper(rawPaper, paperIndex, options, errors, warnings) {
  if (!isRecord(rawPaper)) {
    errors.push(`papers[${paperIndex}]: 试卷必须是对象`);
    return null;
  }

  const year = asNumber(getField(rawPaper, "year"));
  const paperType = asString(getField(rawPaper, "paperType", "paper_type")) || "english1";
  const title = asString(getField(rawPaper, "title")) || `${year || ""} 年考研英语一真题`.trim();
  const totalScore = asNumber(getField(rawPaper, "totalScore", "total_score")) ?? 100;
  const passagesRaw = getField(rawPaper, "passages") ?? [];
  const path = `papers[${paperIndex}]`;

  if (!VALID_YEARS.has(year)) errors.push(`${path}.year: 必须在 2007-2026 之间`);
  if (paperType !== "english1") errors.push(`${path}.paperType: v1 只允许 english1`);
  if (!Array.isArray(passagesRaw)) errors.push(`${path}.passages: 必须是数组`);

  const passages = Array.isArray(passagesRaw)
    ? passagesRaw
        .map((passage, passageIndex) => normalizePassage(
          passage,
          year,
          passageIndex,
          options,
          pathLabel(path, `passages[${passageIndex}]`),
          errors,
          warnings,
        ))
        .filter(Boolean)
    : [];

  if (passages.length === 0) errors.push(`${path}.passages: 至少需要 1 个篇章/题组`);

  return {
    year,
    paperType,
    title,
    totalScore,
    passages,
  };
}

function normalizeInput(raw, options) {
  const errors = [];
  const warnings = [];
  findForbiddenKeys(raw, "", errors);

  const rawPapers = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.papers)
      ? raw.papers
      : [raw];

  const papers = rawPapers
    .map((paper, index) => normalizePaper(paper, index, options, errors, warnings))
    .filter(Boolean);

  validateDuplicates(papers, errors);
  if (options.strictComplete) validateComplete(papers, errors);
  else warnIfIncomplete(papers, warnings);

  if (errors.length > 0) {
    const detail = errors.slice(0, 80).map((error) => `- ${error}`).join("\n");
    const suffix = errors.length > 80 ? `\n... 另有 ${errors.length - 80} 个错误` : "";
    throw new Error(`真题 JSON 校验失败:\n${detail}${suffix}`);
  }

  return { papers, warnings };
}

function validateDuplicates(papers, errors) {
  const paperKeys = new Set();
  for (const paper of papers) {
    const paperKey = `${paper.paperType}:${paper.year}`;
    if (paperKeys.has(paperKey)) errors.push(`${paper.year}: 试卷重复`);
    paperKeys.add(paperKey);

    const passageKeys = new Set();
    for (const passage of paper.passages) {
      const passageKey = `${passage.section}:${passage.passageNo}`;
      if (passageKeys.has(passageKey)) errors.push(`${paper.year} ${passageKey}: 篇章重复`);
      passageKeys.add(passageKey);

      const questionNos = new Set();
      for (const question of passage.questions) {
        if (questionNos.has(question.questionNo)) {
          errors.push(`${paper.year} ${passage.passageNo} ${question.questionNo}: 题号重复`);
        }
        questionNos.add(question.questionNo);
      }
    }
  }
}

function warnIfIncomplete(papers, warnings) {
  const years = new Set(papers.map((paper) => paper.year));
  const missingYears = COMPLETE_YEARS.filter((year) => !years.has(year));
  if (missingYears.length > 0) {
    warnings.push(`当前不是完整 2007-2026 数据，缺少年份: ${missingYears.join(", ")}`);
  }
}

function validateComplete(papers, errors) {
  const byYear = new Map(papers.map((paper) => [paper.year, paper]));
  for (const year of COMPLETE_YEARS) {
    const paper = byYear.get(year);
    if (!paper) {
      errors.push(`strict-complete: 缺少 ${year} 年试卷`);
      continue;
    }
    const passageNos = new Set(paper.passages.map((passage) => passage.passageNo));
    for (const passageNo of COMPLETE_PASSAGE_NOS) {
      if (!passageNos.has(passageNo)) {
        errors.push(`strict-complete: ${year} 缺少 ${passageNo}`);
      }
    }
  }
}

function summarize(papers) {
  const passages = papers.flatMap((paper) => paper.passages);
  const questions = passages.flatMap((passage) => passage.questions);
  const bySection = {};
  for (const passage of passages) {
    bySection[passage.section] = (bySection[passage.section] ?? 0) + 1;
  }

  return {
    papers: papers.length,
    passages: passages.length,
    questions: questions.length,
    bySection,
  };
}

function getYearRange(papers) {
  const years = papers.map((paper) => paper.year).filter(Number.isFinite).sort((a, b) => a - b);
  if (years.length === 0) return "";
  return `${years[0]}-${years[years.length - 1]}`;
}

function assertApplyConfirmation(args, papers) {
  if (!args.apply) return;

  const allowedTargets = new Set(["local", "staging", "production"]);
  if (!allowedTargets.has(args.target)) {
    throw new Error("--apply 必须同时提供 --target local|staging|production");
  }

  const yearRange = getYearRange(papers);
  if (args.confirmYearRange !== yearRange) {
    throw new Error(`--apply 必须同时提供 --confirm-year-range ${yearRange}`);
  }
}

function printSummary(summary, warnings) {
  console.log(`试卷: ${summary.papers}`);
  console.log(`篇章/题组: ${summary.passages}`);
  console.log(`题目: ${summary.questions}`);
  console.log(`题型分布: ${Object.entries(summary.bySection).map(([key, count]) => `${key}=${count}`).join(", ") || "无"}`);
  if (warnings.length > 0) {
    console.log("");
    console.log("提醒:");
    for (const warning of warnings.slice(0, 40)) console.log(`- ${warning}`);
    if (warnings.length > 40) console.log(`- ... 另有 ${warnings.length - 40} 条提醒`);
  }
}

function sqlString(value) {
  const text = String(value ?? "");
  let tag = "ASTEROID_ENGLISH";
  let suffix = 0;
  while (text.includes(`$${tag}$`)) {
    suffix += 1;
    tag = `ASTEROID_ENGLISH_${suffix}`;
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
    "-- English I past-paper content import.",
    "-- Additive upsert only: no notes/problems/attempts/vocabulary tables are touched.",
    "begin;",
    "",
  ];

  for (const paper of papers) {
    lines.push(
      "insert into public.english_papers (year, paper_type, title, total_score)",
      `values (${sqlNumber(paper.year)}, ${sqlString(paper.paperType)}, ${sqlString(paper.title)}, ${sqlNumber(paper.totalScore)})`,
      "on conflict (paper_type, year) do update set",
      "  title = excluded.title,",
      "  total_score = excluded.total_score,",
      "  updated_at = now();",
      "",
    );

    for (const passage of paper.passages) {
      lines.push(
        "insert into public.english_passages (paper_id, year, section, passage_no, title, content, total_score, sort_order)",
        "select id,",
        `  ${sqlNumber(paper.year)}, ${sqlString(passage.section)}, ${sqlString(passage.passageNo)}, ${sqlString(passage.title)},`,
        `  ${sqlString(passage.content)}, ${sqlNumber(passage.totalScore)}, ${sqlNumber(passage.sortOrder)}`,
        "from public.english_papers",
        `where paper_type = ${sqlString(paper.paperType)} and year = ${sqlNumber(paper.year)}`,
        "on conflict (paper_id, section, passage_no) do update set",
        "  title = excluded.title,",
        "  content = excluded.content,",
        "  total_score = excluded.total_score,",
        "  sort_order = excluded.sort_order,",
        "  updated_at = now();",
        "",
      );

      for (const question of passage.questions) {
        lines.push(
          "insert into public.english_questions (passage_id, question_no, stem, options, standard_answer, score, sort_order)",
          "select english_passages.id,",
          `  ${sqlString(question.questionNo)}, ${sqlString(question.stem)}, ${sqlJson(question.options)},`,
          `  ${sqlString(question.standardAnswer)}, ${sqlNumber(question.score)}, ${sqlNumber(question.sortOrder)}`,
          "from public.english_passages",
          "join public.english_papers on english_papers.id = english_passages.paper_id",
          `where english_papers.paper_type = ${sqlString(paper.paperType)}`,
          `  and english_papers.year = ${sqlNumber(paper.year)}`,
          `  and english_passages.section = ${sqlString(passage.section)}`,
          `  and english_passages.passage_no = ${sqlString(passage.passageNo)}`,
          "on conflict (passage_id, question_no) do update set",
          "  stem = excluded.stem,",
          "  options = excluded.options,",
          "  standard_answer = excluded.standard_answer,",
          "  score = excluded.score,",
          "  sort_order = excluded.sort_order,",
          "  updated_at = now();",
          "",
        );
      }
    }
  }

  lines.push("commit;", "");
  return lines.join("\n");
}

async function upsertToSupabase(papers) {
  loadLocalEnv();
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl) {
    throw new Error("缺少 SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!serviceRoleKey) {
    throw new Error("正式导入需要 SUPABASE_SERVICE_ROLE_KEY。不要使用 anon key 导入真题内容。");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  let passageCount = 0;
  let questionCount = 0;

  for (const paper of papers) {
    const { data: paperRow, error: paperError } = await supabase
      .from("english_papers")
      .upsert({
        year: paper.year,
        paper_type: paper.paperType,
        title: paper.title,
        total_score: paper.totalScore,
        updated_at: new Date().toISOString(),
      }, { onConflict: "paper_type,year" })
      .select("id")
      .single();
    if (paperError) throw paperError;

    for (const passage of paper.passages) {
      const { data: passageRow, error: passageError } = await supabase
        .from("english_passages")
        .upsert({
          paper_id: paperRow.id,
          year: paper.year,
          section: passage.section,
          passage_no: passage.passageNo,
          title: passage.title,
          content: passage.content,
          total_score: passage.totalScore,
          sort_order: passage.sortOrder,
          updated_at: new Date().toISOString(),
        }, { onConflict: "paper_id,section,passage_no" })
        .select("id")
        .single();
      if (passageError) throw passageError;
      passageCount += 1;

      if (passage.questions.length === 0) continue;

      const rows = passage.questions.map((question) => ({
        passage_id: passageRow.id,
        question_no: question.questionNo,
        stem: question.stem,
        options: question.options,
        standard_answer: question.standardAnswer,
        score: question.score,
        sort_order: question.sortOrder,
        updated_at: new Date().toISOString(),
      }));

      const { error: questionError } = await supabase
        .from("english_questions")
        .upsert(rows, { onConflict: "passage_id,question_no" });
      if (questionError) throw questionError;
      questionCount += rows.length;
    }
  }

  return {
    papers: papers.length,
    passages: passageCount,
    questions: questionCount,
  };
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
  const summary = summarize(papers);

  console.log("英语真题 JSON 校验通过");
  printSummary(summary, warnings);

  if (args.emitSql) {
    const outputPath = resolve(rootDir, args.emitSql);
    writeFileSync(outputPath, buildSql(papers), "utf8");
    console.log("");
    console.log(`已生成 SQL: ${outputPath}`);
  }

  if (args.emitSqlDir) {
    const outputDir = resolve(rootDir, args.emitSqlDir);
    mkdirSync(outputDir, { recursive: true });
    const sortedPapers = [...papers].sort((left, right) => left.year - right.year);
    console.log("");
    for (const paper of sortedPapers) {
      const outputPath = resolve(outputDir, `english1-${paper.year}.sql`);
      writeFileSync(outputPath, buildSql([paper]), "utf8");
      console.log(`已生成分块 SQL: ${outputPath}`);
    }
  }

  if (args.apply) {
    console.log("");
    console.log("开始写入 Supabase english_* 内容表...");
    const result = await upsertToSupabase(papers);
    console.log(`导入完成: papers=${result.papers}, passages=${result.passages}, questions=${result.questions}`);
  } else if (!args.emitSql && !args.emitSqlDir) {
    console.log("");
    console.log("当前是 dry-run，没有写入数据库。正式导入请加 --apply，或加 --emit-sql/--emit-sql-dir 生成 SQL。");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
