-- AST-WP7: qualify the pgvector cosine operator under an empty search_path.

begin;

do $$
begin
  if to_regprocedure('public.search_private_note_rag(text,extensions.vector,uuid,integer)') is null then
    raise exception '0022 requires search_private_note_rag from 0021';
  end if;
end
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

revoke all on function public.search_private_note_rag(text,extensions.vector,uuid,integer)
from public, anon, authenticated;
grant execute on function public.search_private_note_rag(text,extensions.vector,uuid,integer)
to authenticated;

comment on function public.search_private_note_rag(text,extensions.vector,uuid,integer)
is 'Private current-version hybrid retrieval with schema-qualified pgvector cosine distance.';

commit;
