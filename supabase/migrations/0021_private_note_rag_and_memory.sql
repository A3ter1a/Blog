-- AST-WP7: persistent private-note RAG derivatives and user-confirmed assistant memory.
-- Source versions and chunks are append-only. Only the current source version is searchable.

begin;

create schema if not exists extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

do $$
begin
  if to_regclass('public.notes') is null
    or to_regclass('public.source_documents') is null
    or to_regclass('public.source_versions') is null
    or to_regprocedure('private.reject_immutable_event_mutation()') is null
    or to_regprocedure('private.current_user_is_admin()') is null
    or to_regprocedure('extensions.digest(bytea,text)') is null
    or to_regtype('extensions.vector') is null
  then
    raise exception '0021 requires notes, source versions, immutable-event guards, pgcrypto, and pgvector';
  end if;
end
$$;

create table public.rag_chunks (
  id uuid primary key default gen_random_uuid(),
  source_version_id uuid not null references public.source_versions(id) on delete restrict,
  chunk_no integer not null,
  content text not null,
  source_label text not null,
  href text not null,
  embedding extensions.vector(256) not null,
  search_vector tsvector generated always as (to_tsvector('simple', content)) stored,
  created_at timestamptz not null default now(),
  constraint rag_chunks_chunk_no_check check (chunk_no >= 0),
  constraint rag_chunks_content_check check (
    nullif(btrim(content), '') is not null and length(content) <= 1400
  ),
  constraint rag_chunks_source_label_check check (
    nullif(btrim(source_label), '') is not null and length(source_label) <= 240
  ),
  constraint rag_chunks_href_check check (
    href ~ '^/notes/(private/)?[0-9a-f-]{36}(#[^[:space:]]+)?$'
  ),
  constraint rag_chunks_source_version_no_key unique (source_version_id, chunk_no)
);

create index rag_chunks_source_version_idx on public.rag_chunks (source_version_id, chunk_no);
create index rag_chunks_search_vector_idx on public.rag_chunks using gin (search_vector);
create index rag_chunks_content_trgm_idx on public.rag_chunks using gin (content extensions.gin_trgm_ops);
create index rag_chunks_embedding_hnsw_idx
  on public.rag_chunks using hnsw (embedding extensions.vector_cosine_ops);

create table public.memory_candidates (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  content text not null,
  reason text not null,
  source_path text not null,
  status text not null default 'proposed',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint memory_candidates_content_check check (
    nullif(btrim(content), '') is not null and length(content) <= 1000
  ),
  constraint memory_candidates_reason_check check (
    nullif(btrim(reason), '') is not null and length(reason) <= 240
  ),
  constraint memory_candidates_source_path_check check (
    source_path ~ '^/' and length(source_path) <= 500
  ),
  constraint memory_candidates_status_check check (status in ('proposed', 'accepted', 'rejected')),
  constraint memory_candidates_decision_shape_check check (
    (status = 'proposed' and decided_at is null)
    or (status in ('accepted', 'rejected') and decided_at is not null)
  )
);

create index memory_candidates_user_status_created_idx
  on public.memory_candidates (user_id, status, created_at desc);

create trigger reject_rag_chunk_mutation
  before update or delete on public.rag_chunks
  for each row execute function private.reject_immutable_event_mutation();

