-- Asteroid production Supabase live audit.
-- READ ONLY: this file must contain only top-level SELECT or WITH statements.
-- Run numbered sections in Supabase Dashboard SQL Editor and export each result.
-- Do not add DDL, DML, procedural blocks, COPY, CALL, or privileged mutations.

-- 00_environment.csv
select
  '00_environment' as audit_section,
  current_timestamp as captured_at,
  current_database() as database_name,
  current_user as database_user,
  current_role as database_role,
  current_setting('server_version') as server_version,
  current_setting('server_version_num') as server_version_num;

-- 01_migration_history_presence.csv
select
  '01_migration_history_presence' as audit_section,
  to_regclass('supabase_migrations.schema_migrations')::text as migration_history_relation,
  case
    when to_regclass('supabase_migrations.schema_migrations') is null then 'missing'
    else 'present'
  end as status;

-- 01b_migration_history.csv
-- Supabase hosted projects normally provide this table. If this section alone fails,
-- export the error text and continue with section 02 instead of changing the database.
select
  '01b_migration_history' as audit_section,
  version,
  name,
  statements
from supabase_migrations.schema_migrations
order by version;

-- 02_extensions.csv
select
  '02_extensions' as audit_section,
  ext.extname as extension_name,
  ext.extversion as extension_version,
  ns.nspname as extension_schema
from pg_extension ext
join pg_namespace ns on ns.oid = ext.extnamespace
order by ext.extname;

-- 03_enum_types.csv
select
  '03_enum_types' as audit_section,
  ns.nspname as schema_name,
  typ.typname as enum_name,
  enum.enumlabel as enum_value,
  enum.enumsortorder as sort_order
from pg_type typ
join pg_namespace ns on ns.oid = typ.typnamespace
join pg_enum enum on enum.enumtypid = typ.oid
where ns.nspname in ('public', 'private')
order by ns.nspname, typ.typname, enum.enumsortorder;

-- 04_relations_and_rls.csv
select
  '04_relations_and_rls' as audit_section,
  ns.nspname as schema_name,
  cls.relname as relation_name,
  case cls.relkind
    when 'r' then 'table'
    when 'p' then 'partitioned_table'
    when 'v' then 'view'
    when 'm' then 'materialized_view'
    when 'S' then 'sequence'
    else cls.relkind::text
  end as relation_kind,
  cls.relrowsecurity as rls_enabled,
  cls.relforcerowsecurity as rls_forced,
  pg_size_pretty(pg_total_relation_size(cls.oid)) as total_size,
  stats.n_live_tup as estimated_live_rows,
  stats.n_dead_tup as estimated_dead_rows,
  stats.last_autovacuum,
  stats.last_autoanalyze
from pg_class cls
join pg_namespace ns on ns.oid = cls.relnamespace
left join pg_stat_user_tables stats
  on stats.relid = cls.oid
where ns.nspname in ('public', 'private')
  and cls.relkind in ('r', 'p', 'v', 'm', 'S')
order by ns.nspname, relation_kind, cls.relname;

-- 05_columns.csv
select
  '05_columns' as audit_section,
  cols.table_schema,
  cols.table_name,
  cols.ordinal_position,
  cols.column_name,
  cols.data_type,
  cols.udt_schema,
  cols.udt_name,
  cols.is_nullable,
  cols.column_default,
  cols.is_identity,
  cols.identity_generation,
  cols.is_generated,
  cols.generation_expression
from information_schema.columns cols
where cols.table_schema in ('public', 'private')
order by cols.table_schema, cols.table_name, cols.ordinal_position;

-- 06_constraints.csv
select
  '06_constraints' as audit_section,
  ns.nspname as schema_name,
  rel.relname as table_name,
  con.conname as constraint_name,
  case con.contype
    when 'p' then 'primary_key'
    when 'f' then 'foreign_key'
    when 'u' then 'unique'
    when 'c' then 'check'
    when 'x' then 'exclusion'
    else con.contype::text
  end as constraint_type,
  con.convalidated as is_validated,
  pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace ns on ns.oid = rel.relnamespace
