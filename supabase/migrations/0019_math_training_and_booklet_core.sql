-- AST-WP6: fixed math paper sources, versioned OCR confirmation, confirmation-bound
-- math grading, and note-backed three-pass booklets.
-- Existing rows are preserved. All history tables remain append-only.

begin;

do $$
begin
  if to_regclass('public.attempts') is null
    or to_regclass('public.attempt_revisions') is null
    or to_regclass('public.grades') is null
    or to_regclass('public.notes') is null
    or to_regprocedure('private.reject_immutable_event_mutation()') is null
    or to_regprocedure('private.current_user_is_admin()') is null
    or to_regprocedure('private.ensure_previous_attempt_has_formal_grade()') is null
    or to_regprocedure('extensions.digest(bytea,text)') is null
  then
    raise exception '0019 requires 0008, 0010, 0011, 0018, and the pgcrypto digest function';
  end if;
end
$$;

create table public.math_papers (
  id uuid primary key default gen_random_uuid(),
  exam_year smallint not null,
  paper_code text not null,
  title text not null,
  source_checksum text not null,
  source_url text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint math_papers_exam_year_check check (exam_year between 1987 and 2100),
  constraint math_papers_paper_code_check check (paper_code in ('math_1', 'math_2', 'math_3')),
  constraint math_papers_title_nonempty check (nullif(btrim(title), '') is not null),
  constraint math_papers_source_checksum_check check (source_checksum ~ '^[0-9a-f]{64}$'),
  constraint math_papers_status_check check (status in ('active', 'archived')),
  constraint math_papers_year_code_key unique (exam_year, paper_code)
);

create table public.math_paper_problems (
  id uuid primary key default gen_random_uuid(),
  math_paper_id uuid not null references public.math_papers(id) on delete restrict,
  problem_no smallint not null,
  problem_type text not null,
  prompt text not null,
  standard_answer text not null,
  scoring_rubric jsonb not null,
  max_score numeric(12, 4) not null,
  content_version bigint not null default 1,
  content_checksum text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint math_paper_problems_problem_no_check check (problem_no >= 1),
  constraint math_paper_problems_problem_type_check check (
    problem_type in ('choice', 'fill', 'calculation', 'proof', 'proof_essay')
  ),
  constraint math_paper_problems_prompt_nonempty check (nullif(btrim(prompt), '') is not null),
  constraint math_paper_problems_answer_nonempty check (nullif(btrim(standard_answer), '') is not null),
  constraint math_paper_problems_rubric_check check (
    jsonb_typeof(scoring_rubric) in ('array', 'object')
    and scoring_rubric not in ('[]'::jsonb, '{}'::jsonb)
  ),
  constraint math_paper_problems_max_score_check check (max_score > 0),
  constraint math_paper_problems_content_version_check check (content_version >= 1),
  constraint math_paper_problems_content_checksum_check check (content_checksum ~ '^[0-9a-f]{64}$'),
  constraint math_paper_problems_paper_no_key unique (math_paper_id, problem_no),
  constraint math_paper_problems_paper_id_id_key unique (math_paper_id, id)
);

create index math_paper_problems_paper_no_idx
  on public.math_paper_problems (math_paper_id, problem_no);

alter table public.attempts
  add column math_paper_id uuid references public.math_papers(id) on delete restrict;

alter table public.attempts drop constraint attempts_source_kind_check;
alter table public.attempts add constraint attempts_source_kind_check check (
  source_kind in ('english_passage', 'note_problem', 'math_paper')
);

alter table public.attempts drop constraint attempts_source_shape_check;
alter table public.attempts add constraint attempts_source_shape_check check (
  (
    source_kind = 'english_passage'
    and english_passage_id is not null
    and note_id is null
    and problem_id is null
    and note_content_version is null
    and math_paper_id is null
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
    and math_paper_id is null
  )
  or
  (
    source_kind = 'math_paper'
    and english_passage_id is null
    and note_id is null
    and problem_id is null
    and note_content_version is null
    and math_paper_id is not null
  )
);

