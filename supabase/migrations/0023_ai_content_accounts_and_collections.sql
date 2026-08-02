-- AST-WP8: AI accounts, isolated content proposals, and generic note collections.
-- This migration is additive. It does not insert Auth users, seed accounts, or touch
-- existing note bodies. Provisioning the four AI accounts remains a separately reviewed
-- Auth/dashboard operation.

begin;

create table if not exists public.ai_profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  account_key text not null,
  subject public.subject not null,
  display_name text not null,
  avatar_url text,
  bio text not null default '',
  academic_affiliation text not null default '',
  focus_tags text[] not null default '{}'::text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_profiles_account_key_check check (account_key ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  constraint ai_profiles_display_name_check check (btrim(display_name) <> ''),
  constraint ai_profiles_account_subject_key unique (account_key),
  constraint ai_profiles_subject_key unique (subject)
);

create table if not exists public.ai_content_proposals (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  ai_profile_id uuid not null references public.ai_profiles(id) on delete restrict,
  note_id uuid references public.notes(id) on delete set null,
  title text not null,
  content text not null default '',
  subject public.subject not null,
  tags text[] not null default '{}'::text[],
  cover_image text,
  videos jsonb not null default '[]'::jsonb,
  problems jsonb not null default '[]'::jsonb,
  review_status text not null default 'draft',
  self_check jsonb not null default '{}'::jsonb,
  source_checksum text,
  content_version bigint not null default 1,
  reviewer_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_content_proposals_title_check check (btrim(title) <> ''),
  constraint ai_content_proposals_status_check check (
    review_status in ('draft', 'self_checked', 'pending_review', 'changes_requested', 'approved', 'published', 'rejected')
  ),
  constraint ai_content_proposals_checksum_check check (
    source_checksum is null or source_checksum ~ '^[0-9a-f]{64}$'
  ),
  constraint ai_content_proposals_content_version_check check (content_version >= 1)
);

create table if not exists public.note_collections (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  owner_kind text not null default 'human',
  ai_profile_id uuid references public.ai_profiles(id) on delete restrict,
  title text not null,
  description text not null default '',
  subject public.subject,
  cover_image text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint note_collections_owner_kind_check check (
    (owner_kind = 'human' and ai_profile_id is null)
    or (owner_kind = 'ai' and ai_profile_id = owner_user_id)
  ),
  constraint note_collections_title_check check (btrim(title) <> '')
);

create table if not exists public.note_collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.note_collections(id) on delete cascade,
  note_id uuid not null references public.notes(id) on delete cascade,
  sort_order integer not null default 0,
  added_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint note_collection_items_sort_order_check check (sort_order >= 0),
  constraint note_collection_items_unique_note unique (collection_id, note_id)
);

alter table public.notes
  add column if not exists author_kind text not null default 'human';
alter table public.notes
  add column if not exists author_profile_id uuid;
alter table public.notes
  add column if not exists owner_user_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.notes'::regclass
      and conname = 'notes_author_profile_fkey'
  ) then
    alter table public.notes
      add constraint notes_author_profile_fkey
      foreign key (author_profile_id) references public.ai_profiles(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.notes'::regclass
      and conname = 'notes_owner_user_fkey'
  ) then
    alter table public.notes
      add constraint notes_owner_user_fkey
      foreign key (owner_user_id) references auth.users(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.notes'::regclass
      and conname = 'notes_author_kind_check'
  ) then
    alter table public.notes
      add constraint notes_author_kind_check check (
        (author_kind = 'human' and author_profile_id is null and owner_user_id is null)
        or (
          author_kind = 'ai'
          and author_profile_id is not null
          and owner_user_id is not null
          and author_profile_id = owner_user_id
        )
      );
  end if;
end
$$;

create index if not exists ai_content_proposals_owner_status_updated_idx
  on public.ai_content_proposals (owner_user_id, review_status, updated_at desc);
create index if not exists ai_content_proposals_profile_updated_idx
  on public.ai_content_proposals (ai_profile_id, updated_at desc);
create index if not exists notes_ai_owner_updated_idx
  on public.notes (owner_user_id, updated_at desc)
  where author_kind = 'ai';
