-- AST-WP1-C/D/E fixed-shadow postflight fingerprint.
-- Read-only. Original-table checksums intentionally exclude notes.content_version.

with original_tables(table_name) as (
  values
    ('admin_users'), ('chapters'), ('english_attempt_answers'), ('english_attempts'),
    ('english_papers'), ('english_passages'), ('english_questions'), ('english_vocabulary'),
    ('flashcards'), ('math3_self_tests'), ('notes'), ('problem_practice_statuses'), ('site_profile')
), original_table_fingerprints as (
  select 'admin_users'::text as table_name, count(*)::bigint as row_count,
    md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by email), '')) as checksum from public.admin_users t
  union all select 'chapters', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.chapters t
  union all select 'english_attempt_answers', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.english_attempt_answers t
  union all select 'english_attempts', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.english_attempts t
  union all select 'english_papers', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.english_papers t
  union all select 'english_passages', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.english_passages t
  union all select 'english_questions', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.english_questions t
  union all select 'english_vocabulary', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.english_vocabulary t
  union all select 'flashcards', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.flashcards t
  union all select 'math3_self_tests', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.math3_self_tests t
  union all select 'notes', count(*), md5(coalesce(string_agg((to_jsonb(t) - 'content_version')::text, E'\n' order by id), '')) from public.notes t
  union all select 'problem_practice_statuses', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.problem_practice_statuses t
  union all select 'site_profile', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.site_profile t
), problem_rows as (
  select notes.id as note_id, nullif(btrim(problem.value ->> 'id'), '') as problem_id
  from public.notes notes
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(notes.problems) = 'array' then notes.problems else '[]'::jsonb end
  ) as problem(value)
), problem_id_set as (
  select distinct note_id, problem_id from problem_rows where problem_id is not null
), duplicate_problem_ids as (
  select note_id, problem_id from problem_rows
  where problem_id is not null group by note_id, problem_id having count(*) > 1
), content_integrity as (
  select jsonb_build_object(
    'problemCount', (select count(*) from problem_rows),
    'malformedProblemNotes', (select count(*) from public.notes where jsonb_typeof(problems) is distinct from 'array'),
    'missingProblemIds', (select count(*) from problem_rows where problem_id is null),
    'duplicateProblemIdGroups', (select count(*) from duplicate_problem_ids),
    'practiceMissingNotes', (
      select count(*) from public.problem_practice_statuses s left join public.notes n on n.id = s.note_id where n.id is null
    ),
    'practiceMissingProblemIds', (
      select count(*) from public.problem_practice_statuses s
      left join problem_id_set p on p.note_id = s.note_id and p.problem_id = s.problem_id where p.note_id is null
    ),
    'englishOrphanQuestions', (
      select count(*) from public.english_questions q left join public.english_passages p on p.id = q.passage_id where p.id is null
    ),
    'englishOrphanAttempts', (
      select count(*) from public.english_attempts a left join public.english_passages p on p.id = a.passage_id where p.id is null
    ),
    'englishOrphanAnswers', (
      select count(*) from public.english_attempt_answers a
      left join public.english_attempts t on t.id = a.attempt_id
      left join public.english_questions q on q.id = a.question_id where t.id is null or q.id is null
    ),
    'englishYearMismatches', (
      select count(*) from public.english_passages p join public.english_papers e on e.id = p.paper_id where p.year is distinct from e.year
    ),
    'englishDuplicateAttemptGroups', (
      select count(*) from (
        select user_id, passage_id from public.english_attempts group by user_id, passage_id having count(*) > 1
      ) duplicates
    ),
    'chapterMissingParents', (
      select count(*) from public.chapters c left join public.chapters p on p.id = c.parent_id
      where c.parent_id is not null and p.id is null
    ),
    'chapterCrossScopeParents', (
      select count(*) from public.chapters c join public.chapters p on p.id = c.parent_id
      where c.note_id is distinct from p.note_id
    )
  ) as payload
), auth_fingerprint as (
  select jsonb_build_object(
    'userCount', count(*),
    'checksum', md5(coalesce(string_agg(
      jsonb_build_object('id', id, 'email', email, 'created_at', created_at, 'updated_at', updated_at)::text,
      E'\n' order by id
    ), '')),
    'stableUsers', coalesce(jsonb_agg(
      jsonb_build_object('id', id, 'email', email) order by id
    ), '[]'::jsonb),
    'emptyTokenUsers', count(*) filter (
      where confirmation_token = ''
        and recovery_token = ''
        and email_change = ''
        and email_change_token_new = ''
    ),
    'emailIdentityCount', (select count(*) from auth.identities where provider = 'email'),
    'validEmailIdentityTimeCount', (
      select count(*) from auth.identities
      where provider = 'email'
        and last_sign_in_at is not null
        and created_at is not null
        and updated_at is not null
    ),
    'unlinkedEmailIdentityCount', (
      select count(*) from auth.identities identity_row
      left join auth.users user_row on user_row.id = identity_row.user_id
      where identity_row.provider = 'email' and user_row.id is null
    ),
    'duplicateEmailIdentityUserCount', (
      select count(*) from (
        select user_id from auth.identities
        where provider = 'email'
        group by user_id having count(*) <> 1
      ) duplicate_identity_users
    ),
    'adminMatchedUsers', (
      select count(*) from public.admin_users a join auth.users u on lower(u.email) = lower(a.email)
    )
  ) as payload from auth.users
), storage_fingerprint as (
  select jsonb_build_object(
    'bucketCount', (select count(*) from storage.buckets where id in ('note-images', 'ocr-documents')),
    'objectCount', count(*),
    'totalSizeBytes', coalesce(sum(coalesce((metadata ->> 'size')::bigint, 0)), 0),
    'checksum', md5(coalesce(string_agg(jsonb_build_object(
      'bucket', bucket_id, 'path', name,
      'size', coalesce((metadata ->> 'size')::bigint, 0), 'mime', metadata ->> 'mimetype'
    )::text, E'\n' order by bucket_id, name), ''))
  ) as payload
  from storage.objects where bucket_id in ('note-images', 'ocr-documents')
), new_tables(table_name) as (
  values
    ('planning_task_status'), ('attempts'), ('attempt_revisions'), ('grades'),
    ('jobs'), ('job_items'), ('source_documents'), ('source_versions')
), new_table_rows as (
  select 'planning_task_status'::text as table_name, count(*)::bigint as row_count from public.planning_task_status
  union all select 'attempts', count(*) from public.attempts
  union all select 'attempt_revisions', count(*) from public.attempt_revisions
  union all select 'grades', count(*) from public.grades
  union all select 'jobs', count(*) from public.jobs
  union all select 'job_items', count(*) from public.job_items
  union all select 'source_documents', count(*) from public.source_documents
  union all select 'source_versions', count(*) from public.source_versions
), expected_policies(table_name, policy_name) as (
  values
    ('planning_task_status', 'planning_task_status_owner_select'),
    ('planning_task_status', 'planning_task_status_owner_insert'),
    ('planning_task_status', 'planning_task_status_owner_update'),
    ('attempts', 'attempts_owner_select'), ('attempts', 'attempts_owner_insert'), ('attempts', 'attempts_owner_update'),
    ('attempt_revisions', 'attempt_revisions_owner_select'), ('attempt_revisions', 'attempt_revisions_owner_insert'),
    ('grades', 'grades_owner_select'), ('grades', 'grades_owner_insert_user_final'),
    ('jobs', 'jobs_owner_select'), ('jobs', 'jobs_owner_insert'), ('jobs', 'jobs_owner_update'),
    ('job_items', 'job_items_owner_select'), ('job_items', 'job_items_owner_insert'), ('job_items', 'job_items_owner_update'),
    ('source_documents', 'source_documents_access_select'), ('source_documents', 'source_documents_access_insert'),
    ('source_documents', 'source_documents_access_update'),
    ('source_versions', 'source_versions_access_select'), ('source_versions', 'source_versions_access_insert')
), expected_triggers(table_name, trigger_name) as (
  values
    ('notes', 'bump_notes_content_version'), ('chapters', 'enforce_chapters_scope'),
    ('planning_task_status', 'set_planning_task_status_updated_at'),
    ('attempt_revisions', 'enforce_attempt_revision_append'), ('attempt_revisions', 'reject_attempt_revision_mutation'),
    ('grades', 'enforce_grade_append'), ('grades', 'reject_grade_mutation'),
    ('attempts', 'enforce_attempt_lifecycle'), ('attempts', 'set_attempts_updated_at'),
    ('source_versions', 'enforce_source_version_append'), ('source_versions', 'reject_source_version_mutation'),
    ('source_documents', 'enforce_source_document_identity'), ('source_documents', 'set_source_documents_updated_at'),
    ('jobs', 'set_jobs_updated_at'), ('job_items', 'set_job_items_updated_at')
), expected_functions(function_name) as (
  values
    ('bump_note_content_version'), ('enforce_chapter_scope'), ('enforce_attempt_revision_append'),
    ('enforce_grade_append'), ('reject_immutable_event_mutation'), ('enforce_attempt_lifecycle'),
    ('enforce_source_version_append'), ('enforce_source_document_identity')
), new_table_acl as (
  select relation.relname as table_name, grants.grantee,
    case when grants.grantee = 0 then 'PUBLIC' else pg_get_userbyid(grants.grantee) end as grantee_name,
    grants.privilege_type
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  join new_tables on new_tables.table_name = relation.relname
  cross join lateral aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) grants
  where namespace.nspname = 'public' and relation.relkind in ('r', 'p')
), missing_policies as (
  select expected_policies.* from expected_policies
  left join pg_policies on pg_policies.schemaname = 'public'
    and pg_policies.tablename = expected_policies.table_name
    and pg_policies.policyname = expected_policies.policy_name
  where pg_policies.policyname is null
), missing_triggers as (
  select expected_triggers.* from expected_triggers
  left join pg_class relation on relation.relname = expected_triggers.table_name
  left join pg_namespace namespace on namespace.oid = relation.relnamespace and namespace.nspname = 'public'
  left join pg_trigger trigger_row on trigger_row.tgrelid = relation.oid
    and trigger_row.tgname = expected_triggers.trigger_name and not trigger_row.tgisinternal
  where trigger_row.oid is null
), missing_functions as (
  select expected_functions.* from expected_functions
  left join pg_proc procedure on procedure.proname = expected_functions.function_name
  left join pg_namespace namespace on namespace.oid = procedure.pronamespace and namespace.nspname = 'private'
  where procedure.oid is null
), private_function_public_exec as (
  select procedure.proname
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  join expected_functions on expected_functions.function_name = procedure.proname
  cross join lateral aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) grants
  where namespace.nspname = 'private' and grants.grantee = 0 and grants.privilege_type = 'EXECUTE'
), new_schema_fingerprint as (
  select jsonb_build_object(
    'columnCount', (
      select count(*) from information_schema.columns columns
      join new_tables on new_tables.table_name = columns.table_name where columns.table_schema = 'public'
    ),
    'constraintCount', (
      select count(*) from pg_constraint constraint_row
      join pg_class relation on relation.oid = constraint_row.conrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      join new_tables on new_tables.table_name = relation.relname where namespace.nspname = 'public'
    ),
    'indexCount', (
      select count(*) from pg_indexes indexes join new_tables on new_tables.table_name = indexes.tablename
      where indexes.schemaname = 'public'
    ),
    'policyCount', (
      select count(*) from pg_policies policies join new_tables on new_tables.table_name = policies.tablename
      where policies.schemaname = 'public'
    ),
    'forcedRlsTableCount', (
      select count(*) from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      join new_tables on new_tables.table_name = relation.relname
      where namespace.nspname = 'public' and relation.relrowsecurity and relation.relforcerowsecurity
    ),
    'missingPolicies', (select coalesce(jsonb_agg(to_jsonb(missing_policies)), '[]'::jsonb) from missing_policies),
    'missingTriggers', (select coalesce(jsonb_agg(to_jsonb(missing_triggers)), '[]'::jsonb) from missing_triggers),
    'missingFunctions', (select coalesce(jsonb_agg(to_jsonb(missing_functions)), '[]'::jsonb) from missing_functions),
    'anonOrPublicGrantCount', (
      select count(*) from new_table_acl where grantee_name in ('anon', 'PUBLIC')
    ),
    'authenticatedGrantCount', (
      select count(*) from new_table_acl where grantee_name = 'authenticated'
    ),
    'clientImmutableWriteGrantCount', (
      select count(*) from new_table_acl
      where table_name in ('attempt_revisions', 'grades', 'source_versions')
        and privilege_type in ('UPDATE', 'DELETE')
        and grantee_name in ('authenticated', 'anon', 'PUBLIC')
    ),
    'allRoleImmutableWriteGrantCount', (
      select count(*) from new_table_acl
      where table_name in ('attempt_revisions', 'grades', 'source_versions')
        and privilege_type in ('UPDATE', 'DELETE')
    ),
    'privateFunctionPublicExecuteCount', (select count(*) from private_function_public_exec),
    'noteDefault', (
      select column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'notes' and column_name = 'is_published'
    ),
    'notesAtVersionOne', (select count(*) from public.notes where content_version = 1),
    'notesOutsideVersionOne', (select count(*) from public.notes where content_version <> 1)
  ) as payload
)
select jsonb_build_object(
  'auditVersion', 1,
  'capturedAt', now(),
  'originalTables', (
    select jsonb_object_agg(table_name, jsonb_build_object('rowCount', row_count, 'checksum', checksum))
    from original_table_fingerprints
  ),
  'contentIntegrity', (select payload from content_integrity),
  'auth', (select payload from auth_fingerprint),
  'storage', (select payload from storage_fingerprint),
  'newTableRows', (
    select jsonb_object_agg(table_name, row_count) from new_table_rows
  ),
  'newSchema', (select payload from new_schema_fingerprint)
)::text as payload;
