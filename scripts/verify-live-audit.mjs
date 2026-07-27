#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const auditPath = join(rootDir, "supabase", "live-audit.sql");
const sql = readFileSync(auditPath, "utf8");

function stripCommentsAndLiterals(source) {
  let result = "";
  let state = "code";

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (state === "line-comment") {
      if (char === "\n") {
        state = "code";
        result += "\n";
      } else {
        result += " ";
      }
      continue;
    }

    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        state = "code";
        result += "  ";
        index += 1;
      } else {
        result += char === "\n" ? "\n" : " ";
      }
      continue;
    }

    if (state === "single-quote") {
      if (char === "'" && next === "'") {
        result += "  ";
        index += 1;
      } else if (char === "'") {
        state = "code";
        result += " ";
      } else {
        result += char === "\n" ? "\n" : " ";
      }
      continue;
    }

    if (state === "double-quote") {
      if (char === '"' && next === '"') {
        result += "  ";
        index += 1;
      } else if (char === '"') {
        state = "code";
        result += " ";
      } else {
        result += char === "\n" ? "\n" : " ";
      }
      continue;
    }

    if (char === "-" && next === "-") {
      state = "line-comment";
      result += "  ";
      index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      state = "block-comment";
      result += "  ";
      index += 1;
      continue;
    }

    if (char === "'") {
      state = "single-quote";
      result += " ";
      continue;
    }

    if (char === '"') {
      state = "double-quote";
      result += " ";
      continue;
    }

    result += char;
  }

  if (state !== "code" && state !== "line-comment") {
    throw new Error(`审计 SQL 存在未闭合结构: ${state}`);
  }

  return result;
}

const executableSql = stripCommentsAndLiterals(sql);
const statements = executableSql
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean);

const blockedPattern = /\b(insert|update|delete|alter|create|drop|truncate|grant|revoke|merge|copy|call|execute|do|refresh|vacuum|cluster|reindex|lock|set|reset|notify|listen|unlisten)\b/i;
const blockedFunctionPattern = /\b(nextval|setval|pg_advisory_lock|pg_try_advisory_lock|pg_cancel_backend|pg_terminate_backend|lo_unlink|dblink_exec|http_post|http_put|http_delete)\s*\(/i;
const invalidStatements = statements.filter((statement) => {
  const normalized = statement.replace(/^\(+/, "").trim();
  return !/^(select|with)\b/i.test(normalized)
    || blockedPattern.test(normalized)
    || blockedFunctionPattern.test(normalized);
});

const requiredMarkers = [
  "pg_policies",
  "pg_constraint",
  "pg_indexes",
  "information_schema.columns",
  "storage.buckets",
  "storage.objects",
  "auth.users",
  "public.notes",
  "public.problem_practice_statuses",
  "public.english_attempts",
  "supabase_migrations.schema_migrations",
  "query_to_xml",
];

let failed = 0;

function check(message, condition) {
  if (condition) {
    console.log(`PASS ${message}`);
  } else {
    console.log(`FAIL ${message}`);
    failed += 1;
  }
}

check("审计 SQL 只包含 SELECT/WITH 顶层语句", invalidStatements.length === 0);
check("审计 SQL 至少包含 15 个独立结果区", statements.length >= 15);

for (const marker of requiredMarkers) {
  check(`审计 SQL 覆盖 ${marker}`, sql.includes(marker));
}

check(
  "审计 SQL 不读取 notes.content 或题目答案正文",
  !/\bnotes\.content\b|\bstandard_answer\b|\buser_answer\b/i.test(executableSql),
);

if (invalidStatements.length > 0) {
  console.log("");
  console.log("发现非只读或无法识别的语句：");
  invalidStatements.forEach((statement, index) => {
    console.log(`${index + 1}. ${statement.slice(0, 180).replace(/\s+/g, " ")}`);
  });
}

if (failed > 0) {
  console.log("");
  console.log(`结果: ${failed} 个 live audit 安全检查未通过。`);
  process.exitCode = 1;
} else {
  console.log("");
  console.log("结果: live-audit.sql 已通过静态只读检查。该检查不代表生产审计已经执行。");
}
