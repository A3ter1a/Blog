-- Shadow-only transactional behavior verification for AST-WP1-C/D/E.
-- All test rows are rolled back. Never use this file as a production migration.

\set ON_ERROR_STOP on

begin;

do $$
declare
  test_user_id uuid;
  first_note_id uuid;
  second_note_id uuid;
  parent_chapter_id uuid;
  round_one_id uuid;
  round_two_id uuid;
  revision_id uuid;
  grade_id uuid;
  source_document_id uuid;
  other_source_document_id uuid;
  source_version_id uuid;
  other_source_version_id uuid;
  observed_version bigint;
  observed_published boolean;
  observed_status text;
begin
  select id into test_user_id from auth.users order by created_at limit 1;
  if test_user_id is null then
    raise exception 'Shadow verification requires one restored auth user';
  end if;

  insert into public.notes (title, content_version)
  values ('WP1-C transactional verification note', 99)
  returning id, is_published, content_version
  into first_note_id, observed_published, observed_version;

  if observed_published is not false or observed_version <> 1 then
    raise exception 'New note defaults are wrong: published=%, version=%', observed_published, observed_version;
  end if;

  update public.notes set title = title || ' v2' where id = first_note_id
  returning content_version into observed_version;
  if observed_version <> 2 then
    raise exception 'Note content_version did not increment to 2';
  end if;

  insert into public.notes (title) values ('WP1-C second scope note') returning id into second_note_id;
  insert into public.chapters (note_id, name) values (first_note_id, 'parent') returning id into parent_chapter_id;

  begin
    insert into public.chapters (note_id, parent_id, name)
    values (second_note_id, parent_chapter_id, 'invalid child');
    raise exception using errcode = 'P0004', message = 'Chapter scope mismatch was accepted';
  exception
    when raise_exception then null;
  end;

  begin
    insert into public.attempts (
      user_id, source_kind, note_id, problem_id, note_content_version, round, status
    ) values (
      test_user_id, 'note_problem', first_note_id, 'stale-version', 1, 1, 'created'
    );
    raise exception using errcode = 'P0004', message = 'Stale note content_version was accepted';
  exception
    when raise_exception then null;
  end;

  begin
    insert into public.attempts (
      user_id, source_kind, round, status
    ) values (
      test_user_id, 'english_passage', 1, 'created'
    );
    raise exception using errcode = 'P0004', message = 'Invalid attempt source shape was accepted';
  exception
    when check_violation then null;
  end;

  insert into public.attempts (
    user_id, source_kind, note_id, problem_id, note_content_version, round, status
  ) values (
    test_user_id, 'note_problem', first_note_id, 'problem-1', 2, 1, 'submitted'
  ) returning id into round_one_id;

  insert into public.attempts (
    user_id, source_kind, note_id, problem_id, note_content_version, round, status
  ) values (
    test_user_id, 'note_problem', first_note_id, 'problem-1', 2, 2, 'submitted'
  ) returning id into round_two_id;

  select status into observed_status from public.attempts where id = round_one_id;
  if observed_status <> 'sealed' then
    raise exception 'Creating round 2 did not seal submitted round 1';
  end if;

  insert into public.attempt_revisions (attempt_id, revision_no, kind, response_payload)
  values (round_two_id, 1, 'correction', '{"answer":"A"}'::jsonb)
  returning id into revision_id;

  begin
    insert into public.attempt_revisions (attempt_id, revision_no, kind, response_payload)
    values (round_two_id, 3, 'correction', '{"answer":"B"}'::jsonb);
    raise exception using errcode = 'P0004', message = 'Skipped revision_no was accepted';
  exception
    when raise_exception then null;
  end;

  insert into public.grades (revision_id, origin, grade_seq, scoring_mode, score, max_score)
  values (revision_id, 'user_final', 1, 'subjective', 1, 2)
  returning id into grade_id;

  begin
    update public.attempt_revisions set response_payload = '{}'::jsonb where id = revision_id;
    raise exception using errcode = 'P0004', message = 'Immutable revision update was accepted';
  exception
    when raise_exception then null;
  end;

  begin
    delete from public.grades where id = grade_id;
    raise exception using errcode = 'P0004', message = 'Immutable grade delete was accepted';
  exception
    when raise_exception then null;
  end;

  begin
    insert into public.jobs (user_id, job_class, job_kind, title, provider, external_task_id)
    values (test_user_id, 'internal', 'verification', 'invalid internal identity', 'provider', 'task');
    raise exception using errcode = 'P0004', message = 'Invalid internal job identity was accepted';
  exception
    when check_violation then null;
  end;

  insert into public.planning_task_status (user_id, task_id, status)
  values (test_user_id, 'verification-task', 'in_progress');

  insert into public.source_documents (
    ownership_kind, user_id, source_kind, display_name, note_id
  ) values (
    'personal', test_user_id, 'note', 'verification source', first_note_id
  ) returning id into source_document_id;

  insert into public.source_versions (
    source_document_id, version_no, checksum, raw_text, note_content_version
  ) values (
    source_document_id, 1, repeat('a', 64), 'source v1', 2
  ) returning id into source_version_id;

  update public.source_documents
  set current_version_id = source_version_id
  where id = source_document_id;

  insert into public.source_documents (
    ownership_kind, user_id, source_kind, display_name, storage_bucket, storage_path
  ) values (
    'personal', test_user_id, 'upload', 'other source', 'ocr-documents', 'verification/other.pdf'
  ) returning id into other_source_document_id;

  insert into public.source_versions (
    source_document_id, version_no, checksum, raw_text
  ) values (
    other_source_document_id, 1, repeat('b', 64), 'other source v1'
  ) returning id into other_source_version_id;

  begin
    update public.source_documents
    set current_version_id = other_source_version_id
    where id = source_document_id;
    set constraints source_documents_current_version_fkey immediate;
    raise exception using errcode = 'P0004', message = 'Cross-document current version pointer was accepted';
  exception
    when foreign_key_violation then null;
  end;

  begin
    update public.source_versions set raw_text = 'mutated' where id = source_version_id;
    raise exception using errcode = 'P0004', message = 'Immutable source version update was accepted';
  exception
    when raise_exception then null;
  end;
end
$$;

rollback;

select json_build_object(
  'status', 'passed',
  'public_table_count', (
    select count(*) from information_schema.tables where table_schema = 'public'
  ),
  'wp1c_table_count', (
    select count(*)
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'planning_task_status', 'attempts', 'attempt_revisions', 'grades',
        'jobs', 'job_items', 'source_documents', 'source_versions'
      )
  ),
  'note_default', (
    select column_default
    from information_schema.columns
    where table_schema = 'public' and table_name = 'notes' and column_name = 'is_published'
  )
);
