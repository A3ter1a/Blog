-- AST-WP10: version-anchored human review comments for AI content proposals.
-- Comments are separate from the proposal body so a reviewer can annotate a
-- selection without granting an AI account any approval or publication power.

begin;

do $$
begin
  if to_regclass('public.ai_content_proposals') is null
    or to_regprocedure('private.current_user_is_admin()') is null
  then
    raise exception '0024 requires ai_content_proposals and current_user_is_admin()';
  end if;
end
$$;

create table if not exists public.ai_content_proposal_comments (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.ai_content_proposals(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete restrict,
  proposal_content_version bigint not null,
  selection_start integer not null,
  selection_end integer not null,
  quoted_text text not null default '',
  body text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_content_comments_version_check check (proposal_content_version >= 1),
  constraint ai_content_comments_selection_check check (
    selection_start >= 0 and selection_end >= selection_start
  ),
  constraint ai_content_comments_quote_check check (char_length(quoted_text) <= 2000),
  constraint ai_content_comments_body_check check (
    nullif(btrim(body), '') is not null and char_length(body) <= 4000
  ),
  constraint ai_content_comments_status_check check (status in ('open', 'resolved', 'dismissed'))
);

create index if not exists ai_content_comments_proposal_status_idx
  on public.ai_content_proposal_comments (proposal_id, status, created_at);

drop trigger if exists set_ai_content_proposal_comments_updated_at on public.ai_content_proposal_comments;
create trigger set_ai_content_proposal_comments_updated_at
  before update on public.ai_content_proposal_comments
  for each row execute function public.set_updated_at();

alter table public.ai_content_proposal_comments enable row level security;
alter table public.ai_content_proposal_comments force row level security;

drop policy if exists ai_content_comments_owner_select on public.ai_content_proposal_comments;
drop policy if exists ai_content_comments_admin_select on public.ai_content_proposal_comments;
drop policy if exists ai_content_comments_admin_insert on public.ai_content_proposal_comments;
drop policy if exists ai_content_comments_admin_update on public.ai_content_proposal_comments;
drop policy if exists ai_content_comments_admin_delete on public.ai_content_proposal_comments;

create policy ai_content_comments_owner_select
on public.ai_content_proposal_comments for select to authenticated
using (exists (
  select 1
  from public.ai_content_proposals proposal
  where proposal.id = ai_content_proposal_comments.proposal_id
    and proposal.owner_user_id = (select auth.uid())
));

create policy ai_content_comments_admin_select
on public.ai_content_proposal_comments for select to authenticated
using ((select private.current_user_is_admin()));

create policy ai_content_comments_admin_insert
on public.ai_content_proposal_comments for insert to authenticated
with check (
  (select private.current_user_is_admin())
  and author_user_id = (select auth.uid())
  and exists (
    select 1 from public.ai_content_proposals proposal
    where proposal.id = ai_content_proposal_comments.proposal_id
  )
);

create policy ai_content_comments_admin_update
on public.ai_content_proposal_comments for update to authenticated
using ((select private.current_user_is_admin()))
with check ((select private.current_user_is_admin()));

create policy ai_content_comments_admin_delete
on public.ai_content_proposal_comments for delete to authenticated
using ((select private.current_user_is_admin()));

-- Once an AI proposal is submitted, its body is frozen until a reviewer sends
-- it back. This prevents an AI edit from silently invalidating review anchors.
drop policy if exists ai_content_proposals_owner_update on public.ai_content_proposals;
create policy ai_content_proposals_owner_update
on public.ai_content_proposals for update to authenticated
using (
  owner_user_id = (select auth.uid())
  and (select private.current_user_is_ai())
  and review_status in ('draft', 'self_checked', 'changes_requested')
)
with check (
  owner_user_id = (select auth.uid())
  and ai_profile_id = (select auth.uid())
  and review_status in ('draft', 'self_checked', 'changes_requested')
  and (select private.current_user_is_ai())
  and exists (
    select 1
    from public.ai_profiles profile
    where profile.id = (select auth.uid())
      and profile.is_active
      and profile.subject = ai_content_proposals.subject
  )
);

-- Publication is a single database transaction. Route Handlers may request it,
-- but an AI bearer token cannot call it because the function checks the same
-- administrator authority source used by the rest of the schema.
create or replace function public.publish_ai_content_proposal(p_proposal_id uuid)
returns public.ai_content_proposals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_user_id uuid := auth.uid();
  v_proposal public.ai_content_proposals%rowtype;
  v_note public.notes%rowtype;
begin
  if v_admin_user_id is null or not (private.current_user_is_admin()) then
    raise exception 'Administrator approval is required' using errcode = '42501';
  end if;

  select proposal.*
  into v_proposal
  from public.ai_content_proposals proposal
  where proposal.id = p_proposal_id
  for update;

  if not found then
    raise exception 'AI content proposal does not exist' using errcode = 'P0002';
  end if;

  if v_proposal.review_status = 'published' then
    return v_proposal;
  end if;

  if v_proposal.review_status <> 'approved' then
    raise exception 'Only an approved proposal can be published' using errcode = '55000';
  end if;

  if v_proposal.note_id is null then
    insert into public.notes (
      type,
      title,
      content,
      subject,
      tags,
      cover_image,
      videos,
      problems,
      is_published,
      author_kind,
      author_profile_id,
      owner_user_id
    )
    values (
      'note',
      v_proposal.title,
      v_proposal.content,
      v_proposal.subject,
      v_proposal.tags,
      v_proposal.cover_image,
      v_proposal.videos,
      v_proposal.problems,
      true,
      'ai',
      v_proposal.ai_profile_id,
      v_proposal.owner_user_id
    )
    returning * into v_note;

    update public.ai_content_proposals
    set note_id = v_note.id,
        review_status = 'published',
        reviewer_user_id = coalesce(reviewer_user_id, v_admin_user_id),
        reviewed_at = coalesce(reviewed_at, now()),
        published_at = coalesce(published_at, now())
    where id = v_proposal.id
    returning * into v_proposal;
  else
    update public.notes
    set title = v_proposal.title,
        content = v_proposal.content,
        subject = v_proposal.subject,
        tags = v_proposal.tags,
        cover_image = v_proposal.cover_image,
        videos = v_proposal.videos,
        problems = v_proposal.problems,
        is_published = true
    where id = v_proposal.note_id
      and author_kind = 'ai'
      and author_profile_id = v_proposal.ai_profile_id
      and owner_user_id = v_proposal.owner_user_id
    returning * into v_note;

    if not found then
      raise exception 'The proposal note is missing or has a different owner' using errcode = '23503';
    end if;

    update public.ai_content_proposals
    set review_status = 'published',
        reviewer_user_id = coalesce(reviewer_user_id, v_admin_user_id),
        reviewed_at = coalesce(reviewed_at, now()),
        published_at = coalesce(published_at, now())
    where id = v_proposal.id
    returning * into v_proposal;
  end if;

  return v_proposal;
end;
$$;

revoke all on function public.publish_ai_content_proposal(uuid) from public, anon, authenticated;
grant execute on function public.publish_ai_content_proposal(uuid) to authenticated;

revoke all on public.ai_content_proposal_comments from anon, authenticated;
grant select, insert, update, delete on public.ai_content_proposal_comments to authenticated;

comment on table public.ai_content_proposal_comments is
  'Human review comments anchored to a proposal content_version; stale anchors must be reselected after edits.';
comment on column public.ai_content_proposal_comments.selection_start is
  'UTF-16 offset from the browser selection start, matching JavaScript string offsets.';
comment on column public.ai_content_proposal_comments.selection_end is
  'UTF-16 offset from the browser selection end, matching JavaScript string offsets.';
comment on function public.publish_ai_content_proposal(uuid) is
  'Administrator-only transactional publication from an AI proposal into the existing notes shape.';

commit;
