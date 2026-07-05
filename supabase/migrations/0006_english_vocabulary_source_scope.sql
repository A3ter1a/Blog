-- English vocabulary source scope and familiar meaning support.
-- Additive for data: keeps existing vocabulary rows and only broadens metadata.

begin;

alter table public.english_vocabulary
  add column if not exists source_area text not null default 'passage',
  add column if not exists source_question_id uuid references public.english_questions(id) on delete set null,
  add column if not exists source_option_label text not null default '',
  add column if not exists highlight_text text not null default '',
  add column if not exists ai_generated boolean not null default false;

do $$
declare
  constraint_name text;
begin
  select conname
  into constraint_name
  from pg_constraint
  where conrelid = 'public.english_vocabulary'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%entry_type%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.english_vocabulary drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.english_vocabulary
  add constraint english_vocabulary_entry_type_check
  check (entry_type in ('word', 'collocation', 'familiar_meaning'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.english_vocabulary'::regclass
      and conname = 'english_vocabulary_source_area_check'
  ) then
    alter table public.english_vocabulary
      add constraint english_vocabulary_source_area_check
      check (source_area in ('passage', 'question', 'option'));
  end if;
end $$;

create index if not exists idx_english_vocabulary_user_source
  on public.english_vocabulary (user_id, source_area, updated_at desc);

create index if not exists idx_english_vocabulary_question
  on public.english_vocabulary (source_question_id, source_option_label);

commit;
