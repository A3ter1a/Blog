-- AST-WP1-C: three-round attempt/revision/grade core.
-- math_paper is intentionally deferred until public.math_papers exists in WP6.

begin;

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  source_kind text not null,
  english_passage_id uuid references public.english_passages(id) on delete restrict,
  note_id uuid references public.notes(id) on delete restrict,
  problem_id text,
  note_content_version bigint,
  round smallint not null,
  status text not null default 'created',
  draft_payload jsonb not null default '{}'::jsonb,
  abandon_reason text,
  started_at timestamptz,
  submitted_at timestamptz,
  sealed_at timestamptz,
  abandoned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attempts_source_kind_check check (
    source_kind in ('english_passage', 'note_problem')
  ),
  constraint attempts_round_check check (round between 1 and 3),
  constraint attempts_status_check check (
    status in ('created', 'in_progress', 'submitted', 'sealed', 'abandoned')
  ),
  constraint attempts_source_shape_check check (
    (
      source_kind = 'english_passage'
      and english_passage_id is not null
      and note_id is null
      and problem_id is null
      and note_content_version is null
    )
    or
    (
      source_kind = 'note_problem'
      and english_passage_id is null
      and note_id is not null
      and problem_id is not null
      and nullif(btrim(problem_id), '') is not null
      and note_content_version is not null
      and note_content_version >= 1
    )
  ),
  constraint attempts_abandon_reason_check check (
    status <> 'abandoned' or nullif(btrim(abandon_reason), '') is not null
  )
);

create unique index if not exists attempts_unique_english_round
  on public.attempts (user_id, english_passage_id, round)
  where source_kind = 'english_passage';

create unique index if not exists attempts_unique_note_problem_round
  on public.attempts (user_id, note_id, problem_id, round)
  where source_kind = 'note_problem';

create index if not exists attempts_user_updated_at_idx
  on public.attempts (user_id, updated_at desc);

create table if not exists public.attempt_revisions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete restrict,
  revision_no integer not null,
  kind text not null,
  response_payload jsonb not null,
  source_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint attempt_revisions_revision_no_check check (revision_no >= 1),
  constraint attempt_revisions_kind_check check (kind in ('submission', 'correction')),
  constraint attempt_revisions_attempt_revision_key unique (attempt_id, revision_no)
);

create index if not exists attempt_revisions_attempt_created_idx
  on public.attempt_revisions (attempt_id, created_at desc);

create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.attempt_revisions(id) on delete restrict,
  origin text not null,
  grade_seq integer not null,
  scoring_mode text not null,
  score numeric(12, 4) not null,
  max_score numeric(12, 4) not null,
  breakdown jsonb not null default '{}'::jsonb,
  feedback text,
  created_at timestamptz not null default now(),
  constraint grades_origin_check check (
    origin in ('system_scored', 'ai_suggested', 'user_final', 'legacy_imported')
  ),
  constraint grades_scoring_mode_check check (
    scoring_mode in ('objective', 'subjective', 'math')
  ),
  constraint grades_origin_mode_check check (
    (origin = 'system_scored' and scoring_mode = 'objective')
    or (origin = 'ai_suggested' and scoring_mode in ('subjective', 'math'))
    or (origin = 'user_final' and scoring_mode in ('subjective', 'math'))
    or origin = 'legacy_imported'
  ),
  constraint grades_grade_seq_check check (grade_seq >= 1),
  constraint grades_score_range_check check (
    max_score >= 0 and score >= 0 and score <= max_score
  ),
  constraint grades_revision_origin_seq_key unique (revision_id, origin, grade_seq)
);

create index if not exists grades_revision_created_idx
  on public.grades (revision_id, created_at desc);

create or replace function private.enforce_attempt_revision_append()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  attempt_status text;
  expected_revision_no integer;
