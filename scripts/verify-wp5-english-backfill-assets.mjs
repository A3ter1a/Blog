#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

function read(relativePath) {
  const path = join(root, relativePath);
  if (!existsSync(path)) throw new Error(`缺少 WP5 资产：${relativePath}`);
  return readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const migration = read("supabase/migrations/0016_english_training_core_backfill.sql");
const commandMigration = read("supabase/migrations/0017_english_training_command_rpc.sql");
const subjectiveMigration = read("supabase/migrations/0018_english_subjective_grade_rpc.sql");
const planner = read("scripts/plan-english-training-backfill.mjs");
const rehearsal = read("scripts/test-wp5-local-english-backfill.ps1");
const contract = read("lib/english-backfill-contract.ts");
const serverCore = read("lib/server-english-training-core.ts");
const attemptRoute = read("app/api/english/attempt/route.ts");
const subjectiveRoute = read("app/api/english/subjective/route.ts");
const subjectiveAiRoute = read("app/api/ai/english-subjective-grade/route.ts");
const packageJson = JSON.parse(read("package.json"));

assert(/create or replace function private\.normalize_english_objective_answer/i.test(migration), "0016 缺少统一客观答案规范化函数");
assert(/insert into public\.attempts/i.test(migration), "0016 未写入共享 attempts");
assert(/insert into public\.attempt_revisions/i.test(migration), "0016 未写入追加式 revisions");
assert(/'legacy_imported'/i.test(migration) && /'system_scored'/i.test(migration), "0016 必须同时保留 legacy 分并追加 system score");
assert(/target attempt UUID already has different immutable input/i.test(migration), "0016 缺少目标 attempt 冲突门");
assert(/existing legacy grade differs/i.test(migration) && /existing system grade differs/i.test(migration), "0016 缺少已有 grade 漂移门");
assert(/not exists \([\s\S]*existing\.origin = 'legacy_imported'/i.test(migration), "0016 legacy grade 重跑不幂等");
assert(/not exists \([\s\S]*existing\.origin = 'system_scored'/i.test(migration), "0016 system grade 重跑不幂等");
assert(/from revision_plan plan[\s\S]{0,220}where not exists \([\s\S]{0,180}public\.attempt_revisions existing/i.test(migration), "0016 revision 重跑会在 ON CONFLICT 前触发追加序号门");
assert(/English backfill postcondition failed/i.test(migration), "0016 缺少迁移后行数对账");
assert(!/\b(?:delete\s+from|truncate\s+table|drop\s+table)\b/i.test(migration), "0016 不得删除任何表或数据");
assert(!/update\s+public\.(?:english_attempts|english_attempt_answers|english_passages|english_questions)\b/i.test(migration), "0016 不得修改 legacy English 真源");
assert(!/on\s+conflict[\s\S]{0,120}do\s+update/i.test(migration), "0016 不得用 upsert 覆盖历史事件");

assert(/record_english_training_command/i.test(commandMigration), "0017 缺少英语原子命令 RPC");
assert(/security definer\s+set search_path = ''/i.test(commandMigration), "0017 security definer 必须固定空 search_path");
assert(/v_user_id uuid := auth\.uid\(\)/i.test(commandMigration), "0017 必须从 JWT 派生 owner，不能接受外部 user_id");
assert(/pg_advisory_xact_lock/i.test(commandMigration), "0017 缺少用户+题组级事务锁");
assert(/where revision\.id = p_command_id/i.test(commandMigration), "0017 缺少提交命令幂等门");
assert(/p_write_legacy boolean/i.test(commandMigration), "0017 缺少显式 legacy 投影开关");
assert(/English training is limited to three rounds/i.test(commandMigration), "0017 缺少数据库三轮上限");
assert(/Legacy projection regressed|order by candidate\.round desc/i.test(commandMigration), "0017 legacy 投影必须选择最高已完成轮次");
assert(!/\b(?:delete\s+from|truncate\s+table|drop\s+table)\b/i.test(commandMigration), "0017 不得删除任何表或数据");
assert(/revoke all on function public\.record_english_training_command/i.test(commandMigration), "0017 缺少 RPC 默认权限撤销");
assert(/grant execute on function public\.record_english_training_command[\s\S]*to authenticated/i.test(commandMigration), "0017 必须只向 authenticated 开放执行");

assert(/if \(!configured\) return "legacy"/i.test(serverCore), "共享训练核开关必须默认 legacy");
assert(/ENGLISH_TRAINING_CORE_MODE/i.test(serverCore) && !/NEXT_PUBLIC_ENGLISH_TRAINING_CORE_MODE/i.test(serverCore), "共享训练核开关必须只存在服务端");
assert(/requireAdminRequest\(req\)/i.test(attemptRoute), "英语共享写入 Route 必须先验证管理员");
assert(/runEnglishTrainingCoreCommand/i.test(attemptRoute), "英语 Route 未接入原子命令");
assert(/record_english_subjective_submission/i.test(subjectiveMigration), "0018 缺少主观题建议 submission RPC");
assert(/confirm_english_subjective_grade/i.test(subjectiveMigration), "0018 缺少 user_final 确认 RPC");
assert(/Previous round requires a formal grade before the next round can start/i.test(subjectiveMigration), "0018 缺少 AI 建议不得开启下一轮的数据库门");
assert(/grade\.origin in \('system_scored', 'user_final', 'legacy_imported'\)/i.test(subjectiveMigration), "0018 把 ai_suggested 错当正式分");
assert((subjectiveMigration.match(/security definer\s+set search_path = ''/gi) ?? []).length >= 2, "0018 两个 public RPC 都必须固定空 search_path");
assert(!/\b(?:delete\s+from|truncate\s+table|drop\s+table)\b/i.test(subjectiveMigration), "0018 不得删除历史数据");
assert(/getAdminRequestContext\(req\)/i.test(subjectiveRoute) && /getAdminRequestContext\(req\)/i.test(subjectiveAiRoute), "主观题 Route 必须先验证管理员");
assert(/mode === "legacy"/i.test(subjectiveRoute), "主观题持久化必须在 legacy 模式拒绝伪同步");

assert(/rawAnswersIncludedInEvidence:\s*false/i.test(planner), "dry-run 证据必须排除原始答案");
assert(/userIdsIncludedInEvidence:\s*false/i.test(planner), "dry-run 证据必须排除 user_id");
assert(/sourceIdsIncludedInEvidence:\s*false/i.test(planner), "dry-run 证据必须排除源 UUID");
assert(/writesPerformed:\s*0/i.test(planner), "dry-run 必须声明零写入");
assert(/planEnglishTrainingBackfill/i.test(contract), "缺少可测试 backfill 领域契约");

assert(/127\.0\.0\.1/i.test(rehearsal), "本地演练必须只监听 loopback");
assert(/externalConnections\s*=\s*0/i.test(rehearsal), "本地演练证据必须声明外部连接为 0");
assert(/0016-rollback\.sql/i.test(rehearsal) && /rollback;/i.test(rehearsal), "本地演练缺少事务回滚验证");
assert(/幂等重跑 0016/i.test(rehearsal), "本地演练缺少第二次幂等执行");
assert(/legacy\/shared 双读对账/i.test(rehearsal) && /dualReadMismatchCount/i.test(rehearsal), "本地演练缺少 legacy/shared 精确双读对账");
assert(/事务回滚预演 0017 英语命令/i.test(rehearsal), "本地演练缺少 0017 事务回滚");
assert(/set local role authenticated/i.test(rehearsal) && /authenticatedRpcVerified\s*=\s*\$true/i.test(rehearsal), "本地演练缺少 authenticated 真实 RPC 执行");
assert(/rpcPermissionBoundaryVerified\s*=\s*\$true/i.test(rehearsal), "本地演练缺少 RPC owner/search_path/execute 权限边界核验");
assert(/commandIdempotencyVerified\s*=\s*\$true/i.test(rehearsal), "本地演练缺少 0017 命令幂等证据");
assert(/legacyProjectionMatchesLatestRound\s*=\s*\$true/i.test(rehearsal), "本地演练缺少最高完成轮次投影证据");
assert(/threeRoundLimitVerified\s*=\s*\$true/i.test(rehearsal), "本地演练缺少三轮上限证据");
assert(/subjectiveNextRoundRequiresFinal\s*=\s*\$true/i.test(rehearsal), "本地演练缺少 AI 建议不得开启下一轮证据");
assert(/subjectiveFinalRevisionVerified\s*=\s*\$true/i.test(rehearsal), "本地演练缺少 user_final 可修订证据");
assert(!/(?:kysywitrsjhcdlcrfayl|qyjfcebqjtphlpsvizxo|supabase\.co)/i.test(rehearsal), "本地演练不得包含 shadow/生产目标");

assert(packageJson.scripts["plan:english-backfill"], "package.json 缺少 plan:english-backfill");
assert(packageJson.scripts["verify:wp5-backfill-assets"], "package.json 缺少 verify:wp5-backfill-assets");
assert(packageJson.scripts["verify:wp5-backfill-local"], "package.json 缺少 verify:wp5-backfill-local");
assert(packageJson.scripts["verify:predeploy"].includes("verify:wp5-backfill-assets"), "verify:predeploy 未接入 WP5 静态门");

console.log("WP5 English backfill and atomic command assets verified");
