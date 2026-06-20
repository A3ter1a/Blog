-- Asteroid base schema for Supabase.
-- Run this first in the Supabase SQL Editor, then run 0002_rls_policies.sql.

begin;

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;

do $$
begin
  create type public.note_type as enum ('note', 'problem', 'essay');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.subject as enum ('math', 'english', 'politics', 'economics');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  type public.note_type not null default 'note',
  title text not null default '',
  content text not null default '',
  subject public.subject,
  tags text[] not null default '{}'::text[],
  cover_image text,
  videos jsonb not null default '[]'::jsonb,
  problems jsonb not null default '[]'::jsonb,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notes add column if not exists type public.note_type;
alter table public.notes add column if not exists title text;
alter table public.notes add column if not exists content text;
alter table public.notes add column if not exists subject public.subject;
alter table public.notes add column if not exists tags text[];
alter table public.notes add column if not exists cover_image text;
alter table public.notes add column if not exists videos jsonb;
alter table public.notes add column if not exists problems jsonb;
alter table public.notes add column if not exists is_published boolean;
alter table public.notes add column if not exists created_at timestamptz;
alter table public.notes add column if not exists updated_at timestamptz;

update public.notes
set
  type = coalesce(type, 'note'::public.note_type),
  title = coalesce(title, ''),
  content = coalesce(content, ''),
  tags = coalesce(tags, '{}'::text[]),
  videos = coalesce(videos, '[]'::jsonb),
  problems = coalesce(problems, '[]'::jsonb),
  is_published = coalesce(is_published, true),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.notes alter column type set default 'note';
alter table public.notes alter column type set not null;
alter table public.notes alter column title set default '';
alter table public.notes alter column title set not null;
alter table public.notes alter column content set default '';
alter table public.notes alter column content set not null;
alter table public.notes alter column tags set default '{}'::text[];
alter table public.notes alter column tags set not null;
alter table public.notes alter column videos set default '[]'::jsonb;
alter table public.notes alter column videos set not null;
alter table public.notes alter column problems set default '[]'::jsonb;
alter table public.notes alter column problems set not null;
alter table public.notes alter column is_published set default true;
alter table public.notes alter column is_published set not null;
alter table public.notes alter column created_at set default now();
alter table public.notes alter column created_at set not null;
alter table public.notes alter column updated_at set default now();
alter table public.notes alter column updated_at set not null;

create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  note_id uuid references public.notes(id) on delete cascade,
  name text not null,
  parent_id uuid references public.chapters(id) on delete set null,
  sort_order integer not null default 0,
  description text,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_profile (
  id text primary key default 'main',
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists admin_users_email_lower_key
  on public.admin_users (lower(email));

create table if not exists public.problem_practice_statuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid not null references public.notes(id) on delete cascade,
  problem_id text not null,
  round integer not null default 0,
  attempts integer not null default 0,
  correct_count integer not null default 0,
  wrong_count integer not null default 0,
  last_result text check (last_result is null or last_result in ('correct', 'wrong', 'skipped')),
  is_mastered boolean not null default false,
  last_practiced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists problem_practice_statuses_user_note_problem_key
  on public.problem_practice_statuses (user_id, note_id, problem_id);

create table if not exists public.math3_self_tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '数学三自测试卷',
  mode text not null default 'quick' check (mode in ('quick', 'full')),
  difficulty text not null default 'simulation' check (difficulty in ('comfort', 'simulation', 'challenge')),
  status text not null default 'draft' check (status in ('draft', 'in_progress', 'submitted', 'reviewed')),
  paper jsonb not null default '{}'::jsonb,
  attempt jsonb not null default '{}'::jsonb,
  score double precision not null default 0,
  max_score double precision not null default 0,
  started_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_notes_updated_at on public.notes;
drop trigger if exists set_notes_updated_at on public.notes;
create trigger set_notes_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

drop trigger if exists set_chapters_updated_at on public.chapters;
create trigger set_chapters_updated_at
  before update on public.chapters
  for each row execute function public.set_updated_at();

drop trigger if exists set_site_profile_updated_at on public.site_profile;
create trigger set_site_profile_updated_at
  before update on public.site_profile
  for each row execute function public.set_updated_at();

drop trigger if exists set_problem_practice_statuses_updated_at on public.problem_practice_statuses;
create trigger set_problem_practice_statuses_updated_at
  before update on public.problem_practice_statuses
  for each row execute function public.set_updated_at();

drop trigger if exists set_math3_self_tests_updated_at on public.math3_self_tests;
create trigger set_math3_self_tests_updated_at
  before update on public.math3_self_tests
  for each row execute function public.set_updated_at();

create index if not exists idx_notes_public_created_at
  on public.notes (created_at desc) where is_published = true;
create index if not exists idx_notes_public_type_created_at
  on public.notes (type, created_at desc) where is_published = true;
create index if not exists idx_notes_public_subject_created_at
  on public.notes (subject, created_at desc) where is_published = true;
create index if not exists idx_notes_tags_gin
  on public.notes using gin (tags);
create index if not exists idx_notes_updated_at
  on public.notes (updated_at desc);

create index if not exists idx_chapters_note_sort
  on public.chapters (note_id, sort_order, name);
create index if not exists idx_chapters_parent_sort
  on public.chapters (parent_id, sort_order, name);
create index if not exists idx_chapters_global_sort
  on public.chapters (sort_order, name) where note_id is null;

create index if not exists idx_problem_practice_statuses_user_note
  on public.problem_practice_statuses (user_id, note_id);
create index if not exists idx_problem_practice_statuses_user_updated_at
  on public.problem_practice_statuses (user_id, updated_at desc);

create index if not exists idx_math3_self_tests_user_updated_at
  on public.math3_self_tests (user_id, updated_at desc);
create index if not exists idx_math3_self_tests_user_status
  on public.math3_self_tests (user_id, status);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'note-images',
  'note-images',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
