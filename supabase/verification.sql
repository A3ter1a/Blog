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
    ('public', 'english_vocabulary')
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
    ('public', 'english_vocabulary', 'ai_generated')
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
    ('public', 'site_profile', 'site_profile_admin_insert'),
    ('public', 'site_profile', 'site_profile_admin_update'),
    ('public', 'site_profile', 'site_profile_admin_delete'),
    ('public', 'admin_users', 'admin_users_admin_select'),
    ('public', 'admin_users', 'admin_users_admin_insert'),
    ('public', 'admin_users', 'admin_users_admin_update'),
    ('public', 'admin_users', 'admin_users_admin_delete'),
    ('public', 'problem_practice_statuses', 'problem_practice_statuses_owner_select'),
    ('public', 'problem_practice_statuses', 'problem_practice_statuses_owner_insert'),
    ('public', 'problem_practice_statuses', 'problem_practice_statuses_owner_update'),
    ('public', 'problem_practice_statuses', 'problem_practice_statuses_owner_delete'),
    ('public', 'math3_self_tests', 'math3_self_tests_owner_select'),
    ('public', 'math3_self_tests', 'math3_self_tests_owner_insert'),
    ('public', 'math3_self_tests', 'math3_self_tests_owner_update'),
    ('public', 'math3_self_tests', 'math3_self_tests_owner_delete'),
    ('public', 'english_papers', 'english_papers_admin_select'),
    ('public', 'english_papers', 'english_papers_admin_insert'),
    ('public', 'english_papers', 'english_papers_admin_update'),
    ('public', 'english_papers', 'english_papers_admin_delete'),
    ('public', 'english_passages', 'english_passages_admin_select'),
    ('public', 'english_passages', 'english_passages_admin_insert'),
    ('public', 'english_passages', 'english_passages_admin_update'),
    ('public', 'english_passages', 'english_passages_admin_delete'),
    ('public', 'english_questions', 'english_questions_admin_select'),
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
    ('storage', 'objects', 'ocr_documents_admin_delete')
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
expected_buckets(bucket_id, is_public, details) as (
  values
    ('note-images', true, 'note-images must exist and stay public for image URLs'),
    ('ocr-documents', false, 'ocr-documents must exist and stay private for signed OCR PDF URLs')
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
  select check_name, status, details from bucket_checks
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
