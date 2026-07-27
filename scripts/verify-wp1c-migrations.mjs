import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationNames = [
  "0008_note_version_and_chapter_scope.sql",
  "0009_planning_task_status.sql",
  "0010_training_event_core.sql",
  "0011_jobs_and_source_versions.sql",
  "0012_private_note_default.sql",
];

const migrations = new Map(migrationNames.map((name) => [
  name,
  readFileSync(resolve("supabase/migrations", name), "utf8"),
]));
const productionPreflight = readFileSync(resolve("supabase/wp1c-production-preflight.sql"), "utf8");
const productionGate = readFileSync(resolve("supabase/wp1c-production-gate.sql"), "utf8");
const shadowPostflight = readFileSync(resolve("supabase/wp1c-shadow-postflight.sql"), "utf8");
const productionRunner = readFileSync(resolve("scripts/run-wp1-production-stage.ps1"), "utf8");
const productionGateRehearsal = readFileSync(resolve("scripts/test-wp1-production-gate-local.ps1"), "utf8");
const boundaryAlignment = readFileSync(resolve("supabase/migrations/0013_boundary_policy_alignment.sql"), "utf8");

function stripCommentsAndFunctionBodies(sql) {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, "$$BODY$$");
}

for (const [name, sql] of migrations) {
  const executable = stripCommentsAndFunctionBodies(sql);
  assert.match(sql, /^begin;/m, `${name} 必须以事务开始`);
  assert.match(sql, /^commit;/m, `${name} 必须提交事务`);
  assert.doesNotMatch(executable, /^\s*(delete\s+from|truncate\s|drop\s+table|alter\s+table[\s\S]*?drop\s+column)/im, `${name} 含破坏性结构或数据操作`);
  assert.doesNotMatch(executable, /^\s*update\s+/im, `${name} 不得在迁移阶段直接更新存量数据`);
}

const combined = [...migrations.values()].join("\n");
for (const expected of [
  "content_version",
  "planning_task_status",
  "public.attempts",
  "public.attempt_revisions",
  "public.grades",
  "public.jobs",
  "public.job_items",
  "public.source_documents",
  "public.source_versions",
  "force row level security",
]) {
  assert.equal(combined.includes(expected), true, `缺少 WP1-C 资产：${expected}`);
}

for (const postponed of [
  "create table public.math_papers",
  "create table public.ocr_confirmations",
  "create table public.booklets",
  "create table public.rag_chunks",
  "create table public.memory_candidates",
  "create table public.content_migration_snapshots",
]) {
  assert.equal(combined.toLowerCase().includes(postponed), false, `过早创建延期对象：${postponed}`);
}

const privateDefault = migrations.get("0012_private_note_default.sql");
assert.match(privateDefault, /alter column is_published set default false/i);
assert.doesNotMatch(privateDefault, /update\s+public\.notes/i);

const training = migrations.get("0010_training_event_core.sql");
assert.match(training, /source_kind in \('english_passage', 'note_problem'\)/);
assert.doesNotMatch(training, /math_paper_id/);
assert.match(training, /reject_attempt_revision_mutation/);
assert.match(training, /reject_grade_mutation/);
assert.match(training, /enforce_attempt_revision_append/);
assert.match(training, /enforce_grade_append/);
assert.match(training, /note_problem attempt must capture the current note content_version/);
assert.doesNotMatch(training, /user_id uuid not null references auth\.users\(id\) on delete cascade/);

const sources = migrations.get("0011_jobs_and_source_versions.sql");
assert.match(sources, /foreign key \(id, current_version_id\)/);
assert.match(sources, /unique \(source_document_id, id\)/);
assert.match(sources, /reject_source_version_mutation/);
assert.match(sources, /enforce_source_version_append/);
assert.match(sources, /unique \(source_document_id, checksum\)/);
assert.doesNotMatch(sources, /user_id uuid(?: not null)? references auth\.users\(id\) on delete cascade/);

