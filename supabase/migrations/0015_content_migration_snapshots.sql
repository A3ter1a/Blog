-- AST-WP2: immutable Markdown migration snapshots with checksum-gated apply and rollback RPCs.

begin;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pgcrypto') then
    raise exception '0015 requires the pgcrypto extension for SHA-256 verification';
  end if;
end
$$;

create table public.content_migration_snapshots (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete restrict,
  batch_id text not null,
  field_path text not null,
  operation_kind text not null,
  reverts_snapshot_id uuid references public.content_migration_snapshots(id) on delete restrict,
  rule_version text not null,
  before_text text not null,
  after_text text not null,
  before_checksum text not null,
  after_checksum text not null,
  note_content_version_before bigint not null,
  note_content_version_after bigint not null,
  ai_involved boolean not null default false,
  ai_provider text,
  ai_model text,
  ai_request_id text,
  validation_status text not null,
  validation_detail jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint content_migration_snapshots_batch_nonempty check (nullif(btrim(batch_id), '') is not null and length(batch_id) <= 200),
  constraint content_migration_snapshots_rule_nonempty check (nullif(btrim(rule_version), '') is not null and length(rule_version) <= 255),
  constraint content_migration_snapshots_field_path_check check (
    field_path = 'content'
    or field_path ~ '^problems\.[0-9]+\.(question|answer|explanation|tips)$'
    or field_path ~ '^problems\.[0-9]+\.options\.[0-9]+\.content$'
  ),
  constraint content_migration_snapshots_operation_check check (operation_kind in ('migration', 'rollback')),
  constraint content_migration_snapshots_checksum_check check (
    before_checksum ~ '^[0-9a-f]{64}$'
    and after_checksum ~ '^[0-9a-f]{64}$'
    and before_checksum <> after_checksum
  ),
  constraint content_migration_snapshots_version_check check (
    note_content_version_before >= 1
    and note_content_version_after = note_content_version_before + 1
  ),
  constraint content_migration_snapshots_ai_shape_check check (
    (
      ai_involved
      and nullif(btrim(ai_provider), '') is not null
      and nullif(btrim(ai_model), '') is not null
    )
    or (
      not ai_involved
      and ai_provider is null
      and ai_model is null
      and ai_request_id is null
    )
  ),
  constraint content_migration_snapshots_validation_check check (
    validation_status in ('deterministic_passed', 'human_approved', 'rollback_verified')
    and jsonb_typeof(validation_detail) = 'object'
  ),
  constraint content_migration_snapshots_operation_shape_check check (
    (
      operation_kind = 'migration'
      and reverts_snapshot_id is null
      and validation_status in ('deterministic_passed', 'human_approved')
    )
    or (
      operation_kind = 'rollback'
      and reverts_snapshot_id is not null
      and validation_status = 'rollback_verified'
      and not ai_involved
    )
  ),
  constraint content_migration_snapshots_batch_field_key unique (batch_id, note_id, field_path)
);

create unique index content_migration_snapshots_single_revert_key
  on public.content_migration_snapshots (reverts_snapshot_id)
  where reverts_snapshot_id is not null;

create index content_migration_snapshots_note_created_idx
  on public.content_migration_snapshots (note_id, created_at desc);

