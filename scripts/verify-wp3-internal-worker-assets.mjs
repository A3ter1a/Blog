import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(path), "utf8");

const runner = read("lib/server-internal-job-runner.ts");
const ledger = read("lib/server-job-ledger.ts");
const jobCenter = read("components/jobs/JobCenter.tsx");
const createPage = read("app/create/page.tsx");
const createRoute = read("app/api/jobs/markdown-review/route.ts");
const advanceRoute = read("app/api/jobs/[id]/advance/route.ts");
const retryRoute = read("app/api/jobs/[id]/retry/route.ts");
const envExample = read(".env.example");
const packageJson = JSON.parse(read("package.json"));

for (const route of [createRoute, advanceRoute, retryRoute]) {
  assert.match(route, /getAdminRequestContext\(req\)/, "WP3 写路由必须经过管理员鉴权");
  assert.doesNotMatch(route, /service[_-]?role/i, "WP3 路由不得使用 service-role 绕过用户边界");
  assert.match(route, /Cache-Control|force-dynamic/, "WP3 路由不得缓存用户任务状态");
}

assert.match(runner, /WP3_INTERNAL_JOB_LEASE_ENABLED/, "worker 必须由显式 rollout flag 控制");
assert.match(envExample, /WP3_INTERNAL_JOB_LEASE_ENABLED=false/, "rollout flag 必须默认关闭");
assert.match(runner, /const sourceMarkdown = input\.markdown;/, "提案必须保留编辑器精确原文");
assert.match(runner, /splitMarkdownForReview\(sourceMarkdown\)/, "长正文必须先分块");
assert.match(runner, /chunks\.forEach[\s\S]*prepareDocumentMarkdownReviewSource\(chunk\)/, "单段限制必须逐块校验");

for (const rpc of [
  "enqueue_job_item",
  "claim_next_job_item",
  "complete_job_item",
  "fail_job_item",
  "reset_failed_job_item",
]) {
  assert.match(runner, new RegExp(`(?:\\"|')${rpc}(?:\\"|')`), `worker 缺少 ${rpc} 调用`);
}

const markdownAdvance = runner.match(/export async function advanceMarkdownReviewJob[\s\S]*?export async function advanceProblemOcrJob/)?.[0] ?? "";
assert.equal((markdownAdvance.match(/"claim_next_job_item"/g) ?? []).length, 1, "Markdown advance 每次只能领取一个分块");
assert.match(advanceRoute, /export const maxDuration = 300/, "单分块路由必须声明受控最大时长");
assert.match(ledger, /sanitizeJobSummaryPayload/, "任务列表必须经过 payload 脱敏");
assert.doesNotMatch(
  ledger.match(/const allowedKeys = \[[\s\S]*?\];/)?.[0] ?? "",
  /sourceMarkdown/,
  "任务列表不得批量返回完整 Markdown 原文",
);
assert.match(ledger, /\.select\("id, user_id, job_class, job_kind, status, title/, "任务列表必须显式选择摘要字段");
assert.doesNotMatch(
  ledger.match(/export async function listUserJobs[\s\S]*?export async function getUserJobResult/)?.[0] ?? "",
  /\bresult\b[^\n]*select|select\([^\n]*\bresult\b/,
  "任务列表不得批量选择 result",
);

assert.match(jobCenter, /\/advance/, "全局任务中心必须推进站内任务");
assert.match(jobCenter, /\/retry/, "全局任务中心必须支持显式重试失败分块");
assert.match(jobCenter, /resultPayload/, "任务中心必须支持结构化结果恢复");
assert.match(jobCenter, /authHeaders\.has\("Authorization"\)/, "无登录态时不得请求受保护的任务推进路由");
assert.match(jobCenter, /AUTH_RETRY_BACKOFF_MS/, "登录失效必须进入有界退避，避免高频 401");
assert.match(jobCenter, /const activeJobPollKey = useMemo/, "任务轮询必须按活跃任务集合建稳定调度键");
assert.match(jobCenter, /jobsRef\.current[\s\S]*window\.setInterval/, "定时轮询必须读取最新任务快照");
assert.doesNotMatch(jobCenter, /\}, \[jobs, pollJob\]\);/, "任务状态更新不得立即重建轮询并形成请求风暴");
assert.match(createPage, /createMarkdownReviewJob/, "创建页必须优先创建后台审阅任务");
assert.match(createPage, /\/api\/ai\/document-markdown-review/, "schema pending 时必须保留同步回退");
assert.match(createPage, /verifyMarkdownReviewProposalChecksums/, "恢复提案前必须重算 checksum");
assert.match(createPage, /MarkdownReviewProposalDialog/, "后台结果必须先进入人工确认对话框");
assert.match(createPage, /claimJobResult\(markdownReviewJobId\)/, "应用提案后必须关闭待领取状态");

assert.match(packageJson.scripts["verify:predeploy"] ?? "", /verify:wp3-worker-assets/, "predeploy 必须接入 WP3 worker 静态检查");

console.log("WP3 internal Markdown review worker assets verified: auth, lease, fallback, redaction, checksum, confirmation");
