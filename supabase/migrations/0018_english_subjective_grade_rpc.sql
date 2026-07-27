-- AST-WP5: append-only subjective English suggestion and user-final confirmation.
-- AI suggestions are advisory; only user_final (or retained legacy grades) are formal.

begin;

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
    and candidate.problem_id is not distinct from new.problem_id;

  if found
    and previous_attempt.status in ('submitted', 'sealed')
    and not exists (
      select 1
      from public.attempt_revisions revision
      join public.grades grade on grade.revision_id = revision.id
      where revision.attempt_id = previous_attempt.id
        and grade.origin in ('system_scored', 'user_final', 'legacy_imported')
    )
  then
    raise exception 'Previous round requires a formal grade before the next round can start';
  end if;

  return new;
end;
$$;

revoke all on function private.ensure_previous_attempt_has_formal_grade() from public, anon, authenticated;

drop trigger if exists verify_previous_attempt_formal_grade on public.attempts;
create trigger verify_previous_attempt_formal_grade
  before insert on public.attempts
  for each row execute function private.ensure_previous_attempt_has_formal_grade();

create or replace function public.record_english_subjective_submission(
  p_passage_id uuid,
  p_round smallint,
  p_answers jsonb,
  p_command_id uuid,
  p_suggested_score numeric,
  p_feedback text,
  p_breakdown jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  passage_section text;
  question_count integer;
  max_score numeric(12, 4);
  next_revision_no integer;
  revision_kind text;
  target_attempt public.attempts%rowtype;
  existing_revision public.attempt_revisions%rowtype;
begin
  if caller_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_passage_id is null or p_command_id is null or p_round not between 1 and 3 then
    raise exception 'Valid passage, command and round are required';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'English answers must be a JSON object';
  end if;
  if p_breakdown is null or jsonb_typeof(p_breakdown) <> 'object' or length(p_breakdown::text) > 100000 then
    raise exception 'Subjective grade breakdown must be a bounded JSON object';
  end if;
  if nullif(btrim(p_feedback), '') is null or length(p_feedback) > 20000 then
    raise exception 'Subjective feedback is required and must be bounded';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(caller_user_id::text || ':' || p_passage_id::text, 0));

  select passage.section
    into passage_section
  from public.english_passages passage
  where passage.id = p_passage_id;
  if passage_section is null or passage_section not in ('translation', 'writing') then
    raise exception 'Subjective grading only accepts translation or writing passages';
  end if;

  if exists (
    select 1 from jsonb_each(p_answers) answer_entry
    where jsonb_typeof(answer_entry.value) <> 'string'
      or length(answer_entry.key) > 80
      or length(answer_entry.value #>> '{}') > 20000
  ) or exists (
    select 1 from jsonb_object_keys(p_answers) answer_question_id
    where not exists (
      select 1 from public.english_questions question
      where question.passage_id = p_passage_id and question.id::text = answer_question_id
    )
  ) then
    raise exception 'Subjective English answers are invalid or cross-passage';
  end if;

  select count(*), coalesce(sum(question.score), 0)::numeric(12, 4)
    into question_count, max_score
  from public.english_questions question
  where question.passage_id = p_passage_id;
  if question_count = 0 or max_score <= 0 then
    raise exception 'Subjective English passage has no valid scoring source';
  end if;
  if p_suggested_score is null or p_suggested_score < 0 or p_suggested_score > max_score then
    raise exception 'Suggested score is outside the allowed range';
  end if;

  select attempt.*
    into target_attempt
  from public.attempts attempt
  where attempt.user_id = caller_user_id
    and attempt.source_kind = 'english_passage'
    and attempt.english_passage_id = p_passage_id
    and attempt.round = p_round
  for update;
  if not found then
    if p_round <> 1 then raise exception 'English round must be created by start_next'; end if;
    insert into public.attempts (
      id, user_id, source_kind, english_passage_id, round, status, draft_payload, started_at
    ) values (
      p_command_id, caller_user_id, 'english_passage', p_passage_id, 1,
      'in_progress', jsonb_build_object('answers', p_answers), now()
    ) returning * into target_attempt;
  end if;

  select revision.*
    into existing_revision
  from public.attempt_revisions revision
  where revision.id = p_command_id;
  if found then
    if existing_revision.attempt_id <> target_attempt.id
      or existing_revision.response_payload <> jsonb_build_object('answers', p_answers)
    then
      raise exception 'Subjective command_id is already used by another revision';
    end if;
    return jsonb_build_object(
      'attemptId', target_attempt.id,
      'revisionId', existing_revision.id,
      'round', target_attempt.round,
      'idempotent', true
    );
  end if;

  select coalesce(max(revision.revision_no), 0) + 1
    into next_revision_no
  from public.attempt_revisions revision
  where revision.attempt_id = target_attempt.id;
  revision_kind := case when next_revision_no = 1 then 'submission' else 'correction' end;
  if revision_kind = 'submission' and target_attempt.status <> 'in_progress' then
    raise exception 'The first subjective submission requires an in-progress round';
  end if;
  if revision_kind = 'correction' and target_attempt.status not in ('submitted', 'sealed') then
    raise exception 'A subjective correction requires a submitted or sealed round';
  end if;

  insert into public.attempt_revisions (
    id, attempt_id, revision_no, kind, response_payload, source_snapshot
  )
  select
    p_command_id,
    target_attempt.id,
    next_revision_no,
    revision_kind,
    jsonb_build_object('answers', p_answers),
    jsonb_build_object(
      'passageId', p_passage_id,
      'questionIds', jsonb_agg(question.id::text order by question.sort_order, question.id)
    )
  from public.english_questions question
  where question.passage_id = p_passage_id;

  insert into public.grades (
    id, revision_id, origin, grade_seq, scoring_mode, score, max_score, breakdown, feedback
  ) values (
    p_command_id, p_command_id, 'ai_suggested', 1, 'subjective',
    p_suggested_score, max_score, p_breakdown, p_feedback
  );

  if target_attempt.status = 'in_progress' then
    update public.attempts
    set status = 'submitted', draft_payload = '{}'::jsonb
    where id = target_attempt.id
    returning * into target_attempt;
  end if;

  return jsonb_build_object(
    'attemptId', target_attempt.id,
    'revisionId', p_command_id,
    'round', target_attempt.round,
    'idempotent', false
  );
end;
$$;

create or replace function public.confirm_english_subjective_grade(
  p_revision_id uuid,
  p_command_id uuid,
  p_score numeric,
  p_feedback text,
  p_breakdown jsonb,
  p_write_legacy boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  target_passage_id uuid;
  passage_section text;
  max_score numeric(12, 4);
  next_grade_seq integer;
  target_attempt public.attempts%rowtype;
  target_revision public.attempt_revisions%rowtype;
  existing_grade public.grades%rowtype;
  effective_attempt public.attempts%rowtype;
  effective_revision public.attempt_revisions%rowtype;
  effective_grade public.grades%rowtype;
  legacy_attempt_id uuid;
  was_idempotent boolean := false;
begin
  if caller_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_revision_id is null or p_command_id is null or p_write_legacy is null then
    raise exception 'Revision, command and legacy mode are required';
  end if;
  if p_breakdown is null or jsonb_typeof(p_breakdown) <> 'object' or length(p_breakdown::text) > 100000 then
    raise exception 'Final grade breakdown must be a bounded JSON object';
  end if;
  if nullif(btrim(p_feedback), '') is null or length(p_feedback) > 20000 then
    raise exception 'Final feedback is required and must be bounded';
  end if;

  select revision.*
    into target_revision
  from public.attempt_revisions revision
  join public.attempts attempt on attempt.id = revision.attempt_id
  where revision.id = p_revision_id
    and attempt.user_id = caller_user_id
    and attempt.source_kind = 'english_passage';
  if not found then raise exception 'Subjective revision does not exist or is not owned by the caller'; end if;

  select attempt.*
    into target_attempt
  from public.attempts attempt
  where attempt.id = target_revision.attempt_id
    and attempt.user_id = caller_user_id
    and attempt.source_kind = 'english_passage'
  for update;
  if not found then raise exception 'Subjective attempt does not exist or is not owned by the caller'; end if;
  target_passage_id := target_attempt.english_passage_id;
  perform pg_advisory_xact_lock(hashtextextended(caller_user_id::text || ':' || target_passage_id::text, 0));

  select passage.section, coalesce(sum(question.score), 0)::numeric(12, 4)
    into passage_section, max_score
  from public.english_passages passage
  join public.english_questions question on question.passage_id = passage.id
  where passage.id = target_passage_id
  group by passage.section;
  if passage_section is null or passage_section not in ('translation', 'writing') then
    raise exception 'Final subjective grade only accepts translation or writing';
  end if;
  if p_score is null or p_score < 0 or p_score > max_score then
    raise exception 'Final score is outside the allowed range';
  end if;
  if not exists (
    select 1 from public.grades grade
    where grade.revision_id = p_revision_id and grade.origin = 'ai_suggested'
  ) then
    raise exception 'User final requires an AI suggestion on the same revision';
  end if;

  select grade.* into existing_grade from public.grades grade where grade.id = p_command_id;
  if found then
    if existing_grade.revision_id <> p_revision_id
      or existing_grade.origin <> 'user_final'
      or existing_grade.score <> p_score
      or existing_grade.max_score <> max_score
    then
      raise exception 'Final-grade command_id is already used by another event';
    end if;
    was_idempotent := true;
  else
    select coalesce(max(grade.grade_seq), 0) + 1
      into next_grade_seq
    from public.grades grade
    where grade.revision_id = p_revision_id and grade.origin = 'user_final';

    insert into public.grades (
      id, revision_id, origin, grade_seq, scoring_mode, score, max_score, breakdown, feedback
    ) values (
      p_command_id, p_revision_id, 'user_final', next_grade_seq, 'subjective',
      p_score, max_score, p_breakdown, p_feedback
    ) returning * into existing_grade;
  end if;

  if p_write_legacy then
    select attempt.* into effective_attempt
    from public.attempts attempt
    where attempt.user_id = caller_user_id
      and attempt.source_kind = 'english_passage'
      and attempt.english_passage_id = target_passage_id
      and attempt.status in ('submitted', 'sealed')
      and exists (
        select 1
        from public.attempt_revisions revision
        join public.grades grade on grade.revision_id = revision.id
        where revision.attempt_id = attempt.id and grade.origin in ('user_final', 'legacy_imported')
      )
    order by attempt.round desc
    limit 1;

    select revision.* into effective_revision
    from public.attempt_revisions revision
    where revision.attempt_id = effective_attempt.id
      and exists (
        select 1 from public.grades grade
        where grade.revision_id = revision.id and grade.origin in ('user_final', 'legacy_imported')
      )
    order by revision.revision_no desc
    limit 1;

    select grade.* into effective_grade
    from public.grades grade
    where grade.revision_id = effective_revision.id and grade.origin in ('user_final', 'legacy_imported')
    order by case grade.origin when 'user_final' then 2 else 1 end desc, grade.grade_seq desc
    limit 1;

    insert into public.english_attempts (
      id, user_id, passage_id, status, score, max_score,
      started_at, submitted_at, created_at, updated_at
    ) values (
      effective_attempt.id, caller_user_id, target_passage_id, 'submitted',
      effective_grade.score, effective_grade.max_score,
      coalesce(effective_attempt.started_at, effective_attempt.created_at),
      coalesce(effective_attempt.submitted_at, effective_revision.created_at),
      effective_attempt.created_at, now()
    )
    on conflict (user_id, passage_id) do update
    set status = 'submitted', score = excluded.score, max_score = excluded.max_score,
        submitted_at = excluded.submitted_at, updated_at = now()
    returning id into legacy_attempt_id;

    insert into public.english_attempt_answers (
      attempt_id, question_id, answer, is_correct, score, created_at, updated_at
    )
    select
      legacy_attempt_id,
      question.id,
      coalesce(effective_revision.response_payload #>> array['answers', question.id::text], ''),
      null,
      0,
      now(), now()
    from public.english_questions question
    where question.passage_id = target_passage_id
    on conflict (attempt_id, question_id) do update
    set answer = excluded.answer, is_correct = null, score = 0, updated_at = now();
  end if;

  return jsonb_build_object(
    'revisionId', p_revision_id,
    'gradeId', existing_grade.id,
    'gradeSeq', existing_grade.grade_seq,
    'idempotent', was_idempotent,
    'legacyProjected', p_write_legacy
  );
end;
$$;

revoke all on function public.record_english_subjective_submission(uuid, smallint, jsonb, uuid, numeric, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.confirm_english_subjective_grade(uuid, uuid, numeric, text, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.record_english_subjective_submission(uuid, smallint, jsonb, uuid, numeric, text, jsonb)
  to authenticated;
grant execute on function public.confirm_english_subjective_grade(uuid, uuid, numeric, text, jsonb, boolean)
  to authenticated;

comment on function public.record_english_subjective_submission(uuid, smallint, jsonb, uuid, numeric, text, jsonb) is
  'Append a subjective English answer revision and advisory AI grade; never formal by itself.';
comment on function public.confirm_english_subjective_grade(uuid, uuid, numeric, text, jsonb, boolean) is
  'Append a user-final subjective grade and optionally refresh the bounded legacy compatibility projection.';

commit;