create unique index attempts_unique_math_paper_round
  on public.attempts (user_id, math_paper_id, round)
  where source_kind = 'math_paper';

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
      new.math_paper_id,
      new.round,
      new.created_at
    ) is distinct from (
      old.user_id,
      old.source_kind,
      old.english_passage_id,
      old.note_id,
      old.problem_id,
      old.note_content_version,
      old.math_paper_id,
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
      and candidate.math_paper_id is not distinct from new.math_paper_id
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

create or replace function private.enforce_math_problem_version()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  content_changed boolean;
begin
  if (new.math_paper_id, new.problem_no, new.created_at) is distinct from
     (old.math_paper_id, old.problem_no, old.created_at)
  then
    raise exception 'Math problem identity is immutable';
  end if;

  content_changed := (new.problem_type, new.prompt, new.standard_answer, new.scoring_rubric, new.max_score)
    is distinct from (old.problem_type, old.prompt, old.standard_answer, old.scoring_rubric, old.max_score);

  if content_changed then
    if new.content_version <> old.content_version + 1 then
      raise exception 'Math problem content update must increment content_version exactly once';
    end if;
    if new.content_checksum = old.content_checksum then
      raise exception 'Math problem content update must provide a new checksum';
    end if;
  elsif (new.content_version, new.content_checksum) is distinct from (old.content_version, old.content_checksum) then
    raise exception 'Math problem version/checksum cannot change without content changes';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_math_problem_version() from public, anon, authenticated;
drop trigger if exists enforce_math_problem_version on public.math_paper_problems;
create trigger enforce_math_problem_version
  before update on public.math_paper_problems
  for each row execute function private.enforce_math_problem_version();

drop trigger if exists set_math_papers_updated_at on public.math_papers;
create trigger set_math_papers_updated_at
  before update on public.math_papers
  for each row execute function public.set_updated_at();

drop trigger if exists set_math_paper_problems_updated_at on public.math_paper_problems;
create trigger set_math_paper_problems_updated_at
  before update on public.math_paper_problems
  for each row execute function public.set_updated_at();

create table public.ocr_confirmations (
  id uuid primary key,
  attempt_id uuid not null references public.attempts(id) on delete restrict,
  revision_id uuid not null unique references public.attempt_revisions(id) on delete restrict,
  confirmation_version integer not null,
  raw_payload jsonb not null,
  confirmed_payload jsonb not null,
  raw_checksum text not null,
  confirmed_checksum text not null,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint ocr_confirmations_version_check check (confirmation_version >= 1),
  constraint ocr_confirmations_raw_payload_check check (
    jsonb_typeof(raw_payload) = 'object'
    and jsonb_typeof(raw_payload -> 'pages') = 'array'
    and jsonb_array_length(raw_payload -> 'pages') > 0
  ),
  constraint ocr_confirmations_confirmed_payload_check check (
    jsonb_typeof(confirmed_payload) = 'object'
    and jsonb_typeof(confirmed_payload -> 'pages') = 'array'
    and jsonb_array_length(confirmed_payload -> 'pages') > 0
  ),
  constraint ocr_confirmations_raw_checksum_check check (raw_checksum ~ '^[0-9a-f]{64}$'),
  constraint ocr_confirmations_confirmed_checksum_check check (confirmed_checksum ~ '^[0-9a-f]{64}$'),
  constraint ocr_confirmations_attempt_version_key unique (attempt_id, confirmation_version)
);

create index ocr_confirmations_attempt_created_idx
  on public.ocr_confirmations (attempt_id, confirmation_version desc);

alter table public.grades
  add column confirmation_id uuid references public.ocr_confirmations(id) on delete restrict;

alter table public.grades add constraint grades_confirmation_shape_check check (
  (scoring_mode = 'math' and confirmation_id is not null)
  or (scoring_mode <> 'math' and confirmation_id is null)
);

create or replace function private.ensure_previous_attempt_has_formal_grade()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  previous_attempt public.attempts%rowtype;
begin
  if new.round <= 1 then return new; end if;

  select candidate.*
    into previous_attempt
  from public.attempts candidate
  where candidate.user_id = new.user_id
    and candidate.source_kind = new.source_kind
    and candidate.round = new.round - 1
    and candidate.english_passage_id is not distinct from new.english_passage_id
    and candidate.note_id is not distinct from new.note_id
    and candidate.problem_id is not distinct from new.problem_id
    and candidate.math_paper_id is not distinct from new.math_paper_id;

  if found
    and previous_attempt.status in ('submitted', 'sealed')
    and not exists (
      select 1
      from public.attempt_revisions revision
      join public.grades grade on grade.revision_id = revision.id
      left join public.ocr_confirmations confirmation on confirmation.id = grade.confirmation_id
      where revision.attempt_id = previous_attempt.id
        and grade.origin in ('system_scored', 'user_final', 'legacy_imported')
        and (
          previous_attempt.source_kind <> 'math_paper'
          or (
            grade.origin = 'user_final'
            and confirmation.confirmation_version = (
              select max(candidate.confirmation_version)
              from public.ocr_confirmations candidate
              where candidate.attempt_id = previous_attempt.id
            )
          )
        )
    )
  then
    raise exception 'Previous round requires a formal grade before the next round can start';
  end if;

  return new;
end;
$$;

create table public.math_grade_steps (
  grade_id uuid not null references public.grades(id) on delete restrict,
  step_no integer not null,
  problem_id uuid not null references public.math_paper_problems(id) on delete restrict,
  criterion text not null,
  earned_score numeric(12, 4) not null,
  max_score numeric(12, 4) not null,
  deduction_reason text,
  created_at timestamptz not null default now(),
  primary key (grade_id, step_no),
  constraint math_grade_steps_step_no_check check (step_no >= 1),
  constraint math_grade_steps_criterion_nonempty check (nullif(btrim(criterion), '') is not null),
  constraint math_grade_steps_score_range_check check (
    max_score > 0 and earned_score >= 0 and earned_score <= max_score
  )
);

create index math_grade_steps_problem_idx
  on public.math_grade_steps (problem_id, created_at desc);

create table public.booklets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  note_id uuid not null unique references public.notes(id) on delete restrict,
  rule_version text not null,
  source_refs jsonb not null,
  snapshot_checksum text not null,
  drift_status text not null default 'current',
  method_summary_confirmed_at timestamptz not null,
  generated_at timestamptz not null default now(),
  last_drift_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booklets_rule_version_nonempty check (nullif(btrim(rule_version), '') is not null),
  constraint booklets_source_refs_check check (
    jsonb_typeof(source_refs) = 'array' and jsonb_array_length(source_refs) > 0
  ),
  constraint booklets_snapshot_checksum_check check (snapshot_checksum ~ '^[0-9a-f]{64}$'),
  constraint booklets_drift_status_check check (drift_status in ('current', 'changed', 'missing'))
);

create index booklets_user_generated_idx on public.booklets (user_id, generated_at desc);

create or replace function private.enforce_ocr_confirmation_append()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  expected_version integer;
  revision_attempt_id uuid;
  revision_confirmation_id text;
begin
  perform 1 from public.attempts where id = new.attempt_id for update;
  if not found then raise exception 'Math attempt does not exist'; end if;

  select revision.attempt_id, revision.response_payload ->> 'confirmationId'
    into revision_attempt_id, revision_confirmation_id
  from public.attempt_revisions revision
  where revision.id = new.revision_id;
  if not found or revision_attempt_id <> new.attempt_id or revision_confirmation_id <> new.id::text then
    raise exception 'OCR confirmation must bind its own attempt revision';
  end if;

  select coalesce(max(confirmation_version), 0) + 1
    into expected_version
  from public.ocr_confirmations
  where attempt_id = new.attempt_id;
  if new.confirmation_version <> expected_version then
    raise exception 'confirmation_version must be the next value %, received %', expected_version, new.confirmation_version;
  end if;

  return new;
end;
$$;

create or replace function private.enforce_math_grade_confirmation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  confirmation_attempt_id uuid;
  confirmation_revision_id uuid;
  confirmation_version integer;
  latest_version integer;
