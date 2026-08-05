import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const files = [
  "supabase/migrations/0024_ai_content_review_comments.sql",
  "lib/server-ai-content-review.ts",
  "lib/ai-review-contract.ts",
  "app/api/ai/content-review/route.ts",
  "app/api/ai/content-review/[id]/route.ts",
  "app/api/ai/content-review/[id]/comments/[commentId]/route.ts",
  "components/ai-content/AiContentReviewWorkspace.tsx",
  "app/tools/ai-review/page.tsx",
  "scripts/test-wp8-local-ai-content.ps1",
];

for (const relativePath of files) {
  if (!existsSync(resolve(relativePath))) throw new Error(`缺少阶段 4 资产：${relativePath}`);
}

const migration = readFileSync(resolve(files[0]), "utf8").toLowerCase();
const service = readFileSync(resolve(files[1]), "utf8");
const contract = readFileSync(resolve(files[2]), "utf8");
const collectionRoute = readFileSync(resolve(files[3]), "utf8");
const detailRoute = readFileSync(resolve(files[4]), "utf8");
const commentRoute = readFileSync(resolve(files[5]), "utf8");
const workspace = readFileSync(resolve(files[6]), "utf8");
const rehearsal = readFileSync(resolve(files[8]), "utf8");

for (const marker of [
  "validateReviewSelection",
  "currentContentVersion",
]) {
  if (!contract.toLowerCase().includes(marker.toLowerCase())) throw new Error(`批注契约缺少：${marker}`);
}

for (const marker of [
  "create table if not exists public.ai_content_proposal_comments",
  "proposal_content_version",
  "selection_start",
  "selection_end",
  "utf-16",
  "alter table public.ai_content_proposal_comments force row level security",
  "create policy ai_content_comments_owner_select",
  "create policy ai_content_comments_admin_insert",
  "create policy ai_content_comments_admin_update",
  "create policy ai_content_comments_admin_delete",
  "create or replace function public.publish_ai_content_proposal",
  "grant execute on function public.publish_ai_content_proposal(uuid) to authenticated",
]) {
  if (!migration.includes(marker)) throw new Error(`0024 缺少关键标记：${marker}`);
}

for (const marker of [
  "listAiContentReviewProposals",
  "transitionAiContentProposal",
  "createAiContentProposalComment",
  "proposal.content_version",
  "publish_ai_content_proposal",
]) {
  if (!service.includes(marker)) throw new Error(`审核服务缺少：${marker}`);
}

for (const route of [collectionRoute, detailRoute, commentRoute]) {
  if (!route.includes("getAdminRequestContext(req)")) throw new Error("审核接口未经过管理员鉴权");
  if (route.includes("getAiRequestContext(req)")) throw new Error("审核接口不应使用 AI 账号鉴权");
}

for (const marker of ["proposalIds", "publishedIds", "attachAiKnowledgeQuizzesToPublishedNote"]) {
  if (!collectionRoute.includes(marker)) throw new Error(`审核集合接口缺少批量审核/发布：${marker}`);
}

for (const marker of [
  "ANNOTATION SOURCE",
  "onSelect={captureSelection}",
  "proposalContentVersion",
  "旧批注不会自动套用",
  "退回返修",
  "批准并发布",
  "批准选中",
  "发布选中",
  "查看作者资料",
]) {
  if (!workspace.includes(marker)) throw new Error(`审核工作台缺少：${marker}`);
}

for (const marker of [
  "AI 读取自己提案批注",
  "AI 创建审核批注",
  "AI 解决审核批注",
  "AI 调用发布 RPC",
  "transactionalPublicationPassed",
  "externalConnections = 0",
]) {
  if (!rehearsal.includes(marker)) throw new Error(`RLS 演练缺少：${marker}`);
}

console.log(JSON.stringify({
  status: "passed",
  migration: "0024_ai_content_review_comments.sql",
  routes: 4,
  versionAnchoredComments: true,
  transactionalPublication: true,
  productionWrites: false,
}, null, 2));
