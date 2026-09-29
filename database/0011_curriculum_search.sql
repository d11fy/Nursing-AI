-- Additive: existing indexed text becomes searchable without changing embeddings.
create or replace function public.normalize_search_text(value text)
returns text language sql immutable parallel safe as $$
  select regexp_replace(translate(lower(coalesce(value,'')), 'أإآٱىؤئ', 'اااايوي'), '[ًٌٍَُِّْـ]', '', 'g');
$$;

alter table public.document_chunks add column if not exists search_vector tsvector
  generated always as (to_tsvector('simple', public.normalize_search_text(content))) stored;
alter table public.lecture_chunks add column if not exists search_vector tsvector
  generated always as (to_tsvector('simple', public.normalize_search_text(content))) stored;
alter table public.documents add column if not exists search_vector tsvector
  generated always as (to_tsvector('simple', public.normalize_search_text(title || ' ' || file_name))) stored;
create index if not exists document_chunks_search_idx on public.document_chunks using gin(search_vector);
create index if not exists lecture_chunks_search_idx on public.lecture_chunks using gin(search_vector);
create index if not exists documents_search_idx on public.documents using gin(search_vector);
create index if not exists document_chunks_position_idx on public.document_chunks(document_id,chunk_index);
create index if not exists lecture_chunks_position_idx on public.lecture_chunks(lecture_id,chunk_index);
alter table public.documents
  add column if not exists extraction_page_count integer,
  add column if not exists ocr_page_count integer not null default 0,
  add column if not exists index_version integer not null default 1;
