-- AST-WP13: AI-generated handout knowledge-point quick tests.
-- Questions are stored separately from answers/explanations. AI accounts own
-- private drafts; only administrators can review/publish them or grade a run.

begin;

do $$
begin
  if to_regclass('public.ai_profiles') is null
    or to_regclass('public.ai_content_proposals') is null
    or to_regprocedure('private.current_user_is_ai()') is null
    or to_regprocedure('private.current_user_is_admin()') is null
  then
    raise exception '0027 requires 0023 AI content accounts and 0024 review helpers';
  end if;
end
$$;

create table if not exists public.ai_knowledge_quizzes (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.ai_content_proposals(id) on delete cascade,
  note_id uuid references public.notes(id) on delete set null,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  ai_profile_id uuid not null references public.ai_profiles(id) on delete restrict,
  title text not null,
  subject public.subject not null,
  review_status text not null default 'draft',
  self_check jsonb not null default '{}'::jsonb,
  source_checksum text,
  content_version bigint not null default 1,
  item_count integer not null default 0,
  reviewer_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_knowledge_quizzes_title_check check (btrim(title) <> ''),
  constraint ai_knowledge_quizzes_status_check check (
    review_status in ('draft', 'self_checked', 'pending_review', 'changes_requested', 'approved', 'published', 'rejected')
  ),
  constraint ai_knowledge_quizzes_checksum_check check (
    source_checksum is null or source_checksum ~ '^[0-9a-f]{64}$'
  ),
  constraint ai_knowledge_quizzes_version_check check (content_version >= 1),
  constraint ai_knowledge_quizzes_item_count_check check (item_count between 0 and 80),
  constraint ai_knowledge_quizzes_owner_profile_check check (owner_user_id = ai_profile_id)
);

create table if not exists public.ai_knowledge_quiz_items (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.ai_knowledge_quizzes(id) on delete cascade,
  ordinal smallint not null,
  item_type text not null,
  question text not null,
  options jsonb not null default '[]'::jsonb,
  answer jsonb not null,
  explanation text not null,
  knowledge_points text[] not null default '{}'::text[],
  difficulty text not null default 'medium',
  source_heading text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_knowledge_quiz_items_ordinal_check check (ordinal between 1 and 80),
  constraint ai_knowledge_quiz_items_type_check check (
    item_type in ('single_choice', 'multiple_choice', 'true_false', 'short_answer')
  ),
  constraint ai_knowledge_quiz_items_question_check check (btrim(question) <> ''),
  constraint ai_knowledge_quiz_items_explanation_check check (btrim(explanation) <> ''),
  constraint ai_knowledge_quiz_items_options_check check (jsonb_typeof(options) = 'array'),
  constraint ai_knowledge_quiz_items_answer_check check (jsonb_typeof(answer) in ('string', 'array', 'boolean')),
  constraint ai_knowledge_quiz_items_difficulty_check check (difficulty in ('easy', 'medium', 'hard')),
  constraint ai_knowledge_quiz_items_unique_ordinal unique (quiz_id, ordinal),
  constraint ai_knowledge_quiz_items_quiz_id_id_key unique (quiz_id, id)
);

create table if not exists public.ai_knowledge_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.ai_knowledge_quizzes(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  answers jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  score numeric(8, 4),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_knowledge_quiz_attempts_answers_check check (jsonb_typeof(answers) = 'object'),
  constraint ai_knowledge_quiz_attempts_result_check check (jsonb_typeof(result) = 'object'),
  constraint ai_knowledge_quiz_attempts_score_check check (score is null or (score >= 0 and score <= 100))
);

create index if not exists ai_knowledge_quizzes_owner_updated_idx
  on public.ai_knowledge_quizzes (owner_user_id, updated_at desc);
create index if not exists ai_knowledge_quizzes_note_status_idx
  on public.ai_knowledge_quizzes (note_id, review_status, updated_at desc);
create index if not exists ai_knowledge_quiz_items_quiz_ordinal_idx
  on public.ai_knowledge_quiz_items (quiz_id, ordinal);
create index if not exists ai_knowledge_quiz_attempts_user_created_idx
  on public.ai_knowledge_quiz_attempts (user_id, created_at desc);

drop trigger if exists set_ai_knowledge_quizzes_updated_at on public.ai_knowledge_quizzes;
create trigger set_ai_knowledge_quizzes_updated_at
  before update on public.ai_knowledge_quizzes
  for each row execute function public.set_updated_at();

drop trigger if exists set_ai_knowledge_quiz_items_updated_at on public.ai_knowledge_quiz_items;
create trigger set_ai_knowledge_quiz_items_updated_at
  before update on public.ai_knowledge_quiz_items
  for each row execute function public.set_updated_at();