create or replace function public.sync_private_note_rag(
  p_note_id uuid,
  p_note_content_version bigint,
  p_checksum text,
  p_raw_text text,
  p_chunks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_note public.notes%rowtype;
  v_document public.source_documents%rowtype;
  v_current_version public.source_versions%rowtype;
  v_version_id uuid := gen_random_uuid();
  v_version_no integer;
  v_chunk_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not private.current_user_is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if p_note_id is null or p_note_content_version is null or p_note_content_version < 1 then
    raise exception 'note_id and positive note_content_version are required';
  end if;
  if p_checksum is null or p_checksum !~ '^[0-9a-f]{64}$' then raise exception 'A SHA-256 checksum is required'; end if;
  if p_raw_text is null or nullif(btrim(p_raw_text), '') is null or length(p_raw_text) > 5000000 then
    raise exception 'RAG source text is required and must stay within 5 MB';
  end if;
  if encode(extensions.digest(convert_to(p_raw_text, 'UTF8'), 'sha256'), 'hex') <> p_checksum then
    raise exception 'RAG source checksum mismatch';
  end if;
  if p_chunks is null or jsonb_typeof(p_chunks) <> 'array'
    or jsonb_array_length(p_chunks) < 1 or jsonb_array_length(p_chunks) > 64
  then
    raise exception 'RAG chunks must contain between 1 and 64 items';
  end if;

  select note.* into v_note from public.notes note where note.id = p_note_id for share;
  if not found then raise exception 'Note does not exist'; end if;
  if v_note.content_version <> p_note_content_version then raise exception 'Note content version changed before RAG sync'; end if;

  select document.* into v_document
  from public.source_documents document
  where document.source_kind = 'note' and document.note_id = p_note_id
  for update;

  if not found then
    insert into public.source_documents (
      ownership_kind, user_id, source_kind, display_name, note_id, metadata
    ) values (
      'personal', v_user_id, 'note', v_note.title, v_note.id,
      jsonb_build_object('subject', v_note.subject, 'noteType', v_note.type)
    ) returning * into v_document;
  elsif v_document.user_id <> v_user_id then
    raise exception 'Note source belongs to another user';
  end if;

  if v_document.current_version_id is not null then
    select version.* into v_current_version
    from public.source_versions version
    where version.id = v_document.current_version_id
      and version.source_document_id = v_document.id;
  end if;

  if v_current_version.id is not null and v_current_version.checksum = p_checksum then
    return jsonb_build_object(
      'sourceDocumentId', v_document.id,
      'sourceVersionId', v_current_version.id,
      'versionNo', v_current_version.version_no,
      'chunkCount', (select count(*) from public.rag_chunks chunk where chunk.source_version_id = v_current_version.id),
      'action', 'unchanged'
    );
  end if;

  select coalesce(max(version.version_no), 0) + 1 into v_version_no
  from public.source_versions version where version.source_document_id = v_document.id;

  insert into public.source_versions (
    id, source_document_id, version_no, checksum, raw_text, note_content_version,
    structure, source_metadata
  ) values (
    v_version_id, v_document.id, v_version_no, p_checksum, p_raw_text, p_note_content_version,
    jsonb_build_object('chunker', 'heading-window-v1', 'chunkCount', jsonb_array_length(p_chunks)),
    jsonb_build_object('embedding', 'token-hash-v1', 'dimensions', 256)
  );

  if exists (
    select 1
    from jsonb_array_elements(p_chunks) with ordinality entry(value, ordinal)
    where jsonb_typeof(entry.value) <> 'object'
      or nullif(btrim(entry.value ->> 'content'), '') is null
      or length(entry.value ->> 'content') > 1400
      or nullif(btrim(entry.value ->> 'sourceLabel'), '') is null
      or length(entry.value ->> 'sourceLabel') > 240
      or coalesce(entry.value ->> 'href', '') !~ '^/notes/(private/)?[0-9a-f-]{36}(#[^[:space:]]+)?$'
      or jsonb_typeof(entry.value -> 'embedding') <> 'array'
      or jsonb_array_length(entry.value -> 'embedding') <> 256
      or extensions.vector_dims(((entry.value -> 'embedding')::text)::extensions.vector) <> 256
  ) then
    raise exception 'RAG chunk payload is invalid';
  end if;

  insert into public.rag_chunks (
    source_version_id, chunk_no, content, source_label, href, embedding
  )
  select
    v_version_id,
    entry.ordinality - 1,
    btrim(entry.value ->> 'content'),
    btrim(entry.value ->> 'sourceLabel'),
    entry.value ->> 'href',
    ((entry.value -> 'embedding')::text)::extensions.vector
  from jsonb_array_elements(p_chunks) with ordinality entry(value, ordinality)
  order by entry.ordinality;
  get diagnostics v_chunk_count = row_count;

  update public.source_documents
  set
    display_name = v_note.title,
    current_version_id = v_version_id,
    metadata = jsonb_build_object('subject', v_note.subject, 'noteType', v_note.type)
  where id = v_document.id;

  return jsonb_build_object(
    'sourceDocumentId', v_document.id,
    'sourceVersionId', v_version_id,
    'versionNo', v_version_no,
    'chunkCount', v_chunk_count,
    'action', 'create_version'
  );
end;
$$;

create or replace function public.search_private_note_rag(
  p_query text,
  p_query_embedding extensions.vector,
  p_note_id uuid default null,
  p_limit integer default 8
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := greatest(4, least(coalesce(p_limit, 8), 12));
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_query is null or nullif(btrim(p_query), '') is null or length(p_query) > 500 then
    raise exception 'A query of at most 500 characters is required';
  end if;
  if p_query_embedding is null or extensions.vector_dims(p_query_embedding) <> 256 then
    raise exception 'A 256-dimensional query embedding is required';
  end if;

  with ranked as (
    select
      chunk.id,
      document.note_id,
      note.title as note_title,
      note.type as note_type,
      note.subject,
      chunk.chunk_no,
      chunk.source_label,
      chunk.href,
      chunk.content,
      greatest(0::double precision, least(1::double precision,
        (case when position(lower(btrim(p_query)) in lower(chunk.content)) > 0 then 0.45 else 0 end)
        + extensions.similarity(lower(chunk.content), lower(btrim(p_query))) * 0.35
        + least(ts_rank_cd(chunk.search_vector, plainto_tsquery('simple', p_query))::double precision, 0.2)
      )) as keyword_score,
      greatest(0::double precision, 1 - (chunk.embedding <=> p_query_embedding)) as vector_score
    from public.rag_chunks chunk
    join public.source_versions version on version.id = chunk.source_version_id
    join public.source_documents document
      on document.id = version.source_document_id
      and document.current_version_id = version.id
    join public.notes note on note.id = document.note_id
    where document.source_kind = 'note'
      and document.ownership_kind = 'personal'
      and document.user_id = v_user_id
      and (p_note_id is null or document.note_id = p_note_id)
  ),
  selected as (
    select *, (keyword_score * 0.55 + vector_score * 0.45) as score
    from ranked
    order by score desc, chunk_no asc
    limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', selected.id,
    'noteId', selected.note_id,
    'noteTitle', selected.note_title,
    'noteType', selected.note_type,
    'subject', selected.subject,
    'chunkNo', selected.chunk_no,
    'sourceLabel', selected.source_label,
    'href', selected.href,
    'content', selected.content,
    'excerpt', left(regexp_replace(selected.content, '\s+', ' ', 'g'), 180),
    'score', selected.score,
    'keywordScore', selected.keyword_score,
    'vectorScore', selected.vector_score
  ) order by selected.score desc, selected.chunk_no), '[]'::jsonb)
  into v_result
  from selected;

  return v_result;
