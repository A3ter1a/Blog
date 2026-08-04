-- AST-WP5b: record an English score without requiring the learner to re-enter answers.
-- Objective sections keep the system_scored origin for compatibility; the breakdown
-- records that the score was entered by the learner. Subjective sections use user_final.

begin;

do $$
begin
  if to_regclass('public.attempts') is null
    or to_regclass('public.attempt_revisions') is null
    or to_regclass('public.grades') is null
    or to_regclass('public.english_passages') is null
    or to_regclass('public.english_questions') is null
  then
    raise exception '0031 requires the English training core and question tables';
  end if;
end
$$;

create or replace function public.record_english_manual_score(
  p_passage_id uuid,
  p_round smallint,
  p_scores jsonb,
  p_command_id uuid,
  p_write_legacy boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_section text;
  v_question_count integer;
  v_score numeric(12, 4);
  v_max_score numeric(12, 4);
  v_breakdown jsonb;
  v_source_snapshot jsonb;
  v_answer_snapshot jsonb;
  v_revision_no integer;
  v_revision_kind text;
  v_grade_origin text;
  v_scoring_mode text;
  v_idempotent boolean := false;
  v_attempt public.attempts%rowtype;
  v_existing_revision public.attempt_revisions%rowtype;
  v_effective_attempt public.attempts%rowtype;
  v_effective_revision public.attempt_revisions%rowtype;
  v_effective_grade public.grades%rowtype;
  v_legacy_attempt_id uuid;
  v_manual_prefix constant text := '__ASTEROID_MANUAL_SCORE__:';
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_passage_id is null or p_command_id is null then
    raise exception 'passage_id and command_id are required';
  end if;
  if p_round not between 1 and 3 then
    raise exception 'English training round must be between 1 and 3';
  end if;
  if p_scores is null or jsonb_typeof(p_scores) <> 'object' then
    raise exception 'English manual scores must be a JSON object';
  end if;
  if p_write_legacy is null then
    raise exception 'write_legacy must be explicit';
  end if;

  if exists (
    select 1
    from jsonb_each(p_scores) score_entry
    where jsonb_typeof(score_entry.value) <> 'number'
      or length(score_entry.key) > 80
  ) then
    raise exception 'English manual scores must contain numeric question scores';
  end if;
  if exists (
    select 1
    from jsonb_each(p_scores) score_entry
    where (score_entry.value #>> '{}')::numeric < 0
  ) then
    raise exception 'English manual scores cannot be negative';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || p_passage_id::text, 0)
  );

  select passage.section
    into v_section
  from public.english_passages passage
  where passage.id = p_passage_id;
  if not found then
    raise exception 'English passage does not exist';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_scores) score_question_id
    where not exists (
      select 1
      from public.english_questions question
      where question.passage_id = p_passage_id
        and question.id::text = score_question_id
    )
  ) then
    raise exception 'English manual scores contain a question outside the passage';
  end if;

  if exists (
    select 1
    from public.english_questions question
    where question.passage_id = p_passage_id
      and (p_scores ->> question.id::text)::numeric > question.score
  ) then
    raise exception 'English manual score exceeds the question max score';
  end if;

  select count(*), coalesce(sum(question.score), 0)::numeric(12, 4)
    into v_question_count, v_max_score
  from public.english_questions question
  where question.passage_id = p_passage_id;
  if v_question_count = 0 then
    raise exception 'English passage has no questions';
  end if;

  select coalesce(jsonb_object_agg(
    question.id::text,
    to_jsonb(v_manual_prefix || coalesce(p_scores ->> question.id::text, '0'))
  ), '{}'::jsonb)
    into v_answer_snapshot
  from public.english_questions question
  where question.passage_id = p_passage_id;

  select revision.*
    into v_existing_revision
  from public.attempt_revisions revision
  where revision.id = p_command_id;
  if found then
    if v_existing_revision.response_payload <> jsonb_build_object('answers', v_answer_snapshot) then
      raise exception 'English manual score command_id is already used by another revision';
    end if;
    v_idempotent := true;
    select candidate.*
      into v_attempt
    from public.attempts candidate
    where candidate.id = v_existing_revision.attempt_id;
    if not found
      or v_attempt.user_id <> v_user_id
      or v_attempt.source_kind <> 'english_passage'
      or v_attempt.english_passage_id <> p_passage_id
      or v_attempt.round <> p_round
    then
      raise exception 'English manual score command does not belong to the current user and passage';
    end if;
  else
    select candidate.*
      into v_attempt
    from public.attempts candidate
    where candidate.user_id = v_user_id
      and candidate.source_kind = 'english_passage'
      and candidate.english_passage_id = p_passage_id
      and candidate.round = p_round
    for update;

    if not found then
      if p_round <> 1 then
        raise exception 'English round must be created by start_next';
      end if;
      insert into public.attempts (
        id, user_id, source_kind, english_passage_id, round, status,
        draft_payload, started_at
      ) values (
        gen_random_uuid(), v_user_id, 'english_passage', p_passage_id, 1,
        'in_progress', '{}'::jsonb, now()
      )
      returning * into v_attempt;
    end if;
  end if;

  if not v_idempotent then
    if v_attempt.status not in ('in_progress', 'submitted', 'sealed') then
      raise exception 'English round is not available for a score record';
    end if;

    select coalesce(max(revision.revision_no), 0) + 1
      into v_revision_no
    from public.attempt_revisions revision
    where revision.attempt_id = v_attempt.id;
    v_revision_kind := case when v_revision_no = 1 then 'submission' else 'correction' end;
    v_grade_origin := case when v_section in ('reading', 'cloze', 'new_type') then 'system_scored' else 'user_final' end;
    v_scoring_mode := case when v_section in ('reading', 'cloze', 'new_type') then 'objective' else 'subjective' end;

    select
      coalesce(sum(coalesce((p_scores ->> question.id::text)::numeric, 0)), 0)::numeric(12, 4),
      coalesce(sum(question.score), 0)::numeric(12, 4),
      jsonb_build_object(
        'source', 'user_recorded_scores',
        'questionCount', count(*),
        'scoringMode', 'manual',
        'questions', jsonb_agg(
          jsonb_build_object(
            'questionId', question.id,
            'isManual', true,
            'score', coalesce((p_scores ->> question.id::text)::numeric, 0),
            'maxScore', question.score
          )
          order by question.sort_order, question.id
        )
      ),
      jsonb_build_object(
        'passageId', p_passage_id,
        'questionIds', jsonb_agg(question.id::text order by question.sort_order, question.id)
      )
      into v_score, v_max_score, v_breakdown, v_source_snapshot
    from public.english_questions question
    where question.passage_id = p_passage_id;

    insert into public.attempt_revisions (
      id, attempt_id, revision_no, kind, response_payload, source_snapshot
    ) values (
      p_command_id,
      v_attempt.id,
      v_revision_no,
      v_revision_kind,
      jsonb_build_object('answers', v_answer_snapshot),
      v_source_snapshot
    )
    returning * into v_existing_revision;

    insert into public.grades (
      revision_id, origin, grade_seq, scoring_mode, score, max_score, breakdown
    ) values (
      v_existing_revision.id,
      v_grade_origin,
      1,
      v_scoring_mode,
      v_score,
      v_max_score,
      v_breakdown
    );

    if v_attempt.status = 'in_progress' then
      update public.attempts
      set status = 'submitted', draft_payload = '{}'::jsonb
      where id = v_attempt.id
      returning * into v_attempt;
    end if;
  end if;

  if p_write_legacy then
    select candidate.*
      into v_effective_attempt
    from public.attempts candidate
    where candidate.user_id = v_user_id
      and candidate.source_kind = 'english_passage'
      and candidate.english_passage_id = p_passage_id
      and candidate.status in ('submitted', 'sealed')
      and exists (
        select 1
        from public.attempt_revisions revision
        join public.grades grade on grade.revision_id = revision.id
        where revision.attempt_id = candidate.id
          and grade.origin in ('system_scored', 'user_final', 'legacy_imported')
      )
    order by candidate.round desc
    limit 1;
    if not found then
      raise exception 'No formal English result exists for the legacy projection';
    end if;

    select revision.*
      into v_effective_revision
    from public.attempt_revisions revision
    where revision.attempt_id = v_effective_attempt.id
      and exists (
        select 1 from public.grades grade
        where grade.revision_id = revision.id
          and grade.origin in ('system_scored', 'user_final', 'legacy_imported')
      )
    order by revision.revision_no desc
    limit 1;

    select grade.*
      into v_effective_grade
    from public.grades grade
    where grade.revision_id = v_effective_revision.id
      and grade.origin in ('system_scored', 'user_final', 'legacy_imported')
    order by case grade.origin
      when 'user_final' then 3
      when 'system_scored' then 2
      else 1
    end desc, grade.grade_seq desc
    limit 1;

    insert into public.english_attempts (
      id, user_id, passage_id, status, score, max_score,
      started_at, submitted_at, created_at, updated_at
    ) values (
      v_effective_attempt.id,
      v_user_id,
      p_passage_id,
      'submitted',
      v_effective_grade.score,
      v_effective_grade.max_score,
      coalesce(v_effective_attempt.started_at, v_effective_attempt.created_at),
      coalesce(v_effective_attempt.submitted_at, v_effective_revision.created_at),
      v_effective_attempt.created_at,
      now()
    )
    on conflict (user_id, passage_id) do update
    set status = 'submitted',
        score = excluded.score,
        max_score = excluded.max_score,
        submitted_at = excluded.submitted_at,
        updated_at = now()
    returning id into v_legacy_attempt_id;

    insert into public.english_attempt_answers (
      attempt_id, question_id, answer, is_correct, score, created_at, updated_at
    )
    select
      v_legacy_attempt_id,
      question.id,
      coalesce(v_effective_revision.response_payload #>> array['answers', question.id::text], ''),
      null,
      case
        when coalesce(v_effective_revision.response_payload #>> array['answers', question.id::text], '') like v_manual_prefix || '%'
        then substring(v_effective_revision.response_payload #>> array['answers', question.id::text] from char_length(v_manual_prefix) + 1)::numeric
        else 0
      end,
      now(),
      now()
    from public.english_questions question
    where question.passage_id = p_passage_id
    on conflict (attempt_id, question_id) do update
    set answer = excluded.answer,
        is_correct = excluded.is_correct,
        score = excluded.score,
        updated_at = now();
  end if;

  return jsonb_build_object(
    'action', 'manual_score',
    'attemptId', v_attempt.id,
    'revisionId', v_existing_revision.id,
    'round', v_attempt.round,
    'idempotent', v_idempotent,
    'legacyProjected', p_write_legacy
  );
end;
$$;

revoke all on function public.record_english_manual_score(uuid, smallint, jsonb, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.record_english_manual_score(uuid, smallint, jsonb, uuid, boolean)
  to authenticated;

comment on function public.record_english_manual_score(uuid, smallint, jsonb, uuid, boolean) is
  'Record per-question English scores without requiring answer re-entry, with optional legacy projection.';

commit;