drop trigger if exists set_ai_knowledge_quiz_attempts_updated_at on public.ai_knowledge_quiz_attempts;
create trigger set_ai_knowledge_quiz_attempts_updated_at
  before update on public.ai_knowledge_quiz_attempts
  for each row execute function public.set_updated_at();

alter table public.ai_knowledge_quizzes enable row level security;
alter table public.ai_knowledge_quizzes force row level security;
alter table public.ai_knowledge_quiz_items enable row level security;
alter table public.ai_knowledge_quiz_items force row level security;
alter table public.ai_knowledge_quiz_attempts enable row level security;
alter table public.ai_knowledge_quiz_attempts force row level security;

drop policy if exists ai_knowledge_quizzes_owner_select on public.ai_knowledge_quizzes;
drop policy if exists ai_knowledge_quizzes_owner_insert on public.ai_knowledge_quizzes;
drop policy if exists ai_knowledge_quizzes_owner_update on public.ai_knowledge_quizzes;
drop policy if exists ai_knowledge_quizzes_owner_delete on public.ai_knowledge_quizzes;
drop policy if exists ai_knowledge_quizzes_admin_select on public.ai_knowledge_quizzes;
drop policy if exists ai_knowledge_quizzes_admin_insert on public.ai_knowledge_quizzes;
drop policy if exists ai_knowledge_quizzes_admin_update on public.ai_knowledge_quizzes;
drop policy if exists ai_knowledge_quizzes_admin_delete on public.ai_knowledge_quizzes;

create policy ai_knowledge_quizzes_owner_select
on public.ai_knowledge_quizzes for select to authenticated
using (owner_user_id = (select auth.uid()) and (select private.current_user_is_ai()));

create policy ai_knowledge_quizzes_owner_insert
on public.ai_knowledge_quizzes for insert to authenticated
with check (
  owner_user_id = (select auth.uid())
  and ai_profile_id = (select auth.uid())
  and review_status in ('draft', 'self_checked')
  and (select private.current_user_is_ai())
  and exists (
    select 1 from public.ai_content_proposals proposal
    where proposal.id = ai_knowledge_quizzes.proposal_id
      and proposal.owner_user_id = (select auth.uid())
      and proposal.ai_profile_id = (select auth.uid())
  )
);

create policy ai_knowledge_quizzes_owner_update
on public.ai_knowledge_quizzes for update to authenticated
using (
  owner_user_id = (select auth.uid())
  and (select private.current_user_is_ai())
  and review_status in ('draft', 'self_checked', 'changes_requested', 'rejected')
)
with check (
  owner_user_id = (select auth.uid())
  and ai_profile_id = (select auth.uid())
  and review_status in ('draft', 'self_checked', 'pending_review', 'changes_requested', 'rejected')
  and (select private.current_user_is_ai())
);

create policy ai_knowledge_quizzes_owner_delete
on public.ai_knowledge_quizzes for delete to authenticated
using (
  owner_user_id = (select auth.uid())
  and (select private.current_user_is_ai())
  and review_status in ('draft', 'self_checked', 'changes_requested', 'rejected')
);

create policy ai_knowledge_quizzes_admin_select
on public.ai_knowledge_quizzes for select to authenticated
using ((select private.current_user_is_admin()));
create policy ai_knowledge_quizzes_admin_insert
on public.ai_knowledge_quizzes for insert to authenticated
with check ((select private.current_user_is_admin()));
create policy ai_knowledge_quizzes_admin_update
on public.ai_knowledge_quizzes for update to authenticated
using ((select private.current_user_is_admin()))
with check ((select private.current_user_is_admin()));
create policy ai_knowledge_quizzes_admin_delete
on public.ai_knowledge_quizzes for delete to authenticated
using ((select private.current_user_is_admin()));

drop policy if exists ai_knowledge_quiz_items_owner_select on public.ai_knowledge_quiz_items;
drop policy if exists ai_knowledge_quiz_items_owner_insert on public.ai_knowledge_quiz_items;
drop policy if exists ai_knowledge_quiz_items_owner_update on public.ai_knowledge_quiz_items;
drop policy if exists ai_knowledge_quiz_items_owner_delete on public.ai_knowledge_quiz_items;
drop policy if exists ai_knowledge_quiz_items_admin_select on public.ai_knowledge_quiz_items;
drop policy if exists ai_knowledge_quiz_items_admin_insert on public.ai_knowledge_quiz_items;
drop policy if exists ai_knowledge_quiz_items_admin_update on public.ai_knowledge_quiz_items;
drop policy if exists ai_knowledge_quiz_items_admin_delete on public.ai_knowledge_quiz_items;

