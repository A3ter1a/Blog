-- English past-paper training schema.
-- Additive only: this migration does not modify notes, existing problem JSON,
-- math3_self_tests, or problem_practice_statuses.

begin;

create table if not exists public.english_papers (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 2007 and 2026),
  paper_type text not null default 'english1' check (paper_type = 'english1'),
  title text not null default '',
  total_score double precision not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (paper_type, year)
);

create table if not exists public.english_passages (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.english_papers(id) on delete cascade,
  year integer not null check (year between 2007 and 2026),
  section text not null check (section in ('reading', 'cloze', 'new_type', 'translation', 'writing')),
  passage_no text not null,
  title text not null default '',
  content text not null default '',
  total_score double precision not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (paper_id, section, passage_no)
);

create table if not exists public.english_questions (
  id uuid primary key default gen_random_uuid(),
  passage_id uuid not null references public.english_passages(id) on delete cascade,
  question_no text not null,
  stem text not null default '',
  options jsonb not null default '[]'::jsonb,
  standard_answer text not null default '',
  score double precision not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (passage_id, question_no)
);

create table if not exists public.english_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  passage_id uuid not null references public.english_passages(id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted')),
  score double precision not null default 0,
  max_score double precision not null default 0,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, passage_id)
);

create table if not exists public.english_attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.english_attempts(id) on delete cascade,
  question_id uuid not null references public.english_questions(id) on delete cascade,
  answer text not null default '',
  is_correct boolean,
  score double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create table if not exists public.english_vocabulary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  passage_id uuid not null references public.english_passages(id) on delete cascade,
  word text not null,
  part_of_speech text not null default 'other' check (part_of_speech in ('n', 'v', 'adj', 'adv', 'prep', 'conj', 'phr', 'other')),
  definition text not null default '',
  example_sentence text not null default '',
  mastery_status text not null default 'new' check (mastery_status in ('new', 'learning', 'mastered')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_english_papers_updated_at
  before update on public.english_papers
  for each row execute function public.set_updated_at();

create trigger set_english_passages_updated_at
  before update on public.english_passages
  for each row execute function public.set_updated_at();

create trigger set_english_questions_updated_at
  before update on public.english_questions
  for each row execute function public.set_updated_at();

create trigger set_english_attempts_updated_at
  before update on public.english_attempts
  for each row execute function public.set_updated_at();

create trigger set_english_attempt_answers_updated_at
  before update on public.english_attempt_answers
  for each row execute function public.set_updated_at();

create trigger set_english_vocabulary_updated_at
  before update on public.english_vocabulary
  for each row execute function public.set_updated_at();

create index if not exists idx_english_passages_year_section
  on public.english_passages (year desc, section, sort_order);
create index if not exists idx_english_questions_passage_sort
  on public.english_questions (passage_id, sort_order, question_no);
create index if not exists idx_english_attempts_user_updated_at
  on public.english_attempts (user_id, updated_at desc);
create index if not exists idx_english_attempts_user_passage
  on public.english_attempts (user_id, passage_id);
create index if not exists idx_english_attempt_answers_attempt
  on public.english_attempt_answers (attempt_id);
create index if not exists idx_english_vocabulary_user_passage
  on public.english_vocabulary (user_id, passage_id, updated_at desc);
create index if not exists idx_english_vocabulary_user_word
  on public.english_vocabulary (user_id, lower(word));

alter table public.english_papers enable row level security;
alter table public.english_passages enable row level security;
alter table public.english_questions enable row level security;
alter table public.english_attempts enable row level security;
alter table public.english_attempt_answers enable row level security;
alter table public.english_vocabulary enable row level security;

create policy english_papers_admin_select
on public.english_papers
for select
to authenticated
using ((select private.current_user_is_admin()));

create policy english_papers_admin_insert
on public.english_papers
for insert
to authenticated
with check ((select private.current_user_is_admin()));

create policy english_papers_admin_update
on public.english_papers
for update
to authenticated
using ((select private.current_user_is_admin()))
with check ((select private.current_user_is_admin()));

create policy english_papers_admin_delete
on public.english_papers
for delete
to authenticated
using ((select private.current_user_is_admin()));

create policy english_passages_admin_select
on public.english_passages
for select
to authenticated
using ((select private.current_user_is_admin()));

create policy english_passages_admin_insert
on public.english_passages
for insert
to authenticated
with check ((select private.current_user_is_admin()));

create policy english_passages_admin_update
on public.english_passages
for update
to authenticated
using ((select private.current_user_is_admin()))
with check ((select private.current_user_is_admin()));

create policy english_passages_admin_delete
on public.english_passages
for delete
to authenticated
using ((select private.current_user_is_admin()));

create policy english_questions_admin_select
on public.english_questions
for select
to authenticated
using ((select private.current_user_is_admin()));

create policy english_questions_admin_insert
on public.english_questions
for insert
to authenticated
with check ((select private.current_user_is_admin()));

create policy english_questions_admin_update
on public.english_questions
for update
to authenticated
using ((select private.current_user_is_admin()))
with check ((select private.current_user_is_admin()));

create policy english_questions_admin_delete
on public.english_questions
for delete
to authenticated
using ((select private.current_user_is_admin()));

create policy english_attempts_owner_select
on public.english_attempts
for select
to authenticated
using (user_id = (select auth.uid()));

create policy english_attempts_owner_insert
on public.english_attempts
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy english_attempts_owner_update
on public.english_attempts
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy english_attempts_owner_delete
on public.english_attempts
for delete
to authenticated
using (user_id = (select auth.uid()));

create policy english_attempt_answers_owner_select
on public.english_attempt_answers
for select
to authenticated
using (
  exists (
    select 1
    from public.english_attempts
    where english_attempts.id = english_attempt_answers.attempt_id
      and english_attempts.user_id = (select auth.uid())
  )
);

create policy english_attempt_answers_owner_insert
on public.english_attempt_answers
for insert
to authenticated
with check (
  exists (
    select 1
    from public.english_attempts
    where english_attempts.id = english_attempt_answers.attempt_id
      and english_attempts.user_id = (select auth.uid())
  )
);

create policy english_attempt_answers_owner_update
on public.english_attempt_answers
for update
to authenticated
using (
  exists (
    select 1
    from public.english_attempts
    where english_attempts.id = english_attempt_answers.attempt_id
      and english_attempts.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.english_attempts
    where english_attempts.id = english_attempt_answers.attempt_id
      and english_attempts.user_id = (select auth.uid())
  )
);

create policy english_attempt_answers_owner_delete
on public.english_attempt_answers
for delete
to authenticated
using (
  exists (
    select 1
    from public.english_attempts
    where english_attempts.id = english_attempt_answers.attempt_id
      and english_attempts.user_id = (select auth.uid())
  )
);

create policy english_vocabulary_owner_select
on public.english_vocabulary
for select
to authenticated
using (user_id = (select auth.uid()));

create policy english_vocabulary_owner_insert
on public.english_vocabulary
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy english_vocabulary_owner_update
on public.english_vocabulary
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy english_vocabulary_owner_delete
on public.english_vocabulary
for delete
to authenticated
using (user_id = (select auth.uid()));

revoke all on public.english_papers from anon, authenticated;
revoke all on public.english_passages from anon, authenticated;
revoke all on public.english_questions from anon, authenticated;
revoke all on public.english_attempts from anon, authenticated;
revoke all on public.english_attempt_answers from anon, authenticated;
revoke all on public.english_vocabulary from anon, authenticated;

grant select, insert, update, delete on public.english_papers to authenticated;
grant select, insert, update, delete on public.english_passages to authenticated;
grant select, insert, update, delete on public.english_questions to authenticated;
grant select, insert, update, delete on public.english_attempts to authenticated;
grant select, insert, update, delete on public.english_attempt_answers to authenticated;
grant select, insert, update, delete on public.english_vocabulary to authenticated;

commit;
