\set ON_ERROR_STOP on

-- AST-WP1 production gate snapshot.
-- Read-only and free of note bodies, answers, credentials, emails, and user IDs.

begin transaction read only;

with planning_checks as (
  select
    to_regclass('public.planning_task_status') is not null as table_ready,
    (
      (select count(*) = 5
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'planning_task_status')
      and
      (select count(*) = 5
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'planning_task_status'
         and (
           (column_name = 'user_id' and data_type = 'uuid' and is_nullable = 'NO')
           or (column_name = 'task_id' and data_type = 'text' and is_nullable = 'NO')
           or (
             column_name = 'status'
             and data_type = 'text'
             and is_nullable = 'NO'
             and position('not_started' in coalesce(column_default, '')) > 0
           )
           or (
             column_name = 'created_at'
             and data_type = 'timestamp with time zone'
             and is_nullable = 'NO'
             and position('now()' in coalesce(column_default, '')) > 0
           )
           or (
             column_name = 'updated_at'
             and data_type = 'timestamp with time zone'
             and is_nullable = 'NO'
             and position('now()' in coalesce(column_default, '')) > 0
           )
         ))
    ) as columns_ready,
    (
      select count(*) = 4
      from pg_constraint constraint_row
      join pg_class relation on relation.oid = constraint_row.conrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = 'planning_task_status'
        and (
          (constraint_row.conname = 'planning_task_status_pkey' and constraint_row.contype = 'p')
          or (constraint_row.conname = 'planning_task_status_user_id_fkey' and constraint_row.contype = 'f')
          or (constraint_row.conname = 'planning_task_status_task_id_nonempty' and constraint_row.contype = 'c')
          or (constraint_row.conname = 'planning_task_status_status_check' and constraint_row.contype = 'c')
        )
    ) as constraints_ready,
    exists (
      select 1
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = 'planning_task_status'
        and relation.relkind = 'r'
        and relation.relrowsecurity
        and relation.relforcerowsecurity
    ) as rls_ready,
    exists (
      select 1 from pg_trigger trigger_row
      join pg_class relation on relation.oid = trigger_row.tgrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = 'planning_task_status'
        and trigger_row.tgname = 'set_planning_task_status_updated_at'
        and not trigger_row.tgisinternal
        and trigger_row.tgenabled <> 'D'
    ) as trigger_ready,
    (
      (select count(*) = 3
       from pg_policies
       where schemaname = 'public'
         and tablename = 'planning_task_status')
      and
      (select count(*) = 3
       from pg_policies
       where schemaname = 'public'
         and tablename = 'planning_task_status'
         and roles = array['authenticated']::name[]
         and (
           (policyname = 'planning_task_status_owner_select' and cmd = 'SELECT')
           or (policyname = 'planning_task_status_owner_insert' and cmd = 'INSERT')
           or (policyname = 'planning_task_status_owner_update' and cmd = 'UPDATE')
         ))
    ) as policies_ready,
    case
      when to_regclass('public.planning_task_status') is null then false
      else
        has_table_privilege('authenticated', 'public.planning_task_status', 'select')
        and has_table_privilege('authenticated', 'public.planning_task_status', 'insert')
        and has_table_privilege('authenticated', 'public.planning_task_status', 'update')
        and not has_table_privilege('authenticated', 'public.planning_task_status', 'delete')
        and not has_table_privilege('anon', 'public.planning_task_status', 'select')
        and not has_table_privilege('anon', 'public.planning_task_status', 'insert')
        and not has_table_privilege('anon', 'public.planning_task_status', 'update')
        and not has_table_privilege('anon', 'public.planning_task_status', 'delete')
    end as permissions_ready
), training_tables(table_name, expected_column_count) as (
  values
    ('attempts', 17::bigint),
    ('attempt_revisions', 7::bigint),
    ('grades', 10::bigint)
), training_constraints(table_name, constraint_name, constraint_type) as (
  values
    ('attempts', 'attempts_pkey', 'p'::char),
    ('attempts', 'attempts_user_id_fkey', 'f'::char),
    ('attempts', 'attempts_english_passage_id_fkey', 'f'::char),
    ('attempts', 'attempts_note_id_fkey', 'f'::char),
    ('attempts', 'attempts_source_kind_check', 'c'::char),
    ('attempts', 'attempts_round_check', 'c'::char),
    ('attempts', 'attempts_status_check', 'c'::char),
    ('attempts', 'attempts_source_shape_check', 'c'::char),
    ('attempts', 'attempts_abandon_reason_check', 'c'::char),
    ('attempt_revisions', 'attempt_revisions_pkey', 'p'::char),
    ('attempt_revisions', 'attempt_revisions_attempt_id_fkey', 'f'::char),
    ('attempt_revisions', 'attempt_revisions_revision_no_check', 'c'::char),
    ('attempt_revisions', 'attempt_revisions_kind_check', 'c'::char),
    ('attempt_revisions', 'attempt_revisions_attempt_revision_key', 'u'::char),
    ('grades', 'grades_pkey', 'p'::char),
    ('grades', 'grades_revision_id_fkey', 'f'::char),
    ('grades', 'grades_origin_check', 'c'::char),
    ('grades', 'grades_scoring_mode_check', 'c'::char),
    ('grades', 'grades_origin_mode_check', 'c'::char),
    ('grades', 'grades_grade_seq_check', 'c'::char),
    ('grades', 'grades_score_range_check', 'c'::char),
    ('grades', 'grades_revision_origin_seq_key', 'u'::char)
), training_indexes(table_name, index_name) as (
  values
    ('attempts', 'attempts_pkey'),
    ('attempts', 'attempts_unique_english_round'),
    ('attempts', 'attempts_unique_note_problem_round'),
    ('attempts', 'attempts_user_updated_at_idx'),
    ('attempt_revisions', 'attempt_revisions_pkey'),
    ('attempt_revisions', 'attempt_revisions_attempt_revision_key'),
    ('attempt_revisions', 'attempt_revisions_attempt_created_idx'),
    ('grades', 'grades_pkey'),
    ('grades', 'grades_revision_origin_seq_key'),
    ('grades', 'grades_revision_created_idx')
), training_policies(table_name, policy_name, policy_command) as (
  values
    ('attempts', 'attempts_owner_select', 'SELECT'),
    ('attempts', 'attempts_owner_insert', 'INSERT'),
    ('attempts', 'attempts_owner_update', 'UPDATE'),
    ('attempt_revisions', 'attempt_revisions_owner_select', 'SELECT'),
    ('attempt_revisions', 'attempt_revisions_owner_insert', 'INSERT'),
    ('grades', 'grades_owner_select', 'SELECT'),
    ('grades', 'grades_owner_insert_user_final', 'INSERT')
), training_triggers(table_name, trigger_name) as (
  values
    ('attempts', 'enforce_attempt_lifecycle'),
    ('attempts', 'set_attempts_updated_at'),
    ('attempt_revisions', 'enforce_attempt_revision_append'),
    ('attempt_revisions', 'reject_attempt_revision_mutation'),
    ('grades', 'enforce_grade_append'),
    ('grades', 'reject_grade_mutation')
), training_functions(function_name) as (
  values
    ('enforce_attempt_revision_append'),
    ('enforce_grade_append'),
    ('reject_immutable_event_mutation'),
    ('enforce_attempt_lifecycle')
), training_checks as (
  select
    (
      select count(*) = 3
      from information_schema.tables
      join training_tables on training_tables.table_name = tables.table_name
      where tables.table_schema = 'public'
        and tables.table_type = 'BASE TABLE'
    ) as tables_ready,
    not exists (
      select 1
      from training_tables expected
      where (
        select count(*)
        from information_schema.columns
        where table_schema = 'public'
          and table_name = expected.table_name
      ) <> expected.expected_column_count
    ) as columns_ready,
    (
      (select count(*) = 22
       from pg_constraint constraint_row
       join pg_class relation on relation.oid = constraint_row.conrelid
       join pg_namespace namespace on namespace.oid = relation.relnamespace
       join training_tables on training_tables.table_name = relation.relname
       where namespace.nspname = 'public')
      and
      (select count(*) = 22
       from training_constraints expected
       join pg_class relation on relation.relname = expected.table_name
       join pg_namespace namespace on namespace.oid = relation.relnamespace
         and namespace.nspname = 'public'
       join pg_constraint constraint_row on constraint_row.conrelid = relation.oid
         and constraint_row.conname = expected.constraint_name
         and constraint_row.contype::text = expected.constraint_type::text)
    ) as constraints_ready,
    (
      (select count(*) = 10
       from pg_indexes indexes
       join training_tables on training_tables.table_name = indexes.tablename
       where indexes.schemaname = 'public')
      and
      (select count(*) = 10
       from training_indexes expected
       join pg_indexes indexes on indexes.schemaname = 'public'
         and indexes.tablename = expected.table_name
         and indexes.indexname = expected.index_name)
    ) as indexes_ready,
    (
      select count(*) = 3
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      join training_tables on training_tables.table_name = relation.relname
      where namespace.nspname = 'public'
        and relation.relkind = 'r'
        and relation.relrowsecurity
        and relation.relforcerowsecurity
    ) as rls_ready,
    (
      (select count(*) = 6
       from pg_trigger trigger_row
       join pg_class relation on relation.oid = trigger_row.tgrelid
       join pg_namespace namespace on namespace.oid = relation.relnamespace
       join training_tables on training_tables.table_name = relation.relname
       where namespace.nspname = 'public'
         and not trigger_row.tgisinternal)
      and
      (select count(*) = 6
       from training_triggers expected
       join pg_class relation on relation.relname = expected.table_name
       join pg_namespace namespace on namespace.oid = relation.relnamespace
         and namespace.nspname = 'public'
       join pg_trigger trigger_row on trigger_row.tgrelid = relation.oid
         and trigger_row.tgname = expected.trigger_name
         and not trigger_row.tgisinternal
         and trigger_row.tgenabled <> 'D')
    ) as triggers_ready,
    (
      (select count(*) = 7
       from pg_policies policies
       join training_tables on training_tables.table_name = policies.tablename
       where policies.schemaname = 'public')
      and
      (select count(*) = 7
       from training_policies expected
       join pg_policies policies on policies.schemaname = 'public'
         and policies.tablename = expected.table_name
         and policies.policyname = expected.policy_name
         and policies.cmd = expected.policy_command
         and policies.roles = array['authenticated']::name[])
    ) as policies_ready,
    (
      (select count(*) = 4
       from pg_proc procedure
       join pg_namespace namespace on namespace.oid = procedure.pronamespace
       join training_functions on training_functions.function_name = procedure.proname
       where namespace.nspname = 'private'
         and not procedure.prosecdef)
      and not exists (
        select 1
        from pg_proc procedure
        join pg_namespace namespace on namespace.oid = procedure.pronamespace
        join training_functions on training_functions.function_name = procedure.proname
        cross join lateral aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) grants
        where namespace.nspname = 'private'
          and grants.grantee = 0
          and grants.privilege_type = 'EXECUTE'
      )
    ) as functions_ready,
    case
      when (
        select count(*) = 3
        from information_schema.tables
        join training_tables on training_tables.table_name = tables.table_name
        where tables.table_schema = 'public'
          and tables.table_type = 'BASE TABLE'
      ) is false then false
      else
        has_table_privilege('authenticated', 'public.attempts', 'select')
        and has_table_privilege('authenticated', 'public.attempts', 'insert')
        and has_table_privilege('authenticated', 'public.attempts', 'update')
        and not has_table_privilege('authenticated', 'public.attempts', 'delete')
        and has_table_privilege('authenticated', 'public.attempt_revisions', 'select')
        and has_table_privilege('authenticated', 'public.attempt_revisions', 'insert')
        and not has_table_privilege('authenticated', 'public.attempt_revisions', 'update')
        and not has_table_privilege('authenticated', 'public.attempt_revisions', 'delete')
        and has_table_privilege('authenticated', 'public.grades', 'select')
        and has_table_privilege('authenticated', 'public.grades', 'insert')
        and not has_table_privilege('authenticated', 'public.grades', 'update')
        and not has_table_privilege('authenticated', 'public.grades', 'delete')
        and not has_table_privilege('anon', 'public.attempts', 'select')
        and not has_table_privilege('anon', 'public.attempts', 'insert')
        and not has_table_privilege('anon', 'public.attempts', 'update')
        and not has_table_privilege('anon', 'public.attempts', 'delete')
        and not has_table_privilege('anon', 'public.attempt_revisions', 'select')
        and not has_table_privilege('anon', 'public.attempt_revisions', 'insert')
        and not has_table_privilege('anon', 'public.attempt_revisions', 'update')
        and not has_table_privilege('anon', 'public.attempt_revisions', 'delete')
        and not has_table_privilege('anon', 'public.grades', 'select')
        and not has_table_privilege('anon', 'public.grades', 'insert')
        and not has_table_privilege('anon', 'public.grades', 'update')
        and not has_table_privilege('anon', 'public.grades', 'delete')
    end as permissions_ready
), job_source_tables(table_name, expected_column_count) as (
  values
    ('jobs', 21::bigint),
    ('job_items', 13::bigint),
    ('source_documents', 13::bigint),
    ('source_versions', 10::bigint)
), job_source_constraints(table_name, constraint_name, constraint_type) as (
  values
    ('jobs', 'jobs_pkey', 'p'::char),
    ('jobs', 'jobs_user_id_fkey', 'f'::char),
    ('jobs', 'jobs_class_check', 'c'::char),
    ('jobs', 'jobs_status_check', 'c'::char),
    ('jobs', 'jobs_kind_nonempty', 'c'::char),
    ('jobs', 'jobs_title_nonempty', 'c'::char),
    ('jobs', 'jobs_progress_check', 'c'::char),
    ('jobs', 'jobs_external_identity_shape_check', 'c'::char),
    ('jobs', 'jobs_source_storage_shape_check', 'c'::char),
    ('job_items', 'job_items_pkey', 'p'::char),
    ('job_items', 'job_items_job_id_fkey', 'f'::char),
    ('job_items', 'job_items_ordinal_check', 'c'::char),
    ('job_items', 'job_items_idempotency_key_nonempty', 'c'::char),
    ('job_items', 'job_items_status_check', 'c'::char),
    ('job_items', 'job_items_attempt_count_check', 'c'::char),
    ('job_items', 'job_items_lease_shape_check', 'c'::char),
    ('job_items', 'job_items_job_ordinal_key', 'u'::char),
    ('job_items', 'job_items_job_idempotency_key', 'u'::char),
    ('source_documents', 'source_documents_pkey', 'p'::char),
    ('source_documents', 'source_documents_user_id_fkey', 'f'::char),
    ('source_documents', 'source_documents_note_id_fkey', 'f'::char),
    ('source_documents', 'source_documents_ownership_check', 'c'::char),
    ('source_documents', 'source_documents_kind_check', 'c'::char),
    ('source_documents', 'source_documents_name_nonempty', 'c'::char),
    ('source_documents', 'source_documents_shape_check', 'c'::char),
    ('source_documents', 'source_documents_current_version_fkey', 'f'::char),
    ('source_versions', 'source_versions_pkey', 'p'::char),
    ('source_versions', 'source_versions_source_document_id_fkey', 'f'::char),
    ('source_versions', 'source_versions_version_no_check', 'c'::char),
    ('source_versions', 'source_versions_checksum_check', 'c'::char),
    ('source_versions', 'source_versions_note_content_version_check', 'c'::char),
    ('source_versions', 'source_versions_document_version_key', 'u'::char),
    ('source_versions', 'source_versions_document_checksum_key', 'u'::char),
    ('source_versions', 'source_versions_document_id_id_key', 'u'::char)
), job_source_indexes(table_name, index_name) as (
  values
    ('jobs', 'jobs_pkey'),
    ('jobs', 'jobs_external_identity_key'),
    ('jobs', 'jobs_user_status_updated_idx'),
    ('job_items', 'job_items_pkey'),
    ('job_items', 'job_items_job_ordinal_key'),
    ('job_items', 'job_items_job_idempotency_key'),
    ('job_items', 'job_items_claim_idx'),
    ('source_documents', 'source_documents_pkey'),
    ('source_documents', 'source_documents_note_key'),
    ('source_documents', 'source_documents_personal_upload_key'),
    ('source_versions', 'source_versions_pkey'),
    ('source_versions', 'source_versions_document_version_key'),
    ('source_versions', 'source_versions_document_checksum_key'),
    ('source_versions', 'source_versions_document_id_id_key'),
    ('source_versions', 'source_versions_document_captured_idx')
), job_source_policies(table_name, policy_name, policy_command) as (
  values
    ('jobs', 'jobs_owner_select', 'SELECT'),
    ('jobs', 'jobs_owner_insert', 'INSERT'),
    ('jobs', 'jobs_owner_update', 'UPDATE'),
    ('job_items', 'job_items_owner_select', 'SELECT'),
    ('job_items', 'job_items_owner_insert', 'INSERT'),
    ('job_items', 'job_items_owner_update', 'UPDATE'),
    ('source_documents', 'source_documents_access_select', 'SELECT'),
    ('source_documents', 'source_documents_access_insert', 'INSERT'),
    ('source_documents', 'source_documents_access_update', 'UPDATE'),
    ('source_versions', 'source_versions_access_select', 'SELECT'),
    ('source_versions', 'source_versions_access_insert', 'INSERT')
), job_source_triggers(table_name, trigger_name) as (
  values
    ('jobs', 'set_jobs_updated_at'),
    ('job_items', 'set_job_items_updated_at'),
    ('source_documents', 'enforce_source_document_identity'),
    ('source_documents', 'set_source_documents_updated_at'),
    ('source_versions', 'enforce_source_version_append'),
    ('source_versions', 'reject_source_version_mutation')
), job_source_functions(function_name) as (
  values
    ('enforce_source_version_append'),
    ('enforce_source_document_identity')
), job_source_checks as (
  select
    (
      select count(*) = 4
      from information_schema.tables
      join job_source_tables on job_source_tables.table_name = tables.table_name
      where tables.table_schema = 'public'
        and tables.table_type = 'BASE TABLE'
    ) as tables_ready,
    not exists (
      select 1
      from job_source_tables expected
      where (
        select count(*)
        from information_schema.columns
        where table_schema = 'public'
          and table_name = expected.table_name
      ) <> expected.expected_column_count
    ) as columns_ready,
    (
      (select count(*) = 34
       from pg_constraint constraint_row
       join pg_class relation on relation.oid = constraint_row.conrelid
       join pg_namespace namespace on namespace.oid = relation.relnamespace
       join job_source_tables on job_source_tables.table_name = relation.relname
       where namespace.nspname = 'public')
      and
      (select count(*) = 34
       from job_source_constraints expected
       join pg_class relation on relation.relname = expected.table_name
       join pg_namespace namespace on namespace.oid = relation.relnamespace
         and namespace.nspname = 'public'
       join pg_constraint constraint_row on constraint_row.conrelid = relation.oid
         and constraint_row.conname = expected.constraint_name
         and constraint_row.contype::text = expected.constraint_type::text)
      and exists (
        select 1
        from pg_constraint constraint_row
        join pg_class relation on relation.oid = constraint_row.conrelid
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'source_documents'
          and constraint_row.conname = 'source_documents_current_version_fkey'
          and constraint_row.condeferrable
          and constraint_row.condeferred
      )
    ) as constraints_ready,
    (
      (select count(*) = 15
       from pg_indexes indexes
       join job_source_tables on job_source_tables.table_name = indexes.tablename
       where indexes.schemaname = 'public')
      and
      (select count(*) = 15
       from job_source_indexes expected
       join pg_indexes indexes on indexes.schemaname = 'public'
         and indexes.tablename = expected.table_name
         and indexes.indexname = expected.index_name)
    ) as indexes_ready,
    (
      select count(*) = 4
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      join job_source_tables on job_source_tables.table_name = relation.relname
      where namespace.nspname = 'public'
        and relation.relkind = 'r'
        and relation.relrowsecurity
        and relation.relforcerowsecurity
    ) as rls_ready,
    (
      (select count(*) = 6
       from pg_trigger trigger_row
       join pg_class relation on relation.oid = trigger_row.tgrelid
       join pg_namespace namespace on namespace.oid = relation.relnamespace
       join job_source_tables on job_source_tables.table_name = relation.relname
       where namespace.nspname = 'public'
         and not trigger_row.tgisinternal)
      and
      (select count(*) = 6
       from job_source_triggers expected
       join pg_class relation on relation.relname = expected.table_name
       join pg_namespace namespace on namespace.oid = relation.relnamespace
         and namespace.nspname = 'public'
       join pg_trigger trigger_row on trigger_row.tgrelid = relation.oid
         and trigger_row.tgname = expected.trigger_name
         and not trigger_row.tgisinternal
         and trigger_row.tgenabled <> 'D')
    ) as triggers_ready,
    (
      (select count(*) = 11
       from pg_policies policies
       join job_source_tables on job_source_tables.table_name = policies.tablename
       where policies.schemaname = 'public')
      and
      (select count(*) = 11
       from job_source_policies expected
       join pg_policies policies on policies.schemaname = 'public'
         and policies.tablename = expected.table_name
         and policies.policyname = expected.policy_name
         and policies.cmd = expected.policy_command
         and policies.roles = array['authenticated']::name[])
    ) as policies_ready,
    (
      (select count(*) = 2
       from pg_proc procedure
       join pg_namespace namespace on namespace.oid = procedure.pronamespace
       join job_source_functions on job_source_functions.function_name = procedure.proname
       where namespace.nspname = 'private'
         and not procedure.prosecdef)
      and not exists (
        select 1
        from pg_proc procedure
        join pg_namespace namespace on namespace.oid = procedure.pronamespace
        join job_source_functions on job_source_functions.function_name = procedure.proname
        cross join lateral aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) grants
        where namespace.nspname = 'private'
          and grants.grantee = 0
          and grants.privilege_type = 'EXECUTE'
      )
    ) as functions_ready,
    case
      when (
        select count(*) = 4
        from information_schema.tables
        join job_source_tables on job_source_tables.table_name = tables.table_name
        where tables.table_schema = 'public'
          and tables.table_type = 'BASE TABLE'
      ) is false then false
      else
        has_table_privilege('authenticated', 'public.jobs', 'select')
        and has_table_privilege('authenticated', 'public.jobs', 'insert')
        and has_table_privilege('authenticated', 'public.jobs', 'update')
        and not has_table_privilege('authenticated', 'public.jobs', 'delete')
        and has_table_privilege('authenticated', 'public.job_items', 'select')
        and has_table_privilege('authenticated', 'public.job_items', 'insert')
        and has_table_privilege('authenticated', 'public.job_items', 'update')
        and not has_table_privilege('authenticated', 'public.job_items', 'delete')
        and has_table_privilege('authenticated', 'public.source_documents', 'select')
        and has_table_privilege('authenticated', 'public.source_documents', 'insert')
        and has_table_privilege('authenticated', 'public.source_documents', 'update')
        and not has_table_privilege('authenticated', 'public.source_documents', 'delete')
        and has_table_privilege('authenticated', 'public.source_versions', 'select')
        and has_table_privilege('authenticated', 'public.source_versions', 'insert')
        and not has_table_privilege('authenticated', 'public.source_versions', 'update')
        and not has_table_privilege('authenticated', 'public.source_versions', 'delete')
        and not has_table_privilege('anon', 'public.jobs', 'select')
        and not has_table_privilege('anon', 'public.jobs', 'insert')
        and not has_table_privilege('anon', 'public.jobs', 'update')
        and not has_table_privilege('anon', 'public.jobs', 'delete')
        and not has_table_privilege('anon', 'public.job_items', 'select')
        and not has_table_privilege('anon', 'public.job_items', 'insert')
        and not has_table_privilege('anon', 'public.job_items', 'update')
        and not has_table_privilege('anon', 'public.job_items', 'delete')
        and not has_table_privilege('anon', 'public.source_documents', 'select')
        and not has_table_privilege('anon', 'public.source_documents', 'insert')
        and not has_table_privilege('anon', 'public.source_documents', 'update')
        and not has_table_privilege('anon', 'public.source_documents', 'delete')
        and not has_table_privilege('anon', 'public.source_versions', 'select')
        and not has_table_privilege('anon', 'public.source_versions', 'insert')
        and not has_table_privilege('anon', 'public.source_versions', 'update')
        and not has_table_privilege('anon', 'public.source_versions', 'delete')
    end as permissions_ready
), boundary_tables(table_name) as (
  values
    ('admin_users'),
    ('site_profile'),
    ('english_papers'),
    ('english_passages'),
    ('english_questions'),
    ('problem_practice_statuses')
), boundary_policies(table_name, policy_name, policy_command, policy_roles) as (
  values
    ('admin_users', 'admin_users_admin_select', 'SELECT', array['authenticated']::name[]),
    ('site_profile', 'site_profile_public_select', 'SELECT', array['anon', 'authenticated']::name[]),
    ('site_profile', 'site_profile_admin_update', 'UPDATE', array['authenticated']::name[]),
    ('english_papers', 'english_papers_authenticated_select', 'SELECT', array['authenticated']::name[]),
    ('english_papers', 'english_papers_admin_insert', 'INSERT', array['authenticated']::name[]),
    ('english_papers', 'english_papers_admin_update', 'UPDATE', array['authenticated']::name[]),
    ('english_papers', 'english_papers_admin_delete', 'DELETE', array['authenticated']::name[]),
    ('english_passages', 'english_passages_authenticated_select', 'SELECT', array['authenticated']::name[]),
    ('english_passages', 'english_passages_admin_insert', 'INSERT', array['authenticated']::name[]),
    ('english_passages', 'english_passages_admin_update', 'UPDATE', array['authenticated']::name[]),
    ('english_passages', 'english_passages_admin_delete', 'DELETE', array['authenticated']::name[]),
    ('english_questions', 'english_questions_authenticated_select', 'SELECT', array['authenticated']::name[]),
    ('english_questions', 'english_questions_admin_insert', 'INSERT', array['authenticated']::name[]),
    ('english_questions', 'english_questions_admin_update', 'UPDATE', array['authenticated']::name[]),
    ('english_questions', 'english_questions_admin_delete', 'DELETE', array['authenticated']::name[]),
    ('problem_practice_statuses', 'problem_practice_statuses_owner_select', 'SELECT', array['authenticated']::name[]),
    ('problem_practice_statuses', 'problem_practice_statuses_owner_insert', 'INSERT', array['authenticated']::name[]),
    ('problem_practice_statuses', 'problem_practice_statuses_owner_update', 'UPDATE', array['authenticated']::name[]),
    ('problem_practice_statuses', 'problem_practice_statuses_owner_delete', 'DELETE', array['authenticated']::name[])
), boundary_checks as (
  select
    (
      select count(*) = 6
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      join boundary_tables on boundary_tables.table_name = relation.relname
      where namespace.nspname = 'public'
        and relation.relkind = 'r'
        and relation.relrowsecurity
    ) as rls_ready,
    (
      (select count(*) = 19
       from pg_policies policies
       join boundary_tables on boundary_tables.table_name = policies.tablename
       where policies.schemaname = 'public')
      and
      (select count(*) = 19
       from boundary_policies expected
       join pg_policies policies on policies.schemaname = 'public'
         and policies.tablename = expected.table_name
         and policies.policyname = expected.policy_name
         and policies.cmd = expected.policy_command
         and policies.roles @> expected.policy_roles
         and policies.roles <@ expected.policy_roles)
    ) as policies_ready,
    (
      exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'admin_users'
          and policyname = 'admin_users_admin_select'
          and position('auth.jwt' in lower(coalesce(qual, ''))) > 0
          and position('email' in lower(coalesce(qual, ''))) > 0
          and position('current_user_is_admin' in lower(coalesce(qual, ''))) > 0
      )
      and exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'site_profile'
          and policyname = 'site_profile_admin_update'
          and position('main' in lower(coalesce(qual, ''))) > 0
          and position('current_user_is_admin' in lower(coalesce(qual, ''))) > 0
          and position('main' in lower(coalesce(with_check, ''))) > 0
          and position('current_user_is_admin' in lower(coalesce(with_check, ''))) > 0
      )
      and (
        select count(*) = 3
        from pg_policies
        where schemaname = 'public'
          and policyname in (
            'english_papers_authenticated_select',
            'english_passages_authenticated_select',
            'english_questions_authenticated_select'
          )
          and position('auth.role' in lower(coalesce(qual, ''))) > 0
          and position('authenticated' in lower(coalesce(qual, ''))) > 0
      )
      and exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'problem_practice_statuses'
          and policyname = 'problem_practice_statuses_owner_select'
          and position('auth.uid' in lower(coalesce(qual, ''))) > 0
          and position('current_user_is_admin' in lower(coalesce(qual, ''))) > 0
      )
    ) as expressions_ready,
    not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and policyname in (
          'admin_users_admin_insert',
          'admin_users_admin_update',
          'admin_users_admin_delete',
          'site_profile_admin_insert',
          'site_profile_admin_delete',
          'english_papers_admin_select',
          'english_passages_admin_select',
          'english_questions_admin_select'
        )
    ) as legacy_policies_gone,
    case
      when (
        select count(*) = 6
        from information_schema.tables
        join boundary_tables on boundary_tables.table_name = tables.table_name
        where tables.table_schema = 'public'
          and tables.table_type = 'BASE TABLE'
      ) is false then false
      else
        has_table_privilege('authenticated', 'public.admin_users', 'select')
        and not has_table_privilege('authenticated', 'public.admin_users', 'insert')
        and not has_table_privilege('authenticated', 'public.admin_users', 'update')
        and not has_table_privilege('authenticated', 'public.admin_users', 'delete')
        and not has_table_privilege('anon', 'public.admin_users', 'select')
        and not has_table_privilege('anon', 'public.admin_users', 'insert')
        and not has_table_privilege('anon', 'public.admin_users', 'update')
        and not has_table_privilege('anon', 'public.admin_users', 'delete')
        and has_table_privilege('authenticated', 'public.site_profile', 'select')
        and has_table_privilege('authenticated', 'public.site_profile', 'update')
        and not has_table_privilege('authenticated', 'public.site_profile', 'insert')
        and not has_table_privilege('authenticated', 'public.site_profile', 'delete')
        and has_table_privilege('anon', 'public.site_profile', 'select')
        and not has_table_privilege('anon', 'public.site_profile', 'insert')
        and not has_table_privilege('anon', 'public.site_profile', 'update')
        and not has_table_privilege('anon', 'public.site_profile', 'delete')
        and has_table_privilege('authenticated', 'public.english_papers', 'select')
        and has_table_privilege('authenticated', 'public.english_papers', 'insert')
        and has_table_privilege('authenticated', 'public.english_papers', 'update')
        and has_table_privilege('authenticated', 'public.english_papers', 'delete')
        and has_table_privilege('authenticated', 'public.english_passages', 'select')
        and has_table_privilege('authenticated', 'public.english_passages', 'insert')
        and has_table_privilege('authenticated', 'public.english_passages', 'update')
        and has_table_privilege('authenticated', 'public.english_passages', 'delete')
        and has_table_privilege('authenticated', 'public.english_questions', 'select')
        and has_table_privilege('authenticated', 'public.english_questions', 'insert')
        and has_table_privilege('authenticated', 'public.english_questions', 'update')
        and has_table_privilege('authenticated', 'public.english_questions', 'delete')
        and has_table_privilege('authenticated', 'public.problem_practice_statuses', 'select')
        and has_table_privilege('authenticated', 'public.problem_practice_statuses', 'insert')
        and has_table_privilege('authenticated', 'public.problem_practice_statuses', 'update')
        and has_table_privilege('authenticated', 'public.problem_practice_statuses', 'delete')
        and not has_table_privilege('anon', 'public.english_papers', 'select')
        and not has_table_privilege('anon', 'public.english_passages', 'select')
        and not has_table_privilege('anon', 'public.english_questions', 'select')
        and not has_table_privilege('anon', 'public.problem_practice_statuses', 'select')
    end as grants_ready
)
select json_build_object(
  'gateVersion', 1,
  'capturedAt', now(),
  'identity', json_build_object(
    'database', current_database(),
    'user', current_user,
    'transactionReadOnly', current_setting('transaction_read_only')::boolean
  ),
  'baseline', json_build_object(
    'notesTotal', (select count(*) from public.notes),
    'notesPublished', (select count(*) from public.notes where is_published),
    'notesPrivate', (select count(*) from public.notes where not is_published),
    'notesAtVersionOne', (
      select count(*) from public.notes note_row
      where to_jsonb(note_row) ->> 'content_version' = '1'
    ),
    'notesInvalidContentVersions', (
      select count(*) from public.notes note_row
      where to_jsonb(note_row) ? 'content_version'
        and coalesce(to_jsonb(note_row) ->> 'content_version', '') !~ '^[1-9][0-9]*$'
    ),
    'notesStableChecksum', (
      select md5(coalesce(string_agg((to_jsonb(note_row) - 'content_version')::text, E'\n' order by id), ''))
      from public.notes note_row
    ),
    'publishedNoteIdsMd5', (
      select md5(coalesce(string_agg(id::text, ',' order by id), ''))
      from public.notes
      where is_published
    ),
    'chaptersTotal', (select count(*) from public.chapters),
    'chaptersChecksum', (
      select md5(coalesce(string_agg(to_jsonb(chapter_row)::text, E'\n' order by id), ''))
      from public.chapters chapter_row
    ),
    'englishAttemptsTotal', (select count(*) from public.english_attempts),
    'englishAttemptsChecksum', (
      select md5(coalesce(string_agg(to_jsonb(attempt_row)::text, E'\n' order by id), ''))
      from public.english_attempts attempt_row
    ),
    'englishAttemptAnswersTotal', (select count(*) from public.english_attempt_answers),
    'englishAttemptAnswersChecksum', (
      select md5(coalesce(string_agg(to_jsonb(answer_row)::text, E'\n' order by id), ''))
      from public.english_attempt_answers answer_row
    ),
    'adminUsersTotal', (select count(*) from public.admin_users),
    'adminUsersChecksum', (
      select md5(coalesce(string_agg(to_jsonb(admin_row)::text, E'\n' order by email), ''))
      from public.admin_users admin_row
    )
  ),
  'integrity', json_build_object(
    'invalidChapterScopeRows', (
      select count(*)
      from public.chapters child
      join public.chapters parent on parent.id = child.parent_id
      where child.note_id is distinct from parent.note_id
    ),
    'unmatchedAdminUsers', (
      select count(*)
      from public.admin_users admin_row
      left join auth.users auth_user on lower(auth_user.email) = lower(admin_row.email)
      where auth_user.id is null
    )
  ),
  'schema', json_build_object(
    'contentVersionReady', (
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'notes'
          and column_name = 'content_version'
          and data_type = 'bigint'
          and is_nullable = 'NO'
          and position('1' in coalesce(column_default, '')) > 0
      )
      and exists (
        select 1 from pg_trigger trigger_row
        join pg_class relation on relation.oid = trigger_row.tgrelid
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'notes'
          and trigger_row.tgname = 'bump_notes_content_version'
          and not trigger_row.tgisinternal
          and trigger_row.tgenabled <> 'D'
      )
      and exists (
        select 1 from pg_trigger trigger_row
        join pg_class relation on relation.oid = trigger_row.tgrelid
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'chapters'
          and trigger_row.tgname = 'enforce_chapters_scope'
          and not trigger_row.tgisinternal
          and trigger_row.tgenabled <> 'D'
      )
    ),
    'notesVersionTriggerReady', exists (
      select 1 from pg_trigger trigger_row
      join pg_class relation on relation.oid = trigger_row.tgrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = 'notes'
        and trigger_row.tgname = 'bump_notes_content_version'
        and not trigger_row.tgisinternal
        and trigger_row.tgenabled <> 'D'
    ),
    'chapterScopeTriggerReady', exists (
      select 1 from pg_trigger trigger_row
      join pg_class relation on relation.oid = trigger_row.tgrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = 'chapters'
        and trigger_row.tgname = 'enforce_chapters_scope'
        and not trigger_row.tgisinternal
        and trigger_row.tgenabled <> 'D'
    ),
    'planningReady', (
      select table_ready
        and columns_ready
        and constraints_ready
        and rls_ready
        and trigger_ready
        and policies_ready
        and permissions_ready
      from planning_checks
    ),
    'planningTableReady', (select table_ready from planning_checks),
    'planningColumnsReady', (select columns_ready from planning_checks),
    'planningConstraintsReady', (select constraints_ready from planning_checks),
    'planningRlsReady', (select rls_ready from planning_checks),
    'planningTriggerReady', (select trigger_ready from planning_checks),
    'planningPoliciesReady', (select policies_ready from planning_checks),
    'planningPermissionsReady', (select permissions_ready from planning_checks),
    'trainingCoreReady', (
      select tables_ready
        and columns_ready
        and constraints_ready
        and indexes_ready
        and rls_ready
        and triggers_ready
        and policies_ready
        and functions_ready
        and permissions_ready
      from training_checks
    ),
    'trainingTablesReady', (select tables_ready from training_checks),
    'trainingColumnsReady', (select columns_ready from training_checks),
    'trainingConstraintsReady', (select constraints_ready from training_checks),
    'trainingIndexesReady', (select indexes_ready from training_checks),
    'trainingRlsReady', (select rls_ready from training_checks),
    'trainingTriggersReady', (select triggers_ready from training_checks),
    'trainingPoliciesReady', (select policies_ready from training_checks),
    'trainingFunctionsReady', (select functions_ready from training_checks),
    'trainingPermissionsReady', (select permissions_ready from training_checks),
    'jobsAndSourcesReady', (
      select tables_ready
        and columns_ready
        and constraints_ready
        and indexes_ready
        and rls_ready
        and triggers_ready
        and policies_ready
        and functions_ready
        and permissions_ready
      from job_source_checks
    ),
    'jobsSourceTablesReady', (select tables_ready from job_source_checks),
    'jobsSourceColumnsReady', (select columns_ready from job_source_checks),
    'jobsSourceConstraintsReady', (select constraints_ready from job_source_checks),
    'jobsSourceIndexesReady', (select indexes_ready from job_source_checks),
    'jobsSourceRlsReady', (select rls_ready from job_source_checks),
    'jobsSourceTriggersReady', (select triggers_ready from job_source_checks),
    'jobsSourcePoliciesReady', (select policies_ready from job_source_checks),
    'jobsSourceFunctionsReady', (select functions_ready from job_source_checks),
    'jobsSourcePermissionsReady', (select permissions_ready from job_source_checks),
    'privateNoteDefaultReady', coalesce((
      select data_type = 'boolean'
        and is_nullable = 'NO'
        and lower(regexp_replace(coalesce(column_default, ''), '\s', '', 'g')) in ('false', 'false::boolean')
      from information_schema.columns
      where table_schema = 'public' and table_name = 'notes' and column_name = 'is_published'
    ), false),
    'boundaryAlignmentReady', (
      select rls_ready
        and policies_ready
        and expressions_ready
        and legacy_policies_gone
        and grants_ready
      from boundary_checks
    ),
    'boundaryRlsReady', (select rls_ready from boundary_checks),
    'boundaryPoliciesReady', (select policies_ready from boundary_checks),
    'boundaryPolicyActualCount', (
      select count(*)
      from pg_policies policies
      join boundary_tables on boundary_tables.table_name = policies.tablename
      where policies.schemaname = 'public'
    ),
    'boundaryPolicyMatchedCount', (
      select count(*)
      from boundary_policies expected
      join pg_policies policies on policies.schemaname = 'public'
        and policies.tablename = expected.table_name
        and policies.policyname = expected.policy_name
        and policies.cmd = expected.policy_command
        and policies.roles @> expected.policy_roles
        and policies.roles <@ expected.policy_roles
    ),
    'boundaryMissingPolicies', array(
      select expected.policy_name
      from boundary_policies expected
      left join pg_policies policies on policies.schemaname = 'public'
        and policies.tablename = expected.table_name
        and policies.policyname = expected.policy_name
        and policies.cmd = expected.policy_command
        and policies.roles @> expected.policy_roles
        and policies.roles <@ expected.policy_roles
      where policies.policyname is null
      order by expected.policy_name
    ),
    'boundaryUnexpectedPolicies', array(
      select policies.policyname
      from pg_policies policies
      join boundary_tables on boundary_tables.table_name = policies.tablename
      left join boundary_policies expected on expected.table_name = policies.tablename
        and expected.policy_name = policies.policyname
        and expected.policy_command = policies.cmd
        and policies.roles @> expected.policy_roles
        and policies.roles <@ expected.policy_roles
      where policies.schemaname = 'public'
        and expected.policy_name is null
      order by policies.policyname
    ),
    'boundaryExpressionsReady', (select expressions_ready from boundary_checks),
    'boundaryLegacyPoliciesGone', (select legacy_policies_gone from boundary_checks),
    'boundaryGrantsReady', (select grants_ready from boundary_checks)
  )
)::text;

rollback;
