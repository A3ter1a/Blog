-- AST-WP1-E: align runtime RLS behavior with the calibrated Fable v2 matrix.
-- This migration changes policies/grants only; it does not update application rows.

begin;

-- Administrator authority is bootstrapped through reviewed SQL, not mutable through
-- an ordinary user JWT. An administrator may only read the row matching that JWT.
drop policy if exists admin_users_admin_select on public.admin_users;
drop policy if exists admin_users_admin_insert on public.admin_users;
drop policy if exists admin_users_admin_update on public.admin_users;
drop policy if exists admin_users_admin_delete on public.admin_users;
drop policy if exists admin_read_admin_users on public.admin_users;

create policy admin_users_admin_select
on public.admin_users
for select
to authenticated
using (
  lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  and (select private.current_user_is_admin())
);

revoke insert, update, delete on public.admin_users from authenticated;
grant select on public.admin_users to authenticated;

-- The public profile has one pre-bootstrapped row. Runtime clients may read it and an
-- administrator may update it, but JWT clients may not create or delete profile rows.
drop policy if exists site_profile_admin_insert on public.site_profile;
drop policy if exists site_profile_admin_update on public.site_profile;
drop policy if exists site_profile_admin_delete on public.site_profile;
drop policy if exists public_read_site_profile on public.site_profile;
drop policy if exists admin_insert_site_profile on public.site_profile;
drop policy if exists admin_update_site_profile on public.site_profile;
drop policy if exists admin_delete_site_profile on public.site_profile;

create policy site_profile_admin_update
on public.site_profile
for update
to authenticated
using (
  id = 'main'
  and (select private.current_user_is_admin())
)
with check (
  id = 'main'
  and (select private.current_user_is_admin())
);

revoke insert, delete on public.site_profile from authenticated;
grant select, update on public.site_profile to authenticated;

-- Exam papers/passages/questions are official read-only sources for every authenticated
-- learner. Their create/update/delete policies remain administrator-only.
drop policy if exists english_papers_admin_select on public.english_papers;
drop policy if exists english_passages_admin_select on public.english_passages;
drop policy if exists english_questions_admin_select on public.english_questions;
drop policy if exists english_papers_authenticated_select on public.english_papers;
drop policy if exists english_passages_authenticated_select on public.english_passages;
drop policy if exists english_questions_authenticated_select on public.english_questions;

create policy english_papers_authenticated_select
on public.english_papers
for select
to authenticated
using ((select auth.role()) = 'authenticated');

create policy english_passages_authenticated_select
on public.english_passages
for select
to authenticated
using ((select auth.role()) = 'authenticated');

create policy english_questions_authenticated_select
on public.english_questions
for select
to authenticated
using ((select auth.role()) = 'authenticated');

-- Projection rows remain owner-writable, while administrators gain audit-only SELECT.
drop policy if exists problem_practice_statuses_owner_select on public.problem_practice_statuses;
drop policy if exists admin_read_problem_practice_statuses on public.problem_practice_statuses;
drop policy if exists admin_insert_problem_practice_statuses on public.problem_practice_statuses;
drop policy if exists admin_update_problem_practice_statuses on public.problem_practice_statuses;
drop policy if exists admin_delete_problem_practice_statuses on public.problem_practice_statuses;
create policy problem_practice_statuses_owner_select
on public.problem_practice_statuses
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.current_user_is_admin())
);

commit;