begin
  if new.scoring_mode <> 'math' then
    if new.confirmation_id is not null then
      raise exception 'Only math grades may bind OCR confirmations';
    end if;
    return new;
  end if;

  select confirmation.attempt_id, confirmation.revision_id, confirmation.confirmation_version
    into confirmation_attempt_id, confirmation_revision_id, confirmation_version
  from public.ocr_confirmations confirmation
  where confirmation.id = new.confirmation_id;
  if not found or confirmation_revision_id <> new.revision_id then
    raise exception 'Math grade must bind the revision created by its OCR confirmation';
  end if;

  select max(candidate.confirmation_version)
    into latest_version
  from public.ocr_confirmations candidate
  where candidate.attempt_id = confirmation_attempt_id;
  if confirmation_version <> latest_version then
    raise exception 'Math grade must bind the latest OCR confirmation';
  end if;

  if new.origin = 'user_final' and not exists (
    select 1 from public.grades suggestion
    where suggestion.revision_id = new.revision_id
      and suggestion.confirmation_id = new.confirmation_id
      and suggestion.scoring_mode = 'math'
      and suggestion.origin = 'ai_suggested'
  ) then
    raise exception 'Math user_final requires an AI suggestion for the same confirmation';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_ocr_confirmation_append() from public, anon, authenticated;
revoke all on function private.enforce_math_grade_confirmation() from public, anon, authenticated;

drop trigger if exists enforce_ocr_confirmation_append on public.ocr_confirmations;
create trigger enforce_ocr_confirmation_append
  before insert on public.ocr_confirmations
  for each row execute function private.enforce_ocr_confirmation_append();

drop trigger if exists reject_ocr_confirmation_mutation on public.ocr_confirmations;
create trigger reject_ocr_confirmation_mutation
  before update or delete on public.ocr_confirmations
  for each row execute function private.reject_immutable_event_mutation();

drop trigger if exists enforce_math_grade_confirmation on public.grades;
create trigger enforce_math_grade_confirmation
  before insert on public.grades
  for each row execute function private.enforce_math_grade_confirmation();

drop trigger if exists reject_math_grade_step_mutation on public.math_grade_steps;
create trigger reject_math_grade_step_mutation
  before update or delete on public.math_grade_steps
  for each row execute function private.reject_immutable_event_mutation();

drop trigger if exists set_booklets_updated_at on public.booklets;
create trigger set_booklets_updated_at
  before update on public.booklets
  for each row execute function public.set_updated_at();

create or replace function private.assert_math_grade_steps(
  p_math_paper_id uuid,
  p_score numeric,
  p_max_score numeric,
  p_steps jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  paper_max_score numeric(12, 4);
  step_score numeric(12, 4);
  step_max_score numeric(12, 4);
begin
  if p_steps is null or jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) = 0 then
    raise exception 'Math grade requires non-empty step details';
  end if;
  if p_score is null or p_max_score is null or p_max_score <= 0 or p_score < 0 or p_score > p_max_score then
    raise exception 'Math score is outside the valid range';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_steps) entry(value)
    where jsonb_typeof(entry.value) <> 'object'
      or coalesce(entry.value ->> 'problemId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or nullif(btrim(entry.value ->> 'criterion'), '') is null
      or jsonb_typeof(entry.value -> 'earnedScore') <> 'number'
      or jsonb_typeof(entry.value -> 'maxScore') <> 'number'
      or (entry.value ->> 'earnedScore')::numeric < 0
      or (entry.value ->> 'maxScore')::numeric <= 0
      or (entry.value ->> 'earnedScore')::numeric > (entry.value ->> 'maxScore')::numeric
      or (
        entry.value ? 'deductionReason'
        and jsonb_typeof(entry.value -> 'deductionReason') not in ('string', 'null')
      )
  ) then
    raise exception 'Math grade step payload is invalid';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_steps) entry(value)
    left join public.math_paper_problems problem
      on problem.id = (entry.value ->> 'problemId')::uuid
      and problem.math_paper_id = p_math_paper_id
    where problem.id is null
  ) then
    raise exception 'Math grade step references a problem outside the paper';
  end if;

  select coalesce(sum(problem.max_score), 0)
    into paper_max_score
  from public.math_paper_problems problem
  where problem.math_paper_id = p_math_paper_id;
  if paper_max_score <= 0 or paper_max_score <> p_max_score then
    raise exception 'Math grade max_score must equal the fixed paper total';
  end if;

  if exists (
    select 1
    from public.math_paper_problems problem
    left join (
      select (entry.value ->> 'problemId')::uuid as problem_id,
             sum((entry.value ->> 'maxScore')::numeric) as step_max
      from jsonb_array_elements(p_steps) entry(value)
      group by (entry.value ->> 'problemId')::uuid
    ) step_total on step_total.problem_id = problem.id
    where problem.math_paper_id = p_math_paper_id
      and (step_total.problem_id is null or step_total.step_max <> problem.max_score)
  ) then
    raise exception 'Math grade steps must cover every problem and its full rubric score';
  end if;

  select sum((entry.value ->> 'earnedScore')::numeric),
         sum((entry.value ->> 'maxScore')::numeric)
    into step_score, step_max_score
  from jsonb_array_elements(p_steps) entry(value);
  if step_score <> p_score or step_max_score <> p_max_score then
    raise exception 'Math grade totals must equal the sum of step details';
  end if;
end;
$$;

revoke all on function private.assert_math_grade_steps(uuid, numeric, numeric, jsonb)
  from public, anon, authenticated;

