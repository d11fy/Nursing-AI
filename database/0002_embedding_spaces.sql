-- Preserve legacy vectors, but do not guess their model from their dimension.
alter table public.document_chunks drop constraint document_chunks_embedding_check;
alter table public.document_chunks
  add column embedding_provider text,
  add column embedding_model text,
  add column embedding_dimensions integer;
alter table public.document_chunks add constraint document_chunks_embedding_space_check check (
  (embedding_provider is null and embedding_model is null and embedding_dimensions is null)
  or (embedding is not null and embedding_provider is not null and embedding_model is not null
      and embedding_dimensions is not null and embedding_dimensions > 0
      and cardinality(embedding) = embedding_dimensions and array_ndims(embedding) = 1)
);
create index document_chunks_embedding_space_idx
  on public.document_chunks(embedding_provider, embedding_model, embedding_dimensions);

create or replace function public.cosine_similarity(a double precision[], b double precision[])
returns double precision language sql immutable strict as $$
 select case when cardinality(a) = cardinality(b) and cardinality(a) > 0
   then (select sum(x*y) / nullif(sqrt(sum(x*x))*sqrt(sum(y*y)),0) from unnest(a,b) as v(x,y))
   else null end;
$$;

-- Remove the unsafe signature: callers must now identify the embedding space.
drop function public.match_document_chunks(double precision[], uuid, integer);
create function public.match_document_chunks(
  query_embedding double precision[], match_subject_id uuid, match_count integer,
  query_provider text, query_model text
)
returns table(id uuid, document_id uuid, content text, chapter text, page_number integer, similarity float)
language sql stable as $$
 select dc.id, dc.document_id, dc.content, dc.chapter, dc.page_number,
   public.cosine_similarity(dc.embedding, query_embedding) as similarity
 from public.document_chunks dc
 where dc.embedding_provider = query_provider and dc.embedding_model = query_model
   and dc.embedding_dimensions = cardinality(query_embedding)
   and (match_subject_id is null or dc.subject_id = match_subject_id)
   and exists(select 1 from public.documents d where d.id = dc.document_id and d.status = 'ready')
 order by similarity desc nulls last
 limit greatest(0, least(match_count, 100));
$$;
