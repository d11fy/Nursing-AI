-- Student lecture workspace: personal uploads, private RAG, retention, and
-- an opt-in path into the shared knowledge base. Status/classification
-- columns use text+check (not new enum types) to match the stored_files.bucket
-- precedent and stay easy to extend without ALTER TYPE ceremony.

create table public.lectures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  title text not null,
  file_name text not null,
  original_file_name text not null,
  storage_path text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  file_hash text not null,
  status text not null default 'uploading' check (status in ('uploading','uploaded','processing','ready','failed','expired','deleted')),
  error_message text,
  uploaded_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processing_completed_at timestamptz,
  delete_after timestamptz,
  deleted_at timestamptz,
  contribution_status text not null default 'not_submitted' check (contribution_status in ('not_submitted','pending','approved','rejected')),
  contribution_consent_at timestamptz,
  contribution_ownership_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lectures_user_id_idx on public.lectures(user_id);
create index lectures_subject_id_idx on public.lectures(subject_id);
create index lectures_delete_after_idx on public.lectures(delete_after) where deleted_at is null;

create trigger lectures_updated_at before update on public.lectures
for each row execute function public.set_updated_at();

-- =========================================
-- LECTURE CHUNKS (private per-student RAG)
-- =========================================
create table public.lecture_chunks (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  content text not null,
  page_number integer,
  chunk_index integer not null,
  embedding double precision[],
  embedding_provider text,
  embedding_model text,
  embedding_dimensions integer,
  created_at timestamptz not null default now(),
  constraint lecture_chunks_embedding_space_check check (
    (embedding_provider is null and embedding_model is null and embedding_dimensions is null)
    or (embedding is not null and embedding_provider is not null and embedding_model is not null
        and embedding_dimensions is not null and embedding_dimensions > 0
        and cardinality(embedding) = embedding_dimensions and array_ndims(embedding) = 1)
  )
);

create index lecture_chunks_lecture_id_idx on public.lecture_chunks(lecture_id);
create index lecture_chunks_user_id_idx on public.lecture_chunks(user_id);

-- Requires and enforces lecture_id + user_id inside the SQL itself — never
-- just an application-layer filter, so a private lecture can never leak
-- across students even if a caller passes the wrong owner by mistake.
create function public.match_lecture_chunks(
  query_embedding double precision[], match_lecture_id uuid, match_user_id uuid, match_count integer,
  query_provider text, query_model text
)
returns table(id uuid, lecture_id uuid, content text, page_number integer, similarity float)
language sql stable as $$
  select lc.id, lc.lecture_id, lc.content, lc.page_number,
    public.cosine_similarity(lc.embedding, query_embedding) as similarity
  from public.lecture_chunks lc
  where lc.lecture_id = match_lecture_id and lc.user_id = match_user_id
    and lc.embedding_provider = query_provider and lc.embedding_model = query_model
    and lc.embedding_dimensions = cardinality(query_embedding)
    and exists(select 1 from public.lectures l where l.id = lc.lecture_id and l.user_id = match_user_id and l.status = 'ready')
  order by similarity desc nulls last
  limit greatest(0, least(match_count, 100));
$$;

-- =========================================
-- GENERATED STUDY CONTENT (summary / key points / quiz / flashcards)
-- =========================================
create table public.generated_study_content (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  content_type text not null check (content_type in ('summary','key_points','quiz','flashcards')),
  content_json jsonb not null,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(lecture_id, content_type)
);

create index generated_study_content_lecture_id_idx on public.generated_study_content(lecture_id);

create trigger generated_study_content_updated_at before update on public.generated_study_content
for each row execute function public.set_updated_at();

-- =========================================
-- FILE CLEANUP LOGS (retention job audit trail)
-- =========================================
create table public.file_cleanup_logs (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  storage_path text not null,
  attempted_at timestamptz not null default now(),
  status text not null check (status in ('success','failed')),
  error_message text
);

create index file_cleanup_logs_lecture_id_idx on public.file_cleanup_logs(lecture_id);

-- =========================================
-- KNOWLEDGE CONTRIBUTIONS (admin review queue)
-- =========================================
create table public.knowledge_contributions (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  classification text not null check (classification in ('nursing_related','not_nursing','uncertain')),
  classification_confidence numeric,
  privacy_flagged boolean not null default false,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  approved_document_id uuid references public.documents(id) on delete set null,
  created_at timestamptz not null default now()
);

create index knowledge_contributions_status_idx on public.knowledge_contributions(status);
create index knowledge_contributions_lecture_id_idx on public.knowledge_contributions(lecture_id);

-- =========================================
-- Link the shared knowledge base back to its originating contribution
-- (the "withdrawal" hook — deleting this documents row cascades its chunks).
-- =========================================
alter table public.documents add column contribution_id uuid references public.knowledge_contributions(id) on delete set null;
alter type source_type add value if not exists 'student_contribution';

-- =========================================
-- Optional lecture-scoped conversations ("chat about this lecture").
-- Same insert-time ownership validation pattern as subject_id in lib/db/query.ts.
-- =========================================
alter table public.conversations add column lecture_id uuid references public.lectures(id) on delete set null;

-- =========================================
-- Per-lecture AI cost attribution.
-- =========================================
alter table public.usage_logs add column lecture_id uuid references public.lectures(id) on delete set null;
alter type usage_type add value if not exists 'lecture_processing';
alter type usage_type add value if not exists 'summary';
alter type usage_type add value if not exists 'key_points';
alter type usage_type add value if not exists 'quiz';
alter type usage_type add value if not exists 'flashcards';

-- =========================================
-- Widen stored_files for lecture uploads (larger than chat images/documents).
-- =========================================
alter table public.stored_files drop constraint stored_files_bucket_check;
alter table public.stored_files drop constraint stored_files_content_check;
alter table public.stored_files add constraint stored_files_bucket_check check (bucket in ('chat-images','knowledge-documents','lecture-files'));
alter table public.stored_files add constraint stored_files_content_check check (
  (bucket in ('chat-images','knowledge-documents') and octet_length(content) <= 10485760)
  or (bucket = 'lecture-files' and octet_length(content) <= 62914560)
);

-- =========================================
-- Settings (admin editable, not hardcoded in application code).
-- =========================================
insert into public.settings (key, value) values
  ('lecture_max_file_mb', '50'),
  ('lecture_large_file_mb', '20'),
  ('lecture_retention_days', '10')
on conflict (key) do nothing;
