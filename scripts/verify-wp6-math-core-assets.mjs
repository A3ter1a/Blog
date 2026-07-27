#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

function read(relativePath) {
  const path = join(root, relativePath);
  if (!existsSync(path)) throw new Error(`缺少 WP6 资产：${relativePath}`);
  return readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const migration = read("supabase/migrations/0019_math_training_and_booklet_core.sql");
const rehearsal = read("scripts/test-wp6-local-math-core.ps1");
const serverCore = read("lib/server-math-training-core.ts");
const domainCore = read("lib/math-training-core.ts");
const ocrUi = read("components/tools/MathPaperOcrReview.tsx");
const bookletUi = read("components/tools/ProblemBooklet.tsx");
const bookletContract = read("lib/booklet-contract.ts");
const attemptRoute = read("app/api/math/attempt/route.ts");
const gradeRoute = read("app/api/math/grade/route.ts");
const aiGradeRoute = read("app/api/ai/math-paper-grade/route.ts");
const bookletRoute = read("app/api/booklets/route.ts");
const shadowRunner = read("scripts/run-wp6-shadow-stage.ps1");
const shadowTypegen = read("scripts/generate-wp6-shadow-types.ps1");
read("scripts/test-wp6-shadow-stage-local.ps1");
const packageJson = JSON.parse(read("package.json"));

assert(/create table public\.math_papers/i.test(migration), "0019 缺少固定数学真题表");
assert(/create table public\.math_paper_problems/i.test(migration), "0019 缺少数学真题题目与评分细则表");
assert(/source_kind in \('english_passage', 'note_problem', 'math_paper'\)/i.test(migration), "0019 未把 math_paper 接入共享 attempts");
assert(/and candidate\.math_paper_id is not distinct from new\.math_paper_id/i.test(migration), "共享三轮生命周期未按 math_paper 隔离");
assert(/create table public\.ocr_confirmations/i.test(migration), "0019 缺少 OCR confirmation 追加账本");
assert(/confirmation_version must be the next value/i.test(migration), "OCR confirmation 缺少单调版本门");
assert(/Math grade must bind the latest OCR confirmation/i.test(migration), "数据库未拒绝旧 confirmation 评分");
assert(/Previous round requires a formal grade[\s\S]*grade\.origin = 'user_final'[\s\S]*confirmation\.confirmation_version/i.test(migration), "下一轮未要求最新 confirmation 的 user_final");
assert(/create table public\.math_grade_steps/i.test(migration), "0019 缺少可读逐步扣分表");
assert(/Math grade steps must cover every problem and its full rubric score/i.test(migration), "逐步评分未覆盖整张固定试卷");
assert(/create table public\.booklets/i.test(migration), "0019 缺少做题本元数据表");
assert(/insert into public\.notes[\s\S]*insert into public\.booklets/i.test(migration), "做题本笔记与元数据未在同一 RPC 原子创建");
assert(/method_summary_confirmed/i.test(migration), "做题本缺少方法总结人工确认门");
assert(/refresh_booklet_drift/i.test(migration), "做题本缺少源题漂移刷新命令");
assert(/security definer\s+set search_path = ''/i.test(migration), "WP6 public RPC 未固定空 search_path");
assert(/v_user_id uuid := auth\.uid\(\)/i.test(migration), "WP6 RPC 未从 JWT 派生 owner");
assert(!/\b(?:delete\s+from|truncate\s+table|drop\s+table)\b/i.test(migration), "0019 不得删除表或数据");

assert(/127\.0\.0\.1/i.test(rehearsal), "WP6 本地演练必须只监听 loopback");
assert(/transactionRollbackVerified = \$true/i.test(rehearsal), "WP6 本地演练缺少事务回滚证据");
assert(/staleConfirmationGradeRejected = \$true/i.test(rehearsal), "WP6 本地演练缺少旧确认拒评分证据");
assert(/latestConfirmationFinalRequiredForNextRound = \$true/i.test(rehearsal), "WP6 本地演练缺少最新终分三轮门证据");
assert(/bookletDriftDetectedWithoutSnapshotRewrite = \$true/i.test(rehearsal), "WP6 本地演练缺少漂移不改写快照证据");
assert(/fixtureOnly = \$true/i.test(rehearsal) && /realMathPaperImported = \$false/i.test(rehearsal), "夹具演练必须明确不冒充真实真题导入");
assert(/externalConnections = 0/i.test(rehearsal), "WP6 本地演练必须声明零外连");
assert(!/(?:kysywitrsjhcdlcrfayl|qyjfcebqjtphlpsvizxo|supabase\.co)/i.test(rehearsal), "WP6 本地演练不得包含 shadow/生产目标");

assert(/if \(!configured\) return "local"/i.test(serverCore), "数学共享训练核开关必须默认 local");
assert(/MATH_TRAINING_CORE_MODE/i.test(serverCore) && !/NEXT_PUBLIC_MATH_TRAINING_CORE_MODE/i.test(serverCore), "数学训练核开关必须只存在服务端");
assert(/buildMathOcrConfirmationPayload/i.test(domainCore), "缺少整套 OCR 确认载荷契约");
assert(/normalizeMathGradeSuggestion/i.test(domainCore), "缺少逐题满分覆盖的建议分归一化");
assert(/getAdminRequestContext\(req\)/i.test(attemptRoute) && /getAdminRequestContext\(req\)/i.test(gradeRoute), "数学写入 Route 必须先验证管理员");
assert(/getMathGradeSource/i.test(aiGradeRoute) && !/standardAnswer.*body\./i.test(aiGradeRoute), "AI 数学评分必须从数据库快照读取答案而非信任客户端");
assert(/confirm_ocr/i.test(ocrUi) && /confirmationId/i.test(ocrUi), "数学 OCR UI 未接入数据库确认 ID");
assert(/createBatchGradeJob/i.test(ocrUi), "数学整套评分未进入悬浮任务中心");
assert(/逐步核对并确认最终分/i.test(ocrUi), "数学 UI 缺少建议分到用户终分的逐步确认区");
assert(/BookletNoteReviewDialog/i.test(bookletUi) && /我已对照本题内容/i.test(bookletUi), "做题本缺少逐题方法总结预览确认");
assert(/calculateBookletMarkdownSnapshotSha256/i.test(bookletUi), "做题本保存前未计算不可变快照 SHA-256");
assert(/calculateBookletProblemSha256/i.test(bookletContract), "做题本来源未使用稳定 SHA-256");
assert(/getAdminRequestContext\(req\)/i.test(bookletRoute), "做题本原子创建 Route 必须先验证管理员");
assert(/PREVIEW \$ShadowProjectRef WP6 0019 ROLLBACK/i.test(shadowRunner), "WP6 Shadow runner 缺少事务回滚预演门");
assert(/default_transaction_read_only=on/i.test(shadowRunner), "WP6 Shadow preflight/postflight 未强制只读");
assert(/targetSecurityDefinerCount/i.test(shadowRunner) && /targetForceRlsCount/i.test(shadowRunner), "WP6 Shadow runner 缺少 RPC/RLS 后验");
assert(/READ \$ShadowProjectRef WP6 TYPES/i.test(shadowTypegen), "WP6 类型生成缺少精确 fixed Shadow 读取门");

assert(packageJson.scripts["verify:wp6-core-assets"], "package.json 缺少 verify:wp6-core-assets");
assert(packageJson.scripts["verify:wp6-core-local"], "package.json 缺少 verify:wp6-core-local");
assert(packageJson.scripts["verify:wp6-shadow-stage-local"], "package.json 缺少 verify:wp6-shadow-stage-local");
assert(packageJson.scripts["verify:predeploy"].includes("verify:wp6-core-assets"), "verify:predeploy 未接入 WP6 静态门");
assert(packageJson.scripts["verify:predeploy"].includes("verify:wp6-shadow-stage-local"), "verify:predeploy 未接入 WP6 Shadow 安全门");

console.log("WP6 math confirmation, grading, and booklet assets verified");
