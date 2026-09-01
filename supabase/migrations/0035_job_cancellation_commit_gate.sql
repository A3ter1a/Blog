-- Make cancellation and side-effect publication mutually exclusive at commit.
-- Job-backed business rows use the job UUID as their command/idempotency UUID.

begin;

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
        and job.job_class = 'internal'
        and job.status in ('queued', 'running', 'waiting_for_trigger', 'stalled')
    )
  returning item.* into updated_item;

  if not found then
    raise exception using errcode = '55000', message = 'No active job and lease owned by this worker';
  end if;

  return next updated_item;
end;
$$;

create or replace function private.assert_active_job_backed_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  command_status text;
begin
  if caller_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required for a job-backed write';
  end if;

  select job.status
  into command_status
  from public.jobs job
  where job.id = new.id
    and job.user_id = caller_user_id
    and job.job_class = 'internal'
  for update;

  if found and command_status not in ('queued', 'running', 'waiting_for_trigger', 'stalled') then
    raise exception using errcode = '55000', message = 'The backing job was cancelled or already reached a terminal state';
  end if;

  return new;
end;
$$;

create or replace function public.job_commit_gate_ready()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select true $$;

drop trigger if exists assert_active_job_backed_grade_insert on public.grades;
create trigger assert_active_job_backed_grade_insert
  before insert on public.grades
  for each row execute function private.assert_active_job_backed_insert();

drop trigger if exists assert_active_job_backed_attempt_revision_insert on public.attempt_revisions;
create trigger assert_active_job_backed_attempt_revision_insert
  before insert on public.attempt_revisions
  for each row execute function private.assert_active_job_backed_insert();

drop trigger if exists assert_active_job_backed_quiz_insert on public.ai_knowledge_quizzes;
create trigger assert_active_job_backed_quiz_insert
  before insert on public.ai_knowledge_quizzes
  for each row execute function private.assert_active_job_backed_insert();

revoke all on function public.complete_job_item(uuid, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.complete_job_item(uuid, text, integer, jsonb) to authenticated;
revoke all on function private.assert_active_job_backed_insert() from public, anon, authenticated;
revoke all on function public.job_commit_gate_ready() from public, anon, authenticated;
grant execute on function public.job_commit_gate_ready() to authenticated;

comment on function private.assert_active_job_backed_insert() is
  'Serializes job-backed business inserts with cancellation when the inserted UUID matches an owned internal job UUID.';

commit;
