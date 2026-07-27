-- AST-WP3-A: atomic database lease primitives for bounded internal job workers.
-- Additive functions plus a privilege reduction: job_items state transitions must use these RPCs.

begin;

create or replace function public.enqueue_job_item(
  p_job_id uuid,
  p_ordinal integer,
  p_idempotency_key text,
  p_payload jsonb default '{}'::jsonb
)
returns setof public.job_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  queued_item public.job_items%rowtype;
  normalized_key text := btrim(p_idempotency_key);
  normalized_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  parent_job_class text;
  parent_job_status text;
begin
  if caller_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required to enqueue a job item';
  end if;
  if p_job_id is null then
    raise exception using errcode = '22023', message = 'job_id is required';
  end if;
  if p_ordinal is null or p_ordinal < 0 then
    raise exception using errcode = '22023', message = 'ordinal must be a non-negative integer';
  end if;
  if nullif(normalized_key, '') is null or length(normalized_key) > 500 then
    raise exception using errcode = '22023', message = 'idempotency_key must contain 1 to 500 characters';
  end if;
  select job.job_class, job.status
    into parent_job_class, parent_job_status
  from public.jobs job
  where job.id = p_job_id
    and job.user_id = caller_user_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'Only the job owner may enqueue or resolve an idempotent item';
  end if;

  select item.* into queued_item
  from public.job_items item
  where item.job_id = p_job_id
    and item.idempotency_key = normalized_key;

  if found then
    if queued_item.ordinal is distinct from p_ordinal or queued_item.payload is distinct from normalized_payload then
      raise exception using errcode = '23505', message = 'Idempotency key already exists with different immutable input';
    end if;
    return next queued_item;
    return;
  end if;

  if parent_job_class <> 'internal' or parent_job_status <> 'queued' then
    raise exception using errcode = '55000', message = 'New items may only be added to a queued internal job';
  end if;

  insert into public.job_items (job_id, ordinal, idempotency_key, status, payload)
  values (p_job_id, p_ordinal, normalized_key, 'pending', normalized_payload)
  on conflict (job_id, idempotency_key) do nothing
  returning * into queued_item;

  if not found then
    select item.* into queued_item
    from public.job_items item
    where item.job_id = p_job_id
      and item.idempotency_key = normalized_key;

    if not found
      or queued_item.ordinal is distinct from p_ordinal
      or queued_item.payload is distinct from normalized_payload
    then
      raise exception using errcode = '23505', message = 'Idempotency key already exists with different immutable input';
    end if;
  end if;

  return next queued_item;
end;
$$;

create or replace function public.claim_next_job_item(
  p_job_id uuid,
  p_worker_id text,
  p_lease_seconds integer default 60
)
returns setof public.job_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
begin
  if caller_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required to claim a job item';
  end if;
  if p_job_id is null then
    raise exception using errcode = '22023', message = 'job_id is required';
  end if;
  if nullif(btrim(p_worker_id), '') is null or length(btrim(p_worker_id)) > 200 then
    raise exception using errcode = '22023', message = 'worker_id must contain 1 to 200 characters';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 5 or p_lease_seconds > 900 then
    raise exception using errcode = '22023', message = 'lease_seconds must be between 5 and 900';
  end if;

  return query
  with candidate as (
    select item.id
    from public.job_items item
    where item.job_id = p_job_id
      and exists (
        select 1
        from public.jobs job
        where job.id = item.job_id
          and job.user_id = caller_user_id
          and job.job_class = 'internal'
          and job.status in ('queued', 'running', 'waiting_for_trigger', 'stalled')
      )
      and (
        item.status = 'pending'
        or (
          item.status = 'leased'
          and item.lease_expires_at <= statement_timestamp()
        )
      )
    order by item.ordinal, item.id
    for update of item skip locked
    limit 1
  )
  update public.job_items item
  set status = 'leased',
      claimed_by = btrim(p_worker_id),
      lease_expires_at = statement_timestamp() + (p_lease_seconds * interval '1 second'),
      attempt_count = item.attempt_count + 1,
      result = null,
      error = null
  from candidate
  where item.id = candidate.id
  returning item.*;
