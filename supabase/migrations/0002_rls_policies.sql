-- Asteroid RLS and Storage policies for Supabase.
-- Run after 0001_base_schema.sql.

begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admin_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function private.current_user_is_admin() from public;
grant execute on function private.current_user_is_admin() to anon, authenticated;

alter table public.notes enable row level security;
alter table public.chapters enable row level security;
alter table public.site_profile enable row level security;
alter table public.admin_users enable row level security;
alter table public.problem_practice_statuses enable row level security;
alter table public.math3_self_tests enable row level security;

drop policy if exists "公开笔记可读" on public.notes;
drop policy if exists "允许所有操作" on public.notes;
drop policy if exists notes_public_select on public.notes;
drop policy if exists notes_admin_insert on public.notes;
drop policy if exists notes_admin_update on public.notes;
drop policy if exists notes_admin_delete on public.notes;

create policy notes_public_select
on public.notes
for select
to anon, authenticated
using (
  is_published = true
  or (select private.current_user_is_admin())
);

create policy notes_admin_insert
on public.notes
for insert
to authenticated
with check ((select private.current_user_is_admin()));

create policy notes_admin_update
on public.notes
for update
to authenticated
using ((select private.current_user_is_admin()))
with check ((select private.current_user_is_admin()));

create policy notes_admin_delete
on public.notes
for delete
to authenticated
using ((select private.current_user_is_admin()));

drop policy if exists chapters_public_select on public.chapters;
drop policy if exists chapters_admin_insert on public.chapters;
drop policy if exists chapters_admin_update on public.chapters;
drop policy if exists chapters_admin_delete on public.chapters;

create policy chapters_public_select
on public.chapters
for select
to anon, authenticated
using (
  note_id is null
  or exists (
    select 1
    from public.notes
    where notes.id = chapters.note_id
      and notes.is_published = true
  )
  or (select private.current_user_is_admin())
);

create policy chapters_admin_insert
on public.chapters
for insert
to authenticated
with check ((select private.current_user_is_admin()));

create policy chapters_admin_update
on public.chapters
for update
to authenticated
using ((select private.current_user_is_admin()))
with check ((select private.current_user_is_admin()));

create policy chapters_admin_delete
on public.chapters
for delete
to authenticated
using ((select private.current_user_is_admin()));

drop policy if exists site_profile_public_select on public.site_profile;
drop policy if exists site_profile_admin_insert on public.site_profile;
drop policy if exists site_profile_admin_update on public.site_profile;
drop policy if exists site_profile_admin_delete on public.site_profile;

create policy site_profile_public_select
on public.site_profile
for select
to anon, authenticated
using (id = 'main');

create policy site_profile_admin_insert
on public.site_profile
for insert
to authenticated
with check ((select private.current_user_is_admin()));

create policy site_profile_admin_update
on public.site_profile
for update
to authenticated
using ((select private.current_user_is_admin()))
with check ((select private.current_user_is_admin()));

create policy site_profile_admin_delete
on public.site_profile
for delete
to authenticated
using ((select private.current_user_is_admin()));

drop policy if exists admin_users_admin_select on public.admin_users;
drop policy if exists admin_users_admin_insert on public.admin_users;
drop policy if exists admin_users_admin_update on public.admin_users;
drop policy if exists admin_users_admin_delete on public.admin_users;

create policy admin_users_admin_select
on public.admin_users
for select
to authenticated
using ((select private.current_user_is_admin()));

create policy admin_users_admin_insert
on public.admin_users
for insert
to authenticated
with check ((select private.current_user_is_admin()));

create policy admin_users_admin_update
on public.admin_users
for update
to authenticated
using ((select private.current_user_is_admin()))
with check ((select private.current_user_is_admin()));

create policy admin_users_admin_delete
on public.admin_users
for delete
to authenticated
using ((select private.current_user_is_admin()));

drop policy if exists problem_practice_statuses_owner_select on public.problem_practice_statuses;
drop policy if exists problem_practice_statuses_owner_insert on public.problem_practice_statuses;
drop policy if exists problem_practice_statuses_owner_update on public.problem_practice_statuses;
drop policy if exists problem_practice_statuses_owner_delete on public.problem_practice_statuses;

create policy problem_practice_statuses_owner_select
on public.problem_practice_statuses
for select
to authenticated
using (user_id = (select auth.uid()));

create policy problem_practice_statuses_owner_insert
on public.problem_practice_statuses
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy problem_practice_statuses_owner_update
on public.problem_practice_statuses
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy problem_practice_statuses_owner_delete
on public.problem_practice_statuses
for delete
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists math3_self_tests_owner_select on public.math3_self_tests;
drop policy if exists math3_self_tests_owner_insert on public.math3_self_tests;
drop policy if exists math3_self_tests_owner_update on public.math3_self_tests;
drop policy if exists math3_self_tests_owner_delete on public.math3_self_tests;

create policy math3_self_tests_owner_select
on public.math3_self_tests
for select
to authenticated
using (user_id = (select auth.uid()));

create policy math3_self_tests_owner_insert
on public.math3_self_tests
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy math3_self_tests_owner_update
on public.math3_self_tests
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy math3_self_tests_owner_delete
on public.math3_self_tests
for delete
to authenticated
using (user_id = (select auth.uid()));

-- Supabase owns storage.objects in hosted projects. Do not ALTER TABLE it here.
-- The note-images bucket is public, so public image URLs remain readable without
-- adding an anonymous SELECT policy that could also expose object listing.
drop policy if exists note_images_public_read on storage.objects;
drop policy if exists note_images_admin_select on storage.objects;
drop policy if exists note_images_admin_insert on storage.objects;
drop policy if exists note_images_admin_update on storage.objects;
drop policy if exists note_images_admin_delete on storage.objects;

create policy note_images_admin_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'note-images'
  and (select private.current_user_is_admin())
);

create policy note_images_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'note-images'
  and (select private.current_user_is_admin())
);

create policy note_images_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'note-images'
  and (select private.current_user_is_admin())
)
with check (
  bucket_id = 'note-images'
  and (select private.current_user_is_admin())
);

create policy note_images_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'note-images'
  and (select private.current_user_is_admin())
);

revoke all on public.notes from anon, authenticated;
revoke all on public.chapters from anon, authenticated;
revoke all on public.site_profile from anon, authenticated;
revoke all on public.admin_users from anon, authenticated;
revoke all on public.problem_practice_statuses from anon, authenticated;
revoke all on public.math3_self_tests from anon, authenticated;

grant select on public.notes to anon, authenticated;
grant insert, update, delete on public.notes to authenticated;

grant select on public.chapters to anon, authenticated;
grant insert, update, delete on public.chapters to authenticated;

grant select on public.site_profile to anon, authenticated;
grant insert, update, delete on public.site_profile to authenticated;

grant select, insert, update, delete on public.admin_users to authenticated;
grant select, insert, update, delete on public.problem_practice_statuses to authenticated;
grant select, insert, update, delete on public.math3_self_tests to authenticated;

commit;
