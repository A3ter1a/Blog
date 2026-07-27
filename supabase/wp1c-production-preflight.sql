-- AST-WP1-C/D/E production preflight.
-- Read-only. Run immediately before any approved production migration and archive every result set.

select json_build_object(
  'captured_at', now(),
  'notes_total', (select count(*) from public.notes),
  'notes_published', (select count(*) from public.notes where is_published),
  'notes_private', (select count(*) from public.notes where not is_published),
  'published_note_ids_md5', (
    select md5(coalesce(string_agg(id::text, ',' order by id), ''))
    from public.notes
    where is_published
  ),
  'chapters_total', (select count(*) from public.chapters),
  'english_attempts_total', (select count(*) from public.english_attempts),
  'english_attempt_answers_total', (select count(*) from public.english_attempt_answers),
  'admin_users_total', (select count(*) from public.admin_users)
) as production_baseline;

select
  count(*) as invalid_chapter_scope_rows
from public.chapters child
join public.chapters parent on parent.id = child.parent_id
where child.note_id is distinct from parent.note_id;

select
  table_name,
  'already_exists' as status
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'planning_task_status', 'attempts', 'attempt_revisions', 'grades',
    'jobs', 'job_items', 'source_documents', 'source_versions'
  )
order by table_name;

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'notes'
  and column_name in ('content_version', 'is_published')
order by column_name;

select
  au.email as configured_admin_email,
  u.id as matched_auth_user_id,
  case when u.id is null then 'fail' else 'pass' end as status
from public.admin_users au
left join auth.users u on lower(u.email) = lower(au.email)
order by au.email;

select
  conrelid::regclass::text as table_name,
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.notes'::regclass, 'public.chapters'::regclass)
order by table_name, constraint_name;