end;
$$;

create or replace function public.propose_assistant_memory(
  p_command_id uuid,
  p_content text,
  p_reason text,
  p_source_path text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_candidate public.memory_candidates%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_command_id is null then raise exception 'command_id is required'; end if;
  if p_content is null or nullif(btrim(p_content), '') is null or length(p_content) > 1000 then raise exception 'Memory content is invalid'; end if;
  if p_reason is null or nullif(btrim(p_reason), '') is null or length(p_reason) > 240 then raise exception 'Memory reason is invalid'; end if;
  if p_source_path is null or p_source_path !~ '^/' or length(p_source_path) > 500 then raise exception 'Memory source path is invalid'; end if;

  select candidate.* into v_candidate from public.memory_candidates candidate where candidate.id = p_command_id;
  if found then
    if v_candidate.user_id <> v_user_id
      or v_candidate.content <> btrim(p_content)
      or v_candidate.reason <> btrim(p_reason)
      or v_candidate.source_path <> p_source_path
    then raise exception 'Memory command_id is already used by different input'; end if;
    return to_jsonb(v_candidate) || jsonb_build_object('idempotent', true);
  end if;

  insert into public.memory_candidates (id, user_id, content, reason, source_path)
  values (p_command_id, v_user_id, btrim(p_content), btrim(p_reason), p_source_path)
  returning * into v_candidate;
  return to_jsonb(v_candidate) || jsonb_build_object('idempotent', false);
end;
$$;

create or replace function public.decide_assistant_memory(
  p_candidate_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_candidate public.memory_candidates%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_candidate_id is null or p_decision not in ('accepted', 'rejected') then raise exception 'Valid candidate_id and decision are required'; end if;

  select candidate.* into v_candidate
  from public.memory_candidates candidate
  where candidate.id = p_candidate_id and candidate.user_id = v_user_id
  for update;
  if not found then raise exception 'Owned memory candidate does not exist'; end if;
  if v_candidate.status = p_decision then return to_jsonb(v_candidate) || jsonb_build_object('idempotent', true); end if;
  if v_candidate.status <> 'proposed' then raise exception 'Memory candidate already has a different decision'; end if;

  update public.memory_candidates
  set status = p_decision, decided_at = now()
  where id = v_candidate.id
  returning * into v_candidate;
  return to_jsonb(v_candidate) || jsonb_build_object('idempotent', false);
end;
$$;

create or replace function public.list_assistant_memories()
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
    'id', candidate.id,
    'content', candidate.content,
    'reason', candidate.reason,
    'sourcePath', candidate.source_path,
    'status', candidate.status,
    'createdAt', candidate.created_at,
    'decidedAt', candidate.decided_at
  ) order by candidate.created_at desc), '[]'::jsonb)
  into v_result
  from (
    select * from public.memory_candidates
    where user_id = v_user_id
    order by created_at desc
    limit 40
  ) candidate;
  return v_result;