where ns.nspname in ('public', 'private')
order by ns.nspname, rel.relname, constraint_type, con.conname;

-- 07_indexes.csv
select
  '07_indexes' as audit_section,
  idx.schemaname as schema_name,
  idx.tablename as table_name,
  idx.indexname as index_name,
  idx.indexdef as definition
from pg_indexes idx
where idx.schemaname in ('public', 'private')
order by idx.schemaname, idx.tablename, idx.indexname;

-- 08_triggers.csv
select
  '08_triggers' as audit_section,
  ns.nspname as schema_name,
  rel.relname as table_name,
  trg.tgname as trigger_name,
  trg.tgenabled as enabled_state,
  pg_get_triggerdef(trg.oid, true) as definition
from pg_trigger trg
join pg_class rel on rel.oid = trg.tgrelid
join pg_namespace ns on ns.oid = rel.relnamespace
where ns.nspname in ('public', 'private')
  and not trg.tgisinternal
order by ns.nspname, rel.relname, trg.tgname;

-- 09_functions.csv
select
  '09_functions' as audit_section,
  ns.nspname as schema_name,
  proc.proname as function_name,
  pg_get_function_identity_arguments(proc.oid) as identity_arguments,
  pg_get_function_result(proc.oid) as result_type,
  lang.lanname as language_name,
  proc.prosecdef as security_definer,
  proc.provolatile as volatility,
  proc.proconfig as runtime_config,
  pg_get_functiondef(proc.oid) as definition
from pg_proc proc
join pg_namespace ns on ns.oid = proc.pronamespace
join pg_language lang on lang.oid = proc.prolang
where ns.nspname in ('public', 'private')
order by ns.nspname, proc.proname, identity_arguments;

-- 10_rls_policies.csv
select
  '10_rls_policies' as audit_section,
  policies.schemaname as schema_name,
  policies.tablename as table_name,
  policies.policyname as policy_name,
  policies.permissive,
  policies.roles,
  policies.cmd as command,
  policies.qual as using_expression,
  policies.with_check as check_expression
from pg_policies policies
where policies.schemaname in ('public', 'storage')
order by policies.schemaname, policies.tablename, policies.policyname;

-- 11_table_grants.csv
select
  '11_table_grants' as audit_section,
  grants.table_schema,
  grants.table_name,
  grants.grantee,
  grants.privilege_type,
  grants.is_grantable
from information_schema.role_table_grants grants
where grants.table_schema in ('public', 'storage')
  and grants.grantee in ('anon', 'authenticated', 'service_role')
order by grants.table_schema, grants.table_name, grants.grantee, grants.privilege_type;

-- 12_exact_public_table_counts.csv
-- query_to_xml executes a generated COUNT(*) SELECT for each existing public table.
with public_tables as (
  select cls.oid, ns.nspname as schema_name, cls.relname as table_name
  from pg_class cls
  join pg_namespace ns on ns.oid = cls.relnamespace
  where ns.nspname = 'public'
    and cls.relkind in ('r', 'p')
), exact_counts as (
  select
    schema_name,
    table_name,
    trim(both '"' from ((xpath(
      '/row/row_count/text()',
      query_to_xml(
        format('select count(*) as row_count from %I.%I', schema_name, table_name),
        false,
        true,
        ''
      )
    ))[1])::text)::bigint as exact_row_count
  from public_tables
)
select
  '12_exact_public_table_counts' as audit_section,
  schema_name,
  table_name,
  exact_row_count
from exact_counts
order by schema_name, table_name;

-- 13_notes_manifest.csv
-- No article body is returned. This manifest is used to protect current IDs and visibility.
select
  '13_notes_manifest' as audit_section,
  notes.id,
  notes.type,
  notes.subject,
  notes.title,
  notes.is_published,
  jsonb_typeof(notes.problems) as problems_json_type,
  case
    when jsonb_typeof(notes.problems) = 'array' then jsonb_array_length(notes.problems)
    else null
  end as problem_count,
  notes.created_at,
  notes.updated_at
from public.notes
order by notes.created_at, notes.id;

