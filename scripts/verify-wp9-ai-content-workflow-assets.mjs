import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const files = [
  "lib/ai-content-contract.ts",
  "lib/server-ai-auth.ts",
  "lib/server-ai-content.ts",
  "supabase/migrations/0029_ai_content_submission_rpc.sql",
  "hooks/useAiContentWorkspace.ts",
  "components/ai-content/AiContentWorkspace.tsx",
  "app/tools/ai-content/page.tsx",
  "app/api/ai/content-proposals/route.ts",
  "app/api/ai/content-proposals/[id]/route.ts",
  "app/api/ai/content-proposals/[id]/self-check/route.ts",
  "app/api/ai/content-proposals/[id]/submit/route.ts",
  "docs/ai-content-workflow.md",
];

for (const relativePath of files) {
  const path = resolve(relativePath);
  if (!existsSync(path)) throw new Error(`缺少阶段 3 资产：${relativePath}`);
}

const contract = readFileSync(resolve("lib/ai-content-contract.ts"), "utf8");
const auth = readFileSync(resolve("lib/server-ai-auth.ts"), "utf8");
const service = readFileSync(resolve("lib/server-ai-content.ts"), "utf8");
const submissionMigration = readFileSync(resolve("supabase/migrations/0029_ai_content_submission_rpc.sql"), "utf8");
const api = readFileSync(resolve("app/api/ai/content-proposals/route.ts"), "utf8");
const patchRoute = readFileSync(resolve("app/api/ai/content-proposals/[id]/route.ts"), "utf8");
const submitRoute = readFileSync(resolve("app/api/ai/content-proposals/[id]/submit/route.ts"), "utf8");
const workspace = readFileSync(resolve("components/ai-content/AiContentWorkspace.tsx"), "utf8");
const docs = readFileSync(resolve("docs/ai-content-workflow.md"), "utf8");

for (const marker of [
  "AI_CONTENT_SELF_CHECK_VERSION",
  "unbalanced_code_fence",
  "heading_level_jump",
  "normalizeMarkdownSource",
  "validateAiContentInput",
]) {
  if (!contract.includes(marker)) throw new Error(`阶段 3 自检规范缺少：${marker}`);
}

for (const marker of [
  "getAiRequestContext",
  "ai_profiles",
  "is_active",
  "当前账号不是已启用的 AI 学科账号",
]) {
  if (!auth.includes(marker)) throw new Error(`阶段 3 AI 鉴权缺少：${marker}`);
}

for (const marker of [
  "createAiContentProposal",
  "updateAiContentProposal",
  "rerunAiContentSelfCheck",
  "submitAiContentProposal",
  "review_status: selfCheck.passed ? \"self_checked\" : \"draft\"",
  "source_checksum",
  "submit_ai_content_proposal",
]) {
  if (!service.includes(marker)) throw new Error(`阶段 3 提案服务缺少：${marker}`);
}

for (const marker of [
  "create or replace function public.submit_ai_content_proposal",
  "v_proposal.review_status <> 'self_checked'",
  "set review_status = 'pending_review'",
  "grant execute on function public.submit_ai_content_proposal(uuid) to authenticated",
]) {
  if (!submissionMigration.includes(marker)) throw new Error(`阶段 3 提交审核 RPC 缺少：${marker}`);
}

for (const route of [api, patchRoute, submitRoute]) {
  if (!route.includes("getAiRequestContext(req)")) throw new Error("阶段 3 提案接口未经过 AI 账号鉴权");
  if (route.includes("getAdminRequestContext(req)")) throw new Error("阶段 3 提案接口不应复用管理员鉴权");
}

for (const marker of ["/api/ai/content-proposals", "保存并自检", "保存并提交审核", "ContentPreview"]) {
  if (!workspace.includes(marker)) throw new Error(`阶段 3 工作台缺少：${marker}`);
}

for (const marker of [
  "只接收已经由 Codex Skill 处理完成的 Markdown",
  "self_checked",
  "pending_review",
  "AI 账号不能批准或发布",
]) {
  if (!docs.includes(marker)) throw new Error(`阶段 3 文档缺少：${marker}`);
}

console.log(JSON.stringify({
  status: "passed",
  routes: 4,
  productionWrites: false,
  sourceMaterialIngestion: false,
  selfCheck: "ai-content-self-check-v1",
}, null, 2));
