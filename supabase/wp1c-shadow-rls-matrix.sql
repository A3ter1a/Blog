\set ON_ERROR_STOP on

-- Fixed-shadow behavior audit. Every row created here is rolled back.
begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';

create temporary table wp1c_rls_results (
  identity_name text not null,
  check_name text not null,
  passed boolean not null,
  details text not null
) on commit drop;

grant select, insert on wp1c_rls_results to anon, authenticated;

create function pg_temp.record_rls_check(
  identity_name text,
  check_name text,
  passed boolean,
  details text
)
returns void
language plpgsql
security definer
set search_path = pg_temp
as $$
begin
  insert into wp1c_rls_results values (identity_name, check_name, passed, details);
end;
$$;

create function pg_temp.expect_rls_error(
  identity_name text,
  check_name text,
  statement text,
  expected_sqlstate text
)
returns void
language plpgsql
security invoker
set search_path = pg_temp, public
as $$
begin
  execute statement;
  perform pg_temp.record_rls_check(identity_name, check_name, false, 'statement unexpectedly succeeded');
exception when others then
  perform pg_temp.record_rls_check(
    identity_name,
    check_name,
    sqlstate = expected_sqlstate,
    format('sqlstate=%s message=%s', sqlstate, sqlerrm)
  );
end;
$$;

grant execute on function pg_temp.record_rls_check(text, text, boolean, text) to anon, authenticated;
grant execute on function pg_temp.expect_rls_error(text, text, text, text) to anon, authenticated;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
)
values (
  '00000000-0000-0000-0000-000000000000'::uuid,
  '00000000-0000-4000-8000-0000000000aa'::uuid,
  'authenticated', 'authenticated', 'wp1c-nonadmin@shadow.invalid',
  extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
  now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  false, false
);

do $$
declare
  admin_id uuid;
  admin_email text;
  passage_id uuid;
begin
  select u.id, u.email into strict admin_id, admin_email
  from auth.users u
  join public.admin_users a on lower(a.email) = lower(u.email)
  order by u.created_at
  limit 1;

  select id into strict passage_id from public.english_passages order by year, sort_order limit 1;
  perform set_config('wp1c.admin_id', admin_id::text, true);
  perform set_config('wp1c.admin_email', admin_email, true);
  perform set_config('wp1c.passage_id', passage_id::text, true);
end;
$$;

insert into public.notes (
  id, type, title, content, subject, tags, videos, problems, is_published
)
values (
  '00000000-0000-4000-8000-000000000b01', 'problem', 'WP1-C RLS private note', '',
  'math', '{}', '[]'::jsonb,
  '[{"id":"rls-problem","type":"calculation","difficulty":"medium","question":"q","answer":"a","explanation":"e","tags":[]}]'::jsonb,
  false
);

insert into public.chapters (id, note_id, name, sort_order)
values (
  '00000000-0000-4000-8000-000000000b02',
  '00000000-0000-4000-8000-000000000b01',
  'WP1-C private chapter', 0
);

insert into public.problem_practice_statuses (
  id, user_id, note_id, problem_id, round, attempts, correct_count, wrong_count
)
values (
  '00000000-0000-4000-8000-000000000b03',
  '00000000-0000-4000-8000-0000000000aa',
  '00000000-0000-4000-8000-000000000b01',
  'rls-problem', 1, 1, 1, 0
);

insert into public.planning_task_status (user_id, task_id, status)
values (current_setting('wp1c.admin_id')::uuid, 'wp1c-admin-seed', 'completed');

insert into public.jobs (id, user_id, job_class, job_kind, title)
values (
  '00000000-0000-4000-8000-000000000b04',
  current_setting('wp1c.admin_id')::uuid,
  'internal', 'rls_admin_seed', 'WP1-C admin seed'
);

insert into public.source_documents (
  id, ownership_kind, user_id, source_kind, display_name, storage_bucket, storage_path
)
values (
  '00000000-0000-4000-8000-000000000b05',
  'personal', current_setting('wp1c.admin_id')::uuid,
  'upload', 'WP1-C admin upload', 'rls-shadow', 'admin/source.txt'
);