create or replace function public.start_math_paper_attempt(
  p_math_paper_id uuid,
  p_round smallint,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_attempt public.attempts%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_math_paper_id is null or p_command_id is null then raise exception 'paper_id and command_id are required'; end if;
  if p_round not between 1 and 3 then raise exception 'Math training is limited to three rounds'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_math_paper_id::text, 0));
  perform 1 from public.math_papers paper where paper.id = p_math_paper_id and paper.status = 'active';
  if not found then raise exception 'Active math paper does not exist'; end if;

  select candidate.* into v_attempt from public.attempts candidate where candidate.id = p_command_id;
  if found then
    if v_attempt.user_id <> v_user_id or v_attempt.source_kind <> 'math_paper'
      or v_attempt.math_paper_id <> p_math_paper_id or v_attempt.round <> p_round
    then
      raise exception 'Math command_id is already used by another attempt';
    end if;
    return jsonb_build_object('attemptId', v_attempt.id, 'round', v_attempt.round, 'idempotent', true);
  end if;

  select candidate.* into v_attempt
  from public.attempts candidate
  where candidate.user_id = v_user_id
    and candidate.source_kind = 'math_paper'
    and candidate.math_paper_id = p_math_paper_id
    and candidate.round = p_round
  for update;
  if found then
    return jsonb_build_object('attemptId', v_attempt.id, 'round', v_attempt.round, 'idempotent', true);
  end if;

  insert into public.attempts (
    id, user_id, source_kind, math_paper_id, round, status, draft_payload, started_at
  ) values (
    p_command_id, v_user_id, 'math_paper', p_math_paper_id, p_round, 'in_progress', '{}'::jsonb, now()
  ) returning * into v_attempt;

  return jsonb_build_object('attemptId', v_attempt.id, 'round', v_attempt.round, 'idempotent', false);
end;
$$;

