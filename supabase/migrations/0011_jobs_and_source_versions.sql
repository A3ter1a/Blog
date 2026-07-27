-- AST-WP1-C: durable job ledger and immutable source-version foundation.

begin;

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  job_class text not null,
  job_kind text not null,
  status text not null default 'queued',
  title text not null,
  provider text,
  external_task_id text,
  progress_current integer not null default 0,
  progress_total integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  source_storage_bucket text,
  source_storage_path text,
  heartbeat_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_class_check check (job_class in ('external', 'internal')),
  constraint jobs_status_check check (
    status in ('queued', 'dispatched', 'running', 'waiting_for_trigger', 'succeeded', 'failed', 'stalled', 'claimed')
  ),
  constraint jobs_kind_nonempty check (btrim(job_kind) <> ''),
  constraint jobs_title_nonempty check (btrim(title) <> ''),
  constraint jobs_progress_check check (
    progress_current >= 0 and progress_total >= 0 and progress_current <= progress_total
  ),
  constraint jobs_external_identity_shape_check check (
    (
      job_class = 'internal'
      and provider is null
      and external_task_id is null
    )
    or
    (
      job_class = 'external'
      and (
        (provider is null and external_task_id is null)
        or (
          provider is not null
          and external_task_id is not null
          and nullif(btrim(provider), '') is not null
          and nullif(btrim(external_task_id), '') is not null
        )
      )
    )
  ),
  constraint jobs_source_storage_shape_check check (
    (source_storage_bucket is null and source_storage_path is null)
    or (
      source_storage_bucket is not null
      and source_storage_path is not null
      and nullif(btrim(source_storage_bucket), '') is not null
      and nullif(btrim(source_storage_path), '') is not null
    )
  )
);

create unique index if not exists jobs_external_identity_key
  on public.jobs (provider, external_task_id)
  where external_task_id is not null;

create index if not exists jobs_user_status_updated_idx
  on public.jobs (user_id, status, updated_at desc);

create table if not exists public.job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  ordinal integer not null,
  idempotency_key text not null,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  claimed_by text,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_items_ordinal_check check (ordinal >= 0),
  constraint job_items_idempotency_key_nonempty check (btrim(idempotency_key) <> ''),
  constraint job_items_status_check check (status in ('pending', 'leased', 'succeeded', 'failed')),
  constraint job_items_attempt_count_check check (attempt_count >= 0),
  constraint job_items_lease_shape_check check (
    (
      status = 'leased'
      and claimed_by is not null
      and nullif(btrim(claimed_by), '') is not null
      and lease_expires_at is not null
    )
    or (status <> 'leased' and lease_expires_at is null)
  ),
  constraint job_items_job_ordinal_key unique (job_id, ordinal),
  constraint job_items_job_idempotency_key unique (job_id, idempotency_key)
);

create index if not exists job_items_claim_idx
  on public.job_items (job_id, status, ordinal);

create table if not exists public.source_documents (
  id uuid primary key default gen_random_uuid(),
  ownership_kind text not null,
  user_id uuid references auth.users(id) on delete restrict,
  source_kind text not null,
  display_name text not null,
  note_id uuid references public.notes(id) on delete restrict,
  storage_bucket text,
  storage_path text,
  source_uri text,
  current_version_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_documents_ownership_check check (
    (ownership_kind = 'personal' and user_id is not null)
    or (ownership_kind = 'official' and user_id is null)
  ),
  constraint source_documents_kind_check check (source_kind in ('note', 'upload', 'official')),
  constraint source_documents_name_nonempty check (btrim(display_name) <> ''),
  constraint source_documents_shape_check check (
    (
      source_kind = 'note'
      and ownership_kind = 'personal'
      and note_id is not null
      and storage_bucket is null
      and storage_path is null
      and source_uri is null
    )
    or
    (
      source_kind = 'upload'
      and ownership_kind = 'personal'
      and note_id is null
      and storage_bucket is not null
      and storage_path is not null
      and nullif(btrim(storage_bucket), '') is not null
      and nullif(btrim(storage_path), '') is not null
      and source_uri is null
    )
    or
    (
      source_kind = 'official'
      and ownership_kind = 'official'
      and note_id is null
      and (
        (
          storage_bucket is not null
          and storage_path is not null
          and nullif(btrim(storage_bucket), '') is not null
          and nullif(btrim(storage_path), '') is not null
          and source_uri is null
        )
        or (
          storage_bucket is null
          and storage_path is null
          and source_uri is not null
          and nullif(btrim(source_uri), '') is not null
        )
      )
    )
  )
);