insert into public.source_versions (
  id, source_document_id, version_no, checksum, raw_text
)
values (
  '00000000-0000-4000-8000-000000000b06',
  '00000000-0000-4000-8000-000000000b05',
  1, repeat('b', 64), 'admin source'
);

-- Anonymous: public blog reads only; every private/new table is unreachable.
do $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.email', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end;
$$;
set local role anon;

select pg_temp.record_rls_check('anon', 'published notes remain readable', (select count(*) from public.notes) > 0, 'expected at least one published note');
select pg_temp.record_rls_check('anon', 'private note is hidden', (select count(*) from public.notes where id = '00000000-0000-4000-8000-000000000b01') = 0, 'private note must not be visible');
select pg_temp.record_rls_check('anon', 'private chapter is hidden', (select count(*) from public.chapters where id = '00000000-0000-4000-8000-000000000b02') = 0, 'private chapter must not be visible');
select pg_temp.record_rls_check('anon', 'main profile remains readable', (select count(*) from public.site_profile where id = 'main') = 1, 'public profile must stay readable');

select pg_temp.expect_rls_error('anon', 'admin_users has no read grant', 'select count(*) from public.admin_users', '42501');
select pg_temp.expect_rls_error('anon', 'official English source requires login', 'select count(*) from public.english_papers', '42501');
select pg_temp.expect_rls_error('anon', 'private note insert is denied', $$insert into public.notes (title) values ('anon denied')$$, '42501');

select pg_temp.expect_rls_error('anon', 'new private table is unreachable: ' || table_name,
  format('select count(*) from public.%I', table_name), '42501')
from unnest(array[
  'planning_task_status', 'attempts', 'attempt_revisions', 'grades',
  'jobs', 'job_items', 'source_documents', 'source_versions'
]) as table_name;

-- Authenticated non-admin: owner writes work; admin/private content stays hidden.
reset role;
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000aa', true);
  perform set_config('request.jwt.claim.email', 'wp1c-nonadmin@shadow.invalid', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000aa","email":"wp1c-nonadmin@shadow.invalid","role":"authenticated"}',
    true
  );
end;
$$;
set local role authenticated;

select pg_temp.record_rls_check('nonadmin', 'admin authority is false', not private.current_user_is_admin(), 'non-admin must not satisfy admin authority');
select pg_temp.record_rls_check('nonadmin', 'private note is hidden', (select count(*) from public.notes where id = '00000000-0000-4000-8000-000000000b01') = 0, 'private note must not be visible');
select pg_temp.record_rls_check('nonadmin', 'admin_users returns no rows', (select count(*) from public.admin_users) = 0, 'non-admin must not discover administrator rows');
select pg_temp.record_rls_check('nonadmin', 'official English source is readable', (select count(*) from public.english_papers) > 0, 'Fable v2 requires authenticated read-only official sources');

insert into public.planning_task_status (user_id, task_id, status)
values ('00000000-0000-4000-8000-0000000000aa', 'wp1c-owner-task', 'in_progress');

insert into public.attempts (
  id, user_id, source_kind, english_passage_id, round, status, draft_payload
)
values (
  '00000000-0000-4000-8000-000000000c01',
  '00000000-0000-4000-8000-0000000000aa',
  'english_passage', current_setting('wp1c.passage_id')::uuid,
  1, 'in_progress', '{"answer":"A"}'::jsonb
);

insert into public.attempt_revisions (
  id, attempt_id, revision_no, kind, response_payload
)
values (
  '00000000-0000-4000-8000-000000000c02',
  '00000000-0000-4000-8000-000000000c01',
  1, 'submission', '{"answer":"A"}'::jsonb
);

insert into public.grades (
  id, revision_id, origin, grade_seq, scoring_mode, score, max_score
)
values (
  '00000000-0000-4000-8000-000000000c03',
  '00000000-0000-4000-8000-000000000c02',
  'user_final', 1, 'subjective', 8, 10
);

insert into public.jobs (id, user_id, job_class, job_kind, title)
values (
  '00000000-0000-4000-8000-000000000c04',
  '00000000-0000-4000-8000-0000000000aa',
  'internal', 'rls_owner_job', 'WP1-C owner job'
);