-- 14_notes_visibility_summary.csv
select
  '14_notes_visibility_summary' as audit_section,
  notes.type,
  notes.subject,
  notes.is_published,
  count(*) as note_count
from public.notes
group by notes.type, notes.subject, notes.is_published
order by notes.type, notes.subject nulls first, notes.is_published;

-- 15_problem_json_integrity.csv
with problem_rows as (
  select
    notes.id as note_id,
    notes.title as note_title,
    notes.updated_at as note_updated_at,
    problem.ordinality as problem_position,
    nullif(btrim(problem.value ->> 'id'), '') as problem_id
  from public.notes notes
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(notes.problems) = 'array' then notes.problems
      else '[]'::jsonb
    end
  ) with ordinality as problem(value, ordinality)
), duplicate_ids as (
  select note_id, problem_id, count(*) as duplicate_count
  from problem_rows
  where problem_id is not null
  group by note_id, problem_id
  having count(*) > 1
), malformed_notes as (
  select
    notes.id as note_id,
    notes.title as note_title,
    jsonb_typeof(notes.problems) as problems_json_type
  from public.notes notes
  where jsonb_typeof(notes.problems) is distinct from 'array'
), missing_ids as (
  select note_id, note_title, problem_position
  from problem_rows
  where problem_id is null
)
select
  '15_problem_json_integrity' as audit_section,
  'malformed_problems_json' as issue_type,
  malformed_notes.note_id,
  malformed_notes.note_title,
  null::bigint as problem_position,
  null::text as problem_id,
  malformed_notes.problems_json_type as details
from malformed_notes
union all
select
  '15_problem_json_integrity',
  'missing_problem_id',
  missing_ids.note_id,
  missing_ids.note_title,
  missing_ids.problem_position,
  null,
  'problem object has no stable id'
from missing_ids
union all
select
  '15_problem_json_integrity',
  'duplicate_problem_id_within_note',
  duplicates.note_id,
  notes.title,
  null,
  duplicates.problem_id,
  duplicates.duplicate_count::text || ' occurrences'
from duplicate_ids duplicates
join public.notes notes on notes.id = duplicates.note_id
order by issue_type, note_id, problem_position nulls last, problem_id nulls last;

-- 16_practice_status_integrity.csv
with problem_rows as (
  select
    notes.id as note_id,
    nullif(btrim(problem.value ->> 'id'), '') as problem_id
  from public.notes notes
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(notes.problems) = 'array' then notes.problems
      else '[]'::jsonb
    end
  ) as problem(value)
), matching_problem_ids as (
  select distinct note_id, problem_id
  from problem_rows
  where problem_id is not null
)
select
  '16_practice_status_integrity' as audit_section,
  statuses.id as practice_status_id,
  statuses.user_id,
  statuses.note_id,
  statuses.problem_id,
  statuses.round,
  statuses.attempts,
  statuses.correct_count,
  statuses.wrong_count,
  statuses.last_result,
  statuses.is_mastered,
  statuses.is_marked,
  statuses.updated_at,
  case
    when notes.id is null then 'missing_note'
    when matching.note_id is null then 'missing_problem_id_in_note_json'
    else 'ok'
  end as integrity_status
from public.problem_practice_statuses statuses
left join public.notes notes on notes.id = statuses.note_id
left join matching_problem_ids matching
  on matching.note_id = statuses.note_id
  and matching.problem_id = statuses.problem_id
order by integrity_status desc, statuses.note_id, statuses.problem_id, statuses.user_id;