create unique index if not exists source_documents_note_key
  on public.source_documents (note_id)
  where source_kind = 'note';

create unique index if not exists source_documents_personal_upload_key
  on public.source_documents (user_id, storage_bucket, storage_path)
  where source_kind = 'upload';

create table if not exists public.source_versions (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references public.source_documents(id) on delete cascade,
  version_no integer not null,
  checksum text not null,
  raw_text text not null,
  note_content_version bigint,
  structure jsonb not null default '{}'::jsonb,
  source_metadata jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint source_versions_version_no_check check (version_no >= 1),
  constraint source_versions_checksum_check check (checksum ~ '^[0-9a-f]{64}$'),
  constraint source_versions_note_content_version_check check (
    note_content_version is null or note_content_version >= 1
  ),
  constraint source_versions_document_version_key unique (source_document_id, version_no),
  constraint source_versions_document_checksum_key unique (source_document_id, checksum),
  constraint source_versions_document_id_id_key unique (source_document_id, id)
);

alter table public.source_documents
  add constraint source_documents_current_version_fkey
  foreign key (id, current_version_id)
  references public.source_versions(source_document_id, id)
  deferrable initially deferred;

create index if not exists source_versions_document_captured_idx
  on public.source_versions (source_document_id, captured_at desc);

create or replace function private.enforce_source_version_append()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  document_kind text;
  document_note_id uuid;
  current_note_version bigint;
  expected_version_no integer;
begin
  select source_kind, note_id
    into document_kind, document_note_id
  from public.source_documents
  where id = new.source_document_id
  for update;

  if not found then
    raise exception 'Source document % does not exist', new.source_document_id;
  end if;

  select coalesce(max(version_no), 0) + 1
    into expected_version_no
  from public.source_versions
  where source_document_id = new.source_document_id;

  if new.version_no <> expected_version_no then
    raise exception 'source version_no must be the next value %, received %', expected_version_no, new.version_no;
  end if;

  if document_kind = 'note' then
    select content_version
      into current_note_version
    from public.notes
    where id = document_note_id;

    if new.note_content_version is null or new.note_content_version <> current_note_version then
      raise exception 'A note source version must capture the current note content_version';
    end if;
  elsif new.note_content_version is not null then
    raise exception 'Only note source versions may carry note_content_version';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_source_version_append() from public;

drop trigger if exists enforce_source_version_append on public.source_versions;
create trigger enforce_source_version_append
  before insert on public.source_versions
  for each row execute function private.enforce_source_version_append();

create or replace function private.enforce_source_document_identity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (
    new.ownership_kind,
    new.user_id,
    new.source_kind,
    new.note_id,
    new.storage_bucket,
    new.storage_path,
    new.source_uri,
    new.created_at
  ) is distinct from (
    old.ownership_kind,
    old.user_id,
    old.source_kind,
    old.note_id,
    old.storage_bucket,
    old.storage_path,
    old.source_uri,
    old.created_at
  ) then
    raise exception 'Source document identity is immutable';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_source_document_identity() from public;

drop trigger if exists enforce_source_document_identity on public.source_documents;
create trigger enforce_source_document_identity
  before update on public.source_documents
  for each row execute function private.enforce_source_document_identity();

drop trigger if exists set_jobs_updated_at on public.jobs;
create trigger set_jobs_updated_at before update on public.jobs
for each row execute function public.set_updated_at();

