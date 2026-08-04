-- AST-WP13: keep low-relevance chunks out of note QA context.
-- The deterministic token-hash vector remains a private, dependency-free
-- fallback; keyword evidence gets a higher weight and weak candidates are
-- rejected before they reach the model.

begin;

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
  v_candidate_limit integer := greatest(v_limit * 4, 16);
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
        (case when position(lower(btrim(p_query)) in lower(chunk.content)) > 0 then 0.5 else 0 end)
        + extensions.similarity(lower(chunk.content), lower(btrim(p_query))) * 0.3
        + least(ts_rank_cd(chunk.search_vector, plainto_tsquery('simple', p_query))::double precision, 0.2)
      )) as keyword_score,
      greatest(0::double precision, 1 - (chunk.embedding OPERATOR(extensions.<=>) p_query_embedding)) as vector_score
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
  scored as (
    select
      ranked.*,
      (ranked.keyword_score * 0.65 + ranked.vector_score * 0.35) as score
    from ranked
    where ranked.keyword_score >= 0.08 or ranked.vector_score >= 0.28
  ),
  selected as (
    select *
    from scored
    order by score desc, chunk_no asc
    limit v_candidate_limit
  ),
  limited as (
    select *
    from selected
    order by score desc, chunk_no asc
    limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', limited.id,
    'noteId', limited.note_id,
    'noteTitle', limited.note_title,
    'noteType', limited.note_type,
    'subject', limited.subject,
    'chunkNo', limited.chunk_no,
    'sourceLabel', limited.source_label,
    'href', limited.href,
    'content', limited.content,
    'excerpt', left(regexp_replace(limited.content, '\\s+', ' ', 'g'), 180),
    'score', limited.score,
    'keywordScore', limited.keyword_score,
    'vectorScore', limited.vector_score
  ) order by limited.score desc, limited.chunk_no), '[]'::jsonb)
  into v_result
  from limited;

  return v_result;
end;
$$;

revoke all on function public.search_private_note_rag(text,extensions.vector,uuid,integer)
from public, anon, authenticated;
grant execute on function public.search_private_note_rag(text,extensions.vector,uuid,integer)
to authenticated;

comment on function public.search_private_note_rag(text,extensions.vector,uuid,integer)
is 'Private current-version hybrid retrieval with keyword-first relevance gating and schema-qualified pgvector cosine distance.';

commit;
