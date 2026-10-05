-- University Library / ready study sources. This migration is additive: shared
-- documents keep their single storage object, extraction, chunks and vectors.

alter table public.documents add column if not exists resource_category text;
alter table public.documents add column if not exists library_description text;
alter table public.documents add column if not exists language text;
alter table public.documents add column if not exists source_label text;
alter table public.documents add column if not exists visibility_scope text not null default 'specific_subject';
alter table public.documents add column if not exists sort_order integer not null default 0;

alter table public.knowledge_documents add column if not exists resource_category text;
alter table public.knowledge_documents add column if not exists library_description text;
alter table public.knowledge_documents add column if not exists source_label text;
alter table public.knowledge_documents add column if not exists visibility_scope text not null default 'specific_subject';
alter table public.knowledge_documents add column if not exists sort_order integer not null default 0;
alter table public.knowledge_documents add column if not exists publication_status text not null default 'hidden';

update public.knowledge_documents set resource_category = case source_type
  when 'required_textbook' then 'curriculum_book'
  when 'university_lecture' then 'university_lecture'
  when 'doctor_slides' then 'university_lecture'
  when 'lab_manual' then 'lab_material'
  when 'exam_questions' then 'previous_exam'
  when 'approved_notes' then 'notes'
  when 'official_course_material' then 'explanation'
  else 'other' end
where resource_category is null;
update public.knowledge_documents set visibility_scope = case
  when subject_id is not null then 'specific_subject'
  when academic_year_id is not null then 'academic_year'
  else 'all_students' end;
update public.knowledge_documents set publication_status = case when is_active then 'published' else 'hidden' end;

alter table public.documents drop constraint if exists documents_resource_category_check;
alter table public.documents add constraint documents_resource_category_check check(resource_category is null or resource_category in
 ('curriculum_book','university_lecture','summary','previous_exam','exam_model','question_bank','explanation','notes','lab_material','other'));
alter table public.documents drop constraint if exists documents_visibility_scope_check;
alter table public.documents add constraint documents_visibility_scope_check check(visibility_scope in ('all_students','academic_year','specific_subject'));
alter table public.documents drop constraint if exists documents_sort_order_check;
alter table public.documents add constraint documents_sort_order_check check(sort_order between 0 and 100000);

alter table public.knowledge_documents drop constraint if exists knowledge_documents_resource_category_check;
alter table public.knowledge_documents add constraint knowledge_documents_resource_category_check check(resource_category in
 ('curriculum_book','university_lecture','summary','previous_exam','exam_model','question_bank','explanation','notes','lab_material','other'));
alter table public.knowledge_documents drop constraint if exists knowledge_documents_visibility_scope_check;
alter table public.knowledge_documents add constraint knowledge_documents_visibility_scope_check check(visibility_scope in ('all_students','academic_year','specific_subject'));
alter table public.knowledge_documents drop constraint if exists knowledge_documents_publication_status_check;
alter table public.knowledge_documents add constraint knowledge_documents_publication_status_check check(publication_status in ('published','hidden','archived'));
alter table public.knowledge_documents drop constraint if exists knowledge_documents_sort_order_check;
alter table public.knowledge_documents add constraint knowledge_documents_sort_order_check check(sort_order between 0 and 100000);

create index if not exists knowledge_documents_library_scope_idx on public.knowledge_documents
 (academic_year_id,semester_id,subject_id,resource_category,sort_order) where owner_id is null and is_active;
create index if not exists knowledge_documents_library_status_idx on public.knowledge_documents
 (publication_status,status) where owner_id is null;

create or replace function public.ai_library_document_allowed(owner uuid,subject uuid,year_id uuid,semester integer,visibility text)
returns boolean language sql stable as $$
 select ai_is_worker() or ai_is_admin() or owner=ai_user_id() or (owner is null and exists(
   select 1 from profiles p join academic_years y on y.id=p.academic_year_id and y.is_active
   where p.user_id=ai_user_id() and p.status='active' and (
     visibility='all_students'
     or (visibility='academic_year' and (year_id is null or year_id=p.academic_year_id))
     or (visibility='specific_subject' and (year_id is null or year_id=p.academic_year_id) and exists(
       select 1 from subject_academic_years sy join subjects s on s.id=sy.subject_id and s.status='active' and s.archived_at is null
       where sy.academic_year_id=p.academic_year_id and sy.subject_id=subject
     ))
   )
 ))
$$;
drop policy if exists knowledge_documents_read on public.knowledge_documents;
create policy knowledge_documents_read on public.knowledge_documents for select
 using(ai_library_document_allowed(owner_id,subject_id,academic_year_id,semester_id,visibility_scope)
   and (ai_is_worker() or ai_is_admin() or owner_id=ai_user_id() or (is_active and status='ready')));

create table if not exists public.conversation_sources (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 user_id uuid not null references public.app_users(id) on delete cascade,
 document_id uuid not null references public.knowledge_documents(id) on delete restrict,
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(conversation_id,document_id)
);
create index if not exists conversation_sources_user_recent_idx on public.conversation_sources(user_id,updated_at desc);
create index if not exists conversation_sources_active_idx on public.conversation_sources(conversation_id,document_id) where is_active;

create or replace function public.enforce_conversation_source_limit() returns trigger language plpgsql as $$
begin
  if new.is_active and (select count(*) from public.conversation_sources
    where conversation_id=new.conversation_id and is_active and id<>new.id) >= 5 then
    raise exception 'A conversation can have at most 5 active sources';
  end if;
  return new;
end $$;
drop trigger if exists conversation_source_limit on public.conversation_sources;
create trigger conversation_source_limit before insert or update of is_active on public.conversation_sources
 for each row execute function public.enforce_conversation_source_limit();

alter table public.conversation_sources enable row level security;
alter table public.conversation_sources force row level security;
drop policy if exists conversation_sources_owner on public.conversation_sources;
create policy conversation_sources_owner_read on public.conversation_sources for select
 using(user_id=ai_user_id() or ai_is_worker() or ai_is_admin());
create policy conversation_sources_owner_insert on public.conversation_sources for insert
 with check((user_id=ai_user_id() or ai_is_worker() or ai_is_admin())
   and exists(select 1 from public.conversations c where c.id=conversation_id and c.user_id=conversation_sources.user_id)
   and exists(select 1 from public.knowledge_documents d where d.id=document_id and d.owner_id is null
     and d.status='ready' and d.is_active and d.publication_status='published'));
create policy conversation_sources_owner_update on public.conversation_sources for update
 using(user_id=ai_user_id() or ai_is_worker() or ai_is_admin())
 with check((user_id=ai_user_id() or ai_is_worker() or ai_is_admin())
   and exists(select 1 from public.conversations c where c.id=conversation_id and c.user_id=conversation_sources.user_id));
create policy conversation_sources_owner_delete on public.conversation_sources for delete
 using(user_id=ai_user_id() or ai_is_worker() or ai_is_admin());