create or replace function public.record_math_ocr_confirmation(
  p_attempt_id uuid,
  p_command_id uuid,
  p_raw_payload jsonb,
  p_confirmed_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_attempt public.attempts%rowtype;
  v_existing public.ocr_confirmations%rowtype;
  v_revision_id uuid := gen_random_uuid();
  v_revision_no integer;
  v_revision_kind text;
  v_confirmation_version integer;
  v_raw_checksum text;
  v_confirmed_checksum text;
  v_source_snapshot jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_attempt_id is null or p_command_id is null then raise exception 'attempt_id and command_id are required'; end if;
  if p_raw_payload is null or jsonb_typeof(p_raw_payload) <> 'object'
    or jsonb_typeof(p_raw_payload -> 'pages') <> 'array'
    or jsonb_array_length(p_raw_payload -> 'pages') = 0
  then raise exception 'Raw OCR pages are required'; end if;
  if p_confirmed_payload is null or jsonb_typeof(p_confirmed_payload) <> 'object'
    or jsonb_typeof(p_confirmed_payload -> 'pages') <> 'array'
    or jsonb_array_length(p_confirmed_payload -> 'pages') <> jsonb_array_length(p_raw_payload -> 'pages')
  then raise exception 'Confirmed OCR pages must match the raw page count'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_confirmed_payload -> 'pages') page(value)
    where jsonb_typeof(page.value) <> 'object' or nullif(btrim(page.value ->> 'text'), '') is null
  ) then raise exception 'Every confirmed OCR page requires non-empty text'; end if;

  v_raw_checksum := encode(extensions.digest(convert_to(p_raw_payload::text, 'UTF8'), 'sha256'), 'hex');
  v_confirmed_checksum := encode(extensions.digest(convert_to(p_confirmed_payload::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_attempt_id::text, 0));

  select confirmation.* into v_existing
  from public.ocr_confirmations confirmation
  where confirmation.id = p_command_id;
  if found then
    if v_existing.attempt_id <> p_attempt_id
      or v_existing.raw_checksum <> v_raw_checksum
      or v_existing.confirmed_checksum <> v_confirmed_checksum
      or v_existing.raw_payload <> p_raw_payload
      or v_existing.confirmed_payload <> p_confirmed_payload
    then raise exception 'Math confirmation command_id is already used by different input'; end if;
    return jsonb_build_object(
      'attemptId', v_existing.attempt_id,
      'revisionId', v_existing.revision_id,
      'confirmationId', v_existing.id,
      'confirmationVersion', v_existing.confirmation_version,
      'confirmedChecksum', v_existing.confirmed_checksum,
      'idempotent', true
    );
  end if;

  select candidate.* into v_attempt
  from public.attempts candidate
  where candidate.id = p_attempt_id
    and candidate.user_id = v_user_id
    and candidate.source_kind = 'math_paper'
  for update;
  if not found then raise exception 'Owned math attempt does not exist'; end if;
  if v_attempt.status not in ('in_progress', 'submitted', 'sealed') then
    raise exception 'Math OCR confirmation requires an active or completed attempt';
  end if;

  select coalesce(max(revision.revision_no), 0) + 1 into v_revision_no
  from public.attempt_revisions revision where revision.attempt_id = v_attempt.id;
  v_revision_kind := case when v_revision_no = 1 then 'submission' else 'correction' end;
  if v_revision_kind = 'submission' and v_attempt.status <> 'in_progress' then
    raise exception 'First math confirmation requires an in-progress attempt';
  end if;
  if v_revision_kind = 'correction' and v_attempt.status not in ('submitted', 'sealed') then
    raise exception 'Math re-confirmation requires a submitted or sealed attempt';
  end if;

  select jsonb_build_object(
    'mathPaperId', paper.id,
    'paperCode', paper.paper_code,
    'examYear', paper.exam_year,
    'paperChecksum', paper.source_checksum,
    'problems', coalesce(jsonb_agg(jsonb_build_object(
      'problemId', problem.id,
      'problemNo', problem.problem_no,
      'contentVersion', problem.content_version,
      'contentChecksum', problem.content_checksum,
      'prompt', problem.prompt,
      'standardAnswer', problem.standard_answer,
      'scoringRubric', problem.scoring_rubric,
      'maxScore', problem.max_score
    ) order by problem.problem_no) filter (where problem.id is not null), '[]'::jsonb)
  ) into v_source_snapshot
  from public.math_papers paper
  left join public.math_paper_problems problem on problem.math_paper_id = paper.id
  where paper.id = v_attempt.math_paper_id
  group by paper.id;

  insert into public.attempt_revisions (
    id, attempt_id, revision_no, kind, response_payload, source_snapshot
  ) values (
    v_revision_id, v_attempt.id, v_revision_no, v_revision_kind,
    jsonb_build_object('confirmationId', p_command_id), v_source_snapshot
  );

  select coalesce(max(confirmation.confirmation_version), 0) + 1 into v_confirmation_version
  from public.ocr_confirmations confirmation where confirmation.attempt_id = v_attempt.id;
  insert into public.ocr_confirmations (
    id, attempt_id, revision_id, confirmation_version,
    raw_payload, confirmed_payload, raw_checksum, confirmed_checksum
  ) values (
    p_command_id, v_attempt.id, v_revision_id, v_confirmation_version,
    p_raw_payload, p_confirmed_payload, v_raw_checksum, v_confirmed_checksum
  ) returning * into v_existing;

  if v_attempt.status = 'in_progress' then
    update public.attempts set status = 'submitted', draft_payload = '{}'::jsonb where id = v_attempt.id;
  end if;

  return jsonb_build_object(
    'attemptId', v_attempt.id,
    'revisionId', v_revision_id,
    'confirmationId', v_existing.id,
    'confirmationVersion', v_existing.confirmation_version,
    'confirmedChecksum', v_existing.confirmed_checksum,
    'idempotent', false
  );
end;
$$;

create or replace function private.insert_math_grade_steps(
  p_grade_id uuid,
  p_steps jsonb
)
returns void
language sql
set search_path = ''
as $$
  insert into public.math_grade_steps (
    grade_id, step_no, problem_id, criterion, earned_score, max_score, deduction_reason
  )
  select
    p_grade_id,
    entry.ordinality::integer,
    (entry.value ->> 'problemId')::uuid,
    btrim(entry.value ->> 'criterion'),
    (entry.value ->> 'earnedScore')::numeric,
    (entry.value ->> 'maxScore')::numeric,
    nullif(btrim(entry.value ->> 'deductionReason'), '')
  from jsonb_array_elements(p_steps) with ordinality entry(value, ordinality)
  order by entry.ordinality;
$$;

revoke all on function private.insert_math_grade_steps(uuid, jsonb) from public, anon, authenticated;

create or replace function public.record_math_ai_grade(
  p_confirmation_id uuid,
  p_command_id uuid,
  p_score numeric,
  p_max_score numeric,
  p_feedback text,
  p_breakdown jsonb,
  p_steps jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_confirmation public.ocr_confirmations%rowtype;
  v_attempt public.attempts%rowtype;
  v_existing public.grades%rowtype;
  v_grade_seq integer;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_confirmation_id is null or p_command_id is null then raise exception 'confirmation_id and command_id are required'; end if;
  if p_feedback is null or nullif(btrim(p_feedback), '') is null then raise exception 'Math grade feedback is required'; end if;
  if p_breakdown is null or jsonb_typeof(p_breakdown) <> 'object' then raise exception 'Math grade breakdown must be an object'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_confirmation_id::text, 0));
  select confirmation.* into v_confirmation
  from public.ocr_confirmations confirmation
  join public.attempts attempt on attempt.id = confirmation.attempt_id
  where confirmation.id = p_confirmation_id and attempt.user_id = v_user_id;
  if not found then raise exception 'Owned OCR confirmation does not exist'; end if;
  select attempt.* into v_attempt
  from public.attempts attempt
  where attempt.id = v_confirmation.attempt_id and attempt.user_id = v_user_id
  for update;
  if v_confirmation.confirmation_version <> (
    select max(candidate.confirmation_version)
    from public.ocr_confirmations candidate where candidate.attempt_id = v_attempt.id
  ) then raise exception 'AI grade must use the latest OCR confirmation'; end if;

  perform private.assert_math_grade_steps(v_attempt.math_paper_id, p_score, p_max_score, p_steps);
  select grade.* into v_existing from public.grades grade where grade.id = p_command_id;
  if found then
    if v_existing.revision_id <> v_confirmation.revision_id
      or v_existing.confirmation_id <> p_confirmation_id
      or v_existing.origin <> 'ai_suggested'
      or v_existing.score <> p_score
      or v_existing.max_score <> p_max_score
      or v_existing.feedback <> p_feedback
      or v_existing.breakdown <> p_breakdown
    then raise exception 'Math AI grade command_id is already used by different input'; end if;
    return jsonb_build_object('gradeId', v_existing.id, 'origin', v_existing.origin, 'idempotent', true);
  end if;

  select coalesce(max(grade.grade_seq), 0) + 1 into v_grade_seq
  from public.grades grade
  where grade.revision_id = v_confirmation.revision_id and grade.origin = 'ai_suggested';
  insert into public.grades (
    id, revision_id, origin, grade_seq, scoring_mode, score, max_score,
    breakdown, feedback, confirmation_id
  ) values (
    p_command_id, v_confirmation.revision_id, 'ai_suggested', v_grade_seq, 'math',
    p_score, p_max_score, p_breakdown, p_feedback, p_confirmation_id
  ) returning * into v_existing;
  perform private.insert_math_grade_steps(v_existing.id, p_steps);

  return jsonb_build_object('gradeId', v_existing.id, 'origin', v_existing.origin, 'idempotent', false);
end;
$$;

