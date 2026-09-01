-- Keep long-running internal AI calls exclusively leased and make cancellation
-- visible to the worker before it can publish a result.

begin;

create or replace function public.renew_job_item_lease(
  p_item_id uuid,
  p_worker_id text,
  p_lease_attempt integer,
  p_lease_seconds integer default 300
)
returns setof public.job_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  renewed_item public.job_items%rowtype;
begin
  if caller_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required to renew a job item lease';
  end if;
  if p_item_id is null then
    raise exception using errcode = '22023', message = 'item_id is required';
  end if;
  if nullif(btrim(p_worker_id), '') is null or length(btrim(p_worker_id)) > 200 then
    raise exception using errcode = '22023', message = 'worker_id must contain 1 to 200 characters';
  end if;
  if p_lease_attempt is null or p_lease_attempt < 1 then
    raise exception using errcode = '22023', message = 'lease_attempt must be a positive integer';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 5 or p_lease_seconds > 900 then
    raise exception using errcode = '22023', message = 'lease_seconds must be between 5 and 900';
  end if;

  update public.job_items item
  set lease_expires_at = statement_timestamp() + (p_lease_seconds * interval '1 second')
  where item.id = p_item_id
    and item.status = 'leased'
    and item.claimed_by = btrim(p_worker_id)
    and item.attempt_count = p_lease_attempt
    and item.lease_expires_at > statement_timestamp()
    and exists (
      select 1
      from public.jobs job
      where job.id = item.job_id
        and job.user_id = caller_user_id
        and job.job_class = 'internal'
        and job.status in ('queued', 'running', 'waiting_for_trigger', 'stalled')
    )
  returning item.* into renewed_item;

  if not found then
    raise exception using errcode = '55000', message = 'No active job and lease owned by this worker';
  end if;

  return next renewed_item;
end;
$$;

revoke all on function public.renew_job_item_lease(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.renew_job_item_lease(uuid, text, integer, integer) to authenticated;

comment on function public.renew_job_item_lease(uuid, text, integer, integer) is
  'Renews an unexpired owned item lease only while its parent internal job is still active.';

commit;
