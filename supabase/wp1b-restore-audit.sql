-- AST-WP1-B deterministic backup/restore fingerprint.
-- Read-only: returns hashes and counts, never returns article content or answers.
-- notes checksum excludes content_version so pre/post-WP1 backups share one stable-data fingerprint.

with app_tables(table_name) as (
  values
    ('admin_users'),
    ('chapters'),
    ('english_attempt_answers'),
    ('english_attempts'),
    ('english_papers'),
    ('english_passages'),
    ('english_questions'),
    ('english_vocabulary'),
    ('flashcards'),
    ('math3_self_tests'),
    ('notes'),
    ('problem_practice_statuses'),
    ('site_profile')
), table_fingerprints as (
  select 'admin_users'::text as table_name, count(*)::bigint as row_count,
    md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by email), '')) as checksum
  from public.admin_users t
  union all
  select 'chapters', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.chapters t
  union all
  select 'english_attempt_answers', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.english_attempt_answers t
  union all
  select 'english_attempts', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.english_attempts t
  union all
  select 'english_papers', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.english_papers t
  union all
  select 'english_passages', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.english_passages t
  union all
  select 'english_questions', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.english_questions t
  union all
  select 'english_vocabulary', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.english_vocabulary t
  union all
  select 'flashcards', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.flashcards t
  union all
  select 'math3_self_tests', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.math3_self_tests t
  union all
  select 'notes', count(*), md5(coalesce(string_agg((to_jsonb(t) - 'content_version')::text, E'\n' order by id), '')) from public.notes t
  union all
  select 'problem_practice_statuses', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.problem_practice_statuses t
  union all
  select 'site_profile', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.site_profile t
), schema_integrity as (
  select jsonb_build_object(
    'columns', (
      select jsonb_build_object(
        'count', count(*),
        'checksum', md5(coalesce(string_agg(jsonb_build_object(
          'table', columns.table_name,
          'ordinal', columns.ordinal_position,
          'name', columns.column_name,
          'dataType', columns.data_type,
          'udtSchema', columns.udt_schema,
          'udtName', columns.udt_name,
          'nullable', columns.is_nullable,
          'default', columns.column_default,
          'identity', columns.is_identity,
          'generated', columns.is_generated,
          'collation', columns.collation_name
        )::text, E'\n' order by columns.table_name, columns.ordinal_position), ''))
      )
      from information_schema.columns columns
      join app_tables on app_tables.table_name = columns.table_name
      where columns.table_schema = 'public'
    ),
    'constraints', (
      select jsonb_build_object(
        'count', count(*),
        'checksum', md5(coalesce(string_agg(jsonb_build_object(
          'table', relation.relname,
          'name', constraint_row.conname,
          'type', constraint_row.contype,
          'definition', pg_get_constraintdef(constraint_row.oid, true)
        )::text, E'\n' order by relation.relname, constraint_row.conname), ''))
      )
      from pg_constraint constraint_row
      join pg_class relation on relation.oid = constraint_row.conrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      join app_tables on app_tables.table_name = relation.relname
      where namespace.nspname = 'public'
    ),
    'indexes', (
      select jsonb_build_object(
        'count', count(*),
        'checksum', md5(coalesce(string_agg(jsonb_build_object(
          'table', indexes.tablename,
          'name', indexes.indexname,
          'definition', indexes.indexdef
        )::text, E'\n' order by indexes.tablename, indexes.indexname), ''))
      )
      from pg_indexes indexes
      join app_tables on app_tables.table_name = indexes.tablename
      where indexes.schemaname = 'public'
    ),
    'triggers', (
      select jsonb_build_object(
        'count', count(*),
        'checksum', md5(coalesce(string_agg(jsonb_build_object(
          'table', relation.relname,
          'name', trigger_row.tgname,
          'definition', pg_get_triggerdef(trigger_row.oid, true)
        )::text, E'\n' order by relation.relname, trigger_row.tgname), ''))
      )
      from pg_trigger trigger_row
      join pg_class relation on relation.oid = trigger_row.tgrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      join app_tables on app_tables.table_name = relation.relname
      where namespace.nspname = 'public' and not trigger_row.tgisinternal
    ),
    'functions', (
      select jsonb_build_object(
        'count', count(*),
        'checksum', md5(coalesce(string_agg(jsonb_build_object(
          'schema', namespace.nspname,
          'name', procedure.proname,
          'arguments', pg_get_function_identity_arguments(procedure.oid),
          'definition', pg_get_functiondef(procedure.oid)
        )::text, E'\n' order by namespace.nspname, procedure.proname, pg_get_function_identity_arguments(procedure.oid)), ''))
      )
      from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname in ('public', 'private')
    ),
    'rlsTables', (
      select jsonb_build_object(
        'count', count(*),
        'checksum', md5(coalesce(string_agg(jsonb_build_object(
          'table', relation.relname,
          'enabled', relation.relrowsecurity,
          'forced', relation.relforcerowsecurity
        )::text, E'\n' order by relation.relname), ''))
      )
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      join app_tables on app_tables.table_name = relation.relname
      where namespace.nspname = 'public' and relation.relkind in ('r', 'p')
    ),
    'policies', (
      select jsonb_build_object(
        'count', count(*),
        'checksum', md5(coalesce(string_agg(jsonb_build_object(
          'table', policies.tablename,
          'name', policies.policyname,
          'permissive', policies.permissive,
          'roles', policies.roles,
          'command', policies.cmd,
          'using', policies.qual,
          'check', policies.with_check
        )::text, E'\n' order by policies.tablename, policies.policyname), ''))
      )
      from pg_policies policies
      join app_tables on app_tables.table_name = policies.tablename
      where policies.schemaname = 'public'
    ),
    'tableGrants', (
      select jsonb_build_object(
        'count', count(*),
        'checksum', md5(coalesce(string_agg(jsonb_build_object(
          'table', relation.relname,
          'grantor', pg_get_userbyid(grants.grantor),
          'grantee', case when grants.grantee = 0 then 'PUBLIC' else pg_get_userbyid(grants.grantee) end,
          'privilege', grants.privilege_type,
          'grantable', grants.is_grantable
        )::text, E'\n' order by relation.relname, grants.grantee, grants.privilege_type, grants.grantor), ''))
      )
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      join app_tables on app_tables.table_name = relation.relname
      cross join lateral aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) grants
      where namespace.nspname = 'public' and relation.relkind in ('r', 'p')
    ),
    'routineGrants', (
      select jsonb_build_object(
        'count', count(*),
        'checksum', md5(coalesce(string_agg(jsonb_build_object(
          'schema', namespace.nspname,
          'routine', procedure.proname,
          'arguments', pg_get_function_identity_arguments(procedure.oid),
          'grantor', pg_get_userbyid(grants.grantor),
          'grantee', case when grants.grantee = 0 then 'PUBLIC' else pg_get_userbyid(grants.grantee) end,
          'privilege', grants.privilege_type,
          'grantable', grants.is_grantable
        )::text, E'\n' order by namespace.nspname, procedure.proname, pg_get_function_identity_arguments(procedure.oid), grants.grantee, grants.privilege_type, grants.grantor), ''))
      )
      from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      cross join lateral aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) grants
      where namespace.nspname in ('public', 'private')
    ),
    'schemaGrants', (
      select jsonb_build_object(
        'count', count(*),
        'checksum', md5(coalesce(string_agg(jsonb_build_object(
          'schema', namespace.nspname,
          'grantor', pg_get_userbyid(grants.grantor),
          'grantee', case when grants.grantee = 0 then 'PUBLIC' else pg_get_userbyid(grants.grantee) end,
          'privilege', grants.privilege_type,
          'grantable', grants.is_grantable
        )::text, E'\n' order by namespace.nspname, grants.grantee, grants.privilege_type, grants.grantor), ''))
      )
      from pg_namespace namespace
      cross join lateral aclexplode(coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))) grants
      where namespace.nspname in ('public', 'private')
    )
  ) as payload
), problem_rows as (
  select notes.id as note_id, nullif(btrim(problem.value ->> 'id'), '') as problem_id
  from public.notes notes
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(notes.problems) = 'array' then notes.problems else '[]'::jsonb end
  ) as problem(value)
), problem_id_set as (
  select distinct note_id, problem_id from problem_rows where problem_id is not null
), duplicate_problem_ids as (
  select note_id, problem_id from problem_rows
  where problem_id is not null
  group by note_id, problem_id having count(*) > 1
), content_integrity as (
  select jsonb_build_object(
    'problemCount', (select count(*) from problem_rows),
    'malformedProblemNotes', (select count(*) from public.notes where jsonb_typeof(problems) is distinct from 'array'),
    'missingProblemIds', (select count(*) from problem_rows where problem_id is null),
    'duplicateProblemIdGroups', (select count(*) from duplicate_problem_ids),
    'practiceMissingNotes', (
      select count(*) from public.problem_practice_statuses s
      left join public.notes n on n.id = s.note_id where n.id is null
    ),
    'practiceMissingProblemIds', (
      select count(*) from public.problem_practice_statuses s
      left join problem_id_set p on p.note_id = s.note_id and p.problem_id = s.problem_id
      where p.note_id is null
    ),
    'englishOrphanQuestions', (
      select count(*) from public.english_questions q
      left join public.english_passages p on p.id = q.passage_id where p.id is null
    ),
    'englishOrphanAttempts', (
      select count(*) from public.english_attempts a
      left join public.english_passages p on p.id = a.passage_id where p.id is null
    ),
    'englishOrphanAnswers', (
      select count(*) from public.english_attempt_answers a
      left join public.english_attempts t on t.id = a.attempt_id
      left join public.english_questions q on q.id = a.question_id
      where t.id is null or q.id is null
    ),
    'englishYearMismatches', (
      select count(*) from public.english_passages p
      join public.english_papers e on e.id = p.paper_id where p.year is distinct from e.year
    ),
    'englishDuplicateAttemptGroups', (
      select count(*) from (
        select user_id, passage_id from public.english_attempts
        group by user_id, passage_id having count(*) > 1
      ) duplicates
    ),
    'chapterMissingParents', (
      select count(*) from public.chapters c
      left join public.chapters p on p.id = c.parent_id
      where c.parent_id is not null and p.id is null
    ),
    'chapterCrossScopeParents', (
      select count(*) from public.chapters c
      join public.chapters p on p.id = c.parent_id
      where c.note_id is distinct from p.note_id
    )
  ) as payload
), auth_fingerprint as (
  select jsonb_build_object(
    'userCount', count(*),
    'checksum', md5(coalesce(string_agg(
      jsonb_build_object('id', id, 'email', email, 'created_at', created_at, 'updated_at', updated_at)::text,
      E'\n' order by id
    ), '')),
    'adminMatchedUsers', (
      select count(*) from public.admin_users a
      join auth.users u on lower(u.email) = lower(a.email)
    )
  ) as payload
  from auth.users
), storage_fingerprint as (
  select jsonb_build_object(
    'bucketCount', (select count(*) from storage.buckets where id in ('note-images', 'ocr-documents')),
    'objectCount', count(*),
    'totalSizeBytes', coalesce(sum(coalesce((metadata ->> 'size')::bigint, 0)), 0),
    'checksum', md5(coalesce(string_agg(
      jsonb_build_object(
        'bucket', bucket_id,
        'path', name,
        'size', coalesce((metadata ->> 'size')::bigint, 0),
        'mime', metadata ->> 'mimetype'
      )::text,
      E'\n' order by bucket_id, name
    ), ''))
  ) as payload
  from storage.objects
  where bucket_id in ('note-images', 'ocr-documents')
)
select jsonb_build_object(
  'auditVersion', 2,
  'capturedAt', now(),
  'tables', (
    select jsonb_object_agg(table_name, jsonb_build_object('rowCount', row_count, 'checksum', checksum))
    from table_fingerprints
  ),
  'schemaIntegrity', (select payload from schema_integrity),
  'contentIntegrity', (select payload from content_integrity),
  'auth', (select payload from auth_fingerprint),
  'storage', (select payload from storage_fingerprint)
)::text as payload;
