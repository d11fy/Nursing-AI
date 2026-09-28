-- =========================================
-- Relax size limit for admin knowledge documents in stored_files
-- =========================================
alter table public.stored_files drop constraint if exists stored_files_content_check;
alter table public.stored_files add constraint stored_files_content_check check (
  (bucket = 'chat-images' and octet_length(content) <= 10485760)
  or (bucket = 'lecture-files' and octet_length(content) <= 62914560)
  or (bucket = 'knowledge-documents')
);

-- =========================================
-- Knowledge Upload Sessions for Chunked / Large Uploads
-- =========================================
create table if not exists public.knowledge_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.app_users(id) on delete cascade,
  file_name text not null,
  file_size bigint not null,
  mime_type text not null,
  total_chunks int not null,
  uploaded_chunks int not null default 0,
  title text not null,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  source_type text not null,
  storage_path text not null unique,
  status text not null default 'uploading', -- 'uploading', 'processing', 'completed', 'failed', 'cancelled'
  document_id uuid references public.documents(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_upload_sessions_admin on public.knowledge_upload_sessions(admin_id);
create index if not exists idx_upload_sessions_status on public.knowledge_upload_sessions(status);

-- =========================================
-- Knowledge Document Chunks (Stored in 5MB pieces to avoid RAM bloat)
-- =========================================
create table if not exists public.knowledge_document_chunks (
  path text not null,
  chunk_index int not null,
  size_bytes int not null,
  chunk_data bytea not null,
  created_at timestamptz not null default now(),
  primary key (path, chunk_index)
);

create index if not exists idx_doc_chunks_path on public.knowledge_document_chunks(path);