drop trigger if exists set_job_items_updated_at on public.job_items;
create trigger set_job_items_updated_at before update on public.job_items
for each row execute function public.set_updated_at();

drop trigger if exists set_source_documents_updated_at on public.source_documents;
create trigger set_source_documents_updated_at before update on public.source_documents
for each row execute function public.set_updated_at();

drop trigger if exists reject_source_version_mutation on public.source_versions;
create trigger reject_source_version_mutation
  before update or delete on public.source_versions
  for each row execute function private.reject_immutable_event_mutation();

alter table public.jobs enable row level security;
alter table public.jobs force row level security;
alter table public.job_items enable row level security;
alter table public.job_items force row level security;
alter table public.source_documents enable row level security;
alter table public.source_documents force row level security;
alter table public.source_versions enable row level security;
alter table public.source_versions force row level security;

create policy jobs_owner_select on public.jobs for select to authenticated
using (user_id = (select auth.uid()) or (select private.current_user_is_admin()));
create policy jobs_owner_insert on public.jobs for insert to authenticated
with check (user_id = (select auth.uid()));
create policy jobs_owner_update on public.jobs for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy job_items_owner_select on public.job_items for select to authenticated
using (exists (
  select 1 from public.jobs
  where jobs.id = job_items.job_id
    and (jobs.user_id = (select auth.uid()) or (select private.current_user_is_admin()))
));
create policy job_items_owner_insert on public.job_items for insert to authenticated
with check (exists (
  select 1 from public.jobs
  where jobs.id = job_items.job_id and jobs.user_id = (select auth.uid())
));
create policy job_items_owner_update on public.job_items for update to authenticated
using (exists (
  select 1 from public.jobs
  where jobs.id = job_items.job_id and jobs.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.jobs
  where jobs.id = job_items.job_id and jobs.user_id = (select auth.uid())
));

create policy source_documents_access_select on public.source_documents for select to authenticated
using (
  ownership_kind = 'official'
  or user_id = (select auth.uid())
  or (select private.current_user_is_admin())
);
create policy source_documents_access_insert on public.source_documents for insert to authenticated
with check (
  (ownership_kind = 'personal' and user_id = (select auth.uid()))
  or (ownership_kind = 'official' and (select private.current_user_is_admin()))
);
create policy source_documents_access_update on public.source_documents for update to authenticated
using (
  (ownership_kind = 'personal' and user_id = (select auth.uid()))
  or (ownership_kind = 'official' and (select private.current_user_is_admin()))
)
with check (
  (ownership_kind = 'personal' and user_id = (select auth.uid()))
  or (ownership_kind = 'official' and (select private.current_user_is_admin()))
);

create policy source_versions_access_select on public.source_versions for select to authenticated
using (exists (
  select 1 from public.source_documents
  where source_documents.id = source_versions.source_document_id
    and (
      source_documents.ownership_kind = 'official'
      or source_documents.user_id = (select auth.uid())
      or (select private.current_user_is_admin())
    )
));
create policy source_versions_access_insert on public.source_versions for insert to authenticated
with check (exists (
  select 1 from public.source_documents
  where source_documents.id = source_versions.source_document_id
    and (
      (source_documents.ownership_kind = 'personal' and source_documents.user_id = (select auth.uid()))
      or (source_documents.ownership_kind = 'official' and (select private.current_user_is_admin()))
    )
));

revoke all on public.jobs, public.job_items, public.source_documents, public.source_versions from anon, authenticated;
grant select, insert, update on public.jobs, public.job_items, public.source_documents to authenticated;
grant select, insert on public.source_versions to authenticated;

comment on table public.jobs is 'Durable progress ledger; it does not imply an always-running background worker.';
comment on table public.job_items is 'Idempotent bounded work units; atomic lease RPC is added when WP3 activates consumers.';
comment on table public.source_versions is 'Immutable source evidence used by OCR and RAG derivatives.';

commit;
