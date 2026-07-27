-- AST-WP1-C / G2 + G2': note versioning and chapter scope integrity.
-- Additive except for the new chapter integrity constraint. Existing note values are untouched.

begin;

alter table public.notes
  add column if not exists content_version bigint not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.notes'::regclass
      and conname = 'notes_content_version_positive'
  ) then
    alter table public.notes
      add constraint notes_content_version_positive
      check (content_version >= 1);
  end if;
end
$$;

create or replace function private.bump_note_content_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.content_version := 1;
    return new;
  end if;

  if (
    old.type,
    old.title,
    old.content,
    old.subject,
    old.tags,
    old.cover_image,
    old.videos,
    old.problems,
    old.is_published
  ) is distinct from (
    new.type,
    new.title,
    new.content,
    new.subject,
    new.tags,
    new.cover_image,
    new.videos,
    new.problems,
    new.is_published
  ) then
    new.content_version := old.content_version + 1;
  else
    new.content_version := old.content_version;
  end if;

  return new;
end;
$$;

revoke all on function private.bump_note_content_version() from public;

drop trigger if exists bump_notes_content_version on public.notes;
create trigger bump_notes_content_version
  before insert or update on public.notes
  for each row
  execute function private.bump_note_content_version();

do $$
begin
  if exists (
    select 1
    from public.chapters child
    join public.chapters parent on parent.id = child.parent_id
    where child.note_id is distinct from parent.note_id
  ) then
    raise exception 'Cannot enable chapter scope constraint: existing parent/child note scopes differ';
  end if;
end
$$;

create or replace function private.enforce_chapter_scope()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  parent_note_id uuid;
begin
  if new.parent_id = new.id then
    raise exception 'A chapter cannot be its own parent';
  end if;

  if new.parent_id is not null then
    select note_id
      into parent_note_id
    from public.chapters
    where id = new.parent_id;

    if not found then
      raise exception 'Parent chapter % does not exist', new.parent_id;
    end if;

    if parent_note_id is distinct from new.note_id then
      raise exception 'Parent and child chapters must belong to the same note scope';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.note_id is distinct from old.note_id and exists (
    select 1
    from public.chapters child
    where child.parent_id = new.id
      and child.note_id is distinct from new.note_id
  ) then
    raise exception 'Cannot move a parent chapter while its children remain in another note scope';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_chapter_scope() from public;

drop trigger if exists enforce_chapters_scope on public.chapters;
create trigger enforce_chapters_scope
  before insert or update of note_id, parent_id on public.chapters
  for each row
  execute function private.enforce_chapter_scope();

comment on column public.notes.content_version is
  'Monotonic note content version used for optimistic concurrency and immutable source snapshots.';

commit;