begin
  select status
    into attempt_status
  from public.attempts
  where id = new.attempt_id
  for update;

  if not found then
    raise exception 'Attempt % does not exist', new.attempt_id;
  end if;

  select coalesce(max(revision_no), 0) + 1
    into expected_revision_no
  from public.attempt_revisions
  where attempt_id = new.attempt_id;

  if new.revision_no <> expected_revision_no then
    raise exception 'revision_no must be the next value %, received %', expected_revision_no, new.revision_no;
  end if;

  if new.kind = 'submission' and attempt_status not in ('in_progress', 'submitted') then
    raise exception 'A submission revision requires an in-progress or submitted attempt';
  end if;

  if new.kind = 'correction' and attempt_status not in ('submitted', 'sealed') then
    raise exception 'A correction revision requires a submitted or sealed attempt';
  end if;

  return new;
end;
$$;

create or replace function private.enforce_grade_append()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  expected_grade_seq integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(new.revision_id::text || ':' || new.origin, 0)
  );

  perform 1
  from public.attempt_revisions
  where id = new.revision_id;

  if not found then
    raise exception 'Revision % does not exist', new.revision_id;
  end if;

  select coalesce(max(grade_seq), 0) + 1
    into expected_grade_seq
  from public.grades
  where revision_id = new.revision_id
    and origin = new.origin;

  if new.grade_seq <> expected_grade_seq then
    raise exception 'grade_seq must be the next value % for origin %, received %', expected_grade_seq, new.origin, new.grade_seq;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_attempt_revision_append() from public;
revoke all on function private.enforce_grade_append() from public;

drop trigger if exists enforce_attempt_revision_append on public.attempt_revisions;
create trigger enforce_attempt_revision_append
  before insert on public.attempt_revisions
  for each row execute function private.enforce_attempt_revision_append();

drop trigger if exists enforce_grade_append on public.grades;
create trigger enforce_grade_append
  before insert on public.grades
  for each row execute function private.enforce_grade_append();

create or replace function private.reject_immutable_event_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception '% is append-only; create a new event instead', tg_table_name;
end;
$$;

revoke all on function private.reject_immutable_event_mutation() from public;

drop trigger if exists reject_attempt_revision_mutation on public.attempt_revisions;
create trigger reject_attempt_revision_mutation
  before update or delete on public.attempt_revisions
  for each row execute function private.reject_immutable_event_mutation();

drop trigger if exists reject_grade_mutation on public.grades;
create trigger reject_grade_mutation
  before update or delete on public.grades
  for each row execute function private.reject_immutable_event_mutation();

create or replace function private.enforce_attempt_lifecycle()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  previous_attempt public.attempts%rowtype;
  current_note_version bigint;
begin
  if tg_op = 'INSERT' and new.source_kind = 'note_problem' then
    select content_version
      into current_note_version
    from public.notes
    where id = new.note_id
    for share;

    if not found or current_note_version <> new.note_content_version then
      raise exception 'note_problem attempt must capture the current note content_version';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if (
      new.user_id,
      new.source_kind,
      new.english_passage_id,
      new.note_id,
      new.problem_id,
      new.note_content_version,
      new.round,
      new.created_at
    ) is distinct from (
      old.user_id,
      old.source_kind,
      old.english_passage_id,
      old.note_id,
      old.problem_id,
      old.note_content_version,
      old.round,
      old.created_at
    ) then
      raise exception 'Attempt identity and round are immutable';
    end if;

    if not (
      (old.status = 'created' and new.status in ('created', 'in_progress', 'abandoned'))
      or (old.status = 'in_progress' and new.status in ('in_progress', 'submitted', 'abandoned'))
      or (old.status = 'submitted' and new.status in ('submitted', 'sealed', 'abandoned'))
      or (old.status = 'sealed' and new.status = 'sealed')
      or (old.status = 'abandoned' and new.status = 'abandoned')
    ) then
      raise exception 'Invalid attempt status transition: % -> %', old.status, new.status;
    end if;
  end if;

  if tg_op = 'INSERT' and new.round > 1 then
    select candidate.*
      into previous_attempt
    from public.attempts candidate
    where candidate.user_id = new.user_id
      and candidate.source_kind = new.source_kind
      and candidate.round = new.round - 1
      and candidate.english_passage_id is not distinct from new.english_passage_id
      and candidate.note_id is not distinct from new.note_id
      and candidate.problem_id is not distinct from new.problem_id
    for update;

    if not found then
      raise exception 'Previous round does not exist';
    end if;

    if previous_attempt.status = 'submitted' then
      update public.attempts
      set status = 'sealed', sealed_at = coalesce(sealed_at, now())
      where id = previous_attempt.id;
    elsif previous_attempt.status not in ('sealed', 'abandoned') then
      raise exception 'Previous round must be submitted, sealed, or abandoned';
    end if;
  end if;

  if new.status = 'in_progress' then
    new.started_at := coalesce(new.started_at, now());
  elsif new.status = 'submitted' then
    new.started_at := coalesce(new.started_at, now());
    new.submitted_at := coalesce(new.submitted_at, now());
  elsif new.status = 'sealed' then
    new.submitted_at := coalesce(new.submitted_at, now());
    new.sealed_at := coalesce(new.sealed_at, now());
  elsif new.status = 'abandoned' then
    new.abandoned_at := coalesce(new.abandoned_at, now());
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_attempt_lifecycle() from public;