insert into public.job_items (id, job_id, ordinal, idempotency_key)
values (
  '00000000-0000-4000-8000-000000000c05',
  '00000000-0000-4000-8000-000000000c04',
  0, 'owner-item-0'
);

insert into public.source_documents (
  id, ownership_kind, user_id, source_kind, display_name, storage_bucket, storage_path
)
values (
  '00000000-0000-4000-8000-000000000c06',
  'personal', '00000000-0000-4000-8000-0000000000aa',
  'upload', 'WP1-C owner upload', 'rls-shadow', 'owner/source.txt'
);

insert into public.source_versions (
  id, source_document_id, version_no, checksum, raw_text
)
values (
  '00000000-0000-4000-8000-000000000c07',
  '00000000-0000-4000-8000-000000000c06',
  1, repeat('c', 64), 'owner source'
);

select pg_temp.record_rls_check('nonadmin', 'owner rows are readable',
  (select count(*) from public.planning_task_status where task_id = 'wp1c-owner-task') = 1
  and (select count(*) from public.attempts where id = '00000000-0000-4000-8000-000000000c01') = 1
  and (select count(*) from public.attempt_revisions where id = '00000000-0000-4000-8000-000000000c02') = 1
  and (select count(*) from public.grades where id = '00000000-0000-4000-8000-000000000c03') = 1
  and (select count(*) from public.jobs where id = '00000000-0000-4000-8000-000000000c04') = 1
  and (select count(*) from public.job_items where id = '00000000-0000-4000-8000-000000000c05') = 1
  and (select count(*) from public.source_documents where id = '00000000-0000-4000-8000-000000000c06') = 1
  and (select count(*) from public.source_versions where id = '00000000-0000-4000-8000-000000000c07') = 1,
  'all eight WP1-C private table paths must expose only owner rows'
);

select pg_temp.record_rls_check('nonadmin', 'other owner rows stay hidden',
  (select count(*) from public.planning_task_status where task_id = 'wp1c-admin-seed') = 0
  and (select count(*) from public.jobs where id = '00000000-0000-4000-8000-000000000b04') = 0
  and (select count(*) from public.source_documents where id = '00000000-0000-4000-8000-000000000b05') = 0,
  'admin-owned private rows must not leak to non-admin'
);

select pg_temp.expect_rls_error('nonadmin', 'cannot write notes', $$insert into public.notes (title) values ('nonadmin denied')$$, '42501');
select pg_temp.expect_rls_error('nonadmin', 'cannot write another user planning state',
  format($sql$insert into public.planning_task_status (user_id, task_id) values (%L::uuid, 'denied')$sql$, current_setting('wp1c.admin_id')),
  '42501');
select pg_temp.expect_rls_error('nonadmin', 'cannot create trusted system score',
  $$insert into public.grades (revision_id, origin, grade_seq, scoring_mode, score, max_score)
    values ('00000000-0000-4000-8000-000000000c02', 'system_scored', 1, 'objective', 1, 1)$$,
  '42501');
select pg_temp.expect_rls_error('nonadmin', 'immutable revision update is denied',
  $$update public.attempt_revisions set response_payload = '{}' where id = '00000000-0000-4000-8000-000000000c02'$$,
  '42501');
select pg_temp.expect_rls_error('nonadmin', 'immutable source version delete is denied',
  $$delete from public.source_versions where id = '00000000-0000-4000-8000-000000000c07'$$,
  '42501');

-- Admin: shared authority comes from the JWT email + admin_users; private rows are audit-readable.
reset role;
do $$
declare
  admin_id text := current_setting('wp1c.admin_id');
  admin_email text := current_setting('wp1c.admin_email');
begin
  perform set_config('request.jwt.claim.sub', admin_id, true);
  perform set_config('request.jwt.claim.email', admin_email, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', admin_id, 'email', admin_email, 'role', 'authenticated')::text,
    true
  );
end;
$$;
set local role authenticated;