create index if not exists note_collections_owner_updated_idx
  on public.note_collections (owner_user_id, updated_at desc);
create index if not exists note_collection_items_collection_sort_idx
  on public.note_collection_items (collection_id, sort_order, created_at);

create or replace function private.current_user_is_ai()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.ai_profiles profile
    where profile.id = (select auth.uid())
      and profile.is_active
  )
  and not (select private.current_user_is_admin());
$$;

create or replace function private.current_ai_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select profile.id
  from public.ai_profiles profile
  where profile.id = (select auth.uid())
    and profile.is_active
    and not (select private.current_user_is_admin())
  limit 1;
$$;

revoke all on function private.current_user_is_ai() from public;
revoke all on function private.current_ai_profile_id() from public;
grant execute on function private.current_user_is_ai() to anon, authenticated;
grant execute on function private.current_ai_profile_id() to anon, authenticated;

create or replace function private.enforce_ai_admin_separation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'ai_profiles' then
    if exists (
      select 1
      from public.admin_users admin
      join auth.users auth_user on lower(auth_user.email) = lower(admin.email)
      where auth_user.id = new.id
    ) then
      raise exception 'An AI profile cannot use an administrator account';
    end if;
  elsif tg_table_name = 'admin_users' then
    if exists (
      select 1
      from public.ai_profiles profile
      join auth.users auth_user on auth_user.id = profile.id
      where lower(auth_user.email) = lower(new.email)
    ) then
      raise exception 'An administrator account cannot use an AI profile';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_ai_admin_separation() from public;

drop trigger if exists enforce_ai_admin_separation_on_ai_profiles on public.ai_profiles;
create trigger enforce_ai_admin_separation_on_ai_profiles
  before insert or update on public.ai_profiles
  for each row execute function private.enforce_ai_admin_separation();

drop trigger if exists enforce_ai_admin_separation_on_admin_users on public.admin_users;
create trigger enforce_ai_admin_separation_on_admin_users
  before insert or update on public.admin_users
  for each row execute function private.enforce_ai_admin_separation();

create or replace function private.enforce_ai_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.account_key is distinct from old.account_key
    or new.subject is distinct from old.subject
  ) then
    raise exception 'AI account identity is immutable; change it through a reviewed provisioning operation';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_ai_profile_identity() from public;

drop trigger if exists enforce_ai_profile_identity on public.ai_profiles;
create trigger enforce_ai_profile_identity
  before update on public.ai_profiles
  for each row execute function private.enforce_ai_profile_identity();

create or replace function private.bump_ai_proposal_content_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.content_version := 1;
  elsif (
    old.title,
    old.content,
    old.subject,
    old.tags,
    old.cover_image,
    old.videos,
    old.problems
  ) is distinct from (
    new.title,
    new.content,
    new.subject,
    new.tags,
    new.cover_image,
    new.videos,
    new.problems
  ) then
    new.content_version := old.content_version + 1;
  else
    new.content_version := old.content_version;
  end if;
  return new;
end;
$$;

revoke all on function private.bump_ai_proposal_content_version() from public;

drop trigger if exists bump_ai_proposal_content_version on public.ai_content_proposals;
create trigger bump_ai_proposal_content_version
  before insert or update on public.ai_content_proposals
  for each row execute function private.bump_ai_proposal_content_version();

drop trigger if exists set_ai_profiles_updated_at on public.ai_profiles;
create trigger set_ai_profiles_updated_at
  before update on public.ai_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_ai_content_proposals_updated_at on public.ai_content_proposals;
create trigger set_ai_content_proposals_updated_at
  before update on public.ai_content_proposals
  for each row execute function public.set_updated_at();

drop trigger if exists set_note_collections_updated_at on public.note_collections;
create trigger set_note_collections_updated_at
  before update on public.note_collections
  for each row execute function public.set_updated_at();

drop trigger if exists set_note_collection_items_updated_at on public.note_collection_items;
create trigger set_note_collection_items_updated_at
  before update on public.note_collection_items
  for each row execute function public.set_updated_at();

