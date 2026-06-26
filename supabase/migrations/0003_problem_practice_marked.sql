-- Add a lightweight collection flag for third-pass problem review.
-- Run after 0002_rls_policies.sql. Existing RLS owner policies continue to apply.

begin;

alter table public.problem_practice_statuses
  add column if not exists is_marked boolean not null default false;

create index if not exists idx_problem_practice_statuses_user_marked_updated_at
  on public.problem_practice_statuses (user_id, updated_at desc)
  where is_marked = true;

commit;
