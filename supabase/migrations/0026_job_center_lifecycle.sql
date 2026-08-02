-- AST-WP12: durable cancellation and terminal-message retention for the message center.

begin;

alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check check (
  status in ('queued', 'dispatched', 'running', 'waiting_for_trigger', 'succeeded', 'failed', 'stalled', 'claimed', 'cancelled')
);

drop policy if exists jobs_owner_delete on public.jobs;
create policy jobs_owner_delete on public.jobs for delete to authenticated
using (
  user_id = (select auth.uid())
  and status in ('succeeded', 'failed', 'stalled', 'claimed', 'cancelled')
);

grant delete on public.jobs to authenticated;

comment on column public.jobs.status is
  'Lifecycle status. cancelled is a user decision and remains visible in the message center until terminal retention cleanup.';

commit;