create or replace function public.confirm_math_grade(
  p_suggestion_grade_id uuid,
  p_command_id uuid,
  p_score numeric,
  p_feedback text,
  p_breakdown jsonb,
  p_steps jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_suggestion public.grades%rowtype;
  v_attempt public.attempts%rowtype;
  v_existing public.grades%rowtype;
  v_grade_seq integer;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_suggestion_grade_id is null or p_command_id is null then raise exception 'suggestion_grade_id and command_id are required'; end if;
  if p_feedback is null or nullif(btrim(p_feedback), '') is null then raise exception 'Math final feedback is required'; end if;
  if p_breakdown is null or jsonb_typeof(p_breakdown) <> 'object' then raise exception 'Math final breakdown must be an object'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_suggestion_grade_id::text, 0));
  select suggestion.* into v_suggestion
  from public.grades suggestion
  join public.ocr_confirmations confirmation on confirmation.id = suggestion.confirmation_id
  join public.attempts attempt on attempt.id = confirmation.attempt_id
  where suggestion.id = p_suggestion_grade_id
    and suggestion.origin = 'ai_suggested'
    and suggestion.scoring_mode = 'math'
    and attempt.user_id = v_user_id;
  if not found then raise exception 'Owned math AI suggestion does not exist'; end if;
  select attempt.* into v_attempt
  from public.attempts attempt
  join public.attempt_revisions revision on revision.attempt_id = attempt.id
  where revision.id = v_suggestion.revision_id and attempt.user_id = v_user_id
  for update of attempt;
  if not exists (
    select 1 from public.ocr_confirmations latest
    where latest.id = v_suggestion.confirmation_id
      and latest.confirmation_version = (
        select max(candidate.confirmation_version)
        from public.ocr_confirmations candidate where candidate.attempt_id = latest.attempt_id
      )
  ) then raise exception 'Final math grade must use the latest OCR confirmation'; end if;

  perform private.assert_math_grade_steps(v_attempt.math_paper_id, p_score, v_suggestion.max_score, p_steps);
  select grade.* into v_existing from public.grades grade where grade.id = p_command_id;
  if found then
    if v_existing.revision_id <> v_suggestion.revision_id
      or v_existing.confirmation_id <> v_suggestion.confirmation_id
      or v_existing.origin <> 'user_final'
      or v_existing.score <> p_score
      or v_existing.max_score <> v_suggestion.max_score
      or v_existing.feedback <> p_feedback
      or v_existing.breakdown <> p_breakdown
    then raise exception 'Math final grade command_id is already used by different input'; end if;
    return jsonb_build_object('gradeId', v_existing.id, 'origin', v_existing.origin, 'idempotent', true);
  end if;

  select coalesce(max(grade.grade_seq), 0) + 1 into v_grade_seq
  from public.grades grade
  where grade.revision_id = v_suggestion.revision_id and grade.origin = 'user_final';
  insert into public.grades (
    id, revision_id, origin, grade_seq, scoring_mode, score, max_score,
    breakdown, feedback, confirmation_id
  ) values (
    p_command_id, v_suggestion.revision_id, 'user_final', v_grade_seq, 'math',
    p_score, v_suggestion.max_score, p_breakdown, p_feedback, v_suggestion.confirmation_id
  ) returning * into v_existing;
  perform private.insert_math_grade_steps(v_existing.id, p_steps);

  return jsonb_build_object('gradeId', v_existing.id, 'origin', v_existing.origin, 'idempotent', false);
end;
$$;

create or replace function public.list_math_papers()
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', paper.id,
    'examYear', paper.exam_year,
    'paperCode', paper.paper_code,
    'title', paper.title,
    'sourceChecksum', paper.source_checksum,
    'problemCount', coalesce(problem_stat.problem_count, 0),
    'maxScore', coalesce(problem_stat.max_score, 0)
  ) order by paper.exam_year desc, paper.paper_code), '[]'::jsonb)
  into v_result
  from public.math_papers paper
  left join lateral (
    select count(*) as problem_count, coalesce(sum(problem.max_score), 0) as max_score
    from public.math_paper_problems problem where problem.math_paper_id = paper.id
  ) problem_stat on true
  where paper.status = 'active';
  return v_result;
end;
$$;

create or replace function public.get_math_training_state(p_math_paper_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not exists (select 1 from public.math_papers paper where paper.id = p_math_paper_id) then
    raise exception 'Math paper does not exist';
  end if;

  select jsonb_build_object(
    'paperId', p_math_paper_id,
    'attempts', coalesce(jsonb_agg(jsonb_build_object(
      'id', attempt.id,
      'round', attempt.round,
      'status', attempt.status,
      'startedAt', attempt.started_at,
      'submittedAt', attempt.submitted_at,
      'sealedAt', attempt.sealed_at,
      'confirmations', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', confirmation.id,
          'revisionId', confirmation.revision_id,
          'confirmationVersion', confirmation.confirmation_version,
          'confirmedPayload', confirmation.confirmed_payload,
          'confirmedChecksum', confirmation.confirmed_checksum,
          'confirmedAt', confirmation.confirmed_at,
          'grades', (
            select coalesce(jsonb_agg(jsonb_build_object(
              'id', grade.id,
              'origin', grade.origin,
              'gradeSeq', grade.grade_seq,
              'score', grade.score,
              'maxScore', grade.max_score,
              'feedback', grade.feedback,
              'breakdown', grade.breakdown,
              'createdAt', grade.created_at,
              'steps', (
                select coalesce(jsonb_agg(jsonb_build_object(
                  'stepNo', step.step_no,
                  'problemId', step.problem_id,
                  'criterion', step.criterion,
                  'earnedScore', step.earned_score,
                  'maxScore', step.max_score,
                  'deductionReason', step.deduction_reason
                ) order by step.step_no), '[]'::jsonb)
                from public.math_grade_steps step where step.grade_id = grade.id
              )
            ) order by grade.created_at, grade.origin, grade.grade_seq), '[]'::jsonb)
            from public.grades grade
            where grade.revision_id = confirmation.revision_id
              and grade.confirmation_id = confirmation.id
          )
        ) order by confirmation.confirmation_version), '[]'::jsonb)
        from public.ocr_confirmations confirmation where confirmation.attempt_id = attempt.id
      )
    ) order by attempt.round) filter (where attempt.id is not null), '[]'::jsonb)
  ) into v_result
  from public.attempts attempt
  where attempt.user_id = v_user_id
    and attempt.source_kind = 'math_paper'
    and attempt.math_paper_id = p_math_paper_id;
  return v_result;
end;
$$;

