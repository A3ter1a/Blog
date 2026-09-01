-- Remove legacy policy/index duplication and harden helper functions reported
-- by the Supabase advisors. This migration changes schema metadata only; it
-- does not read, update, or delete application rows.

begin;

-- These policies predate the canonical policies in 0002_rls_policies.sql.
-- Keeping both sets makes PostgreSQL evaluate multiple permissive policies for
-- the same operation and keeps the legacy public.is_admin() helper reachable.
drop policy if exists admin_read_notes on public.notes;
drop policy if exists admin_insert_notes on public.notes;
drop policy if exists admin_update_notes on public.notes;
drop policy if exists admin_delete_notes on public.notes;

drop policy if exists admin_read_chapters on public.chapters;
drop policy if exists admin_insert_chapters on public.chapters;
drop policy if exists admin_update_chapters on public.chapters;
drop policy if exists admin_delete_chapters on public.chapters;

drop policy if exists math3_self_tests_admin_select on public.math3_self_tests;
drop policy if exists math3_self_tests_admin_insert on public.math3_self_tests;
drop policy if exists math3_self_tests_admin_update on public.math3_self_tests;
drop policy if exists math3_self_tests_admin_delete on public.math3_self_tests;

drop policy if exists admin_insert_note_images on storage.objects;
drop policy if exists admin_update_note_images on storage.objects;
drop policy if exists admin_delete_note_images on storage.objects;

-- A legacy flashcards table still depends on public.is_admin(). Keep that
-- compatibility helper, but run it with caller privileges and expose it only
-- to authenticated users. Canonical application policies use the hardened
-- private.current_user_is_admin() helper instead.
do $cleanup$
begin
  if to_regprocedure('public.is_admin()') is not null then
    execute 'alter function public.is_admin() security invoker';
    execute 'alter function public.is_admin() set search_path = ''''';
    execute 'revoke all on function public.is_admin() from public';
    execute 'grant execute on function public.is_admin() to authenticated';
  end if;
end;
$cleanup$;

-- Trigger functions do not need caller-controlled object resolution. An empty
-- search_path is safe because their bodies use only NEW and pg_catalog names.
do $cleanup$
declare
  function_name text;
begin
  foreach function_name in array array[
    'set_updated_at',
    'set_math3_self_tests_updated_at',
    'update_updated_at_column'
  ] loop
    if to_regprocedure(format('public.%I()', function_name)) is not null then
      execute format(
        'alter function public.%I() set search_path = %L',
        function_name,
        ''
      );
    end if;
  end loop;
end;
$cleanup$;

-- Older production bootstrap SQL created the same indexes under different
-- names. Drop a legacy copy only when the canonical equivalent is present.
do $cleanup$
begin
  if to_regclass('public.idx_problem_practice_statuses_user_note') is not null
    and to_regclass('public.idx_problem_practice_user_note') is not null
  then
    drop index public.idx_problem_practice_user_note;
  end if;

  if exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.problem_practice_statuses'::regclass
      and constraint_row.contype = 'u'
      and constraint_row.conname = 'problem_practice_statuses_user_id_note_id_problem_id_key'
  )
    and to_regclass('public.problem_practice_statuses_user_note_problem_key') is not null
  then
    drop index public.problem_practice_statuses_user_note_problem_key;
  end if;
end;
$cleanup$;

commit;
