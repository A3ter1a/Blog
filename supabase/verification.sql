-- Asteroid post-migration verification.
-- Read-only: run this after all files under supabase/migrations have finished.

with expected_tables(schema_name, table_name) as (
  values
    ('public', 'notes'),
    ('public', 'chapters'),
    ('public', 'site_profile'),
    ('public', 'admin_users'),
    ('public', 'problem_practice_statuses'),
    ('public', 'math3_self_tests')
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
    ('public', 'problem_practice_statuses', 'is_marked')
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
    ('storage', 'objects', 'note_images_admin_select'),
    ('storage', 'objects', 'note_images_admin_insert'),
    ('storage', 'objects', 'note_images_admin_update'),
    ('storage', 'objects', 'note_images_admin_delete')
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
bucket_check as (
  select
    'storage_bucket:note-images' as check_name,
    case when exists (
      select 1
      from storage.buckets
      where id = 'note-images'
        and public = true
    ) then 'pass' else 'fail' end as status,
    'note-images must exist and stay public for image URLs' as details
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
  select check_name, status, details from bucket_check
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