alter table public.ai_profiles enable row level security;
alter table public.ai_profiles force row level security;
alter table public.ai_content_proposals enable row level security;
alter table public.ai_content_proposals force row level security;
alter table public.note_collections enable row level security;
alter table public.note_collections force row level security;
alter table public.note_collection_items enable row level security;
alter table public.note_collection_items force row level security;
alter table public.notes enable row level security;
alter table public.notes force row level security;

drop policy if exists ai_profiles_public_select on public.ai_profiles;
drop policy if exists ai_profiles_owner_select on public.ai_profiles;
drop policy if exists ai_profiles_admin_select on public.ai_profiles;
drop policy if exists ai_profiles_admin_insert on public.ai_profiles;
drop policy if exists ai_profiles_owner_update on public.ai_profiles;
drop policy if exists ai_profiles_admin_update on public.ai_profiles;

create policy ai_profiles_public_select
on public.ai_profiles for select to anon, authenticated
using (is_active = true);

create policy ai_profiles_owner_select
on public.ai_profiles for select to authenticated
using (id = (select auth.uid()));

create policy ai_profiles_admin_select
on public.ai_profiles for select to authenticated
using ((select private.current_user_is_admin()));

create policy ai_profiles_admin_insert
on public.ai_profiles for insert to authenticated
with check ((select private.current_user_is_admin()));

create policy ai_profiles_owner_update
on public.ai_profiles for update to authenticated
using (id = (select auth.uid()) and is_active = true)
with check (id = (select auth.uid()) and is_active = true);

create policy ai_profiles_admin_update
on public.ai_profiles for update to authenticated
using ((select private.current_user_is_admin()))
with check ((select private.current_user_is_admin()));

drop policy if exists notes_ai_select on public.notes;
drop policy if exists notes_ai_insert on public.notes;
drop policy if exists notes_ai_update on public.notes;

create policy notes_ai_select
on public.notes for select to authenticated
using (
  author_kind = 'ai'
  and owner_user_id = (select auth.uid())
  and (select private.current_user_is_ai())
);

create policy notes_ai_insert
on public.notes for insert to authenticated
with check (
  author_kind = 'ai'
  and author_profile_id = (select auth.uid())
  and owner_user_id = (select auth.uid())
  and is_published = false
  and (select private.current_user_is_ai())
  and exists (
    select 1
    from public.ai_profiles profile
    where profile.id = (select auth.uid())
      and profile.is_active
      and profile.subject = notes.subject
  )
);

create policy notes_ai_update
on public.notes for update to authenticated
using (
  author_kind = 'ai'
  and owner_user_id = (select auth.uid())
  and (select private.current_user_is_ai())
)
with check (
  author_kind = 'ai'
  and author_profile_id = (select auth.uid())
  and owner_user_id = (select auth.uid())
  and is_published = false
  and (select private.current_user_is_ai())
  and exists (
    select 1
    from public.ai_profiles profile
    where profile.id = (select auth.uid())
      and profile.is_active
      and profile.subject = notes.subject
  )
);

drop policy if exists ai_content_proposals_owner_select on public.ai_content_proposals;
drop policy if exists ai_content_proposals_admin_select on public.ai_content_proposals;
drop policy if exists ai_content_proposals_owner_insert on public.ai_content_proposals;
drop policy if exists ai_content_proposals_owner_update on public.ai_content_proposals;
drop policy if exists ai_content_proposals_owner_delete on public.ai_content_proposals;
drop policy if exists ai_content_proposals_admin_update on public.ai_content_proposals;
drop policy if exists ai_content_proposals_admin_delete on public.ai_content_proposals;

create policy ai_content_proposals_owner_select
on public.ai_content_proposals for select to authenticated
using (owner_user_id = (select auth.uid()) and (select private.current_user_is_ai()));

create policy ai_content_proposals_admin_select
on public.ai_content_proposals for select to authenticated
using ((select private.current_user_is_admin()));

create policy ai_content_proposals_owner_insert
on public.ai_content_proposals for insert to authenticated
with check (
  owner_user_id = (select auth.uid())
  and ai_profile_id = (select auth.uid())
  and review_status = 'draft'
  and (select private.current_user_is_ai())
  and exists (
    select 1
    from public.ai_profiles profile
    where profile.id = (select auth.uid())
      and profile.is_active
      and profile.subject = ai_content_proposals.subject
  )
);