const preflightExecutable = stripCommentsAndFunctionBodies(productionPreflight);
assert.doesNotMatch(
  preflightExecutable,
  /^\s*(insert|update|delete|alter|create|drop|grant|revoke|truncate)\b/im,
  "WP1-C production preflight 必须保持只读",
);
assert.match(productionPreflight, /invalid_chapter_scope_rows/);
assert.match(productionPreflight, /published_note_ids_md5/);

const productionGateExecutable = stripCommentsAndFunctionBodies(productionGate);
assert.match(productionGate, /begin transaction read only;/i);
assert.match(productionGate, /rollback;/i);
assert.match(productionGate, /data_type = 'boolean'[\s\S]*is_nullable = 'NO'[\s\S]*false::boolean/);
assert.match(productionGate, /policies\.roles @> expected\.policy_roles[\s\S]*policies\.roles <@ expected\.policy_roles/);
assert.doesNotMatch(
  productionGateExecutable,
  /^\s*(insert|update|delete|alter|create|drop|grant|revoke|truncate|call|execute|do)\b/im,
  "WP1 production gate 必须保持只读",
);
for (const expected of [
  "publishedNoteIdsMd5",
  "notesAtVersionOne",
  "notesInvalidContentVersions",
  "notesStableChecksum",
  "chaptersChecksum",
  "englishAttemptsChecksum",
  "englishAttemptAnswersChecksum",
  "adminUsersChecksum",
  "invalidChapterScopeRows",
  "unmatchedAdminUsers",
  "contentVersionReady",
  "notesVersionTriggerReady",
  "chapterScopeTriggerReady",
  "planningReady",
  "planningTableReady",
  "planningColumnsReady",
  "planningConstraintsReady",
  "planningRlsReady",
  "planningTriggerReady",
  "planningPoliciesReady",
  "planningPermissionsReady",
  "trainingCoreReady",
  "trainingTablesReady",
  "trainingColumnsReady",
  "trainingConstraintsReady",
  "trainingIndexesReady",
  "trainingRlsReady",
  "trainingTriggersReady",
  "trainingPoliciesReady",
  "trainingFunctionsReady",
  "trainingPermissionsReady",
  "jobsAndSourcesReady",
  "jobsSourceTablesReady",
  "jobsSourceColumnsReady",
  "jobsSourceConstraintsReady",
  "jobsSourceIndexesReady",
  "jobsSourceRlsReady",
  "jobsSourceTriggersReady",
  "jobsSourcePoliciesReady",
  "jobsSourceFunctionsReady",
  "jobsSourcePermissionsReady",
  "privateNoteDefaultReady",
  "boundaryAlignmentReady",
  "boundaryRlsReady",
  "boundaryPoliciesReady",
  "boundaryPolicyActualCount",
  "boundaryPolicyMatchedCount",
  "boundaryMissingPolicies",
  "boundaryUnexpectedPolicies",
  "boundaryExpressionsReady",
  "boundaryLegacyPoliciesGone",
  "boundaryGrantsReady",
]) {
  assert.equal(productionGate.includes(expected), true, `production gate 缺少 ${expected}`);
}

assert.match(productionRunner, /ProductionProjectRef = 'kysywitrsjhcdlcrfayl'/);
assert.match(productionRunner, /ShadowProjectRef = 'qyjfcebqjtphlpsvizxo'/);
assert.match(productionRunner, /ValidateSet\('preflight', '0008', '0009', '0010', '0011', '0012', '0013'\)/);
assert.match(productionRunner, /ConfirmProductionWrite/);
assert.match(productionRunner, /WRITE \$ProductionProjectRef \$Stage/);
assert.match(productionRunner, /MaxBackupAgeHours/);
assert.match(productionRunner, /verify-wp1b-backup\.mjs/);
assert.match(productionRunner, /productionStableDuringBackup/);
assert.match(productionRunner, /wp1c-production-gate\.sql/);
assert.match(productionRunner, /未处于数据库原生 READ ONLY 事务/);
assert.match(productionRunner, /Assert-StagePrecondition/);
assert.match(productionRunner, /Assert-BaselineStable/);
assert.match(productionRunner, /postCommitGatePassed/);
assert.match(productionRunner, /PostCommitFailureEvidence/);
assert.match(productionRunner, /Stop here and review evidence before authorizing the next stage/);
assert.match(productionRunner, /default_transaction_read_only=on/);
assert.doesNotMatch(productionRunner, /000[1-7]_[a-z]/i, "生产执行器绝不能包含 0001–0007");
assert.match(productionGateRehearsal, /127\.0\.0\.1/);
assert.match(productionGateRehearsal, /wp1c-production-gate\.sql/);
assert.match(productionGateRehearsal, /preMigrationFlagsFalse/);
assert.match(productionGateRehearsal, /externalConnections = 0/);
assert.doesNotMatch(
  productionGateRehearsal,
  /kysywitrsjhcdlcrfayl|qyjfcebqjtphlpsvizxo|supabase\.co/i,
  "WP1 production gate 本地演练不得包含 shadow/生产目标",
);