select pg_temp.record_rls_check('admin', 'admin authority is true', private.current_user_is_admin(), 'JWT email must resolve through admin_users');
select pg_temp.record_rls_check('admin', 'own admin row is readable', (select count(*) from public.admin_users where lower(email) = lower(current_setting('wp1c.admin_email'))) = 1, 'admin authority row must be readable');
select pg_temp.record_rls_check('admin', 'private note and chapter are readable',
  (select count(*) from public.notes where id = '00000000-0000-4000-8000-000000000b01') = 1
  and (select count(*) from public.chapters where id = '00000000-0000-4000-8000-000000000b02') = 1,
  'admin must manage private content'
);
select pg_temp.record_rls_check('admin', 'new private owner rows are audit-readable',
  (select count(*) from public.planning_task_status where task_id = 'wp1c-owner-task') = 1
  and (select count(*) from public.attempts where id = '00000000-0000-4000-8000-000000000c01') = 1
  and (select count(*) from public.attempt_revisions where id = '00000000-0000-4000-8000-000000000c02') = 1
  and (select count(*) from public.grades where id = '00000000-0000-4000-8000-000000000c03') = 1
  and (select count(*) from public.jobs where id = '00000000-0000-4000-8000-000000000c04') = 1
  and (select count(*) from public.job_items where id = '00000000-0000-4000-8000-000000000c05') = 1
  and (select count(*) from public.source_documents where id = '00000000-0000-4000-8000-000000000c06') = 1
  and (select count(*) from public.source_versions where id = '00000000-0000-4000-8000-000000000c07') = 1,
  'admin audit read must cover all eight WP1-C private table paths'
);
select pg_temp.record_rls_check('admin', 'legacy practice status is audit-readable',
  (select count(*) from public.problem_practice_statuses where id = '00000000-0000-4000-8000-000000000b03') = 1,
  'Fable v2 requires admin audit read of practice status'
);

with changed as (
  update public.notes
  set title = title
  where id = '00000000-0000-4000-8000-000000000b01'
  returning 1
)
select pg_temp.record_rls_check('admin', 'private note update is allowed', (select count(*) from changed) = 1, 'admin must update private notes');

with changed as (
  update public.jobs
  set title = 'must not change'
  where id = '00000000-0000-4000-8000-000000000c04'
  returning 1
)
select pg_temp.record_rls_check('admin', 'owner lifecycle remains owner-only', (select count(*) from changed) = 0, 'admin audit must not mutate another owner job');

select pg_temp.expect_rls_error('admin', 'admin_users is runtime read-only',
  $$update public.admin_users set email = email where lower(email) = lower(current_setting('wp1c.admin_email'))$$,
  '42501');

-- Catalog-level boundary assertions that should stay true after policy hardening.
reset role;
select pg_temp.record_rls_check('catalog', 'admin_users authenticated mutation grants are revoked',
  not has_table_privilege('authenticated', 'public.admin_users', 'insert')
  and not has_table_privilege('authenticated', 'public.admin_users', 'update')
  and not has_table_privilege('authenticated', 'public.admin_users', 'delete'),
  'authenticated must retain SELECT only on admin_users'
);
select pg_temp.record_rls_check('catalog', 'site_profile is read/update only at runtime',
  not has_table_privilege('authenticated', 'public.site_profile', 'insert')
  and has_table_privilege('authenticated', 'public.site_profile', 'update')
  and not has_table_privilege('authenticated', 'public.site_profile', 'delete'),
  'profile bootstrap is SQL-only; runtime may read/update main'
);

select json_build_object(
  'auditVersion', 1,
  'status', case when bool_and(passed) then 'passed' else 'failed' end,
  'totalChecks', count(*),
  'passedChecks', count(*) filter (where passed),
  'failedChecks', count(*) filter (where not passed),
  'byIdentity', (
    select json_object_agg(identity_name, json_build_object(
      'total', total,
      'passed', passed_count,
      'failed', failed_count
    ) order by identity_name)
    from (
      select identity_name, count(*) as total,
        count(*) filter (where passed) as passed_count,
        count(*) filter (where not passed) as failed_count
      from wp1c_rls_results
      group by identity_name
    ) summary
  ),
  'failures', coalesce((
    select json_agg(json_build_object(
      'identity', identity_name,
      'check', check_name,
      'details', details
    ) order by identity_name, check_name)
    from wp1c_rls_results
    where not passed
  ), '[]'::json)
)
from wp1c_rls_results;

rollback;