create or replace function public.get_math_grade_source(p_confirmation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select jsonb_build_object(
    'confirmationId', confirmation.id,
    'confirmationVersion', confirmation.confirmation_version,
    'confirmedPayload', confirmation.confirmed_payload,
    'confirmedChecksum', confirmation.confirmed_checksum,
    'sourceSnapshot', revision.source_snapshot,
    'isLatest', confirmation.confirmation_version = (
      select max(candidate.confirmation_version)
      from public.ocr_confirmations candidate where candidate.attempt_id = attempt.id
    )
  ) into v_result
  from public.ocr_confirmations confirmation
  join public.attempt_revisions revision on revision.id = confirmation.revision_id
  join public.attempts attempt on attempt.id = confirmation.attempt_id
  where confirmation.id = p_confirmation_id and attempt.user_id = v_user_id;
  if v_result is null then raise exception 'Owned OCR confirmation does not exist'; end if;
  if not coalesce((v_result ->> 'isLatest')::boolean, false) then
    raise exception 'Math grade source must use the latest OCR confirmation';
  end if;
  return v_result;
end;
$$;

create or replace function private.booklet_problem_checksum(p_problem jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(
    regexp_replace(coalesce(p_problem ->> 'question', ''), E'^\\s+|\\s+$', '', 'g') || chr(31) ||
    regexp_replace(coalesce(p_problem ->> 'answer', ''), E'^\\s+|\\s+$', '', 'g') || chr(31) ||
    regexp_replace(coalesce(p_problem ->> 'explanation', ''), E'^\\s+|\\s+$', '', 'g') || chr(31) ||
    regexp_replace(coalesce(p_problem ->> 'tips', ''), E'^\\s+|\\s+$', '', 'g'),
    'UTF8'
  ), 'sha256'), 'hex');
$$;

revoke all on function private.booklet_problem_checksum(jsonb) from public, anon, authenticated;

create or replace function public.create_private_booklet(
  p_command_id uuid,
  p_title text,
  p_content text,
  p_source_refs jsonb,
  p_rule_version text,
  p_snapshot_checksum text,
  p_method_summary_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_snapshot text;
  v_checksum text;
  v_existing public.booklets%rowtype;
  v_note public.notes%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not private.current_user_is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if p_command_id is null or nullif(btrim(p_title), '') is null or nullif(btrim(p_content), '') is null then
    raise exception 'Booklet id, title, and content are required';
  end if;
  if p_source_refs is null or jsonb_typeof(p_source_refs) <> 'array' or jsonb_array_length(p_source_refs) = 0 then
    raise exception 'Booklet source references are required';
  end if;
  if nullif(btrim(p_rule_version), '') is null or not p_method_summary_confirmed then
    raise exception 'Booklet rule version and explicit method-summary confirmation are required';
  end if;
  if length(p_content) > 5000000 then raise exception 'Booklet content is too large'; end if;
  if length(p_content) - length(replace(p_content, '<!-- asteroid-booklet-snapshot:start -->', ''))
      <> length('<!-- asteroid-booklet-snapshot:start -->')
    or length(p_content) - length(replace(p_content, '<!-- asteroid-booklet-snapshot:end -->', ''))
      <> length('<!-- asteroid-booklet-snapshot:end -->')
  then raise exception 'Booklet content must contain exactly one snapshot boundary'; end if;

  v_snapshot := regexp_replace(split_part(split_part(
    p_content, '<!-- asteroid-booklet-snapshot:start -->', 2
  ), '<!-- asteroid-booklet-snapshot:end -->', 1), E'^\\s+|\\s+$', '', 'g');
  v_checksum := encode(extensions.digest(convert_to(v_snapshot, 'UTF8'), 'sha256'), 'hex');
  if p_snapshot_checksum !~ '^[0-9a-f]{64}$' or p_snapshot_checksum <> v_checksum then
    raise exception 'Booklet snapshot checksum does not match the immutable snapshot region';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_source_refs) source_ref(value)
    left join public.notes source_note
      on source_note.id::text = source_ref.value ->> 'sourceNoteId'
    left join lateral (
      select problem.value
      from jsonb_array_elements(coalesce(source_note.problems, '[]'::jsonb)) problem(value)
      where problem.value ->> 'id' = source_ref.value ->> 'sourceProblemId'
      limit 1
    ) source_problem on true
    where jsonb_typeof(source_ref.value) <> 'object'
      or coalesce(source_ref.value ->> 'sourceNoteId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or nullif(btrim(source_ref.value ->> 'sourceProblemId'), '') is null
      or jsonb_typeof(source_ref.value -> 'sourceContentVersion') <> 'number'
      or coalesce(source_ref.value ->> 'checksum', '') !~ '^[0-9a-f]{64}$'
      or source_note.id is null
      or source_note.content_version <> (source_ref.value ->> 'sourceContentVersion')::bigint
      or source_problem.value is null
      or private.booklet_problem_checksum(source_problem.value) <> source_ref.value ->> 'checksum'
  ) then
    raise exception 'Booklet source changed or contains an invalid reference; reopen the preview';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_command_id::text, 0));
  select booklet.* into v_existing from public.booklets booklet where booklet.note_id = p_command_id;
  if found then
    select note.* into v_note from public.notes note where note.id = p_command_id;
    if v_existing.user_id <> v_user_id
      or v_existing.rule_version <> p_rule_version
      or v_existing.source_refs <> p_source_refs
      or v_existing.snapshot_checksum <> p_snapshot_checksum
      or v_note.title <> p_title
      or v_note.content <> p_content
    then raise exception 'Booklet command_id is already used by different input'; end if;
    return jsonb_build_object('bookletId', v_existing.id, 'noteId', v_existing.note_id, 'idempotent', true);
  end if;

  insert into public.notes (
    id, type, title, content, subject, tags, videos, problems, is_published
  ) values (
    p_command_id, 'note', btrim(p_title), p_content, 'math',
    array['三刷做题本', '错题复盘', '不可变快照'], '[]'::jsonb, '[]'::jsonb, false
  ) returning * into v_note;

  insert into public.booklets (
    user_id, note_id, rule_version, source_refs, snapshot_checksum, method_summary_confirmed_at
  ) values (
    v_user_id, v_note.id, btrim(p_rule_version), p_source_refs, p_snapshot_checksum, now()
  ) returning * into v_existing;

  return jsonb_build_object('bookletId', v_existing.id, 'noteId', v_existing.note_id, 'idempotent', false);
end;
$$;

