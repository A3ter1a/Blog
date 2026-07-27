-- AST-WP5: atomic English draft/submission/correction/next-round command.
-- The optional legacy projection keeps the old read path usable during the bounded dual-write window.

begin;

do $$
begin
  if to_regclass('public.english_attempts') is null
    or to_regclass('public.english_attempt_answers') is null
    or to_regclass('public.english_passages') is null
    or to_regclass('public.english_questions') is null
    or to_regclass('public.attempts') is null
    or to_regclass('public.attempt_revisions') is null
    or to_regclass('public.grades') is null
    or to_regprocedure('private.normalize_english_objective_answer(text)') is null
  then
    raise exception '0017 requires 0010 and 0016';
  end if;
end
$$;

create or replace function public.record_english_training_command(
  p_passage_id uuid,
  p_round smallint,
  p_action text,
  p_answers jsonb,
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
  v_passage_section text;
  v_question_count integer;
  v_score numeric(12, 4);
  v_max_score numeric(12, 4);
  v_breakdown jsonb;
  v_source_snapshot jsonb;
  v_revision_no integer;
  v_revision_kind text;
  v_idempotent boolean := false;
  v_attempt public.attempts%rowtype;
  v_existing_command_revision public.attempt_revisions%rowtype;
  v_effective_attempt public.attempts%rowtype;
  v_effective_revision public.attempt_revisions%rowtype;
  v_effective_grade public.grades%rowtype;
  v_legacy_attempt_id uuid;
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
  if p_action not in ('save_draft', 'submit', 'start_next') then
    raise exception 'Unsupported English training action: %', p_action;
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'English answers must be a JSON object';
  end if;
  if p_write_legacy is null then
    raise exception 'write_legacy must be explicit';
  end if;
  if p_action = 'start_next' and p_answers <> '{}'::jsonb then
    raise exception 'start_next does not accept answers';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || p_passage_id::text, 0)
  );

  select passage.section
    into v_passage_section
  from public.english_passages passage
  where passage.id = p_passage_id;
  if not found then
    raise exception 'English passage does not exist';
  end if;

  if exists (
    select 1
    from jsonb_each(p_answers) answer_entry
    where jsonb_typeof(answer_entry.value) <> 'string'
      or length(answer_entry.key) > 80
      or length(answer_entry.value #>> '{}') > 20000
  ) then
    raise exception 'English answer keys or values are invalid';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_answers) answer_question_id
    where not exists (
      select 1
      from public.english_questions question
      where question.passage_id = p_passage_id
        and question.id::text = answer_question_id
    )
  ) then
    raise exception 'English answers contain a question outside the passage';
  end if;

  select count(*), coalesce(sum(question.score), 0)::numeric(12, 4)
    into v_question_count, v_max_score
  from public.english_questions question
  where question.passage_id = p_passage_id;
  if v_question_count = 0 then
    raise exception 'English passage has no questions';
  end if;

  if p_action = 'start_next' then
    if p_round >= 3 then
      raise exception 'English training is limited to three rounds';
    end if;

    select candidate.*
      into v_attempt
    from public.attempts candidate
    where candidate.id = p_command_id;
    if found then
      if v_attempt.user_id <> v_user_id
        or v_attempt.source_kind <> 'english_passage'
        or v_attempt.english_passage_id <> p_passage_id
        or v_attempt.round <> p_round + 1
      then
        raise exception 'English command_id is already used by another event';
      end if;
      return jsonb_build_object(
        'action', p_action,
        'attemptId', v_attempt.id,
        'round', v_attempt.round,
        'idempotent', true
      );
    end if;

    select candidate.*
      into v_attempt
    from public.attempts candidate
    where candidate.user_id = v_user_id
      and candidate.source_kind = 'english_passage'
      and candidate.english_passage_id = p_passage_id
      and candidate.round = p_round
    for update;
    if not found then
      raise exception 'Current English round does not exist';
    end if;
    if v_attempt.status not in ('submitted', 'abandoned') then
      raise exception 'Current English round must be submitted or abandoned';
    end if;

    select candidate.*
      into v_effective_attempt
    from public.attempts candidate
    where candidate.user_id = v_user_id
      and candidate.source_kind = 'english_passage'
      and candidate.english_passage_id = p_passage_id
      and candidate.round = p_round + 1
    for update;
    if found then
      return jsonb_build_object(
        'action', p_action,
        'attemptId', v_effective_attempt.id,
        'round', v_effective_attempt.round,
        'idempotent', true
      );
    end if;

    insert into public.attempts (
      id, user_id, source_kind, english_passage_id, round, status,
      draft_payload, started_at
    ) values (
      p_command_id, v_user_id, 'english_passage', p_passage_id, p_round + 1,
      'in_progress', '{}'::jsonb, now()
    )
    returning * into v_attempt;

    return jsonb_build_object(
      'action', p_action,
      'attemptId', v_attempt.id,
      'round', v_attempt.round,
      'idempotent', false
    );
  end if;

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
      p_command_id, v_user_id, 'english_passage', p_passage_id, 1,
      'in_progress', jsonb_build_object('answers', p_answers), now()
    )
    returning * into v_attempt;
  end if;

  if p_action = 'save_draft' then
    if v_attempt.status <> 'in_progress' then
      raise exception 'Only an in-progress English round can save a draft';
    end if;

    update public.attempts
    set draft_payload = jsonb_build_object('answers', p_answers)
    where id = v_attempt.id
    returning * into v_attempt;

    if p_write_legacy and p_round = 1 then
      select legacy.id
        into v_legacy_attempt_id
      from public.english_attempts legacy
      where legacy.user_id = v_user_id and legacy.passage_id = p_passage_id
      for update;
      if found and v_legacy_attempt_id <> v_attempt.id then
        raise exception 'Legacy/shared round-1 identity mismatch';
      end if;

      insert into public.english_attempts (
        id, user_id, passage_id, status, score, max_score,
        started_at, submitted_at, created_at, updated_at
      ) values (
        v_attempt.id, v_user_id, p_passage_id, 'in_progress', 0, v_max_score,
        coalesce(v_attempt.started_at, now()), null, v_attempt.created_at, now()
      )
      on conflict (user_id, passage_id) do update
      set status = 'in_progress',
          score = 0,
          max_score = excluded.max_score,
          submitted_at = null,
          updated_at = now()
      returning id into v_legacy_attempt_id;

      insert into public.english_attempt_answers (
        attempt_id, question_id, answer, is_correct, score, created_at, updated_at
      )
      select
        v_legacy_attempt_id,
        question.id,
        coalesce(p_answers ->> question.id::text, ''),
        null,
        0,
        now(),
        now()
      from public.english_questions question
      where question.passage_id = p_passage_id
      on conflict (attempt_id, question_id) do update
      set answer = excluded.answer,
          is_correct = null,
          score = 0,
          updated_at = now();
    end if;

    return jsonb_build_object(
      'action', p_action,
      'attemptId', v_attempt.id,
      'round', v_attempt.round,
      'idempotent', false
    );
  end if;

  if v_passage_section not in ('reading', 'cloze', 'new_type') then
    raise exception 'Subjective English answers require the AI suggestion and user-final flow';
  end if;
  if exists (
    select 1
    from public.english_questions question
    where question.passage_id = p_passage_id
      and nullif(btrim(question.standard_answer), '') is null
  ) then
    raise exception 'English objective source answer is incomplete';
  end if;

  select revision.*
    into v_existing_command_revision
  from public.attempt_revisions revision
  where revision.id = p_command_id;

  if found then
    if v_existing_command_revision.attempt_id <> v_attempt.id
      or v_existing_command_revision.response_payload <> jsonb_build_object('answers', p_answers)
    then
      raise exception 'English command_id is already used by another revision';
    end if;
    v_idempotent := true;
  else
    select coalesce(max(revision.revision_no), 0) + 1
      into v_revision_no
    from public.attempt_revisions revision
    where revision.attempt_id = v_attempt.id;
    v_revision_kind := case when v_revision_no = 1 then 'submission' else 'correction' end;

    if v_revision_kind = 'submission' and v_attempt.status <> 'in_progress' then
      raise exception 'The first English submission requires an in-progress round';
    end if;
    if v_revision_kind = 'correction' and v_attempt.status not in ('submitted', 'sealed') then
      raise exception 'An English correction requires a submitted or sealed round';
    end if;

    select
      coalesce(sum(
        case
          when private.normalize_english_objective_answer(coalesce(p_answers ->> question.id::text, '')) <> ''
            and private.normalize_english_objective_answer(p_answers ->> question.id::text)
              = private.normalize_english_objective_answer(question.standard_answer)
          then question.score
          else 0
        end
      ), 0)::numeric(12, 4),
      coalesce(sum(question.score), 0)::numeric(12, 4),
      jsonb_build_object(
        'source', 'current_official_answers',
        'questionCount', count(*),
        'correctCount', count(*) filter (
          where private.normalize_english_objective_answer(coalesce(p_answers ->> question.id::text, '')) <> ''
            and private.normalize_english_objective_answer(p_answers ->> question.id::text)
              = private.normalize_english_objective_answer(question.standard_answer)
        ),
        'questions', jsonb_agg(
          jsonb_build_object(
            'questionId', question.id,
            'isCorrect',
              private.normalize_english_objective_answer(coalesce(p_answers ->> question.id::text, '')) <> ''
              and private.normalize_english_objective_answer(p_answers ->> question.id::text)
                = private.normalize_english_objective_answer(question.standard_answer),
            'score', case
              when private.normalize_english_objective_answer(coalesce(p_answers ->> question.id::text, '')) <> ''
                and private.normalize_english_objective_answer(p_answers ->> question.id::text)
                  = private.normalize_english_objective_answer(question.standard_answer)
              then question.score
              else 0
            end,
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
      jsonb_build_object('answers', p_answers),
      v_source_snapshot
    )
    returning * into v_existing_command_revision;

    insert into public.grades (
      revision_id, origin, grade_seq, scoring_mode, score, max_score, breakdown
    ) values (
      v_existing_command_revision.id,
      'system_scored',
      1,
      'objective',
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
      private.normalize_english_objective_answer(
        coalesce(v_effective_revision.response_payload #>> array['answers', question.id::text], '')
      ) <> ''
        and private.normalize_english_objective_answer(
          v_effective_revision.response_payload #>> array['answers', question.id::text]
        ) = private.normalize_english_objective_answer(question.standard_answer),
      case
        when private.normalize_english_objective_answer(
          coalesce(v_effective_revision.response_payload #>> array['answers', question.id::text], '')
        ) <> ''
          and private.normalize_english_objective_answer(
            v_effective_revision.response_payload #>> array['answers', question.id::text]
          ) = private.normalize_english_objective_answer(question.standard_answer)
        then question.score
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
    'action', p_action,
    'attemptId', v_attempt.id,
    'revisionId', v_existing_command_revision.id,
    'round', v_attempt.round,
    'idempotent', v_idempotent,
    'legacyProjected', p_write_legacy
  );
end;
$$;

revoke all on function public.record_english_training_command(uuid, smallint, text, jsonb, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.record_english_training_command(uuid, smallint, text, jsonb, uuid, boolean)
  to authenticated;

comment on function public.record_english_training_command(uuid, smallint, text, jsonb, uuid, boolean) is
  'Atomic owner-scoped English draft, objective submission/correction, next-round transition, and optional legacy projection.';

commit;
