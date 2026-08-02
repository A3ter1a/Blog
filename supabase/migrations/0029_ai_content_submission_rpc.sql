-- AST-WP9 follow-up: submit a self-checked proposal without widening the
-- general owner UPDATE policy to pending_review. The function changes only
-- review_status after verifying the authenticated AI owns the proposal.

begin;

do $$
begin
  if to_regclass('public.ai_content_proposals') is null
    or to_regprocedure('private.current_user_is_ai()') is null
  then
    raise exception '0029 requires ai_content_proposals and current_user_is_ai()';
  end if;
end
$$;

create or replace function public.submit_ai_content_proposal(p_proposal_id uuid)
returns public.ai_content_proposals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_proposal public.ai_content_proposals%rowtype;
begin
  if v_user_id is null or not private.current_user_is_ai() then
    raise exception 'Only an active AI account can submit a proposal'
      using errcode = '42501';
  end if;

  select proposal.*
  into v_proposal
  from public.ai_content_proposals proposal
  where proposal.id = p_proposal_id
  for update;

  if not found then
    raise exception 'AI content proposal not found'
      using errcode = 'P0002';
  end if;

  if v_proposal.owner_user_id <> v_user_id
    or v_proposal.ai_profile_id <> v_user_id
  then
    raise exception 'AI account does not own this proposal'
      using errcode = '42501';
  end if;

  if v_proposal.review_status = 'pending_review' then
    return v_proposal;
  end if;

  if v_proposal.review_status <> 'self_checked'
    or not (v_proposal.self_check @> '{"passed": true}'::jsonb)
    or nullif(v_proposal.source_checksum, '') is null
  then
    raise exception 'Proposal must pass self-check before review submission'
      using errcode = '22023';
  end if;

  update public.ai_content_proposals proposal
  set review_status = 'pending_review'
  where proposal.id = p_proposal_id
  returning proposal.* into v_proposal;

  return v_proposal;
end;
$$;

revoke all on function public.submit_ai_content_proposal(uuid) from public, anon, authenticated;
grant execute on function public.submit_ai_content_proposal(uuid) to authenticated;

comment on function public.submit_ai_content_proposal(uuid) is
  'Atomically submits an owned self-checked AI proposal without granting general pending-review updates.';

commit;
