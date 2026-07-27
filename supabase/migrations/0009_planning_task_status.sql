-- AST-WP1-C: authenticated, owner-scoped manual planning status.

begin;

create table if not exists public.planning_task_status (
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null,
  status text not null default 'not_started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_task_status_pkey primary key (user_id, task_id),
  constraint planning_task_status_task_id_nonempty check (btrim(task_id) <> ''),
  constraint planning_task_status_status_check check (
    status in ('not_started', 'in_progress', 'completed')
  )
);

drop trigger if exists set_planning_task_status_updated_at on public.planning_task_status;
create trigger set_planning_task_status_updated_at
  before update on public.planning_task_status
  for each row
  execute function public.set_updated_at();

alter table public.planning_task_status enable row level security;
alter table public.planning_task_status force row level security;

drop policy if exists planning_task_status_owner_select on public.planning_task_status;
create policy planning_task_status_owner_select
on public.planning_task_status
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.current_user_is_admin())
);

drop policy if exists planning_task_status_owner_insert on public.planning_task_status;
create policy planning_task_status_owner_insert
on public.planning_task_status
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists planning_task_status_owner_update on public.planning_task_status;
create policy planning_task_status_owner_update
on public.planning_task_status
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

revoke all on public.planning_task_status from anon, authenticated;
grant select, insert, update on public.planning_task_status to authenticated;

comment on table public.planning_task_status is
  'Manual per-user timeline state. Task definitions remain versioned in application code.';

commit;