-- 17_english_integrity.csv
with checks as (
  select
    'passage_year_mismatch' as issue_type,
    passages.id::text as record_id,
    passages.paper_id::text as parent_id,
    passages.year::text || ' vs paper ' || papers.year::text as details
  from public.english_passages passages
  join public.english_papers papers on papers.id = passages.paper_id
  where passages.year is distinct from papers.year

  union all

  select
    'orphan_question',
    questions.id::text,
    questions.passage_id::text,
    'question has no passage'
  from public.english_questions questions
  left join public.english_passages passages on passages.id = questions.passage_id
  where passages.id is null

  union all

  select
    'orphan_attempt',
    attempts.id::text,
    attempts.passage_id::text,
    'attempt has no passage or auth user'
  from public.english_attempts attempts
  left join public.english_passages passages on passages.id = attempts.passage_id
  left join auth.users users on users.id = attempts.user_id
  where passages.id is null or users.id is null

  union all

  select
    'orphan_attempt_answer',
    answers.id::text,
    answers.attempt_id::text,
    'answer has no attempt or question'
  from public.english_attempt_answers answers
  left join public.english_attempts attempts on attempts.id = answers.attempt_id
  left join public.english_questions questions on questions.id = answers.question_id
  where attempts.id is null or questions.id is null

  union all

  select
    'duplicate_attempt_user_passage',
    attempts.user_id::text,
    attempts.passage_id::text,
    count(*)::text || ' attempts'
  from public.english_attempts attempts
  group by attempts.user_id, attempts.passage_id
  having count(*) > 1
)
select
  '17_english_integrity' as audit_section,
  checks.issue_type,
  checks.record_id,
  checks.parent_id,
  checks.details
from checks
order by checks.issue_type, checks.record_id;

-- 18_chapter_scope_integrity.csv
select
  '18_chapter_scope_integrity' as audit_section,
  child.id as child_id,
  child.note_id as child_note_id,
  child.parent_id,
  parent.note_id as parent_note_id,
  case
    when parent.id is null then 'missing_parent'
    when child.note_id is distinct from parent.note_id then 'cross_scope_parent'
    else 'ok'
  end as integrity_status
from public.chapters child
left join public.chapters parent on parent.id = child.parent_id
where child.parent_id is not null
order by integrity_status desc, child.id;

-- 19_admin_auth_match.csv
select
  '19_admin_auth_match' as audit_section,
  admins.id as admin_row_id,
  admins.email as configured_email,
  users.id as auth_user_id,
  users.email as auth_email,
  users.created_at as auth_created_at,
  users.last_sign_in_at,
  case when users.id is null then 'missing_auth_user' else 'ok' end as match_status
from public.admin_users admins
left join auth.users users on lower(users.email) = lower(admins.email)
order by match_status desc, lower(admins.email);

-- 20_storage_buckets.csv
select
  '20_storage_buckets' as audit_section,
  buckets.id,
  buckets.name,
  buckets.public,
  buckets.file_size_limit,
  buckets.allowed_mime_types,
  buckets.created_at,
  buckets.updated_at
from storage.buckets buckets
order by buckets.id;

-- 21_storage_objects_manifest.csv
-- Object contents and signed URLs are not returned.
select
  '21_storage_objects_manifest' as audit_section,
  objects.bucket_id,
  objects.name as object_path,
  objects.created_at,
  objects.updated_at,
  objects.last_accessed_at,
  objects.metadata ->> 'size' as size_bytes,
  objects.metadata ->> 'mimetype' as mime_type
from storage.objects objects
where objects.bucket_id in ('note-images', 'ocr-documents')
order by objects.bucket_id, objects.name;

-- 22_storage_summary.csv
select
  '22_storage_summary' as audit_section,
  objects.bucket_id,
  count(*) as object_count,
  sum(
    case
      when coalesce(objects.metadata ->> 'size', '') ~ '^[0-9]+$'
        then (objects.metadata ->> 'size')::numeric
      else 0
    end
  ) as total_size_bytes,
  min(objects.created_at) as first_created_at,
  max(objects.updated_at) as last_updated_at
from storage.objects objects
where objects.bucket_id in ('note-images', 'ocr-documents')
group by objects.bucket_id
order by objects.bucket_id;

-- 23_auth_user_manifest.csv
-- Password hashes, identities, tokens, and provider secrets are intentionally excluded.
select
  '23_auth_user_manifest' as audit_section,
  users.id,
  users.email,
  users.created_at,
  users.updated_at,
  users.last_sign_in_at,
  users.email_confirmed_at
from auth.users users
order by users.created_at, users.id;