create policy ai_content_proposals_owner_update
on public.ai_content_proposals for update to authenticated
using (
  owner_user_id = (select auth.uid())
  and (select private.current_user_is_ai())
  and review_status in ('draft', 'self_checked', 'pending_review', 'changes_requested')
)
with check (
  owner_user_id = (select auth.uid())
  and ai_profile_id = (select auth.uid())
  and review_status in ('draft', 'self_checked', 'pending_review', 'changes_requested')
  and (select private.current_user_is_ai())
  and exists (
    select 1
    from public.ai_profiles profile
    where profile.id = (select auth.uid())
      and profile.is_active
      and profile.subject = ai_content_proposals.subject
  )
);

create policy ai_content_proposals_owner_delete
on public.ai_content_proposals for delete to authenticated
using (
  owner_user_id = (select auth.uid())
  and (select private.current_user_is_ai())
  and review_status in ('draft', 'self_checked', 'pending_review', 'changes_requested', 'rejected')
);

create policy ai_content_proposals_admin_update
on public.ai_content_proposals for update to authenticated
using ((select private.current_user_is_admin()))
with check ((select private.current_user_is_admin()));

create policy ai_content_proposals_admin_delete
on public.ai_content_proposals for delete to authenticated
using ((select private.current_user_is_admin()));

drop policy if exists note_collections_public_select on public.note_collections;
drop policy if exists note_collections_owner_select on public.note_collections;
drop policy if exists note_collections_admin_select on public.note_collections;
drop policy if exists note_collections_owner_insert on public.note_collections;
drop policy if exists note_collections_owner_update on public.note_collections;
drop policy if exists note_collections_owner_delete on public.note_collections;
drop policy if exists note_collections_admin_insert on public.note_collections;
drop policy if exists note_collections_admin_update on public.note_collections;
drop policy if exists note_collections_admin_delete on public.note_collections;

create policy note_collections_public_select
on public.note_collections for select to anon, authenticated
using (is_published = true);

create policy note_collections_owner_select
on public.note_collections for select to authenticated
using (owner_user_id = (select auth.uid()));

create policy note_collections_admin_select
on public.note_collections for select to authenticated
using ((select private.current_user_is_admin()));

create policy note_collections_owner_insert
on public.note_collections for insert to authenticated
with check (
  owner_kind = 'ai'
  and owner_user_id = (select auth.uid())
  and ai_profile_id = (select auth.uid())
  and (select private.current_user_is_ai())
);

create policy note_collections_owner_update
on public.note_collections for update to authenticated
using (
  owner_kind = 'ai'
  and owner_user_id = (select auth.uid())
  and ai_profile_id = (select auth.uid())
  and (select private.current_user_is_ai())
)
with check (
  owner_kind = 'ai'
  and owner_user_id = (select auth.uid())
  and ai_profile_id = (select auth.uid())
  and (select private.current_user_is_ai())
);

create policy note_collections_owner_delete
on public.note_collections for delete to authenticated
using (
  owner_kind = 'ai'
  and owner_user_id = (select auth.uid())
  and (select private.current_user_is_ai())
);

create policy note_collections_admin_insert
on public.note_collections for insert to authenticated
with check ((select private.current_user_is_admin()));

create policy note_collections_admin_update
on public.note_collections for update to authenticated
using ((select private.current_user_is_admin()))
with check ((select private.current_user_is_admin()));

create policy note_collections_admin_delete
on public.note_collections for delete to authenticated
using ((select private.current_user_is_admin()));

drop policy if exists note_collection_items_public_select on public.note_collection_items;
drop policy if exists note_collection_items_owner_select on public.note_collection_items;
drop policy if exists note_collection_items_admin_select on public.note_collection_items;
drop policy if exists note_collection_items_owner_insert on public.note_collection_items;
drop policy if exists note_collection_items_owner_update on public.note_collection_items;
drop policy if exists note_collection_items_owner_delete on public.note_collection_items;
drop policy if exists note_collection_items_admin_insert on public.note_collection_items;
drop policy if exists note_collection_items_admin_update on public.note_collection_items;
drop policy if exists note_collection_items_admin_delete on public.note_collection_items;

