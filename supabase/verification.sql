-- Asteroid post-migration verification.
-- Read-only: run this after all files under supabase/migrations have finished.

with expected_tables(schema_name, table_name) as (
  values
    ('public', 'notes'),
    ('public', 'chapters'),
    ('public', 'site_profile'),
    ('public', 'admin_users'),
    ('public', 'problem_practice_statuses'),
    ('public', 'math3_self_tests'),
    ('public', 'english_papers'),
    ('public', 'english_passages'),
    ('public', 'english_questions'),
    ('public', 'english_attempts'),
    ('public', 'english_attempt_answers'),
    ('public', 'english_vocabulary'),
    ('public', 'planning_task_status'),
    ('public', 'attempts'),
    ('public', 'attempt_revisions'),
    ('public', 'grades'),
    ('public', 'jobs'),
    ('public', 'job_items'),
    ('public', 'source_documents'),
    ('public', 'source_versions'),
    ('public', 'content_migration_snapshots'),
    ('public', 'math_papers'),
    ('public', 'math_paper_problems'),
    ('public', 'ocr_confirmations'),
    ('public', 'math_grade_steps'),
    ('public', 'booklets')
),
table_checks as (
  select
    'table_exists:' || schema_name || '.' || table_name as check_name,
    case when exists (
      select 1
      from information_schema.tables
      where table_schema = expected_tables.schema_name
        and table_name = expected_tables.table_name
    ) then 'pass' else 'fail' end as status,
    schema_name || '.' || table_name as details
  from expected_tables
),
expected_columns(schema_name, table_name, column_name) as (
  values
    ('public', 'problem_practice_statuses', 'is_marked'),
    ('public', 'english_papers', 'year'),
    ('public', 'english_passages', 'content'),
    ('public', 'english_questions', 'standard_answer'),
    ('public', 'english_attempts', 'user_id'),
    ('public', 'english_attempt_answers', 'is_correct'),
    ('public', 'english_vocabulary', 'part_of_speech'),
    ('public', 'english_vocabulary', 'entry_type'),
    ('public', 'english_vocabulary', 'source_excerpt'),
    ('public', 'english_vocabulary', 'source_area'),
    ('public', 'english_vocabulary', 'source_question_id'),
    ('public', 'english_vocabulary', 'source_option_label'),
    ('public', 'english_vocabulary', 'highlight_text'),
    ('public', 'english_vocabulary', 'ai_generated'),
    ('public', 'notes', 'content_version'),
    ('public', 'planning_task_status', 'status'),
    ('public', 'attempts', 'source_kind'),
    ('public', 'attempt_revisions', 'revision_no'),
    ('public', 'grades', 'origin'),
    ('public', 'jobs', 'job_class'),
    ('public', 'job_items', 'idempotency_key'),
    ('public', 'source_documents', 'current_version_id'),
    ('public', 'source_versions', 'checksum'),
    ('public', 'content_migration_snapshots', 'field_path'),
    ('public', 'content_migration_snapshots', 'before_checksum'),
    ('public', 'content_migration_snapshots', 'after_checksum'),
    ('public', 'content_migration_snapshots', 'reverts_snapshot_id'),
    ('public', 'attempts', 'math_paper_id'),
    ('public', 'grades', 'confirmation_id'),
    ('public', 'math_paper_problems', 'content_version'),
    ('public', 'math_paper_problems', 'scoring_rubric'),
    ('public', 'ocr_confirmations', 'confirmation_version'),
    ('public', 'math_grade_steps', 'deduction_reason'),
    ('public', 'booklets', 'snapshot_checksum'),
    ('public', 'booklets', 'source_refs')
),
column_checks as (
  select
    'column_exists:' || schema_name || '.' || table_name || '.' || column_name as check_name,
    case when exists (
      select 1
      from information_schema.columns
      where table_schema = expected_columns.schema_name
        and table_name = expected_columns.table_name
        and column_name = expected_columns.column_name
    ) then 'pass' else 'fail' end as status,
    schema_name || '.' || table_name || '.' || column_name as details
  from expected_columns
),
rls_checks as (
  select
    'rls_enabled:' || schema_name || '.' || table_name as check_name,
    case when c.relrowsecurity then 'pass' else 'fail' end as status,
    schema_name || '.' || table_name as details
  from expected_tables
  left join pg_namespace n on n.nspname = expected_tables.schema_name
  left join pg_class c on c.relnamespace = n.oid and c.relname = expected_tables.table_name
),
expected_policies(schema_name, table_name, policy_name) as (
  values
    ('public', 'notes', 'notes_public_select'),
    ('public', 'notes', 'notes_admin_insert'),
    ('public', 'notes', 'notes_admin_update'),
    ('public', 'notes', 'notes_admin_delete'),
    ('public', 'chapters', 'chapters_public_select'),
    ('public', 'chapters', 'chapters_admin_insert'),
    ('public', 'chapters', 'chapters_admin_update'),
    ('public', 'chapters', 'chapters_admin_delete'),
    ('public', 'site_profile', 'site_profile_public_select'),
    ('public', 'site_profile', 'site_profile_admin_update'),
    ('public', 'admin_users', 'admin_users_admin_select'),
    ('public', 'problem_practice_statuses', 'problem_practice_statuses_owner_select'),
    ('public', 'problem_practice_statuses', 'problem_practice_statuses_owner_insert'),
    ('public', 'problem_practice_statuses', 'problem_practice_statuses_owner_update'),
    ('public', 'problem_practice_statuses', 'problem_practice_statuses_owner_delete'),
    ('public', 'math3_self_tests', 'math3_self_tests_owner_select'),
    ('public', 'math3_self_tests', 'math3_self_tests_owner_insert'),
    ('public', 'math3_self_tests', 'math3_self_tests_owner_update'),
    ('public', 'math3_self_tests', 'math3_self_tests_owner_delete'),
    ('public', 'english_papers', 'english_papers_authenticated_select'),
    ('public', 'english_papers', 'english_papers_admin_insert'),
    ('public', 'english_papers', 'english_papers_admin_update'),
    ('public', 'english_papers', 'english_papers_admin_delete'),
    ('public', 'english_passages', 'english_passages_authenticated_select'),
    ('public', 'english_passages', 'english_passages_admin_insert'),
    ('public', 'english_passages', 'english_passages_admin_update'),
    ('public', 'english_passages', 'english_passages_admin_delete'),
    ('public', 'english_questions', 'english_questions_authenticated_select'),
    ('public', 'english_questions', 'english_questions_admin_insert'),
    ('public', 'english_questions', 'english_questions_admin_update'),
    ('public', 'english_questions', 'english_questions_admin_delete'),
    ('public', 'english_attempts', 'english_attempts_owner_select'),
    ('public', 'english_attempts', 'english_attempts_owner_insert'),
    ('public', 'english_attempts', 'english_attempts_owner_update'),
    ('public', 'english_attempts', 'english_attempts_owner_delete'),
    ('public', 'english_attempt_answers', 'english_attempt_answers_owner_select'),
    ('public', 'english_attempt_answers', 'english_attempt_answers_owner_insert'),
    ('public', 'english_attempt_answers', 'english_attempt_answers_owner_update'),
    ('public', 'english_attempt_answers', 'english_attempt_answers_owner_delete'),
    ('public', 'english_vocabulary', 'english_vocabulary_owner_select'),
    ('public', 'english_vocabulary', 'english_vocabulary_owner_insert'),
    ('public', 'english_vocabulary', 'english_vocabulary_owner_update'),
    ('public', 'english_vocabulary', 'english_vocabulary_owner_delete'),
    ('storage', 'objects', 'note_images_admin_select'),
    ('storage', 'objects', 'note_images_admin_insert'),
    ('storage', 'objects', 'note_images_admin_update'),
    ('storage', 'objects', 'note_images_admin_delete'),
    ('storage', 'objects', 'ocr_documents_admin_select'),
    ('storage', 'objects', 'ocr_documents_admin_insert'),
    ('storage', 'objects', 'ocr_documents_admin_update'),
    ('storage', 'objects', 'ocr_documents_admin_delete'),
    ('public', 'planning_task_status', 'planning_task_status_owner_select'),
    ('public', 'planning_task_status', 'planning_task_status_owner_insert'),
    ('public', 'planning_task_status', 'planning_task_status_owner_update'),
    ('public', 'attempts', 'attempts_owner_select'),
    ('public', 'attempts', 'attempts_owner_insert'),
    ('public', 'attempts', 'attempts_owner_update'),
    ('public', 'attempt_revisions', 'attempt_revisions_owner_select'),
    ('public', 'attempt_revisions', 'attempt_revisions_owner_insert'),
    ('public', 'grades', 'grades_owner_select'),
    ('public', 'grades', 'grades_owner_insert_user_final'),
    ('public', 'jobs', 'jobs_owner_select'),
    ('public', 'jobs', 'jobs_owner_insert'),
    ('public', 'jobs', 'jobs_owner_update'),
    ('public', 'job_items', 'job_items_owner_select'),
    ('public', 'job_items', 'job_items_owner_insert'),
    ('public', 'job_items', 'job_items_owner_update'),
    ('public', 'source_documents', 'source_documents_access_select'),
    ('public', 'source_documents', 'source_documents_access_insert'),
    ('public', 'source_documents', 'source_documents_access_update'),
    ('public', 'source_versions', 'source_versions_access_select'),
    ('public', 'source_versions', 'source_versions_access_insert'),
    ('public', 'content_migration_snapshots', 'content_migration_snapshots_admin_select'),
    ('public', 'math_papers', 'math_papers_authenticated_select'),
    ('public', 'math_papers', 'math_papers_admin_insert'),
    ('public', 'math_papers', 'math_papers_admin_update'),
    ('public', 'math_paper_problems', 'math_paper_problems_authenticated_select'),
    ('public', 'math_paper_problems', 'math_paper_problems_admin_insert'),
    ('public', 'math_paper_problems', 'math_paper_problems_admin_update'),
    ('public', 'ocr_confirmations', 'ocr_confirmations_owner_select'),
    ('public', 'math_grade_steps', 'math_grade_steps_owner_select'),
    ('public', 'booklets', 'booklets_owner_select')
),
policy_checks as (
  select
    'policy_exists:' || schema_name || '.' || table_name || '.' || policy_name as check_name,
    case when exists (
      select 1
      from pg_policies
      where schemaname = expected_policies.schema_name
        and tablename = expected_policies.table_name
        and policyname = expected_policies.policy_name
    ) then 'pass' else 'fail' end as status,
    schema_name || '.' || table_name || '.' || policy_name as details
  from expected_policies
),
boundary_grant_checks as (
  select
    'runtime_grants:admin_users_select_only' as check_name,
    case when
      has_table_privilege('authenticated', 'public.admin_users', 'select')
      and not has_table_privilege('authenticated', 'public.admin_users', 'insert')
      and not has_table_privilege('authenticated', 'public.admin_users', 'update')
      and not has_table_privilege('authenticated', 'public.admin_users', 'delete')
    then 'pass' else 'fail' end as status,
    'authenticated must have SELECT only on public.admin_users' as details
  union all
  select
    'runtime_grants:site_profile_read_update_only',
    case when
      has_table_privilege('authenticated', 'public.site_profile', 'select')
      and not has_table_privilege('authenticated', 'public.site_profile', 'insert')
      and has_table_privilege('authenticated', 'public.site_profile', 'update')
      and not has_table_privilege('authenticated', 'public.site_profile', 'delete')
    then 'pass' else 'fail' end,
    'authenticated must have SELECT/UPDATE only on public.site_profile'
  union all
  select
    'obsolete_policies:runtime_mutation_removed',
    case when not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and policyname in (
          'admin_users_admin_insert', 'admin_users_admin_update', 'admin_users_admin_delete',
          'site_profile_admin_insert', 'site_profile_admin_delete',
          'english_papers_admin_select', 'english_passages_admin_select', 'english_questions_admin_select'
        )
    ) then 'pass' else 'fail' end,
    'obsolete mutation/admin-only source-read policies must be absent'
),
expected_job_lease_functions(function_name, identity_arguments) as (
  values
    ('enqueue_job_item', 'uuid, integer, text, jsonb'),
    ('claim_next_job_item', 'uuid, text, integer'),
    ('complete_job_item', 'uuid, text, integer, jsonb'),
    ('fail_job_item', 'uuid, text, integer, text'),
    ('reset_failed_job_item', 'uuid')
),
job_lease_function_catalog as (
  select procedure.oid, procedure.proname, procedure.prosecdef, procedure.proconfig,
    pg_get_userbyid(procedure.proowner) as owner_name,
    pg_get_function_identity_arguments(procedure.oid) as identity_arguments
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  join expected_job_lease_functions expected
    on expected.function_name = procedure.proname
    and expected.identity_arguments = pg_get_function_identity_arguments(procedure.oid)
  where namespace.nspname = 'public'
),
job_lease_checks as (
  select
    'job_lease:rpcs_exist' as check_name,
    case when
      to_regprocedure('public.enqueue_job_item(uuid,integer,text,jsonb)') is not null
      and
      to_regprocedure('public.claim_next_job_item(uuid,text,integer)') is not null
      and to_regprocedure('public.complete_job_item(uuid,text,integer,jsonb)') is not null
      and to_regprocedure('public.fail_job_item(uuid,text,integer,text)') is not null
      and to_regprocedure('public.reset_failed_job_item(uuid)') is not null
    then 'pass' else 'fail' end as status,
    'enqueue, claim, complete, fail and reset RPCs must all exist' as details
  union all
  select
    'job_lease:security_definer_hardened',
    case when (
      select count(*) from job_lease_function_catalog
      where prosecdef
        and owner_name not in ('anon', 'authenticated')
        and coalesce(array_to_string(proconfig, ','), '') like '%search_path=""%'
    ) = 5 then 'pass' else 'fail' end,
    'all five RPCs must be SECURITY DEFINER with an empty search_path and a trusted owner'
  union all
  select
    'job_lease:authenticated_execute_only',
    case when
      coalesce(has_function_privilege('authenticated', to_regprocedure('public.enqueue_job_item(uuid,integer,text,jsonb)'), 'execute'), false)
      and coalesce(has_function_privilege('authenticated', to_regprocedure('public.claim_next_job_item(uuid,text,integer)'), 'execute'), false)
      and coalesce(has_function_privilege('authenticated', to_regprocedure('public.complete_job_item(uuid,text,integer,jsonb)'), 'execute'), false)
      and coalesce(has_function_privilege('authenticated', to_regprocedure('public.fail_job_item(uuid,text,integer,text)'), 'execute'), false)
      and coalesce(has_function_privilege('authenticated', to_regprocedure('public.reset_failed_job_item(uuid)'), 'execute'), false)
      and not coalesce(has_function_privilege('anon', to_regprocedure('public.enqueue_job_item(uuid,integer,text,jsonb)'), 'execute'), false)
      and not coalesce(has_function_privilege('anon', to_regprocedure('public.claim_next_job_item(uuid,text,integer)'), 'execute'), false)
      and not coalesce(has_function_privilege('anon', to_regprocedure('public.complete_job_item(uuid,text,integer,jsonb)'), 'execute'), false)
      and not coalesce(has_function_privilege('anon', to_regprocedure('public.fail_job_item(uuid,text,integer,text)'), 'execute'), false)
      and not coalesce(has_function_privilege('anon', to_regprocedure('public.reset_failed_job_item(uuid)'), 'execute'), false)
    then 'pass' else 'fail' end,
    'authenticated may execute controlled RPCs; anon/PUBLIC may not'
  union all
  select
    'job_lease:direct_item_mutation_revoked',
    case when
      not has_table_privilege('authenticated', 'public.job_items', 'insert')
      and not has_table_privilege('authenticated', 'public.job_items', 'update')
      and not exists (
        select 1 from information_schema.column_privileges
        where table_schema = 'public'
          and table_name = 'job_items'
          and grantee = 'authenticated'
          and privilege_type in ('INSERT', 'UPDATE')
      )
      then 'pass' else 'fail' end,
    'authenticated must not bypass enqueue/lease fencing with table or column INSERT/UPDATE grants'
),
expected_content_migration_functions(function_name, identity_arguments) as (
  values
    ('apply_content_migration', 'uuid, text, text, text, bigint, text, text, text, boolean, text, text, text, text, jsonb'),
    ('rollback_content_migration', 'uuid, text, bigint, jsonb')
),
content_migration_function_catalog as (
  select procedure.oid, procedure.proname, procedure.prosecdef, procedure.proconfig,
    pg_get_userbyid(procedure.proowner) as owner_name,
    pg_get_function_identity_arguments(procedure.oid) as identity_arguments
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  join expected_content_migration_functions expected
    on expected.function_name = procedure.proname
    and expected.identity_arguments = pg_get_function_identity_arguments(procedure.oid)
  where namespace.nspname = 'public'
),
content_migration_checks as (
  select
    'content_migration:rpcs_exist' as check_name,
    case when
      to_regprocedure('public.apply_content_migration(uuid,text,text,text,bigint,text,text,text,boolean,text,text,text,text,jsonb)') is not null
      and to_regprocedure('public.rollback_content_migration(uuid,text,bigint,jsonb)') is not null
    then 'pass' else 'fail' end as status,
    'checksum-gated apply and append-only rollback RPCs must both exist' as details
  union all
  select
    'content_migration:security_definer_hardened',
    case when (
      select count(*) from content_migration_function_catalog
      where prosecdef
        and owner_name not in ('anon', 'authenticated')
        and coalesce(array_to_string(proconfig, ','), '') like '%search_path=""%'
    ) = 2 then 'pass' else 'fail' end,
    'both RPCs must be SECURITY DEFINER with an empty search_path and a trusted owner'
  union all
  select
    'content_migration:authenticated_execute_only',
    case when
      coalesce(has_function_privilege('authenticated', to_regprocedure('public.apply_content_migration(uuid,text,text,text,bigint,text,text,text,boolean,text,text,text,text,jsonb)'), 'execute'), false)
      and coalesce(has_function_privilege('authenticated', to_regprocedure('public.rollback_content_migration(uuid,text,bigint,jsonb)'), 'execute'), false)
      and not coalesce(has_function_privilege('anon', to_regprocedure('public.apply_content_migration(uuid,text,text,text,bigint,text,text,text,boolean,text,text,text,text,jsonb)'), 'execute'), false)
      and not coalesce(has_function_privilege('anon', to_regprocedure('public.rollback_content_migration(uuid,text,bigint,jsonb)'), 'execute'), false)
      and not coalesce(has_function_privilege('public', to_regprocedure('public.apply_content_migration(uuid,text,text,text,bigint,text,text,text,boolean,text,text,text,text,jsonb)'), 'execute'), false)
      and not coalesce(has_function_privilege('public', to_regprocedure('public.rollback_content_migration(uuid,text,bigint,jsonb)'), 'execute'), false)
    then 'pass' else 'fail' end,
    'authenticated may execute controlled RPCs; anon/PUBLIC may not'
  union all
  select
    'content_migration:snapshots_append_only_admin_read',
    case when
      has_table_privilege('authenticated', 'public.content_migration_snapshots', 'select')
      and not has_table_privilege('authenticated', 'public.content_migration_snapshots', 'insert')
      and not has_table_privilege('authenticated', 'public.content_migration_snapshots', 'update')
      and not has_table_privilege('authenticated', 'public.content_migration_snapshots', 'delete')
      and not has_table_privilege('anon', 'public.content_migration_snapshots', 'select')
      and exists (
        select 1
        from pg_class relation
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'content_migration_snapshots'
          and relation.relrowsecurity
          and relation.relforcerowsecurity
      )
      and exists (
        select 1
        from pg_trigger trigger_row
        join pg_class relation on relation.oid = trigger_row.tgrelid
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'content_migration_snapshots'
          and trigger_row.tgname = 'reject_content_migration_snapshot_mutation'
          and not trigger_row.tgisinternal
          and trigger_row.tgenabled <> 'D'
      )
    then 'pass' else 'fail' end,
    'snapshot rows must be forced-RLS, admin-readable and immutable to runtime roles'
),
english_backfill_checks as (
  select
    'english_backfill:normalizer_hardened' as check_name,
    case when exists (
      select 1
      from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'private'
        and procedure.proname = 'normalize_english_objective_answer'
        and pg_get_function_identity_arguments(procedure.oid) = 'text'
        and procedure.provolatile = 'i'
        and procedure.proisstrict
        and coalesce(array_to_string(procedure.proconfig, ','), '') like '%search_path=""%'
        and not coalesce(has_function_privilege('anon', procedure.oid, 'execute'), false)
        and not coalesce(has_function_privilege('authenticated', procedure.oid, 'execute'), false)
    ) then 'pass' else 'fail' end as status,
    'private objective-answer normalizer must be immutable, strict, empty-search-path and inaccessible to clients' as details
  union all
  select
    'english_backfill:legacy_attempts_mapped',
    case when not exists (
      select 1
      from public.english_attempts legacy
      left join public.attempts target
        on target.id = legacy.id
        and target.user_id = legacy.user_id
        and target.source_kind = 'english_passage'
        and target.english_passage_id = legacy.passage_id
        and target.round = 1
      where target.id is null
    ) then 'pass' else 'fail' end,
    'every legacy English attempt must map losslessly to shared round 1'
  union all
  select
    'english_backfill:submitted_revision_and_legacy_grade',
    case when not exists (
      select 1
      from public.english_attempts legacy
      where legacy.status = 'submitted'
        and exists (
          select 1 from public.english_attempt_answers answer_row where answer_row.attempt_id = legacy.id
        )
        and (
          not exists (
            select 1 from public.attempt_revisions revision
            where revision.id = legacy.id
              and revision.attempt_id = legacy.id
              and revision.revision_no = 1
              and revision.kind = 'submission'
          )
          or not exists (
            select 1 from public.grades grade
            where grade.revision_id = legacy.id
              and grade.origin = 'legacy_imported'
              and grade.grade_seq = 1
          )
        )
    ) then 'pass' else 'fail' end,
    'submitted legacy answers require revision 1 plus an append-only legacy grade'
  union all
  select
    'english_backfill:objective_system_grade',
    case when not exists (
      select 1
      from public.english_attempts legacy
      join public.english_passages passage on passage.id = legacy.passage_id
      where legacy.status = 'submitted'
        and passage.section in ('reading', 'cloze', 'new_type')
        and not exists (
          select 1 from public.grades grade
          where grade.revision_id = legacy.id
            and grade.origin = 'system_scored'
            and grade.grade_seq = 1
            and grade.scoring_mode = 'objective'
        )
    ) then 'pass' else 'fail' end,
    'every submitted objective legacy attempt requires a deterministic system grade'
  union all
  select
    'english_backfill:legacy_system_score_difference_inventory',
    'pass',
    (
      select count(*)::text || ' legacy/system score difference(s), with legacy rows retained'
      from public.english_attempts legacy
      join public.grades grade
        on grade.revision_id = legacy.id
        and grade.origin = 'system_scored'
        and grade.grade_seq = 1
      where legacy.score <> grade.score or legacy.max_score <> grade.max_score
    )
),
english_command_checks as (
  select
    'english_command:rpc_hardened' as check_name,
    case when exists (
      select 1
      from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname = 'record_english_training_command'
        and pg_get_function_identity_arguments(procedure.oid) = 'uuid, smallint, text, jsonb, uuid, boolean'
        and procedure.prosecdef
        and pg_get_userbyid(procedure.proowner) not in ('anon', 'authenticated')
        and coalesce(array_to_string(procedure.proconfig, ','), '') like '%search_path=""%'
        and pg_get_functiondef(procedure.oid) like '%auth.uid()%'
        and pg_get_functiondef(procedure.oid) like '%pg_advisory_xact_lock%'
        and pg_get_functiondef(procedure.oid) like '%p_command_id%'
        and pg_get_functiondef(procedure.oid) like '%p_write_legacy%'
    ) then 'pass' else 'fail' end as status,
    'English command RPC must be trusted-owner SECURITY DEFINER with owner, lock, idempotency and compatibility gates' as details
  union all
  select
    'english_command:authenticated_execute_only',
    case when
      coalesce(has_function_privilege(
        'authenticated',
        to_regprocedure('public.record_english_training_command(uuid,smallint,text,jsonb,uuid,boolean)'),
        'execute'
      ), false)
      and not coalesce(has_function_privilege(
        'anon',
        to_regprocedure('public.record_english_training_command(uuid,smallint,text,jsonb,uuid,boolean)'),
        'execute'
      ), false)
      and not coalesce(has_function_privilege(
        'public',
        to_regprocedure('public.record_english_training_command(uuid,smallint,text,jsonb,uuid,boolean)'),
        'execute'
      ), false)
    then 'pass' else 'fail' end,
    'authenticated may execute the controlled English command; anon/PUBLIC may not'
  union all
  select
    'english_command:three_round_limit',
    case when not exists (
      select 1
      from public.attempts attempt
      where attempt.source_kind = 'english_passage'
      group by attempt.user_id, attempt.english_passage_id
      having count(*) > 3 or min(attempt.round) < 1 or max(attempt.round) > 3
    ) then 'pass' else 'fail' end,
    'each user and English passage must have at most rounds 1 through 3'
),
english_subjective_checks as (
  select
    'english_subjective:rpcs_hardened' as check_name,
    case when (
      select count(*)
      from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname in ('record_english_subjective_submission', 'confirm_english_subjective_grade')
        and procedure.prosecdef
        and pg_get_userbyid(procedure.proowner) not in ('anon', 'authenticated')
        and coalesce(array_to_string(procedure.proconfig, ','), '') like '%search_path=""%'
    ) = 2 then 'pass' else 'fail' end as status,
    'both subjective RPCs must be trusted-owner SECURITY DEFINER with an empty search_path' as details
  union all
  select
    'english_subjective:authenticated_execute_only',
    case when
      coalesce(has_function_privilege('authenticated', to_regprocedure('public.record_english_subjective_submission(uuid,smallint,jsonb,uuid,numeric,text,jsonb)'), 'execute'), false)
      and coalesce(has_function_privilege('authenticated', to_regprocedure('public.confirm_english_subjective_grade(uuid,uuid,numeric,text,jsonb,boolean)'), 'execute'), false)
      and not coalesce(has_function_privilege('anon', to_regprocedure('public.record_english_subjective_submission(uuid,smallint,jsonb,uuid,numeric,text,jsonb)'), 'execute'), false)
      and not coalesce(has_function_privilege('anon', to_regprocedure('public.confirm_english_subjective_grade(uuid,uuid,numeric,text,jsonb,boolean)'), 'execute'), false)
      and not coalesce(has_function_privilege('public', to_regprocedure('public.record_english_subjective_submission(uuid,smallint,jsonb,uuid,numeric,text,jsonb)'), 'execute'), false)
      and not coalesce(has_function_privilege('public', to_regprocedure('public.confirm_english_subjective_grade(uuid,uuid,numeric,text,jsonb,boolean)'), 'execute'), false)
    then 'pass' else 'fail' end,
    'authenticated may execute subjective RPCs; anon/PUBLIC may not'
  union all
  select
    'english_subjective:next_round_requires_formal_grade',
    case when
      to_regprocedure('private.ensure_previous_attempt_has_formal_grade()') is not null
      and exists (
        select 1
        from pg_trigger trigger_row
        join pg_class relation on relation.oid = trigger_row.tgrelid
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'attempts'
          and trigger_row.tgname = 'verify_previous_attempt_formal_grade'
          and not trigger_row.tgisinternal
          and trigger_row.tgenabled <> 'D'
      )
      and not exists (
        select 1
        from public.attempts previous
        join public.attempts next_round
          on next_round.user_id = previous.user_id
          and next_round.source_kind = previous.source_kind
          and next_round.round = previous.round + 1
          and next_round.english_passage_id is not distinct from previous.english_passage_id
          and next_round.note_id is not distinct from previous.note_id
          and next_round.problem_id is not distinct from previous.problem_id
        where previous.status in ('submitted', 'sealed')
          and not exists (
            select 1
            from public.attempt_revisions revision
            join public.grades grade on grade.revision_id = revision.id
            where revision.attempt_id = previous.id
              and grade.origin in ('system_scored', 'user_final', 'legacy_imported')
          )
      )
    then 'pass' else 'fail' end,
    'a later round may not exist when the previous round has only an AI suggestion'
),
math_core_checks as (
  select
    'math_core:rpcs_hardened' as check_name,
    case when (
      select count(*)
      from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname in (
          'start_math_paper_attempt', 'record_math_ocr_confirmation',
          'record_math_ai_grade', 'confirm_math_grade', 'list_math_papers',
          'get_math_training_state', 'get_math_grade_source',
          'create_private_booklet', 'refresh_booklet_drift'
        )
        and procedure.prosecdef
        and pg_get_userbyid(procedure.proowner) not in ('anon', 'authenticated')
        and coalesce(array_to_string(procedure.proconfig, ','), '') like '%search_path=""%'
    ) = 9 then 'pass' else 'fail' end as status,
    'all math/booklet RPCs must be trusted-owner SECURITY DEFINER with an empty search_path' as details
  union all
  select
    'math_core:authenticated_execute_only',
    case when
      coalesce(has_function_privilege('authenticated', to_regprocedure('public.start_math_paper_attempt(uuid,smallint,uuid)'), 'execute'), false)
      and coalesce(has_function_privilege('authenticated', to_regprocedure('public.record_math_ocr_confirmation(uuid,uuid,jsonb,jsonb)'), 'execute'), false)
      and coalesce(has_function_privilege('authenticated', to_regprocedure('public.record_math_ai_grade(uuid,uuid,numeric,numeric,text,jsonb,jsonb)'), 'execute'), false)
      and coalesce(has_function_privilege('authenticated', to_regprocedure('public.confirm_math_grade(uuid,uuid,numeric,text,jsonb,jsonb)'), 'execute'), false)
      and coalesce(has_function_privilege('authenticated', to_regprocedure('public.create_private_booklet(uuid,text,text,jsonb,text,text,boolean)'), 'execute'), false)
      and not coalesce(has_function_privilege('anon', to_regprocedure('public.start_math_paper_attempt(uuid,smallint,uuid)'), 'execute'), false)
      and not coalesce(has_function_privilege('anon', to_regprocedure('public.record_math_ocr_confirmation(uuid,uuid,jsonb,jsonb)'), 'execute'), false)
      and not coalesce(has_function_privilege('anon', to_regprocedure('public.record_math_ai_grade(uuid,uuid,numeric,numeric,text,jsonb,jsonb)'), 'execute'), false)
      and not coalesce(has_function_privilege('anon', to_regprocedure('public.confirm_math_grade(uuid,uuid,numeric,text,jsonb,jsonb)'), 'execute'), false)
      and not coalesce(has_function_privilege('anon', to_regprocedure('public.create_private_booklet(uuid,text,text,jsonb,text,text,boolean)'), 'execute'), false)
      and not coalesce(has_function_privilege('public', to_regprocedure('public.start_math_paper_attempt(uuid,smallint,uuid)'), 'execute'), false)
      and not coalesce(has_function_privilege('public', to_regprocedure('public.record_math_ocr_confirmation(uuid,uuid,jsonb,jsonb)'), 'execute'), false)
      and not coalesce(has_function_privilege('public', to_regprocedure('public.record_math_ai_grade(uuid,uuid,numeric,numeric,text,jsonb,jsonb)'), 'execute'), false)
      and not coalesce(has_function_privilege('public', to_regprocedure('public.confirm_math_grade(uuid,uuid,numeric,text,jsonb,jsonb)'), 'execute'), false)
      and not coalesce(has_function_privilege('public', to_regprocedure('public.create_private_booklet(uuid,text,text,jsonb,text,text,boolean)'), 'execute'), false)
    then 'pass' else 'fail' end,
    'authenticated may execute controlled commands; anon/PUBLIC may not'
  union all
  select
    'math_core:append_only_direct_writes_revoked',
    case when
      has_table_privilege('authenticated', 'public.ocr_confirmations', 'select')
      and not has_table_privilege('authenticated', 'public.ocr_confirmations', 'insert')
      and not has_table_privilege('authenticated', 'public.ocr_confirmations', 'update')
      and not has_table_privilege('authenticated', 'public.ocr_confirmations', 'delete')
      and has_table_privilege('authenticated', 'public.math_grade_steps', 'select')
      and not has_table_privilege('authenticated', 'public.math_grade_steps', 'insert')
      and not has_table_privilege('authenticated', 'public.math_grade_steps', 'update')
      and not has_table_privilege('authenticated', 'public.math_grade_steps', 'delete')
      and has_table_privilege('authenticated', 'public.booklets', 'select')
      and not has_table_privilege('authenticated', 'public.booklets', 'insert')
      and not has_table_privilege('authenticated', 'public.booklets', 'update')
      and not has_table_privilege('authenticated', 'public.booklets', 'delete')
    then 'pass' else 'fail' end,
    'confirmation, grade-step, and booklet metadata writes must go through controlled RPCs'
  union all
  select
    'math_core:grade_confirmation_integrity',
    case when not exists (
      select 1
      from public.grades grade
      join public.attempt_revisions revision on revision.id = grade.revision_id
      left join public.ocr_confirmations confirmation on confirmation.id = grade.confirmation_id
      where grade.scoring_mode = 'math'
        and (
          confirmation.id is null
          or confirmation.revision_id <> revision.id
          or confirmation.attempt_id <> revision.attempt_id
        )
    ) then 'pass' else 'fail' end,
    'every math grade must bind the matching immutable confirmation and revision'
  union all
  select
    'math_core:next_round_requires_latest_user_final',
    case when not exists (
      select 1
      from public.attempts previous
      join public.attempts next_round
        on next_round.user_id = previous.user_id
        and next_round.source_kind = 'math_paper'
        and next_round.math_paper_id = previous.math_paper_id
        and next_round.round = previous.round + 1
      where previous.source_kind = 'math_paper'
        and not exists (
          select 1
          from public.ocr_confirmations confirmation
          join public.grades grade
            on grade.confirmation_id = confirmation.id
            and grade.revision_id = confirmation.revision_id
            and grade.origin = 'user_final'
          where confirmation.attempt_id = previous.id
            and confirmation.confirmation_version = (
              select max(candidate.confirmation_version)
              from public.ocr_confirmations candidate where candidate.attempt_id = previous.id
            )
        )
    ) then 'pass' else 'fail' end,
    'a later math round requires user_final on the latest OCR confirmation'
  union all
  select
    'math_core:booklet_single_body_source',
    case when
      not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'booklets' and column_name in ('content', 'body', 'markdown')
      )
      and not exists (
        select 1
        from public.booklets booklet
        join public.notes note on note.id = booklet.note_id
        where note.is_published or booklet.snapshot_checksum !~ '^[0-9a-f]{64}$'
      )
    then 'pass' else 'fail' end,
    'booklets stores metadata only; its linked note must remain private and checksum-addressed'
),
expected_buckets(bucket_id, is_public, details) as (
  values
    ('note-images', true, 'note-images must exist and stay public for image URLs'),
    ('ocr-documents', false, 'ocr-documents must stay private for lecture PDFs and problem OCR source images')
),
bucket_checks as (
  select
    'storage_bucket:' || bucket_id as check_name,
    case when exists (
      select 1
      from storage.buckets
      where id = expected_buckets.bucket_id
        and public = expected_buckets.is_public
    ) then 'pass' else 'fail' end as status,
    details
  from expected_buckets
),
bucket_config_checks as (
  select
    'storage_bucket_config:ocr-documents' as check_name,
    case when exists (
      select 1
      from storage.buckets
      where id = 'ocr-documents'
        and name = 'ocr-documents'
        and public = false
        and file_size_limit = 52428800
        and allowed_mime_types @> array[
          'application/pdf',
          'image/jpeg',
          'image/png',
          'image/webp'
        ]::text[]
    ) then 'pass' else 'fail' end as status,
    'private 50 MiB OCR bucket must accept PDF, JPEG, PNG and WebP without exposing object contents' as details
),
admin_email_rows as (
  select
    'admin_email_auth_match:' || au.email as check_name,
    case when u.id is not null then 'pass' else 'fail' end as status,
    coalesce(u.id::text, 'no matching auth.users email') as details
  from public.admin_users au
  left join auth.users u on lower(u.email) = lower(au.email)
),
admin_email_summary as (
  select
    'admin_email_configured' as check_name,
    case when count(*) > 0 then 'pass' else 'warn' end as status,
    count(*)::text || ' admin_users row(s)' as details
  from public.admin_users
),
all_checks as (
  select check_name, status, details from table_checks
  union all
  select check_name, status, details from column_checks
  union all
  select check_name, status, details from rls_checks
  union all
  select check_name, status, details from policy_checks
  union all
  select check_name, status, details from boundary_grant_checks
  union all
  select check_name, status, details from job_lease_checks
  union all
  select check_name, status, details from content_migration_checks
  union all
  select check_name, status, details from english_backfill_checks
  union all
  select check_name, status, details from english_command_checks
  union all
  select check_name, status, details from english_subjective_checks
  union all
  select check_name, status, details from math_core_checks
  union all
  select check_name, status, details from bucket_checks
  union all
  select check_name, status, details from bucket_config_checks
  union all
  select check_name, status, details from admin_email_rows
  union all
  select check_name, status, details from admin_email_summary
)
select check_name, status, details
from all_checks
order by
  case status
    when 'fail' then 1
    when 'warn' then 2
    else 3
  end,
  check_name;
