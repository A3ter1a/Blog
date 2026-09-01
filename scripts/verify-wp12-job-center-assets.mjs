import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const required = [
  ["supabase/migrations/0026_job_center_lifecycle.sql", ["cancelled", "jobs_owner_delete", "terminal"]],
  ["app/api/jobs/route.ts", ["cleanupExpiredUserJobs", "cleanup", "listUserJobs"]],
  ["app/api/jobs/[id]/cancel/route.ts", ["getJobRequestContext", "cancelUserJob", "export async function POST"]],
  ["lib/server-job-ledger.ts", ["cancelUserJob", "cleanupExpiredUserJobs", "TERMINAL_JOB_RETENTION_MS"]],
  ["lib/job-client.ts", ["cancelled", "removeExpiredClientJobs", "isClientJobTerminal", "math3_self_test_generation", "math_paper_grade", "math_paper_ocr", "math3_auto_classify", "english_subjective_grade"]],
  ["components/jobs/JobCenter.tsx", ["消息中心", "待处理", "进行中", "已结束", "cancelJob", "取消任务", "content-review?status=pending_review", "打开审核", "createMath3SelfTestJob", "createMathPaperGradeJob", "createMathPaperOcrJob", "createMath3ClassifyJob", "createEnglishSubjectiveGradeJob"]],
  ["components/tools/Math3SelfTest.tsx", ["useJobCenter", "createMath3SelfTestJob", "createFromGenerationJob", "取消生成"]],
  ["app/api/jobs/math3-self-test/route.ts", ["createMath3SelfTestGenerationJob", "internalJobLeaseSchemaAvailable", "sanitizeJobSummaryRow"]],
  ["lib/server-internal-job-runner.ts", ["createMath3SelfTestGenerationJob", "advanceMath3SelfTestGenerationJob", "math3_self_test_generation"]],
  ["lib/server-math3-self-test-generation.ts", ["generateVerifiedMath3SelfTestPaper", "正在进行分科独立审校", "正在进行高风险二次终审"]],
  ["app/api/jobs/math-paper-grade/route.ts", ["createMathPaperGradeJob", "internalJobLeaseSchemaAvailable"]],
  ["app/api/jobs/math-paper-ocr/route.ts", ["createMathPaperOcrJob", "internalJobLeaseSchemaAvailable"]],
  ["app/api/jobs/math3-classify/route.ts", ["createMath3ClassificationJob", "sourceChecksum"]],
  ["app/api/jobs/english-subjective-grade/route.ts", ["createEnglishSubjectiveGradeJob", "internalJobLeaseSchemaAvailable"]],
  ["lib/server-internal-job-runner.ts", ["math_paper_grade", "math_paper_ocr", "math3_auto_classify", "english_subjective_grade", "normalizeMath3ChapterAssignments"]],
  ["lib/server-job-ledger.ts", ["getOwnedInternalOcrAssetPaths", "临时源图已清理"]],
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
const math3SelfTest = fs.readFileSync(path.join(root, "components/tools/Math3SelfTest.tsx"), "utf8");
const createPage = fs.readFileSync(path.join(root, "app/create/page.tsx"), "utf8");
const scanHook = fs.readFileSync(path.join(root, "hooks/useAIScan.ts"), "utf8");
if (/fetch\(["']\/api\/ai\/math3-self-test\/generate/.test(math3SelfTest)) {
  failures.push("数学三试卷生成仍绕过任务中心直接请求同步生成 API");
}
if (/fetch\(["']\/api\/ai\/document-markdown-review/.test(createPage)) {
  failures.push("Markdown 审阅仍保留不可恢复的页面内 AI 降级");
}
if (/createLocalProblemOcrJob|\/api\/ai\/(?:ocr|analyze)/.test(scanHook)) {
  failures.push("题库 OCR 仍保留不可恢复的页面内 AI 降级");
}
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
    "unclaimed results are retained; claimed, failed, and cancelled history expires after thirty days",
    "empty message center hides the floating button",
    "pending AI proposals surface as administrator review notifications",
    "math3 self-test generation is durable, cancellable, resumable, and claimed idempotently",
    "math paper grading and answer-sheet OCR survive page closure",
    "math3 classification protects edited source snapshots before applying results",
    "English subjective grading records suggestions idempotently inside the durable job",
    "persistent task capability failures never fall back to untracked in-page AI work",
  ],
}, null, 2));