create policy ai_knowledge_quiz_items_owner_select
on public.ai_knowledge_quiz_items for select to authenticated
using (exists (
  select 1 from public.ai_knowledge_quizzes quiz
  where quiz.id = ai_knowledge_quiz_items.quiz_id
    and quiz.owner_user_id = (select auth.uid())
    and (select private.current_user_is_ai())
));
create policy ai_knowledge_quiz_items_owner_insert
on public.ai_knowledge_quiz_items for insert to authenticated
with check (exists (
  select 1 from public.ai_knowledge_quizzes quiz
  where quiz.id = ai_knowledge_quiz_items.quiz_id
    and quiz.owner_user_id = (select auth.uid())
    and quiz.review_status in ('draft', 'self_checked', 'changes_requested', 'rejected')
    and (select private.current_user_is_ai())
));
create policy ai_knowledge_quiz_items_owner_update
on public.ai_knowledge_quiz_items for update to authenticated
using (exists (
  select 1 from public.ai_knowledge_quizzes quiz
  where quiz.id = ai_knowledge_quiz_items.quiz_id
    and quiz.owner_user_id = (select auth.uid())
    and quiz.review_status in ('draft', 'self_checked', 'changes_requested', 'rejected')
    and (select private.current_user_is_ai())
))
with check (exists (
  select 1 from public.ai_knowledge_quizzes quiz
  where quiz.id = ai_knowledge_quiz_items.quiz_id
    and quiz.owner_user_id = (select auth.uid())
    and quiz.review_status in ('draft', 'self_checked', 'changes_requested', 'rejected')
    and (select private.current_user_is_ai())
));
create policy ai_knowledge_quiz_items_owner_delete
on public.ai_knowledge_quiz_items for delete to authenticated
using (exists (
  select 1 from public.ai_knowledge_quizzes quiz
  where quiz.id = ai_knowledge_quiz_items.quiz_id
    and quiz.owner_user_id = (select auth.uid())
    and quiz.review_status in ('draft', 'self_checked', 'changes_requested', 'rejected')
    and (select private.current_user_is_ai())
));
create policy ai_knowledge_quiz_items_admin_select
on public.ai_knowledge_quiz_items for select to authenticated
using ((select private.current_user_is_admin()));
create policy ai_knowledge_quiz_items_admin_insert
on public.ai_knowledge_quiz_items for insert to authenticated
with check ((select private.current_user_is_admin()));
create policy ai_knowledge_quiz_items_admin_update
on public.ai_knowledge_quiz_items for update to authenticated
using ((select private.current_user_is_admin()))
with check ((select private.current_user_is_admin()));
create policy ai_knowledge_quiz_items_admin_delete
on public.ai_knowledge_quiz_items for delete to authenticated
using ((select private.current_user_is_admin()));

drop policy if exists ai_knowledge_quiz_attempts_owner_select on public.ai_knowledge_quiz_attempts;
drop policy if exists ai_knowledge_quiz_attempts_owner_insert on public.ai_knowledge_quiz_attempts;
drop policy if exists ai_knowledge_quiz_attempts_owner_update on public.ai_knowledge_quiz_attempts;
drop policy if exists ai_knowledge_quiz_attempts_admin_select on public.ai_knowledge_quiz_attempts;
create policy ai_knowledge_quiz_attempts_owner_select
on public.ai_knowledge_quiz_attempts for select to authenticated
using (user_id = (select auth.uid()));
create policy ai_knowledge_quiz_attempts_owner_insert
on public.ai_knowledge_quiz_attempts for insert to authenticated
with check (user_id = (select auth.uid()));
create policy ai_knowledge_quiz_attempts_owner_update
on public.ai_knowledge_quiz_attempts for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
create policy ai_knowledge_quiz_attempts_admin_select
on public.ai_knowledge_quiz_attempts for select to authenticated
using ((select private.current_user_is_admin()));

revoke all on public.ai_knowledge_quizzes, public.ai_knowledge_quiz_items, public.ai_knowledge_quiz_attempts from anon, authenticated;
grant select, insert, update, delete on public.ai_knowledge_quizzes to authenticated;
grant select, insert, update, delete on public.ai_knowledge_quiz_items to authenticated;
grant select, insert, update on public.ai_knowledge_quiz_attempts to authenticated;

comment on table public.ai_knowledge_quizzes is
  'AI-generated knowledge-point quick tests attached to a handout proposal; answer data remains outside Markdown notes.';
comment on table public.ai_knowledge_quiz_items is
  'Private question, answer, and explanation rows. API responses must explicitly project public question fields.';
comment on table public.ai_knowledge_quiz_attempts is
  'User-owned quick-test attempts. Grading is performed server-side against private answer rows.';

commit;
