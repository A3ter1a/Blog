#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

function readRequired(relativePath) {
  const fullPath = join(rootDir, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`缺少文件: ${relativePath}`);
  }
  return readFileSync(fullPath, "utf8");
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function fail(message, risk) {
  console.log(`FAIL ${message}`);
  if (risk) console.log(`     风险: ${risk}`);
  failed += 1;
}

function check(message, condition, risk) {
  if (condition) {
    pass(message);
  } else {
    fail(message, risk);
  }
}

let failed = 0;

const schemaSql = readRequired("supabase/migrations/0001_base_schema.sql");
const rlsSql = readRequired("supabase/migrations/0002_rls_policies.sql");
const practiceMarkedSql = readRequired("supabase/migrations/0003_problem_practice_marked.sql");
const englishTrainingSql = readRequired("supabase/migrations/0004_english_training.sql");
const englishVocabularyContextSql = readRequired("supabase/migrations/0005_english_vocabulary_context.sql");
const englishVocabularySourceSql = readRequired("supabase/migrations/0006_english_vocabulary_source_scope.sql");
const documentOcrStorageSql = readRequired("supabase/migrations/0007_document_ocr_storage.sql");
const noteVersionSql = readRequired("supabase/migrations/0008_note_version_and_chapter_scope.sql");
const planningStatusSql = readRequired("supabase/migrations/0009_planning_task_status.sql");
const trainingCoreSql = readRequired("supabase/migrations/0010_training_event_core.sql");
const jobsAndSourcesSql = readRequired("supabase/migrations/0011_jobs_and_source_versions.sql");
const privateNoteDefaultSql = readRequired("supabase/migrations/0012_private_note_default.sql");
const boundaryPolicySql = readRequired("supabase/migrations/0013_boundary_policy_alignment.sql");
const jobLeaseSql = readRequired("supabase/migrations/0014_job_item_lease_rpc.sql");
const contentMigrationSql = readRequired("supabase/migrations/0015_content_migration_snapshots.sql");
const englishBackfillSql = readRequired("supabase/migrations/0016_english_training_core_backfill.sql");
const englishCommandSql = readRequired("supabase/migrations/0017_english_training_command_rpc.sql");
const englishSubjectiveSql = readRequired("supabase/migrations/0018_english_subjective_grade_rpc.sql");
const mathCoreSql = readRequired("supabase/migrations/0019_math_training_and_booklet_core.sql");
const problemOcrAssetsSql = readRequired("supabase/migrations/0020_problem_ocr_job_assets.sql");
const privateRagSql = readRequired("supabase/migrations/0021_private_note_rag_and_memory.sql");
const privateRagOperatorFixSql = readRequired("supabase/migrations/0022_private_note_rag_operator_fix.sql");
const verificationSql = readRequired("supabase/verification.sql");
const englishImportScript = readRequired("scripts/import-english-papers.mjs");
const legacySql = readRequired("supabase-init.sql");
const combinedSql = `${schemaSql}\n${rlsSql}\n${practiceMarkedSql}\n${englishTrainingSql}\n${englishVocabularyContextSql}\n${englishVocabularySourceSql}\n${documentOcrStorageSql}\n${noteVersionSql}\n${planningStatusSql}\n${trainingCoreSql}\n${jobsAndSourcesSql}\n${privateNoteDefaultSql}\n${boundaryPolicySql}\n${jobLeaseSql}\n${contentMigrationSql}\n${englishBackfillSql}\n${englishCommandSql}\n${englishSubjectiveSql}\n${mathCoreSql}\n${problemOcrAssetsSql}\n${privateRagSql}\n${privateRagOperatorFixSql}\n${legacySql}`;
const docsSqlExamples = [
  readRequired("README.md"),
  readRequired("supabase/README.md"),
  readRequired("PRODUCTION_SECURITY_CHECKLIST.md"),
  readRequired("SECURITY_DEPLOYMENT.md"),
  readRequired("OPTIMIZATION_PLAN.md"),
].join("\n");