end;
$$;

alter table public.rag_chunks enable row level security;
alter table public.rag_chunks force row level security;
alter table public.memory_candidates enable row level security;
alter table public.memory_candidates force row level security;

create policy rag_chunks_owner_select on public.rag_chunks
for select to authenticated using (exists (
  select 1
  from public.source_versions version
  join public.source_documents document on document.id = version.source_document_id
  where version.id = rag_chunks.source_version_id
    and (document.user_id = (select auth.uid()) or (select private.current_user_is_admin()))
));

create policy memory_candidates_owner_select on public.memory_candidates
for select to authenticated using (
  user_id = (select auth.uid()) or (select private.current_user_is_admin())
);

revoke all on public.rag_chunks, public.memory_candidates from anon, authenticated;
grant select on public.rag_chunks, public.memory_candidates to authenticated;

revoke all on function public.sync_private_note_rag(uuid,bigint,text,text,jsonb),
  public.search_private_note_rag(text,extensions.vector,uuid,integer),
  public.propose_assistant_memory(uuid,text,text,text),
  public.decide_assistant_memory(uuid,text),
  public.list_assistant_memories()
from public, anon, authenticated;

grant execute on function public.sync_private_note_rag(uuid,bigint,text,text,jsonb),
  public.search_private_note_rag(text,extensions.vector,uuid,integer),
  public.propose_assistant_memory(uuid,text,text,text),
  public.decide_assistant_memory(uuid,text),
  public.list_assistant_memories()
to authenticated;

comment on table public.rag_chunks is 'Append-only private note retrieval derivatives; only current source versions are searchable.';
comment on column public.rag_chunks.embedding is 'Deterministic token-hash-v1 vector; no note text is sent to an embedding provider.';
comment on table public.memory_candidates is 'User-scoped assistant memory proposals; only explicit accepted decisions enter prompts.';

commit;
