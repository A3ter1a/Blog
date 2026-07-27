-- AST-WP5: idempotent legacy English attempt backfill into the shared training core.
-- This migration only inserts shared attempts/revisions/grades. It never mutates legacy English rows.

begin;

create or replace function private.normalize_english_objective_answer(p_answer text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.upper(
    pg_catalog.regexp_replace(
      pg_catalog.translate(
        pg_catalog.btrim(p_answer),
        'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ０１２３４５６７８９',
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
      ),
      '[，。；、,.[:space:]]',
      '',
      'g'
    )
  );
$$;

revoke all on function private.normalize_english_objective_answer(text) from public, anon, authenticated;

do $$
begin
  if to_regclass('public.english_attempts') is null
    or to_regclass('public.english_attempt_answers') is null
    or to_regclass('public.english_passages') is null
    or to_regclass('public.english_questions') is null
    or to_regclass('public.attempts') is null
    or to_regclass('public.attempt_revisions') is null
    or to_regclass('public.grades') is null
  then
    raise exception '0016 requires legacy English tables and the shared training core';
  end if;

  if exists (
    select 1
    from public.english_attempts legacy
    left join public.english_passages passage on passage.id = legacy.passage_id
    where passage.id is null
  ) then
    raise exception 'English backfill refused: orphan legacy attempt passage';
  end if;

  if exists (
    select 1
    from public.english_attempt_answers answer_row
    left join public.english_attempts legacy on legacy.id = answer_row.attempt_id
    left join public.english_questions question on question.id = answer_row.question_id
    where legacy.id is null
      or question.id is null
      or question.passage_id <> legacy.passage_id
  ) then
    raise exception 'English backfill refused: orphan or cross-passage legacy answer';
  end if;

  if exists (
    select 1
    from public.english_attempts legacy
    where legacy.status not in ('in_progress', 'submitted')
      or legacy.score < 0
      or legacy.max_score < 0
      or legacy.score > legacy.max_score
  ) then
    raise exception 'English backfill refused: invalid legacy status or score';
  end if;

  if exists (
    select 1
    from public.attempts target
    join public.english_attempts legacy on legacy.id = target.id
    where target.user_id <> legacy.user_id
      or target.source_kind <> 'english_passage'
      or target.english_passage_id <> legacy.passage_id
      or target.round <> 1
      or target.status <> legacy.status
  ) then
    raise exception 'English backfill refused: target attempt UUID already has different immutable input';
  end if;

  if exists (
    select 1
    from public.english_attempts legacy
    join public.attempts target
      on target.user_id = legacy.user_id
      and target.source_kind = 'english_passage'
      and target.english_passage_id = legacy.passage_id
      and target.round = 1
    where target.id <> legacy.id
  ) then
    raise exception 'English backfill refused: round-1 identity already uses another attempt UUID';
  end if;
end
$$;

with legacy_answer_payloads as (
  select
    legacy.id as attempt_id,
    coalesce(
      jsonb_object_agg(answer_row.question_id::text, answer_row.answer order by answer_row.question_id)
        filter (where answer_row.id is not null),
      '{}'::jsonb
    ) as answers
  from public.english_attempts legacy
  left join public.english_attempt_answers answer_row on answer_row.attempt_id = legacy.id
  group by legacy.id
)
insert into public.attempts (
  id, user_id, source_kind, english_passage_id, round, status, draft_payload,
  started_at, submitted_at, created_at, updated_at
)
select
  legacy.id,
  legacy.user_id,
  'english_passage',
  legacy.passage_id,
  1,
  legacy.status,
  case
    when legacy.status = 'in_progress' then jsonb_build_object('answers', payload.answers)
    else '{}'::jsonb
  end,
  coalesce(legacy.started_at, legacy.created_at),
  case when legacy.status = 'submitted'
    then coalesce(legacy.submitted_at, legacy.updated_at, legacy.created_at)
    else null
  end,
  legacy.created_at,
  legacy.updated_at
from public.english_attempts legacy
join legacy_answer_payloads payload on payload.attempt_id = legacy.id
on conflict (id) do nothing;

do $$
begin
  if exists (
    with revision_plan as (
      select
        legacy.id as revision_id,
        jsonb_build_object(
          'answers',
          jsonb_object_agg(answer_row.question_id::text, answer_row.answer order by answer_row.question_id)
        ) as response_payload
      from public.english_attempts legacy
      join public.english_attempt_answers answer_row on answer_row.attempt_id = legacy.id
      where legacy.status = 'submitted'
      group by legacy.id
    )
    select 1
    from revision_plan plan
    join public.attempt_revisions target on target.id = plan.revision_id
    where target.attempt_id <> plan.revision_id
      or target.revision_no <> 1
      or target.kind <> 'submission'
      or target.response_payload <> plan.response_payload
  ) then
    raise exception 'English backfill refused: revision UUID already has different immutable input';
  end if;

  if exists (
    select 1
    from public.english_attempts legacy
    join public.attempt_revisions target
      on target.attempt_id = legacy.id and target.revision_no = 1
    where legacy.status = 'submitted'
      and target.id <> legacy.id
  ) then
    raise exception 'English backfill refused: revision 1 already uses another UUID';
  end if;
end
$$;

with revision_plan as (
  select
    legacy.id as revision_id,
    legacy.id as attempt_id,
    jsonb_build_object(
      'answers',
      jsonb_object_agg(answer_row.question_id::text, answer_row.answer order by answer_row.question_id)
    ) as response_payload,
    jsonb_build_object(
      'legacyEnglishAttemptId', legacy.id,
      'passageId', legacy.passage_id,
      'questionIds', jsonb_agg(answer_row.question_id::text order by answer_row.question_id)
    ) as source_snapshot,
    coalesce(legacy.submitted_at, legacy.updated_at, legacy.created_at) as created_at
  from public.english_attempts legacy
  join public.english_attempt_answers answer_row on answer_row.attempt_id = legacy.id
  where legacy.status = 'submitted'
  group by legacy.id
)
insert into public.attempt_revisions (
  id, attempt_id, revision_no, kind, response_payload, source_snapshot, created_at
)
select
  plan.revision_id,
  plan.attempt_id,
  1,
  'submission',
  plan.response_payload,
  plan.source_snapshot,
  plan.created_at
from revision_plan plan
where not exists (
  select 1
  from public.attempt_revisions existing
  where existing.id = plan.revision_id
)
on conflict (id) do nothing;

do $$
begin
  if exists (
    select 1
    from public.english_attempts legacy
    join public.english_passages passage on passage.id = legacy.passage_id
    join public.grades target
      on target.revision_id = legacy.id
      and target.origin = 'legacy_imported'
      and target.grade_seq = 1
    where legacy.status = 'submitted'
      and (
        target.score <> legacy.score
        or target.max_score <> legacy.max_score
        or target.scoring_mode <> case
          when passage.section in ('reading', 'cloze', 'new_type') then 'objective'
          else 'subjective'
        end
      )
  ) then
    raise exception 'English backfill refused: existing legacy grade differs';
  end if;
end
$$;

insert into public.grades (
  revision_id, origin, grade_seq, scoring_mode, score, max_score, breakdown, created_at
)
select
  legacy.id,
  'legacy_imported',
  1,
  case when passage.section in ('reading', 'cloze', 'new_type') then 'objective' else 'subjective' end,
  legacy.score,
  legacy.max_score,
  jsonb_build_object(
    'source', 'english_attempts',
    'historicalContinuity', true,
    'legacyEnglishAttemptId', legacy.id
  ),
  coalesce(legacy.submitted_at, legacy.updated_at, legacy.created_at)
from public.english_attempts legacy
join public.english_passages passage on passage.id = legacy.passage_id
join public.attempt_revisions revision on revision.id = legacy.id
where legacy.status = 'submitted'
  and not exists (
    select 1 from public.grades existing
    where existing.revision_id = legacy.id
      and existing.origin = 'legacy_imported'
      and existing.grade_seq = 1
  );

do $$
begin
  if exists (
    select 1
    from public.english_attempts legacy
    join public.english_passages passage on passage.id = legacy.passage_id
    where legacy.status = 'submitted'
      and passage.section in ('reading', 'cloze', 'new_type')
      and not exists (
        select 1 from public.english_questions question
        where question.passage_id = passage.id
      )
  ) or exists (
    select 1
    from public.english_attempts legacy
    join public.english_passages passage on passage.id = legacy.passage_id
    join public.english_questions question on question.passage_id = passage.id
    where legacy.status = 'submitted'
      and passage.section in ('reading', 'cloze', 'new_type')
      and nullif(btrim(question.standard_answer), '') is null
  ) then
    raise exception 'English backfill refused: objective source answer is incomplete';
  end if;
end
$$;

do $$
begin
  if exists (
    with system_grade_plan as (
      select
        legacy.id as revision_id,
        sum(
          case
            when private.normalize_english_objective_answer(coalesce(answer_row.answer, '')) <> ''
              and private.normalize_english_objective_answer(answer_row.answer)
                = private.normalize_english_objective_answer(question.standard_answer)
            then question.score
            else 0
          end
        ) as score,
        sum(question.score) as max_score
      from public.english_attempts legacy
      join public.english_passages passage on passage.id = legacy.passage_id
      join public.english_questions question on question.passage_id = passage.id
      left join public.english_attempt_answers answer_row
        on answer_row.attempt_id = legacy.id and answer_row.question_id = question.id
      where legacy.status = 'submitted'
        and passage.section in ('reading', 'cloze', 'new_type')
      group by legacy.id
    )
    select 1
    from system_grade_plan plan
    join public.grades target
      on target.revision_id = plan.revision_id
      and target.origin = 'system_scored'
      and target.grade_seq = 1
    where target.scoring_mode <> 'objective'
      or target.score <> plan.score
      or target.max_score <> plan.max_score
  ) then
    raise exception 'English backfill refused: existing system grade differs';
  end if;
end
$$;

with system_grade_plan as (
  select
    legacy.id as revision_id,
    sum(
      case
        when private.normalize_english_objective_answer(coalesce(answer_row.answer, '')) <> ''
          and private.normalize_english_objective_answer(answer_row.answer)
            = private.normalize_english_objective_answer(question.standard_answer)
        then question.score
        else 0
      end
    ) as score,
    sum(question.score) as max_score,
    count(*) as question_count,
    count(*) filter (
      where private.normalize_english_objective_answer(coalesce(answer_row.answer, '')) <> ''
        and private.normalize_english_objective_answer(answer_row.answer)
          = private.normalize_english_objective_answer(question.standard_answer)
    ) as correct_count,
    jsonb_agg(
      jsonb_build_object(
        'questionId', question.id,
        'isCorrect',
          private.normalize_english_objective_answer(coalesce(answer_row.answer, '')) <> ''
          and private.normalize_english_objective_answer(answer_row.answer)
            = private.normalize_english_objective_answer(question.standard_answer),
        'score', case
          when private.normalize_english_objective_answer(coalesce(answer_row.answer, '')) <> ''
            and private.normalize_english_objective_answer(answer_row.answer)
              = private.normalize_english_objective_answer(question.standard_answer)
          then question.score
          else 0
        end,
        'maxScore', question.score
      )
      order by question.sort_order, question.id
    ) as questions
  from public.english_attempts legacy
  join public.english_passages passage on passage.id = legacy.passage_id
  join public.english_questions question on question.passage_id = passage.id
  left join public.english_attempt_answers answer_row
    on answer_row.attempt_id = legacy.id and answer_row.question_id = question.id
  where legacy.status = 'submitted'
    and passage.section in ('reading', 'cloze', 'new_type')
  group by legacy.id
)
insert into public.grades (
  revision_id, origin, grade_seq, scoring_mode, score, max_score, breakdown, created_at
)
select
  plan.revision_id,
  'system_scored',
  1,
  'objective',
  plan.score,
  plan.max_score,
  jsonb_build_object(
    'source', 'current_official_answers',
    'questionCount', plan.question_count,
    'correctCount', plan.correct_count,
    'questions', plan.questions
  ),
  coalesce(legacy.submitted_at, legacy.updated_at, legacy.created_at)
from system_grade_plan plan
join public.english_attempts legacy on legacy.id = plan.revision_id
where not exists (
  select 1 from public.grades existing
  where existing.revision_id = plan.revision_id
    and existing.origin = 'system_scored'
    and existing.grade_seq = 1
);

do $$
declare
  legacy_attempt_count bigint;
  mapped_attempt_count bigint;
  expected_revision_count bigint;
  mapped_revision_count bigint;
  mapped_legacy_grade_count bigint;
  expected_system_grade_count bigint;
  mapped_system_grade_count bigint;
begin
  select count(*) into legacy_attempt_count from public.english_attempts;
  select count(*) into mapped_attempt_count
  from public.english_attempts legacy
  join public.attempts target
    on target.id = legacy.id
    and target.user_id = legacy.user_id
    and target.source_kind = 'english_passage'
    and target.english_passage_id = legacy.passage_id
    and target.round = 1;

  select count(*) into expected_revision_count
  from public.english_attempts legacy
  where legacy.status = 'submitted'
    and exists (
      select 1 from public.english_attempt_answers answer_row where answer_row.attempt_id = legacy.id
    );
  select count(*) into mapped_revision_count
  from public.english_attempts legacy
  join public.attempt_revisions revision
    on revision.id = legacy.id and revision.attempt_id = legacy.id and revision.revision_no = 1;
  select count(*) into mapped_legacy_grade_count
  from public.english_attempts legacy
  join public.grades grade
    on grade.revision_id = legacy.id and grade.origin = 'legacy_imported' and grade.grade_seq = 1;

  select count(*) into expected_system_grade_count
  from public.english_attempts legacy
  join public.english_passages passage on passage.id = legacy.passage_id
  where legacy.status = 'submitted'
    and passage.section in ('reading', 'cloze', 'new_type');
  select count(*) into mapped_system_grade_count
  from public.english_attempts legacy
  join public.grades grade
    on grade.revision_id = legacy.id and grade.origin = 'system_scored' and grade.grade_seq = 1;

  if mapped_attempt_count <> legacy_attempt_count
    or mapped_revision_count <> expected_revision_count
    or mapped_legacy_grade_count <> expected_revision_count
    or mapped_system_grade_count <> expected_system_grade_count
  then
    raise exception 'English backfill postcondition failed: attempts %/%, revisions %/%, legacy grades %/%, system grades %/%',
      mapped_attempt_count, legacy_attempt_count,
      mapped_revision_count, expected_revision_count,
      mapped_legacy_grade_count, expected_revision_count,
      mapped_system_grade_count, expected_system_grade_count;
  end if;
end
$$;

comment on function private.normalize_english_objective_answer(text) is
  'Canonical English objective-answer normalization shared by the WP5 legacy backfill.';

commit;
