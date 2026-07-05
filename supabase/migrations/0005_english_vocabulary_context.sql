-- English vocabulary trace metadata.
-- Additive only: this migration extends english_vocabulary for words,
-- fixed collocations, and source-text traceability.

begin;

alter table public.english_vocabulary
  add column if not exists entry_type text not null default 'word'
    check (entry_type in ('word', 'collocation')),
  add column if not exists source_excerpt text not null default '',
  add column if not exists source_start integer,
  add column if not exists source_end integer,
  add column if not exists source_paragraph integer;

create index if not exists idx_english_vocabulary_user_type_updated_at
  on public.english_vocabulary (user_id, entry_type, updated_at desc);

create index if not exists idx_english_vocabulary_passage_source
  on public.english_vocabulary (passage_id, source_start);

commit;
