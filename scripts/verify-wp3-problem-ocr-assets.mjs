import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(path), "utf8");

const migration = read("supabase/migrations/0020_problem_ocr_job_assets.sql");
const storage = read("lib/supabase-storage.ts");
const contract = read("lib/problem-ocr-contract.ts");
const service = read("lib/problem-ocr-service.ts");
const runner = read("lib/server-internal-job-runner.ts");
const ledger = read("lib/server-job-ledger.ts");
const createRoute = read("app/api/jobs/problem-ocr/route.ts");
const advanceRoute = read("app/api/jobs/[id]/advance/route.ts");
const retryRoute = read("app/api/jobs/[id]/retry/route.ts");
const jobCenter = read("components/jobs/JobCenter.tsx");
const scanHook = read("hooks/useAIScan.ts");
const uploader = read("components/ai-assistant/OCRUploader.tsx");
const verification = read("supabase/verification.sql");
const envExample = read(".env.example");
const packageJson = JSON.parse(read("package.json"));

assert.match(migration, /^begin;/m, "0020 必须以事务开始");
assert.match(migration, /^commit;/m, "0020 必须提交事务");
assert.match(migration, /update storage\.buckets/i, "0020 只能扩展既有私有 OCR bucket 配置");
assert.match(migration, /public\s*=\s*false/i, "题库 OCR 源图 bucket 必须保持私有");
for (const mime of ["application/pdf", "image/jpeg", "image/png", "image/webp"]) {
  assert.ok(migration.includes(`'${mime}'`), `0020 缺少允许类型 ${mime}`);
}
assert.doesNotMatch(migration, /storage\.objects|drop\s+table|truncate|delete\s+from/i, "0020 不得修改对象、删除表或清理数据");
assert.doesNotMatch(migration, /kysywitrsjhcdlcrfayl|qyjfcebqjtphlpsvizxo/i, "0020 不得绑定 production/shadow ref");

assert.match(storage, /OCR_DOCUMENT_BUCKET_NAME = "ocr-documents"/, "题库 OCR 必须复用私有 OCR bucket");
assert.match(storage, /problem-ocr\/\$\{userResult\.data\.user\.id\}\/\$\{batchId\}/, "每批源图必须按用户和随机批次隔离");
assert.doesNotMatch(
  storage.match(/export async function uploadProblemOcrAssets[\s\S]*?export async function deleteProblemOcrAssets/)?.[0] ?? "",
  /note-images/,
  "私人题目源图不得上传到公开 note-images bucket",
);
assert.match(contract, /isOwnedProblemOcrAssetPath/, "服务端必须验证源图路径 owner 边界");
assert.match(contract, /题库 OCR 分块序号或总数不连续/, "聚合结果必须拒绝缺号或错序分块");
assert.match(contract, /extractProblemOcrJobResult/, "客户端恢复前必须校验结构化结果");

for (const route of [createRoute, advanceRoute, retryRoute]) {
  assert.match(route, /getAdminRequestContext\(req\)/, "题库 OCR 写路由必须经过管理员鉴权");
  assert.doesNotMatch(route, /service[_-]?role/i, "题库 OCR 不得使用 service-role 绕过用户边界");
  assert.match(route, /force-dynamic|Cache-Control/, "题库 OCR 用户状态不得缓存");
}
assert.match(createRoute, /internalJobLeaseAvailable/, "上传前必须先检查 0014 lease 能力");
assert.match(createRoute, /resolveAIKey\("qwen"\)/, "持久 OCR 必须只读服务端 Qwen key");
assert.match(createRoute, /resolveAIKey\("deepseek"\)/, "持久 OCR 必须只读服务端 DeepSeek key");

const problemAdvance = runner.match(/export async function advanceProblemOcrJob[\s\S]*?export async function advanceInternalJob/)?.[0] ?? "";
assert.equal((problemAdvance.match(/"claim_next_job_item"/g) ?? []).length, 1, "题库 OCR 每次 advance 只能领取一张图片");
assert.match(problemAdvance, /storage\.from\(PROBLEM_OCR_BUCKET\)\.download/, "worker 必须从私有 Storage 读取源图");
assert.match(problemAdvance, /recognizeProblemImage/, "worker 必须调用共享 Qwen OCR 服务");
assert.match(problemAdvance, /analyzeProblemOcrText/, "worker 必须调用共享 DeepSeek 结构化服务");
assert.match(problemAdvance, /complete_job_item/, "单图成功必须通过 lease RPC 完成");
assert.match(problemAdvance, /fail_job_item/, "单图失败必须保留错误并等待显式重试");

const syncProblem = runner.match(/async function syncProblemOcrJobState[\s\S]*?export function internalJobLeaseRolloutEnabled/)?.[0] ?? "";
assert.match(syncProblem, /projection\.status === "succeeded"[\s\S]*storage\.from\(PROBLEM_OCR_BUCKET\)\.remove/, "只有全部分块成功后才允许清理源图");
assert.match(syncProblem, /update\.status = "stalled"/, "源图清理失败必须进入 stalled 并保留结果");
assert.match(syncProblem, /update\.result = toJson\(result\)/, "清理失败前必须先生成可恢复结果");

assert.match(service, /Separate distinct problems/, "共享分析 prompt 必须保留多题拆分规则");
assert.match(service, /If an answer is visible[\s\S]*lower confidence/, "答案不可见时必须降低置信度或留空");
assert.match(service, /parseOrRepairAIJson/, "模型 JSON 漂移必须自动修复");
assert.match(service, /ocrFallback/, "空分析必须保留 OCR 低置信度兜底");

assert.match(jobCenter, /capabilityResponse[\s\S]*uploadProblemOcrAssets/, "必须先检查能力再上传私有源图");
assert.match(jobCenter, /临时源图已保留/, "登记结果不确定时不得误删可能正在使用的源图");
assert.match(jobCenter, /重试临时源图清理/, "stalled 清理必须有显式重试入口");
assert.match(ledger, /"cleanupError"/, "任务摘要必须恢复源图清理错误");
assert.doesNotMatch(
  ledger.match(/const allowedKeys = \[[\s\S]*?\];/)?.[0] ?? "",
  /assets|chapterContext/,
  "任务列表不得批量返回私有源图路径或章节上下文",
);
assert.match(scanHook, /await createProblemOcrJob\(/, "题库扫描必须优先创建持久任务");
assert.match(scanHook, /createLocalProblemOcrJob/, "schema 或 flag 未就绪时必须保留页面内回退");
assert.match(scanHook, /extractProblemOcrJobResult/, "恢复结果必须通过结构校验");
assert.match(scanHook, /loadJobResult/, "成功任务必须可跨页读取结果");
assert.match(uploader, /关闭弹窗、刷新或切换页面都不会丢失任务/, "界面必须明确说明持久任务可离页恢复");
assert.match(runner, /registrationComplete/, "登记中断必须保留可幂等补齐的状态");
assert.match(runner, /源图仍保留，正在幂等补齐登记失败的分块/, "登记失败的显式重试必须复用保留源图");

for (const mime of ["image/jpeg", "image/png", "image/webp"]) {
  assert.ok(verification.includes(`'${mime}'`), `只读后验缺少 ${mime} bucket 配置检查`);
}
assert.match(envExample, /WP3_INTERNAL_JOB_LEASE_ENABLED=false/, "WP3 rollout flag 必须默认关闭");
assert.match(packageJson.scripts["verify:predeploy"] ?? "", /verify:wp3-problem-ocr-assets/, "predeploy 必须接入题库 OCR 资产检查");

console.log("WP3 persistent problem OCR assets verified: private source, one-item lease, retry, recovery, cleanup");