create or replace function public.refresh_booklet_drift(p_booklet_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_booklet public.booklets%rowtype;
  v_status text := 'current';
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select booklet.* into v_booklet
  from public.booklets booklet
  where booklet.id = p_booklet_id and booklet.user_id = v_user_id
  for update;
  if not found then raise exception 'Owned booklet does not exist'; end if;

  if exists (
    select 1
    from jsonb_array_elements(v_booklet.source_refs) source_ref(value)
    left join public.notes source_note on source_note.id::text = source_ref.value ->> 'sourceNoteId'
    left join lateral (
      select problem.value
      from jsonb_array_elements(coalesce(source_note.problems, '[]'::jsonb)) problem(value)
      where problem.value ->> 'id' = source_ref.value ->> 'sourceProblemId'
      limit 1
    ) source_problem on true
    where source_note.id is null or source_problem.value is null
  ) then
    v_status := 'missing';
  elsif exists (
    select 1
    from jsonb_array_elements(v_booklet.source_refs) source_ref(value)
    join public.notes source_note on source_note.id::text = source_ref.value ->> 'sourceNoteId'
    join lateral (
      select problem.value
      from jsonb_array_elements(source_note.problems) problem(value)
      where problem.value ->> 'id' = source_ref.value ->> 'sourceProblemId'
      limit 1
    ) source_problem on true
    where private.booklet_problem_checksum(source_problem.value) <> source_ref.value ->> 'checksum'
  ) then
    v_status := 'changed';
  end if;

  update public.booklets
  set drift_status = v_status, last_drift_checked_at = now()
  where id = v_booklet.id;

  return jsonb_build_object('bookletId', v_booklet.id, 'driftStatus', v_status);
end;
$$;

alter table public.math_papers enable row level security;
alter table public.math_papers force row level security;
alter table public.math_paper_problems enable row level security;
alter table public.math_paper_problems force row level security;
alter table public.ocr_confirmations enable row level security;
alter table public.ocr_confirmations force row level security;
alter table public.math_grade_steps enable row level security;
alter table public.math_grade_steps force row level security;
alter table public.booklets enable row level security;
alter table public.booklets force row level security;

create policy math_papers_authenticated_select on public.math_papers
for select to authenticated using ((select auth.uid()) is not null);
create policy math_papers_admin_insert on public.math_papers
for insert to authenticated with check ((select private.current_user_is_admin()));
create policy math_papers_admin_update on public.math_papers
for update to authenticated using ((select private.current_user_is_admin()))
with check ((select private.current_user_is_admin()));

create policy math_paper_problems_authenticated_select on public.math_paper_problems
for select to authenticated using ((select auth.uid()) is not null);
create policy math_paper_problems_admin_insert on public.math_paper_problems
for insert to authenticated with check ((select private.current_user_is_admin()));
create policy math_paper_problems_admin_update on public.math_paper_problems
for update to authenticated using ((select private.current_user_is_admin()))
with check ((select private.current_user_is_admin()));

create policy ocr_confirmations_owner_select on public.ocr_confirmations
for select to authenticated using (exists (
  select 1 from public.attempts attempt
  where attempt.id = ocr_confirmations.attempt_id
    and (attempt.user_id = (select auth.uid()) or (select private.current_user_is_admin()))
));

create policy math_grade_steps_owner_select on public.math_grade_steps
for select to authenticated using (exists (
  select 1
  from public.grades grade
  join public.attempt_revisions revision on revision.id = grade.revision_id
  join public.attempts attempt on attempt.id = revision.attempt_id
  where grade.id = math_grade_steps.grade_id
    and (attempt.user_id = (select auth.uid()) or (select private.current_user_is_admin()))
));

create policy booklets_owner_select on public.booklets
for select to authenticated using (
  user_id = (select auth.uid()) or (select private.current_user_is_admin())
);

drop policy grades_owner_insert_user_final on public.grades;
create policy grades_owner_insert_user_final on public.grades
for insert to authenticated
with check (
  origin = 'user_final'
  and scoring_mode <> 'math'
  and confirmation_id is null
  and exists (
    select 1
    from public.attempt_revisions revision
    join public.attempts attempt on attempt.id = revision.attempt_id
    where revision.id = grades.revision_id
      and attempt.user_id = (select auth.uid())
  )
);

revoke all on public.math_papers, public.math_paper_problems, public.ocr_confirmations,
  public.math_grade_steps, public.booklets from anon, authenticated;
grant select, insert, update on public.math_papers, public.math_paper_problems to authenticated;
grant select on public.ocr_confirmations, public.math_grade_steps, public.booklets to authenticated;

revoke all on function public.start_math_paper_attempt(uuid, smallint, uuid),
  public.record_math_ocr_confirmation(uuid, uuid, jsonb, jsonb),
  public.record_math_ai_grade(uuid, uuid, numeric, numeric, text, jsonb, jsonb),
  public.confirm_math_grade(uuid, uuid, numeric, text, jsonb, jsonb),
  public.list_math_papers(),
  public.get_math_training_state(uuid),
  public.get_math_grade_source(uuid),
  public.create_private_booklet(uuid, text, text, jsonb, text, text, boolean),
  public.refresh_booklet_drift(uuid)
from public, anon, authenticated;

grant execute on function public.start_math_paper_attempt(uuid, smallint, uuid),
  public.record_math_ocr_confirmation(uuid, uuid, jsonb, jsonb),
  public.record_math_ai_grade(uuid, uuid, numeric, numeric, text, jsonb, jsonb),
  public.confirm_math_grade(uuid, uuid, numeric, text, jsonb, jsonb),
  public.list_math_papers(),
  public.get_math_training_state(uuid),
  public.get_math_grade_source(uuid),
  public.create_private_booklet(uuid, text, text, jsonb, text, text, boolean),
  public.refresh_booklet_drift(uuid)
to authenticated;

comment on table public.math_papers is 'Admin-maintained fixed official math paper identity; AI cannot write source rows.';
comment on table public.math_paper_problems is 'Versioned fixed problem source with official answer and scoring rubric.';
comment on table public.ocr_confirmations is 'Append-only user-confirmed OCR versions; every math grade binds one version.';
comment on table public.math_grade_steps is 'Append-only readable per-step deductions for a math grade event.';
comment on table public.booklets is 'Metadata only; the private note remains the single booklet body source of truth.';

commit;