create policy note_collection_items_public_select
on public.note_collection_items for select to anon, authenticated
using (
  exists (
    select 1
    from public.note_collections collection
    join public.notes note on note.id = note_collection_items.note_id
    where collection.id = note_collection_items.collection_id
      and collection.is_published
      and note.is_published
  )
);

create policy note_collection_items_owner_select
on public.note_collection_items for select to authenticated
using (exists (
  select 1 from public.note_collections collection
  where collection.id = note_collection_items.collection_id
    and collection.owner_user_id = (select auth.uid())
));

create policy note_collection_items_admin_select
on public.note_collection_items for select to authenticated
using ((select private.current_user_is_admin()));

create policy note_collection_items_owner_insert
on public.note_collection_items for insert to authenticated
with check (exists (
  select 1
  from public.note_collections collection
  join public.notes note on note.id = note_collection_items.note_id
  where collection.id = note_collection_items.collection_id
    and collection.owner_kind = 'ai'
    and collection.owner_user_id = (select auth.uid())
    and collection.ai_profile_id = (select auth.uid())
    and note.author_kind = 'ai'
    and note.owner_user_id = (select auth.uid())
    and note.author_profile_id = (select auth.uid())
    and note_collection_items.added_by_user_id = (select auth.uid())
    and (select private.current_user_is_ai())
));

create policy note_collection_items_owner_update
on public.note_collection_items for update to authenticated
using (exists (
  select 1 from public.note_collections collection
  where collection.id = note_collection_items.collection_id
    and collection.owner_kind = 'ai'
    and collection.owner_user_id = (select auth.uid())
    and (select private.current_user_is_ai())
))
with check (exists (
  select 1
  from public.note_collections collection
  join public.notes note on note.id = note_collection_items.note_id
  where collection.id = note_collection_items.collection_id
    and collection.owner_kind = 'ai'
    and collection.owner_user_id = (select auth.uid())
    and note.author_kind = 'ai'
    and note.owner_user_id = (select auth.uid())
    and note_collection_items.added_by_user_id = (select auth.uid())
    and (select private.current_user_is_ai())
));

create policy note_collection_items_owner_delete
on public.note_collection_items for delete to authenticated
using (exists (
  select 1 from public.note_collections collection
  where collection.id = note_collection_items.collection_id
    and collection.owner_kind = 'ai'
    and collection.owner_user_id = (select auth.uid())
    and (select private.current_user_is_ai())
));

create policy note_collection_items_admin_insert
on public.note_collection_items for insert to authenticated
with check ((select private.current_user_is_admin()));

create policy note_collection_items_admin_update
on public.note_collection_items for update to authenticated
using ((select private.current_user_is_admin()))
with check ((select private.current_user_is_admin()));

create policy note_collection_items_admin_delete
on public.note_collection_items for delete to authenticated
using ((select private.current_user_is_admin()));

revoke all on public.ai_profiles, public.ai_content_proposals, public.note_collections, public.note_collection_items from anon, authenticated;
grant select on public.ai_profiles to anon, authenticated;
grant select, insert, update, delete on public.ai_content_proposals to authenticated;
grant select, insert, update, delete on public.note_collections to authenticated;
grant select, insert, update, delete on public.note_collection_items to authenticated;

comment on table public.ai_profiles is
  'Four reviewed AI identities. The id is the Auth user id; account identity and subject are immutable.';
comment on table public.ai_content_proposals is
  'AI-owned Markdown staging area. Only an administrator may approve/publish a proposal into notes.';
comment on column public.notes.author_kind is
  'human or ai. Existing rows remain human; AI rows must carry their own profile and owner id.';
comment on table public.note_collections is
  'Generic incremental collection metadata for notes, handouts, and knowledge-point sets.';
comment on table public.note_collection_items is
  'Ordered collection membership. Items can be appended, reordered, or removed without replacing a collection.';

commit;