create or replace function private.content_sha256(p_text text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  extension_schema text;
  checksum text;
begin
  if p_text is null then
    raise exception using errcode = '22004', message = 'Cannot checksum NULL content';
  end if;

  select namespace.nspname
    into extension_schema
  from pg_extension extension_row
  join pg_namespace namespace on namespace.oid = extension_row.extnamespace
  where extension_row.extname = 'pgcrypto';

  if extension_schema is null then
    raise exception 'pgcrypto extension is unavailable';
  end if;

  execute pg_catalog.format(
    'select pg_catalog.encode(%I.digest(pg_catalog.convert_to($1, ''UTF8''), ''sha256''), ''hex'')',
    extension_schema
  ) into checksum using p_text;

  return checksum;
end;
$$;

create or replace function private.read_note_markdown_field(
  p_content text,
  p_problems jsonb,
  p_field_path text
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  path_match text[];
  target jsonb;
begin
  if p_field_path = 'content' then
    return p_content;
  end if;
  if jsonb_typeof(p_problems) <> 'array' then
    raise exception using errcode = '22023', message = 'notes.problems must be a JSON array';
  end if;

  path_match := regexp_match(p_field_path, '^problems\.([0-9]+)\.(question|answer|explanation|tips)$');
  if path_match is not null then
    target := p_problems -> path_match[1]::integer -> path_match[2];
  else
    path_match := regexp_match(p_field_path, '^problems\.([0-9]+)\.options\.([0-9]+)\.content$');
    if path_match is null then
      raise exception using errcode = '22023', message = 'Unsupported Markdown field path';
    end if;
    target := p_problems -> path_match[1]::integer -> 'options' -> path_match[2]::integer -> 'content';
  end if;

  if target is null or jsonb_typeof(target) <> 'string' then
    raise exception using errcode = '22023', message = 'Markdown field path does not resolve to a JSON string';
  end if;
  return target #>> '{}';
end;
$$;

create or replace function public.apply_content_migration(
  p_note_id uuid,
  p_field_path text,
  p_batch_id text,
  p_rule_version text,
  p_expected_note_version bigint,
  p_before_checksum text,
  p_after_text text,
  p_after_checksum text,
  p_ai_involved boolean default false,
  p_ai_provider text default null,
  p_ai_model text default null,
  p_ai_request_id text default null,
  p_validation_status text default 'deterministic_passed',
  p_validation_detail jsonb default '{}'::jsonb
)
returns setof public.content_migration_snapshots
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  normalized_field_path text := btrim(p_field_path);
  normalized_batch_id text := btrim(p_batch_id);
  normalized_rule_version text := btrim(p_rule_version);
  normalized_before_checksum text := lower(btrim(p_before_checksum));
  normalized_after_checksum text := lower(btrim(p_after_checksum));
  normalized_ai_provider text := nullif(btrim(p_ai_provider), '');
  normalized_ai_model text := nullif(btrim(p_ai_model), '');
  normalized_ai_request_id text := nullif(btrim(p_ai_request_id), '');
  normalized_validation_detail jsonb := coalesce(p_validation_detail, '{}'::jsonb);
  locked_content text;
  locked_problems jsonb;
  locked_version bigint;
  current_text text;
  current_checksum text;
  updated_problems jsonb;
  updated_version bigint;
  path_match text[];
  snapshot_row public.content_migration_snapshots%rowtype;
begin
  if caller_user_id is null or not private.current_user_is_admin() then
    raise exception using errcode = '42501', message = 'Administrator authentication is required';
  end if;
  if p_note_id is null or p_expected_note_version is null or p_expected_note_version < 1 then
    raise exception using errcode = '22023', message = 'note_id and a positive expected note version are required';
  end if;
  if normalized_batch_id is null or normalized_batch_id = '' or length(normalized_batch_id) > 200
    or normalized_rule_version is null or normalized_rule_version = '' or length(normalized_rule_version) > 255
    or normalized_field_path is null or normalized_field_path = ''
  then
    raise exception using errcode = '22023', message = 'batch_id, rule_version and field_path are required';
  end if;
  if p_after_text is null
    or normalized_before_checksum !~ '^[0-9a-f]{64}$'
    or normalized_after_checksum !~ '^[0-9a-f]{64}$'
    or normalized_before_checksum = normalized_after_checksum
  then
    raise exception using errcode = '22023', message = 'Migration text and distinct SHA-256 checksums are required';
  end if;
  if p_ai_involved is null or p_validation_status is null
    or p_validation_status not in ('deterministic_passed', 'human_approved')
    or jsonb_typeof(normalized_validation_detail) <> 'object'
  then
    raise exception using errcode = '22023', message = 'Migration validation status must be deterministic_passed or human_approved';
  end if;
  if p_ai_involved then
    if normalized_ai_provider is null or normalized_ai_model is null or p_validation_status <> 'human_approved' then
      raise exception using errcode = '22023', message = 'AI migrations require provider, model and human_approved validation';
    end if;
  elsif normalized_ai_provider is not null or normalized_ai_model is not null or normalized_ai_request_id is not null then
    raise exception using errcode = '22023', message = 'AI metadata requires ai_involved=true';
  end if;

  select note.content, note.problems, note.content_version
    into locked_content, locked_problems, locked_version
  from public.notes note
  where note.id = p_note_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Note not found';
  end if;

  select snapshot.* into snapshot_row
  from public.content_migration_snapshots snapshot
  where snapshot.batch_id = normalized_batch_id
    and snapshot.note_id = p_note_id
    and snapshot.field_path = normalized_field_path;
  if found then
    if snapshot_row.operation_kind <> 'migration'
      or snapshot_row.rule_version <> normalized_rule_version
      or snapshot_row.before_checksum <> normalized_before_checksum
      or snapshot_row.after_text <> p_after_text
      or snapshot_row.after_checksum <> normalized_after_checksum
      or snapshot_row.note_content_version_before <> p_expected_note_version
      or snapshot_row.ai_involved <> p_ai_involved
      or snapshot_row.ai_provider is distinct from normalized_ai_provider
      or snapshot_row.ai_model is distinct from normalized_ai_model
      or snapshot_row.ai_request_id is distinct from normalized_ai_request_id
      or snapshot_row.validation_status <> p_validation_status
      or snapshot_row.validation_detail <> normalized_validation_detail
    then
      raise exception using errcode = '23505', message = 'Migration batch key already exists with different immutable input';
    end if;
    return next snapshot_row;
    return;
  end if;

  if locked_version <> p_expected_note_version then
    raise exception using errcode = '40001', message = 'Note content_version changed after migration planning';
  end if;
  current_text := private.read_note_markdown_field(locked_content, locked_problems, normalized_field_path);
  current_checksum := private.content_sha256(current_text);
  if current_checksum <> normalized_before_checksum then
    raise exception using errcode = '40001', message = 'Markdown source changed after migration planning';
  end if;
  if private.content_sha256(p_after_text) <> normalized_after_checksum then
    raise exception using errcode = '22023', message = 'after_checksum does not match after_text';
  end if;

  if normalized_field_path = 'content' then
    update public.notes
    set content = p_after_text
    where id = p_note_id
    returning content_version into updated_version;
  else
    path_match := regexp_match(normalized_field_path, '^problems\.([0-9]+)\.(question|answer|explanation|tips)$');
    if path_match is not null then
      updated_problems := jsonb_set(
        locked_problems,
        array[path_match[1], path_match[2]],
        to_jsonb(p_after_text),
        false
      );
    else
      path_match := regexp_match(normalized_field_path, '^problems\.([0-9]+)\.options\.([0-9]+)\.content$');
      if path_match is null then
        raise exception using errcode = '22023', message = 'Unsupported Markdown field path';
      end if;
      updated_problems := jsonb_set(
        locked_problems,
        array[path_match[1], 'options', path_match[2], 'content'],
        to_jsonb(p_after_text),
        false
      );
    end if;
    update public.notes
    set problems = updated_problems
    where id = p_note_id
    returning content_version into updated_version;
  end if;

  if updated_version <> locked_version + 1 then
    raise exception 'notes.content_version did not advance exactly once';
  end if;

  insert into public.content_migration_snapshots (
    note_id, batch_id, field_path, operation_kind, rule_version,
    before_text, after_text, before_checksum, after_checksum,
    note_content_version_before, note_content_version_after,
    ai_involved, ai_provider, ai_model, ai_request_id,
    validation_status, validation_detail, created_by
  ) values (
    p_note_id, normalized_batch_id, normalized_field_path, 'migration', normalized_rule_version,
    current_text, p_after_text, normalized_before_checksum, normalized_after_checksum,
    locked_version, updated_version,
    p_ai_involved, normalized_ai_provider, normalized_ai_model, normalized_ai_request_id,
    p_validation_status, normalized_validation_detail, caller_user_id
  ) returning * into snapshot_row;

  return next snapshot_row;
end;
$$;

create or replace function public.rollback_content_migration(
  p_snapshot_id uuid,
  p_batch_id text,
  p_expected_note_version bigint,
  p_validation_detail jsonb default '{}'::jsonb
)
returns setof public.content_migration_snapshots
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  normalized_batch_id text := btrim(p_batch_id);
  normalized_validation_detail jsonb := coalesce(p_validation_detail, '{}'::jsonb);
  original_snapshot public.content_migration_snapshots%rowtype;
  rollback_snapshot public.content_migration_snapshots%rowtype;
  locked_content text;
  locked_problems jsonb;
  locked_version bigint;
  current_text text;
  updated_problems jsonb;
  updated_version bigint;
  path_match text[];
begin
  if caller_user_id is null or not private.current_user_is_admin() then
    raise exception using errcode = '42501', message = 'Administrator authentication is required';
  end if;
  if p_snapshot_id is null or p_expected_note_version is null or p_expected_note_version < 1
    or normalized_batch_id is null or normalized_batch_id = '' or length(normalized_batch_id) > 200
    or jsonb_typeof(normalized_validation_detail) <> 'object'
  then
    raise exception using errcode = '22023', message = 'snapshot_id, batch_id and a positive expected note version are required';
  end if;

  select snapshot.* into original_snapshot
  from public.content_migration_snapshots snapshot
  where snapshot.id = p_snapshot_id;
  if not found or original_snapshot.operation_kind <> 'migration' then
    raise exception using errcode = '22023', message = 'Only an existing migration snapshot can be rolled back';
  end if;

  select note.content, note.problems, note.content_version
    into locked_content, locked_problems, locked_version
  from public.notes note
  where note.id = original_snapshot.note_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Snapshot note not found';
  end if;

  select snapshot.* into rollback_snapshot
  from public.content_migration_snapshots snapshot
  where snapshot.reverts_snapshot_id = original_snapshot.id;
  if found then
    if rollback_snapshot.batch_id <> normalized_batch_id
      or rollback_snapshot.note_content_version_before <> p_expected_note_version
      or rollback_snapshot.validation_detail <>
        normalized_validation_detail || jsonb_build_object('revertsSnapshotId', original_snapshot.id)
    then
      raise exception using errcode = '23505', message = 'Rollback batch key already exists with different immutable input';
    end if;
    return next rollback_snapshot;
    return;
  end if;

  if locked_version <> p_expected_note_version then
    raise exception using errcode = '40001', message = 'Note content_version changed before rollback';
  end if;
  current_text := private.read_note_markdown_field(
    locked_content,
    locked_problems,
    original_snapshot.field_path
  );
  if private.content_sha256(current_text) <> original_snapshot.after_checksum then
    raise exception using errcode = '40001', message = 'Current Markdown no longer matches the migration snapshot';
  end if;

  if original_snapshot.field_path = 'content' then
    update public.notes
    set content = original_snapshot.before_text
    where id = original_snapshot.note_id
    returning content_version into updated_version;
  else
    path_match := regexp_match(original_snapshot.field_path, '^problems\.([0-9]+)\.(question|answer|explanation|tips)$');
    if path_match is not null then
      updated_problems := jsonb_set(
        locked_problems,
        array[path_match[1], path_match[2]],
        to_jsonb(original_snapshot.before_text),
        false
      );
    else
      path_match := regexp_match(original_snapshot.field_path, '^problems\.([0-9]+)\.options\.([0-9]+)\.content$');
      if path_match is null then
        raise exception using errcode = '22023', message = 'Unsupported Markdown field path';
      end if;
      updated_problems := jsonb_set(
        locked_problems,
        array[path_match[1], 'options', path_match[2], 'content'],
        to_jsonb(original_snapshot.before_text),
        false
      );
    end if;
    update public.notes
    set problems = updated_problems
    where id = original_snapshot.note_id
    returning content_version into updated_version;
  end if;

  if updated_version <> locked_version + 1 then
    raise exception 'notes.content_version did not advance exactly once during rollback';
  end if;

  insert into public.content_migration_snapshots (
    note_id, batch_id, field_path, operation_kind, reverts_snapshot_id, rule_version,
    before_text, after_text, before_checksum, after_checksum,
    note_content_version_before, note_content_version_after,
    ai_involved, validation_status, validation_detail, created_by
  ) values (
    original_snapshot.note_id, normalized_batch_id, original_snapshot.field_path,
    'rollback', original_snapshot.id, original_snapshot.rule_version,
    current_text, original_snapshot.before_text,
    original_snapshot.after_checksum, original_snapshot.before_checksum,
    locked_version, updated_version,
    false, 'rollback_verified',
    normalized_validation_detail || jsonb_build_object('revertsSnapshotId', original_snapshot.id),
    caller_user_id
  ) returning * into rollback_snapshot;

  return next rollback_snapshot;
end;
$$;

drop trigger if exists reject_content_migration_snapshot_mutation on public.content_migration_snapshots;
create trigger reject_content_migration_snapshot_mutation
  before update or delete on public.content_migration_snapshots
  for each row execute function private.reject_immutable_event_mutation();

alter table public.content_migration_snapshots enable row level security;
alter table public.content_migration_snapshots force row level security;

create policy content_migration_snapshots_admin_select
on public.content_migration_snapshots for select to authenticated
using ((select private.current_user_is_admin()));

revoke all on public.content_migration_snapshots from anon, authenticated;
grant select on public.content_migration_snapshots to authenticated;

revoke all on function private.content_sha256(text) from public, anon, authenticated;
revoke all on function private.read_note_markdown_field(text, jsonb, text) from public, anon, authenticated;
revoke all on function public.apply_content_migration(uuid, text, text, text, bigint, text, text, text, boolean, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.rollback_content_migration(uuid, text, bigint, jsonb) from public, anon, authenticated;

grant execute on function public.apply_content_migration(uuid, text, text, text, bigint, text, text, text, boolean, text, text, text, text, jsonb) to authenticated;
grant execute on function public.rollback_content_migration(uuid, text, bigint, jsonb) to authenticated;

comment on table public.content_migration_snapshots is
  'Immutable before/after evidence for checksum-gated Markdown migrations and rollbacks.';
comment on function public.apply_content_migration(uuid, text, text, text, bigint, text, text, text, boolean, text, text, text, text, jsonb) is
  'Admin-only atomic Markdown field migration with source checksum, content_version and validation gates.';
comment on function public.rollback_content_migration(uuid, text, bigint, jsonb) is
  'Admin-only rollback that appends a new immutable audit event and refuses changed source content.';

commit;