end;
$$;

create or replace function public.complete_job_item(
  p_item_id uuid,
  p_worker_id text,
  p_lease_attempt integer,
  p_result jsonb default null
)
returns setof public.job_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  updated_item public.job_items%rowtype;
begin
  if caller_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required to complete a job item';
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

  update public.job_items item
  set status = 'succeeded',
      result = p_result,
      error = null,
      lease_expires_at = null
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
    )
  returning item.* into updated_item;

  if not found then
    raise exception using errcode = '55000', message = 'No active lease owned by this worker';
  end if;

  return next updated_item;
end;
$$;

create or replace function public.fail_job_item(
  p_item_id uuid,
  p_worker_id text,
  p_lease_attempt integer,
  p_error text
)
returns setof public.job_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  updated_item public.job_items%rowtype;
begin
  if caller_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required to fail a job item';
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
  if nullif(btrim(p_error), '') is null or length(p_error) > 32768 then
    raise exception using errcode = '22023', message = 'error must contain 1 to 32768 characters';
  end if;

  update public.job_items item
  set status = 'failed',
      result = null,
      error = p_error,
      lease_expires_at = null
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
    )
  returning item.* into updated_item;

  if not found then
    raise exception using errcode = '55000', message = 'No active lease owned by this worker';
  end if;

  return next updated_item;
end;
$$;

create or replace function public.reset_failed_job_item(p_item_id uuid)
returns setof public.job_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  updated_item public.job_items%rowtype;
begin
  if caller_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required to reset a job item';
  end if;
  if p_item_id is null then
    raise exception using errcode = '22023', message = 'item_id is required';
  end if;

  update public.job_items item
  set status = 'pending',
      claimed_by = null,
      lease_expires_at = null,
      result = null,
      error = null
  where item.id = p_item_id
    and item.status = 'failed'
    and exists (
      select 1
      from public.jobs job
      where job.id = item.job_id
        and job.user_id = caller_user_id
    )
  returning item.* into updated_item;

  if not found then
    raise exception using errcode = '55000', message = 'Only an owned failed item can be reset';
  end if;

  return next updated_item;
end;
$$;

-- RLS policies remain as defense in depth, but clients may no longer forge or mutate item states directly.
revoke insert, update on public.job_items from authenticated;

revoke all on function public.enqueue_job_item(uuid, integer, text, jsonb) from public, anon, authenticated;
revoke all on function public.claim_next_job_item(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.complete_job_item(uuid, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.fail_job_item(uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.reset_failed_job_item(uuid) from public, anon, authenticated;

grant execute on function public.enqueue_job_item(uuid, integer, text, jsonb) to authenticated;
grant execute on function public.claim_next_job_item(uuid, text, integer) to authenticated;
grant execute on function public.complete_job_item(uuid, text, integer, jsonb) to authenticated;
grant execute on function public.fail_job_item(uuid, text, integer, text) to authenticated;
grant execute on function public.reset_failed_job_item(uuid) to authenticated;

comment on function public.enqueue_job_item(uuid, integer, text, jsonb) is
  'Idempotently enqueues a clean pending item for an owned queued internal job.';
comment on function public.claim_next_job_item(uuid, text, integer) is
  'Atomically claims one pending or expired job item owned by auth.uid(); database time controls the lease.';
comment on function public.complete_job_item(uuid, text, integer, jsonb) is
  'Completes an owned job item only for its current worker, lease attempt and unexpired lease.';
comment on function public.fail_job_item(uuid, text, integer, text) is
  'Fails an owned job item only for its current worker, lease attempt and unexpired lease.';
comment on function public.reset_failed_job_item(uuid) is
  'Explicitly resets an owned failed item without erasing its attempt count.';

commit;