for (const legacyPolicy of [
  "admin_read_admin_users",
  "public_read_site_profile",
  "admin_insert_site_profile",
  "admin_update_site_profile",
  "admin_delete_site_profile",
  "admin_read_problem_practice_statuses",
  "admin_insert_problem_practice_statuses",
  "admin_update_problem_practice_statuses",
  "admin_delete_problem_practice_statuses",
]) {
  assert.match(
    boundaryAlignment,
    new RegExp(`drop policy if exists ${legacyPolicy}`, "i"),
    `0013 必须清理生产遗留策略：${legacyPolicy}`,
  );
}
for (const authenticatedSelect of [
  "english_papers_authenticated_select",
  "english_passages_authenticated_select",
  "english_questions_authenticated_select",
]) {
  assert.match(
    boundaryAlignment,
    new RegExp(`drop policy if exists ${authenticatedSelect}`, "i"),
    `0013 重放前必须先清理：${authenticatedSelect}`,
  );
}

const postflightExecutable = stripCommentsAndFunctionBodies(shadowPostflight);
assert.doesNotMatch(
  postflightExecutable,
  /^\s*(insert|update|delete|alter|create|drop|grant|revoke|truncate)\b/im,
  "WP1-C shadow postflight 必须保持只读",
);
assert.match(shadowPostflight, /to_jsonb\(t\) - 'content_version'/);
assert.match(shadowPostflight, /anonOrPublicGrantCount/);

const typegenScript = readFileSync(resolve("scripts/generate-wp1c-shadow-types.ps1"), "utf8");
assert.match(typegenScript, /SupabaseCliVersion = '2\.109\.1'/);
assert.match(typegenScript, /PostgresMetaVersion = '0\.96\.6'/);
assert.match(typegenScript, /ShadowProjectRef = 'qyjfcebqjtphlpsvizxo'/);
assert.match(typegenScript, /ProductionProjectRef = 'kysywitrsjhcdlcrfayl'/);
assert.match(typegenScript, /DeterministicTypeGeneration=passed/);
assert.match(typegenScript, /--registry=https:\/\/registry\.npmjs\.org/);
assert.match(typegenScript, /PG_META_GENERATE_TYPES_INCLUDED_SCHEMAS'\] = 'public'/);

const policyAlignmentRunner = readFileSync(resolve("scripts/run-wp1e-shadow-policy-alignment.ps1"), "utf8");
assert.match(policyAlignmentRunner, /ShadowProjectRef = 'qyjfcebqjtphlpsvizxo'/);
assert.match(policyAlignmentRunner, /ProductionProjectRef = 'kysywitrsjhcdlcrfayl'/);
assert.match(policyAlignmentRunner, /ConfirmShadowWrite/);
assert.match(policyAlignmentRunner, /0013 事务预演/);
assert.match(policyAlignmentRunner, /FinalChecks=/);
assert.match(policyAlignmentRunner, /run-wp1c-shadow-postflight\.ps1/);

console.log(`WP1-C migration assets verified: ${migrationNames.length}/${migrationNames.length}`);