const requiredTables = [
  "notes",
  "chapters",
  "site_profile",
  "admin_users",
  "problem_practice_statuses",
  "math3_self_tests",
  "english_papers",
  "english_passages",
  "english_questions",
  "english_attempts",
  "english_attempt_answers",
  "english_vocabulary",
  "planning_task_status",
  "attempts",
  "attempt_revisions",
  "grades",
  "jobs",
  "job_items",
  "source_documents",
  "source_versions",
  "content_migration_snapshots",
  "math_papers",
  "math_paper_problems",
  "ocr_confirmations",
  "math_grade_steps",
  "booklets",
  "rag_chunks",
  "memory_candidates",
];

for (const table of requiredTables) {
  check(
    `${table} 表在基础迁移中有定义`,
    new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.${table}\\b`, "i").test(combinedSql),
    `代码会访问 ${table}，缺少表定义会导致线上功能运行时失败。`,
  );

  check(
    `${table} 已启用 RLS`,
    new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i").test(combinedSql),
    `没有启用 RLS 时，策略不会成为数据库最后一道安全门。`,
  );
}

const requiredPolicyMarkers = [
  "notes_public_select",
  "notes_admin_insert",
  "notes_admin_update",
  "notes_admin_delete",
  "chapters_public_select",
  "chapters_admin_insert",
  "chapters_admin_update",
  "chapters_admin_delete",
  "site_profile_public_select",
  "site_profile_admin_update",
  "admin_users_admin_select",
  "problem_practice_statuses_owner_select",
  "problem_practice_statuses_owner_insert",
  "problem_practice_statuses_owner_update",
  "problem_practice_statuses_owner_delete",
  "math3_self_tests_owner_select",
  "math3_self_tests_owner_insert",
  "math3_self_tests_owner_update",
  "math3_self_tests_owner_delete",
  "english_papers_authenticated_select",
  "english_papers_admin_insert",
  "english_papers_admin_update",
  "english_papers_admin_delete",
  "english_passages_authenticated_select",
  "english_passages_admin_insert",
  "english_passages_admin_update",
  "english_passages_admin_delete",
  "english_questions_authenticated_select",
  "english_questions_admin_insert",
  "english_questions_admin_update",
  "english_questions_admin_delete",
  "english_attempts_owner_select",
  "english_attempts_owner_insert",
  "english_attempts_owner_update",
  "english_attempts_owner_delete",
  "english_attempt_answers_owner_select",
  "english_attempt_answers_owner_insert",
  "english_attempt_answers_owner_update",
  "english_attempt_answers_owner_delete",
  "english_vocabulary_owner_select",
  "english_vocabulary_owner_insert",
  "english_vocabulary_owner_update",
  "english_vocabulary_owner_delete",
  "note_images_admin_select",
  "note_images_admin_insert",
  "note_images_admin_update",
  "note_images_admin_delete",
  "ocr_documents_admin_select",
  "ocr_documents_admin_insert",
  "ocr_documents_admin_update",
  "ocr_documents_admin_delete",
  "planning_task_status_owner_select",
  "planning_task_status_owner_insert",
  "planning_task_status_owner_update",
  "attempts_owner_select",
  "attempts_owner_insert",
  "attempts_owner_update",
  "attempt_revisions_owner_select",
  "attempt_revisions_owner_insert",
  "grades_owner_select",
  "grades_owner_insert_user_final",
  "jobs_owner_select",
  "jobs_owner_insert",
  "jobs_owner_update",
  "job_items_owner_select",
  "job_items_owner_insert",
  "job_items_owner_update",
  "source_documents_access_select",
  "source_documents_access_insert",
  "source_documents_access_update",
  "source_versions_access_select",
  "source_versions_access_insert",
  "content_migration_snapshots_admin_select",
  "math_papers_authenticated_select",
  "math_papers_admin_insert",
  "math_papers_admin_update",
  "math_paper_problems_authenticated_select",
  "math_paper_problems_admin_insert",
  "math_paper_problems_admin_update",
  "ocr_confirmations_owner_select",
  "math_grade_steps_owner_select",
  "booklets_owner_select",
  "rag_chunks_owner_select",
  "memory_candidates_owner_select",
];

for (const marker of requiredPolicyMarkers) {
  check(
    `策略 ${marker} 存在`,
    combinedSql.includes(marker),
    `策略缺失时，对应读写路径可能没有明确的数据库权限边界。`,
  );
}

check(
  "WP1-C 私人表对 anon 没有 grants",
  /revoke\s+all\s+on\s+public\.planning_task_status\s+from\s+anon/i.test(planningStatusSql)
    && /revoke\s+all\s+on\s+public\.attempts,[\s\S]*from\s+anon,\s*authenticated/i.test(trainingCoreSql)
    && /revoke\s+all\s+on\s+public\.jobs,[\s\S]*from\s+anon,\s*authenticated/i.test(jobsAndSourcesSql),
  "规划、训练、任务或资料来源对匿名访客暴露，会泄露私人学习事实。",
);

check(
  "WP1-C 不可变事件没有 UPDATE/DELETE grant",
  /grant\s+select,\s*insert\s+on\s+public\.attempt_revisions,\s*public\.grades\s+to\s+authenticated/i.test(trainingCoreSql)
    && /grant\s+select,\s*insert\s+on\s+public\.source_versions\s+to\s+authenticated/i.test(jobsAndSourcesSql)
    && !/grant[^;]*(update|delete)[^;]*public\.(attempt_revisions|grades|source_versions)/i.test(`${trainingCoreSql}\n${jobsAndSourcesSql}`),
  "revision、grade 与 source version 必须追加新行，不能原地覆盖或删除。",
);

check(
  "WP3 job_items 状态变化只经原子 lease RPC",
  /for update of item skip locked/i.test(jobLeaseSql)
    && /revoke insert, update on public\.job_items from authenticated/i.test(jobLeaseSql)
    && /set search_path = ''/i.test(jobLeaseSql)
    && /job\.user_id = caller_user_id/i.test(jobLeaseSql)
    && /item\.attempt_count = p_lease_attempt/i.test(jobLeaseSql)
    && /create or replace function public\.enqueue_job_item/i.test(jobLeaseSql)
    && !/grant\s+execute[^;]*to\s+(?:public|anon)/i.test(jobLeaseSql),
  "若客户端仍能直接 INSERT/UPDATE，或 RPC 缺少 owner/search_path/fencing 保护，两台设备可绕过 lease 状态机。",
);

check(
  "WP2 内容迁移只经校验 RPC 且快照不可变",
  /create\s+table\s+public\.content_migration_snapshots/i.test(contentMigrationSql)
    && /before\s+update\s+or\s+delete\s+on\s+public\.content_migration_snapshots/i.test(contentMigrationSql)
    && /force\s+row\s+level\s+security/i.test(contentMigrationSql)
    && /revoke\s+all\s+on\s+public\.content_migration_snapshots\s+from\s+anon,\s*authenticated/i.test(contentMigrationSql)
    && /grant\s+select\s+on\s+public\.content_migration_snapshots\s+to\s+authenticated/i.test(contentMigrationSql)
    && /create\s+or\s+replace\s+function\s+public\.apply_content_migration/i.test(contentMigrationSql)
    && /create\s+or\s+replace\s+function\s+public\.rollback_content_migration/i.test(contentMigrationSql)
    && /if\s+caller_user_id\s+is\s+null\s+or\s+not\s+private\.current_user_is_admin\(\)/i.test(contentMigrationSql)
    && /if\s+p_ai_involved\s+then[\s\S]{0,240}p_validation_status\s*<>\s*'human_approved'/i.test(contentMigrationSql)
    && /set\s+search_path\s*=\s*''/i.test(contentMigrationSql)
    && !/grant\s+execute[^;]*to\s+(?:public|anon)/i.test(contentMigrationSql),
  "若快照可原地改写、RPC 缺少管理员/人工确认/search_path 门，AI 可能无审计地覆盖旧文章。",
);

check(
  "WP5 英语 backfill 只追加共享事件且保留 legacy 真源",
  /insert into public\.attempts/i.test(englishBackfillSql)
    && /insert into public\.attempt_revisions/i.test(englishBackfillSql)
    && /'legacy_imported'/i.test(englishBackfillSql)
    && /'system_scored'/i.test(englishBackfillSql)
    && /English backfill postcondition failed/i.test(englishBackfillSql)
    && !/update\s+public\.(?:english_attempts|english_attempt_answers)/i.test(englishBackfillSql)
    && !/\b(?:delete\s+from|truncate\s+table|drop\s+table)\b/i.test(englishBackfillSql),
  "backfill 只能追加共享 attempt/revision/grade，不得覆盖或删除旧英语记录。",
);

check(
  "WP5 英语新写路径只经 owner 约束的原子命令",
  /create\s+or\s+replace\s+function\s+public\.record_english_training_command/i.test(englishCommandSql)
    && /security\s+definer\s+set\s+search_path\s*=\s*''/i.test(englishCommandSql)
    && /v_user_id\s+uuid\s*:=\s*auth\.uid\(\)/i.test(englishCommandSql)
    && /pg_advisory_xact_lock/i.test(englishCommandSql)
    && /where\s+revision\.id\s*=\s*p_command_id/i.test(englishCommandSql)
    && /p_write_legacy\s+boolean/i.test(englishCommandSql)
    && !/grant\s+execute[^;]*to\s+(?:public|anon)/i.test(englishCommandSql)
    && !/\b(?:delete\s+from|truncate\s+table|drop\s+table)\b/i.test(englishCommandSql),
  "新写路径若缺少 owner、事务锁、幂等键或显式兼容开关，会造成重复 revision、跨用户写入或回退漂移。",
);

check(
  "WP5 主观题 AI 建议与用户终分严格分层",
  /record_english_subjective_submission/i.test(englishSubjectiveSql)
    && /confirm_english_subjective_grade/i.test(englishSubjectiveSql)
    && /grade\.origin in \('system_scored', 'user_final', 'legacy_imported'\)/i.test(englishSubjectiveSql)
    && /Previous round requires a formal grade before the next round can start/i.test(englishSubjectiveSql)
    && (englishSubjectiveSql.match(/security\s+definer\s+set\s+search_path\s*=\s*''/gi) ?? []).length >= 2
    && !/grant\s+execute[^;]*to\s+(?:public|anon)/i.test(englishSubjectiveSql)
    && !/\b(?:delete\s+from|truncate\s+table|drop\s+table)\b/i.test(englishSubjectiveSql),
  "AI 建议若能直接成为正式分、或未确认即可开启下一轮，会污染正式统计。",
);

check(
  "WP6 数学确认、逐步评分与做题本保持 owner/RPC 边界",
  /create\s+table\s+public\.ocr_confirmations/i.test(mathCoreSql)
    && /create\s+table\s+public\.math_grade_steps/i.test(mathCoreSql)
    && /create\s+table\s+public\.booklets/i.test(mathCoreSql)
    && /Math grade must bind the latest OCR confirmation/i.test(mathCoreSql)
    && /grade\.origin = 'user_final'[\s\S]{0,500}confirmation\.confirmation_version/i.test(mathCoreSql)
    && /revoke\s+all\s+on\s+public\.math_papers,[\s\S]*public\.booklets\s+from\s+anon,\s*authenticated/i.test(mathCoreSql)
    && /grant\s+select\s+on\s+public\.ocr_confirmations,\s*public\.math_grade_steps,\s*public\.booklets\s+to\s+authenticated/i.test(mathCoreSql)
    && /security\s+definer\s+set\s+search_path\s*=\s*''/i.test(mathCoreSql)
    && !/\b(?:delete\s+from|truncate\s+table|drop\s+table)\b/i.test(mathCoreSql),
  "数学评分若可直接写表、可绑定旧确认或做题本正文重复存储，会破坏追加历史和单一真源。",
);

check(
  "WP7 私人 RAG 与确认记忆保持 current-version/RLS/RPC 边界",
  /create\s+table\s+public\.rag_chunks/i.test(privateRagSql)
    && /create\s+table\s+public\.memory_candidates/i.test(privateRagSql)
    && /document\.current_version_id\s*=\s*version\.id/i.test(privateRagSql)
    && /force\s+row\s+level\s+security/i.test(privateRagSql)
    && /revoke\s+all\s+on\s+public\.rag_chunks,\s*public\.memory_candidates\s+from\s+anon,\s*authenticated/i.test(privateRagSql)
    && /security\s+definer\s+set\s+search_path\s*=\s*''/i.test(privateRagSql)
    && /OPERATOR\(extensions\.<=>\)/i.test(privateRagOperatorFixSql)
    && !/\b(?:delete\s+from|truncate\s+table|drop\s+table)\b/i.test(`${privateRagSql}\n${privateRagOperatorFixSql}`),
  "私人笔记 chunk 或记忆候选必须只在用户 JWT/RPC 边界内访问，检索只能命中 current source version。",
);

check(
  "新笔记默认私有且不改存量行",
  /alter\s+column\s+is_published\s+set\s+default\s+false/i.test(privateNoteDefaultSql)
    && !/update\s+public\.notes/i.test(privateNoteDefaultSql),
  "默认值迁移只能影响未来 insert，不能批量改写现有公开文章。",
);

check(
  "运行时 admin_users 只读且 site_profile 只允许更新 main",
  /revoke\s+insert,\s*update,\s*delete\s+on\s+public\.admin_users\s+from\s+authenticated/i.test(boundaryPolicySql)
    && /revoke\s+insert,\s*delete\s+on\s+public\.site_profile\s+from\s+authenticated/i.test(boundaryPolicySql)
    && /create\s+policy\s+site_profile_admin_update[\s\S]*id\s*=\s*'main'/i.test(boundaryPolicySql),
  "普通 JWT 不应能修改管理员权威，也不应创建或删除站点资料行。",
);

check(
  "全新数据库会幂等创建 site_profile.main",
  /insert\s+into\s+public\.site_profile\s*\(id,\s*profile\)[\s\S]*values\s*\(\s*'main'[\s\S]*on\s+conflict\s*\(id\)\s+do\s+nothing/i.test(schemaSql),
  "收紧为只更新 main 后，基础迁移必须先创建 main 行，否则新部署无法首次保存资料。",
);

check(
  "登录用户只读官方英语题源且管理员可审计刷题投影",
  /create\s+policy\s+english_papers_authenticated_select/i.test(boundaryPolicySql)
    && /create\s+policy\s+english_passages_authenticated_select/i.test(boundaryPolicySql)
    && /create\s+policy\s+english_questions_authenticated_select/i.test(boundaryPolicySql)
    && /problem_practice_statuses_owner_select[\s\S]*private\.current_user_is_admin/i.test(boundaryPolicySql),
  "非管理员登录用户需要读取官方题源，管理员需要只读审计学习投影。",
);

check(
  "管理员判断函数位于 private schema",
  /create\s+or\s+replace\s+function\s+private\.current_user_is_admin\(\)/i.test(rlsSql),
  "管理员判断函数不应放在公开暴露的 public schema 中。",
);

check(
  "Storage bucket note-images 在基础迁移中创建或修正",
  /insert\s+into\s+storage\.buckets/i.test(schemaSql) && schemaSql.includes("'note-images'"),
  "缺少 bucket 定义会导致封面或编辑器图片上传失败。",
);

check(
  "Storage bucket ocr-documents 在讲义 OCR 迁移中创建或修正",
  /insert\s+into\s+storage\.buckets/i.test(documentOcrStorageSql)
    && documentOcrStorageSql.includes("'ocr-documents'")
    && documentOcrStorageSql.includes("52428800")
    && documentOcrStorageSql.includes("'application/pdf'"),
  "缺少 OCR 临时 PDF bucket 会导致大文件无法自动转成百度可读取的链接。",
);

check(
  "Storage bucket ocr-documents 在 WP3 中保持私有并允许压缩题目图片",
  /update\s+storage\.buckets/i.test(problemOcrAssetsSql)
    && /public\s*=\s*false/i.test(problemOcrAssetsSql)
    && ["'application/pdf'", "'image/jpeg'", "'image/png'", "'image/webp'"]
      .every((mime) => problemOcrAssetsSql.includes(mime))
    && !/storage\.objects|drop\s+table|truncate|delete\s+from/i.test(problemOcrAssetsSql),
  "题库 OCR 必须复用私有临时桶，不能把私人题目图片放进公开图片桶，也不能删除既有对象。",
);

check(
  "problem_practice_statuses 有三刷标记字段迁移",
  /alter\s+table\s+public\.problem_practice_statuses[\s\S]*add\s+column\s+if\s+not\s+exists\s+is_marked\s+boolean/i.test(practiceMarkedSql),
  "题集标记功能依赖 is_marked 字段；缺少迁移会导致线上点击标记失败。",
);

check(
  "problem_practice_statuses 已标记筛选有索引",
  practiceMarkedSql.includes("idx_problem_practice_statuses_user_marked_updated_at"),
  "已标记题目变多后，缺少索引会拖慢三刷收集列表。",
);

check(
  "英语真题训练迁移不包含删除或旧数据覆盖语句",
  !/\b(drop|truncate)\b|delete\s+from|update\s+notes|alter\s+table\s+public\.notes|notes\.problems/i.test(englishTrainingSql),
  "英语真题训练是新增模块，迁移不得删除对象、覆盖旧文章或改写旧 problems 数据。",
);

check(
  "英语生词追溯迁移只扩展 english_vocabulary",
  /alter\s+table\s+public\.english_vocabulary[\s\S]*add\s+column\s+if\s+not\s+exists\s+entry_type/i.test(englishVocabularyContextSql)
    && /add\s+column\s+if\s+not\s+exists\s+source_excerpt/i.test(englishVocabularyContextSql)
    && !/\b(drop|truncate)\b|delete\s+from|update\s+notes|alter\s+table\s+public\.notes|notes\.problems|alter\s+table\s+public\.(?!english_vocabulary\b)/i.test(englishVocabularyContextSql),
  "生词和固定搭配追溯只能加字段、加索引，不能触碰旧文章、旧题集或训练记录。",
);

check(
  "英语词汇来源迁移只扩展 english_vocabulary",
  /alter\s+table\s+public\.english_vocabulary[\s\S]*add\s+column\s+if\s+not\s+exists\s+source_area/i.test(englishVocabularySourceSql)
    && /familiar_meaning/i.test(englishVocabularySourceSql)
    && !/\b(drop\s+table|truncate)\b|delete\s+from|update\s+notes|alter\s+table\s+public\.notes|notes\.problems|alter\s+table\s+public\.(?!english_vocabulary\b)/i.test(englishVocabularySourceSql),
  "词汇来源和熟词生义迁移只能改 english_vocabulary 元数据，不能触碰旧文章、旧题集或训练记录。",
);

check(
  "英语真题导入脚本只写 english 内容表",
  !/\.from\(\s*["'](?:notes|problem_practice_statuses|math3_self_tests|english_attempts|english_attempt_answers|english_vocabulary)["']\s*\)|notesApi\./.test(englishImportScript),
  "真题正文导入只能写 english_papers、english_passages、english_questions，不能污染旧题集、作答记录或生词表。",
);

check(
  "英语真题正式导入需要目标与年份确认",
  englishImportScript.includes("--target") && englishImportScript.includes("--confirm-year-range"),
  "使用 service role 写入时必须显式确认目标环境和年份范围，避免误写生产库。",
);

check(
  "迁移文件不直接 ALTER storage.objects",
  !/alter\s+table\s+storage\.objects\b/i.test(rlsSql),
  "Supabase 托管项目中的 storage.objects 通常由 Supabase 内部角色拥有，直接 ALTER 会在 SQL Editor 报 must be owner。",
);

check(
  "迁移后核验 SQL 是只读脚本",
  !/^\s*(insert|update|delete\s+from|alter|create|drop|grant|revoke|truncate)\b/im.test(verificationSql),
  "verification.sql 应只用于检查生产状态，不能修改 Supabase 数据或权限。",
);

check(
  "迁移后核验 SQL 检查 RLS 状态",
  verificationSql.includes("relrowsecurity"),
  "如果核验脚本不检查 relrowsecurity，可能漏掉“表存在但 RLS 没开”的情况。",
);

check(
  "迁移后核验 SQL 检查策略存在性",
  verificationSql.includes("pg_policies")
    && verificationSql.includes("note_images_admin_insert")
    && verificationSql.includes("ocr_documents_admin_insert"),
  "如果核验脚本不查 pg_policies，可能漏掉 Storage 或表策略缺失。",
);

check(
  "迁移后核验 SQL 检查 Storage buckets",
  verificationSql.includes("storage.buckets")
    && verificationSql.includes("'note-images'")
    && verificationSql.includes("'ocr-documents'")
    && verificationSql.includes("'image/jpeg'")
    && verificationSql.includes("'image/png'")
    && verificationSql.includes("'image/webp'"),
  "如果 bucket 没被核验，图片上传或讲义 OCR 临时文件链接可能在生产环境才暴露问题。",
);

check(
  "迁移后核验 SQL 检查 admin_users 与 auth.users 邮箱匹配",
  verificationSql.includes("public.admin_users") && verificationSql.includes("auth.users") && verificationSql.includes("lower(u.email) = lower(au.email)"),
  "管理员邮箱写错时，Next.js 鉴权和 Supabase RLS 会出现一边放行、一边拒绝的混乱状态。",
);

check(
  "迁移后核验 SQL 检查三刷标记字段",
  verificationSql.includes("'problem_practice_statuses', 'is_marked'"),
  "如果核验脚本不检查 is_marked，可能漏掉数据库还没执行第三个迁移的问题。",
);

check(
  "迁移后核验 SQL 检查英语真题训练表",
  verificationSql.includes("'public', 'english_papers'")
    && verificationSql.includes("'public', 'english_attempts'")
    && verificationSql.includes("'public', 'english_vocabulary'"),
  "如果核验脚本不检查英语训练表，可能漏掉生产库还没执行第四个迁移的问题。",
);

check(
  "迁移后核验 SQL 检查英语生词追溯字段",
  verificationSql.includes("'english_vocabulary', 'entry_type'")
    && verificationSql.includes("'english_vocabulary', 'source_excerpt'")
    && verificationSql.includes("'english_vocabulary', 'source_area'")
    && verificationSql.includes("'english_vocabulary', 'highlight_text'"),
  "如果核验脚本不检查 entry_type/source_excerpt/source_area/highlight_text，可能漏掉词汇追溯迁移未执行的问题。",
);

check(
  "迁移后核验 SQL 检查英语真题训练策略",
  verificationSql.includes("english_papers_authenticated_select")
    && verificationSql.includes("english_attempts_owner_select")
    && verificationSql.includes("english_vocabulary_owner_insert"),
  "如果核验脚本不检查英语训练 RLS 策略，可能漏掉训练记录权限边界缺失。",
);

check(
  "迁移后核验 SQL 检查原子 lease RPC 与直接写入撤销",
  verificationSql.includes("job_lease:rpcs_exist")
    && verificationSql.includes("job_lease:authenticated_execute_only")
    && verificationSql.includes("job_lease:direct_item_mutation_revoked")
    && verificationSql.includes("claim_next_job_item(uuid,text,integer)"),
  "若核验脚本不检查 RPC 和表 grant，生产可能存在函数缺失或客户端绕过。",
);

check(
  "迁移后核验 SQL 检查内容快照、RPC 与不可变权限",
  verificationSql.includes("'public', 'content_migration_snapshots'")
    && verificationSql.includes("content_migration:rpcs_exist")
    && verificationSql.includes("content_migration:authenticated_execute_only")
    && verificationSql.includes("content_migration:snapshots_append_only_admin_read")
    && verificationSql.includes("rollback_content_migration(uuid,text,bigint,jsonb)"),
  "若核验脚本不检查 0015，远端可能缺少快照表、回退 RPC 或仍允许直接篡改审计历史。",
);

check(
  "迁移后核验 SQL 检查英语 backfill 对账",
  verificationSql.includes("english_backfill:normalizer_hardened")
    && verificationSql.includes("english_backfill:legacy_attempts_mapped")
    && verificationSql.includes("english_backfill:submitted_revision_and_legacy_grade")
    && verificationSql.includes("english_backfill:objective_system_grade"),
  "若核验脚本不检查 legacy→shared 映射，远端可能出现漏迁 attempt、revision 或正式客观分。",
);

check(
  "迁移后核验 SQL 检查英语原子命令权限与三轮不变量",
  verificationSql.includes("english_command:rpc_hardened")
    && verificationSql.includes("english_command:authenticated_execute_only")
    && verificationSql.includes("english_command:three_round_limit")
    && verificationSql.includes("record_english_training_command(uuid,smallint,text,jsonb,uuid,boolean)"),
  "若核验脚本不检查 0017，远端可能缺少 RPC、权限边界或三轮约束。",
);

check(
  "迁移后核验 SQL 检查英语主观建议与终分门",
  verificationSql.includes("english_subjective:rpcs_hardened")
    && verificationSql.includes("english_subjective:authenticated_execute_only")
    && verificationSql.includes("english_subjective:next_round_requires_formal_grade")
    && verificationSql.includes("confirm_english_subjective_grade(uuid,uuid,numeric,text,jsonb,boolean)"),
  "若核验脚本不检查 0018，AI 建议可能绕过终分确认或 RPC 权限可能漂移。",
);

check(
  "迁移后核验 SQL 检查数学确认、逐步评分与做题本边界",
  verificationSql.includes("'public', 'math_papers'")
    && verificationSql.includes("'public', 'ocr_confirmations'")
    && verificationSql.includes("math_core:rpcs_hardened")
    && verificationSql.includes("math_core:append_only_direct_writes_revoked")
    && verificationSql.includes("math_core:grade_confirmation_integrity")
    && verificationSql.includes("math_core:next_round_requires_latest_user_final")
    && verificationSql.includes("math_core:booklet_single_body_source"),
  "若核验脚本不检查 0019，远端可能缺少确认绑定、追加式逐步评分或做题本单一正文门。",
);

check(
  "管理员邮箱插入示例不使用 on conflict (email)",
  !/on\s+conflict\s*\(\s*email\s*\)\s+do\s+nothing/i.test(docsSqlExamples),
  "admin_users 当前使用 lower(email) 表达式唯一索引，文档示例应使用 on conflict do nothing，避免 SQL Editor 报没有匹配的唯一约束。",
);

const dangerousPatterns = [
  {
    pattern: /create\s+policy[\s\S]*?\bfor\s+all\b/i,
    message: "SQL 中不应出现 FOR ALL 策略",
    risk: "FOR ALL 容易把读、写、删混在一起，误放开生产数据。",
  },
  {
    pattern: /using\s*\(\s*true\s*\)/i,
    message: "SQL 中不应出现 USING (true)",
    risk: "这通常代表所有行直接放行，容易绕过预期权限边界。",
  },
  {
    pattern: /with\s+check\s*\(\s*true\s*\)/i,
    message: "SQL 中不应出现 WITH CHECK (true)",
    risk: "这通常代表插入或更新不受业务权限限制。",
  },
  {
    pattern: /create\s+policy\s+"允许所有操作"/i,
    message: "旧的“允许所有操作”策略已移除",
    risk: "这个旧策略会让访客拥有不该有的数据库写入能力。",
  },
];

for (const item of dangerousPatterns) {
  check(item.message, !item.pattern.test(combinedSql), item.risk);
}

if (failed > 0) {
  console.log("");
  console.log(`结果: ${failed} 个 RLS 资产检查未通过。`);
  process.exitCode = 1;
} else {
  console.log("");
  console.log("结果: RLS 迁移资产检查通过。注意：这不代表生产数据库已经执行了这些 SQL。");
}
