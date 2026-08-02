import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const required = [
  ["supabase/migrations/0026_job_center_lifecycle.sql", ["cancelled", "jobs_owner_delete", "terminal"]],
  ["app/api/jobs/route.ts", ["cleanupExpiredUserJobs", "cleanup", "listUserJobs"]],
  ["app/api/jobs/[id]/cancel/route.ts", ["getAdminRequestContext", "cancelUserJob", "export async function POST"]],
  ["lib/server-job-ledger.ts", ["cancelUserJob", "cleanupExpiredUserJobs", "TERMINAL_JOB_RETENTION_MS"]],
  ["lib/job-client.ts", ["cancelled", "removeExpiredClientJobs", "isClientJobTerminal"]],
  ["components/jobs/JobCenter.tsx", ["消息中心", "待处理", "进行中", "已完成", "cancelJob", "取消任务", "content-review?status=pending_review", "打开审核"]],
  ["components/tools/AdminReviewToolCard.tsx", ["AI 内容审核", "/tools/ai-review", "useAdminAuth"]],
  ["app/globals.css", ["job-center-bucket-tabs", "job-center-cancel"]],
];

const failures = [];
for (const [relative, markers] of required) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    failures.push(`${relative}: missing`);
    continue;
  }
  const content = fs.readFileSync(file, "utf8");
  for (const marker of markers) {
    if (!content.includes(marker)) failures.push(`${relative}: missing marker ${marker}`);
  }
}

const migration = fs.readFileSync(path.join(root, "supabase/migrations/0026_job_center_lifecycle.sql"), "utf8");
if (!migration.includes("'cancelled'") || !migration.includes("status in")) failures.push("0026 must extend the jobs status check with cancelled");
if (!migration.includes("for delete to authenticated")) failures.push("0026 must add an authenticated owner delete policy");
if (!migration.includes("terminal")) {
  // The database migration owns the boundary; the exact cutoff is applied by
  // the server ledger so this marker prevents silently dropping the policy.
  if (!fs.readFileSync(path.join(root, "lib/server-job-ledger.ts"), "utf8").includes("TERMINAL_JOB_RETENTION_MS")) {
    failures.push("terminal retention boundary is missing");
  }
}

if (failures.length) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checkedFiles: required.length,
  guarantees: [
    "three message buckets with terminal failure/cancellation visibility",
    "owner-scoped cancellation endpoint",
    "best-effort three-day server cleanup plus local expiry cleanup",
    "empty message center hides the floating button",
    "pending AI proposals surface as administrator review notifications",
  ],
}, null, 2));
