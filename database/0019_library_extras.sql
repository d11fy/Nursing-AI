-- Library favorites, safe Study Pack integration, and document-level shared
-- generation cache. No source file, chunk or embedding is copied.

create table if not exists public.library_favorites (
 user_id uuid not null references public.app_users(id) on delete cascade,
 document_id uuid not null references public.knowledge_documents(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(user_id,document_id)
);
create index if not exists library_favorites_user_recent_idx on public.library_favorites(user_id,created_at desc);
alter table public.library_favorites enable row level security;
alter table public.library_favorites force row level security;
create policy library_favorites_owner on public.library_favorites for all
 using(user_id=ai_user_id() or ai_is_worker() or ai_is_admin())
 with check((user_id=ai_user_id() or ai_is_worker() or ai_is_admin())
   and exists(select 1 from public.knowledge_documents d where d.id=document_id and d.owner_id is null
     and d.status='ready' and d.is_active and d.publication_status='published'));

alter table public.study_packs alter column lecture_id drop not null;
create unique index if not exists study_packs_user_library_document_idx on public.study_packs(user_id,document_id)
 where lecture_id is null and document_id is not null;

create table if not exists public.shared_study_content (
 document_id uuid not null references public.knowledge_documents(id) on delete cascade,
 source_hash text not null,
 content_type text not null check(content_type in ('summary','key_points')),
 content_json jsonb not null default '{}',
 generation_status text not null default 'generating' check(generation_status in ('generating','ready','failed')),
 generated_at timestamptz,
 updated_at timestamptz not null default now(),
 primary key(document_id,source_hash,content_type)
);
alter table public.shared_study_content enable row level security;
alter table public.shared_study_content force row level security;
create policy shared_study_content_read on public.shared_study_content for select
 using(ai_is_worker() or ai_is_admin() or exists(select 1 from public.knowledge_documents d where d.id=document_id));
create policy shared_study_content_worker_write on public.shared_study_content for all
 using(ai_is_worker() or ai_is_admin()) with check(ai_is_worker() or ai_is_admin());

