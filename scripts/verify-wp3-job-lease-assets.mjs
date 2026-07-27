import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve("supabase/migrations/0014_job_item_lease_rpc.sql"), "utf8");
const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));

function count(pattern) {
  return migration.match(pattern)?.length ?? 0;
}

assert.match(migration, /^begin;/m, "0014 必须以事务开始");
assert.match(migration, /^commit;/m, "0014 必须提交事务");
assert.doesNotMatch(migration, /^\s*(drop\s+table|truncate\s|delete\s+from)\b/im, "0014 不得删除既有数据或表");
assert.doesNotMatch(migration, /kysywitrsjhcdlcrfayl|qyjfcebqjtphlpsvizxo/i, "迁移不得绑定生产或 shadow ref");

for (const signature of [
  /create or replace function public\.enqueue_job_item\(/i,
  /create or replace function public\.claim_next_job_item\(/i,
  /create or replace function public\.complete_job_item\(/i,
  /create or replace function public\.fail_job_item\(/i,
  /create or replace function public\.reset_failed_job_item\(/i,
]) {
  assert.match(migration, signature, `缺少受控 job item RPC：${signature}`);
}

assert.equal(count(/security definer/g), 5, "五个 job item RPC 必须全部使用 SECURITY DEFINER");
assert.equal(count(/set search_path = ''/g), 5, "五个 SECURITY DEFINER RPC 必须固定空 search_path");
assert.equal(count(/caller_user_id uuid := auth\.uid\(\);/g), 5, "五个 RPC 必须显式读取 auth.uid()");
assert.ok(count(/job\.user_id = caller_user_id/g) >= 5, "每个 RPC 必须显式核对 job owner");

const enqueueBody = migration.match(/create or replace function public\.enqueue_job_item[\s\S]*?as \$\$([\s\S]*?)\$\$;/i)?.[1] ?? "";
assert.match(enqueueBody, /parent_job_class <> 'internal'/i, "enqueue 只允许 internal job");
assert.match(enqueueBody, /parent_job_status <> 'queued'/i, "只有 queued job 可以添加新 item");
assert.match(enqueueBody, /values \(p_job_id, p_ordinal, normalized_key, 'pending', normalized_payload\)/i, "enqueue 只能创建干净 pending item");
assert.match(enqueueBody, /on conflict \(job_id, idempotency_key\) do nothing/i, "enqueue 必须具备数据库幂等门");
assert.match(enqueueBody, /queued_item\.ordinal is distinct from p_ordinal[\s\S]*queued_item\.payload is distinct from normalized_payload/i, "幂等重试只比较不可变输入");
assert.doesNotMatch(enqueueBody, /queued_item\.(?:status|attempt_count|claimed_by|lease_expires_at|result|error)/i, "幂等重试不得依赖 item 当前执行状态");

assert.match(migration, /for update of item skip locked/i, "领取必须使用 SKIP LOCKED 原子竞争");
assert.match(migration, /item\.status = 'pending'/i, "领取必须覆盖 pending item");
assert.match(migration, /item\.status = 'leased'[\s\S]*item\.lease_expires_at <= statement_timestamp\(\)/i, "只有过期 lease 可以重领");
assert.match(migration, /p_lease_seconds < 5 or p_lease_seconds > 900/i, "lease TTL 必须有 5–900 秒边界");
assert.match(migration, /attempt_count = item\.attempt_count \+ 1/i, "每次领取必须累计 attempt_count");
assert.match(migration, /lease_expires_at = statement_timestamp\(\) \+ \(p_lease_seconds \* interval '1 second'\)/i, "lease 到期时间必须由数据库计算");
assert.match(migration, /job\.status in \('queued', 'running', 'waiting_for_trigger', 'stalled'\)/i, "领取必须限制父 job 生命周期");

assert.ok(count(/item\.claimed_by = btrim\(p_worker_id\)/g) >= 2, "完成和失败必须核对当前 worker");
assert.ok(count(/item\.attempt_count = p_lease_attempt/g) >= 2, "完成和失败必须校验 lease fencing 代次");
assert.ok(count(/item\.lease_expires_at > statement_timestamp\(\)/g) >= 2, "完成和失败必须拒绝过期 lease");
const resetBody = migration.match(/create or replace function public\.reset_failed_job_item[\s\S]*?as \$\$([\s\S]*?)\$\$;/i)?.[1] ?? "";
assert.match(resetBody, /item\.status = 'failed'/i, "只有 failed item 可以 reset");
assert.match(resetBody, /status = 'pending'/i, "reset 必须回到 pending");
assert.doesNotMatch(resetBody, /attempt_count\s*=/i, "reset 不得抹掉 attempt_count 审计历史");

assert.match(migration, /revoke insert, update on public\.job_items from authenticated/i, "客户端直接 INSERT/UPDATE job_items 必须撤销");
assert.doesNotMatch(migration, /grant\s+(?:insert|update)[^;]*on\s+public\.job_items/i, "0014 不得重新开放直接 INSERT/UPDATE");
assert.equal(count(/revoke all on function public\./g), 5, "五个 RPC 必须清除默认执行权");
assert.equal(count(/grant execute on function public\./g), 5, "五个 RPC 必须只显式授予执行权");
assert.doesNotMatch(migration, /grant execute[^;]*to\s+(?:public|anon)/i, "PUBLIC/anon 不得执行 lease RPC");

assert.match(packageJson.scripts["verify:predeploy"] ?? "", /verify:wp3-lease-assets/, "predeploy 必须接入 WP3 lease 静态检查");

console.log("WP3 atomic job lease assets verified: 5/5 RPCs");