drop trigger if exists enforce_attempt_lifecycle on public.attempts;
create trigger enforce_attempt_lifecycle
  before insert or update on public.attempts
  for each row execute function private.enforce_attempt_lifecycle();

drop trigger if exists set_attempts_updated_at on public.attempts;
create trigger set_attempts_updated_at
  before update on public.attempts
  for each row execute function public.set_updated_at();

alter table public.attempts enable row level security;
alter table public.attempts force row level security;
alter table public.attempt_revisions enable row level security;
alter table public.attempt_revisions force row level security;
alter table public.grades enable row level security;
alter table public.grades force row level security;

create policy attempts_owner_select on public.attempts
for select to authenticated
using (user_id = (select auth.uid()) or (select private.current_user_is_admin()));

create policy attempts_owner_insert on public.attempts
for insert to authenticated
with check (user_id = (select auth.uid()));

create policy attempts_owner_update on public.attempts
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy attempt_revisions_owner_select on public.attempt_revisions
for select to authenticated
using (exists (
  select 1 from public.attempts
  where attempts.id = attempt_revisions.attempt_id
    and (
      attempts.user_id = (select auth.uid())
      or (select private.current_user_is_admin())
    )
));

create policy attempt_revisions_owner_insert on public.attempt_revisions
for insert to authenticated
with check (exists (
  select 1 from public.attempts
  where attempts.id = attempt_revisions.attempt_id
    and attempts.user_id = (select auth.uid())
));

create policy grades_owner_select on public.grades
for select to authenticated
using (exists (
  select 1
  from public.attempt_revisions
  join public.attempts on attempts.id = attempt_revisions.attempt_id
  where attempt_revisions.id = grades.revision_id
    and (
      attempts.user_id = (select auth.uid())
      or (select private.current_user_is_admin())
    )
));

create policy grades_owner_insert_user_final on public.grades
for insert to authenticated
with check (
  origin = 'user_final'
  and exists (
    select 1
    from public.attempt_revisions
    join public.attempts on attempts.id = attempt_revisions.attempt_id
    where attempt_revisions.id = grades.revision_id
      and attempts.user_id = (select auth.uid())
  )
);

revoke all on public.attempts, public.attempt_revisions, public.grades from anon, authenticated;
grant select, insert, update on public.attempts to authenticated;
grant select, insert on public.attempt_revisions, public.grades to authenticated;

comment on table public.attempts is 'Mutable lifecycle and draft shell for one source and one of three rounds.';
comment on table public.attempt_revisions is 'Append-only submitted or corrected answer snapshots.';
comment on table public.grades is 'Append-only scoring events; AI suggestions are never official by themselves.';

commit;
