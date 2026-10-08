import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Only prepares a local rollback file; it never connects to or changes a database.
const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) throw new Error("Usage: node scripts/prepare-english-backup-rollback.mjs <backup.json> <rollback.sql>");
const snapshot = JSON.parse(readFileSync(resolve(input), "utf8"));
if (snapshot.project_ref !== "kysywitrsjhcdlcrfayl") throw new Error("Backup project mismatch");
const tables = {
  english_papers: ["id", "year", "paper_type", "title", "total_score", "created_at", "updated_at"],
  english_passages: ["id", "paper_id", "year", "section", "passage_no", "title", "content", "total_score", "sort_order", "created_at", "updated_at"],
  english_questions: ["id", "passage_id", "question_no", "stem", "options", "standard_answer", "score", "sort_order", "created_at", "updated_at"],
};
if (snapshot.english_papers.length !== 6 || snapshot.english_passages.length !== 54 || snapshot.english_questions.length !== 312) throw new Error("Unexpected six-year backup counts");
if (snapshot.english_papers.some((paper) => paper.paper_type !== "english1" || paper.year < 2021 || paper.year > 2026)) throw new Error("Backup exceeds approved range");
const paperIds = new Set(snapshot.english_papers.map((paper) => paper.id));
const passageIds = new Set(snapshot.english_passages.map((passage) => passage.id));
if (snapshot.english_passages.some((passage) => !paperIds.has(passage.paper_id)) || snapshot.english_questions.some((question) => !passageIds.has(question.passage_id))) throw new Error("Backup references exceed approved range");
function literal(value, column) {
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Invalid numeric value");
    return String(value);
  }
  const text = column === "options" ? JSON.stringify(value) : String(value);
  let tag = "ENGLISH_BACKUP";
  while (text.includes(`$${tag}$`)) tag += "_";
  return `$${tag}$${text}$${tag}$${column === "options" ? "::jsonb" : ""}`;
}
const statements = ["-- Restores only the approved English I 2021-2026 content snapshot.", "-- No account, attempt, vocabulary, security or schema changes.", "begin;"];
for (const [table, columns] of Object.entries(tables)) {
  for (const row of snapshot[table]) {
    statements.push(`update public.${table} set ${columns.filter((column) => column !== "id").map((column) => `${column} = ${literal(row[column], column)}`).join(", ")} where id = ${literal(row.id, "id")};`);
  }
}
statements.push("commit;", "");
writeFileSync(resolve(output), statements.join("\n"), { encoding: "utf8", flag: "wx" });
console.log("Prepared 372 scoped UPDATE statements. Database unchanged.");
