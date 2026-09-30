-- Additive rollout. Originals, users, academic data and legacy indexes survive rollback.
create extension if not exists vector;
alter table documents add column if not exists source_priority integer;

create table knowledge_documents (
 id uuid primary key default gen_random_uuid(),
 legacy_document_id uuid unique references documents(id) on delete cascade,
 lecture_id uuid unique references lectures(id) on delete cascade,
 owner_id uuid references app_users(id) on delete cascade,
 title text not null, original_file_name text not null, storage_path text not null,
 subject_id uuid references subjects(id) on delete set null,
 academic_year_id uuid references academic_years(id) on delete set null,
 semester_id integer check(semester_id in (1,2)),
 source_type text not null check(source_type in ('university_lecture','doctor_slides','official_course_material','required_textbook','lab_manual','exam_questions','approved_notes','student_private_file')),
 source_priority integer not null default 70 check(source_priority between 0 and 100),
 language text, edition text, is_active boolean not null default false,
 status text not null default 'uploaded' check(status in ('uploaded','extracting','processing','chunking','embedding','ready','failed','needs_review')),
 file_hash text, file_size bigint, page_count integer not null default 0,
 extracted_text_length integer not null default 0, extracted_pages_json jsonb not null default '[]',
 chunk_count integer not null default 0, embedding_count integer not null default 0,
 index_version integer not null default 0, processing_time_ms integer, error_message text,
 uploaded_by uuid references app_users(id) on delete set null,
 created_at timestamptz not null default now(), processed_at timestamptz, updated_at timestamptz not null default now(),
 check((source_type='student_private_file') = (owner_id is not null)),
 check(status<>'ready' or (extracted_text_length>0 and chunk_count>0 and embedding_count=chunk_count))
);
create index knowledge_documents_scope on knowledge_documents(owner_id,subject_id,status) where is_active;
create table knowledge_chunks (
 id uuid primary key default gen_random_uuid(), document_id uuid not null references knowledge_documents(id) on delete cascade,
 subject_id uuid references subjects(id) on delete set null,
 academic_year_id uuid references academic_years(id) on delete set null, semester_id integer,
 source_type text not null, source_priority integer not null,
 chapter text, section text, heading text, page_number integer,
 chunk_index integer not null, content text not null, content_hash text not null,
 embedding vector(1536) not null, embedding_model text not null default 'text-embedding-3-small',
 token_count integer not null,
 search_vector tsvector generated always as (to_tsvector('simple',coalesce(heading,'') || ' ' || content)) stored,
 created_at timestamptz not null default now(), unique(document_id,chunk_index)
);
create index knowledge_chunks_vector on knowledge_chunks using hnsw(embedding vector_cosine_ops);
create index knowledge_chunks_fts on knowledge_chunks using gin(search_vector);
create index knowledge_chunks_document on knowledge_chunks(document_id,chunk_index);

-- Cache is owner-partitioned: private text cannot be found through a shared hash query.
create table knowledge_embedding_cache (
 scope_key text not null, content_hash text not null, model text not null,
 embedding vector(1536) not null, token_count integer not null, created_at timestamptz not null default now(),
 primary key(scope_key,content_hash,model)
);
create table knowledge_jobs (
 document_id uuid primary key references knowledge_documents(id) on delete cascade,
 status text not null default 'queued' check(status in ('queued','running','done','failed')),
 attempts integer not null default 0, available_at timestamptz not null default now(),
 lease_until timestamptz, error_message text, updated_at timestamptz not null default now()
);

insert into knowledge_documents(legacy_document_id,title,original_file_name,storage_path,subject_id,academic_year_id,semester_id,
 source_type,source_priority,file_hash,file_size,uploaded_by,created_at)
select id,title,file_name,file_url,subject_id,academic_year_id,semester,
 case upper(source_type) when 'BOOK' then 'required_textbook' when 'REFERENCE' then 'required_textbook'
 when 'DOCTOR_SLIDES' then 'doctor_slides' when 'UNIVERSITY_LECTURE' then 'university_lecture'
 when 'LECTURE' then 'university_lecture' when 'LAB_MATERIAL' then 'lab_manual'
 when 'PAST_EXAM' then 'exam_questions' when 'QUESTION_BANK' then 'exam_questions' when 'QUESTIONS' then 'exam_questions'
 when 'OFFICIAL_COURSE_MATERIAL' then 'official_course_material'
 when 'REQUIRED_TEXTBOOK' then 'required_textbook' when 'LAB_MANUAL' then 'lab_manual'
 when 'EXAM_QUESTIONS' then 'exam_questions' else 'approved_notes' end,
 case upper(source_type) when 'DOCTOR_SLIDES' then 100 when 'LECTURE' then 98 when 'UNIVERSITY_LECTURE' then 98
 when 'BOOK' then 90 when 'REFERENCE' then 90 when 'LAB_MATERIAL' then 85 else 70 end,
 file_hash,file_size,created_by,created_at from documents on conflict(legacy_document_id) do nothing;
insert into knowledge_documents(lecture_id,owner_id,title,original_file_name,storage_path,subject_id,source_type,source_priority,file_hash,file_size,uploaded_by,created_at,is_active)
select id,user_id,title,original_file_name,storage_path,subject_id,'student_private_file',100,file_hash,file_size_bytes,user_id,created_at,true
from lectures on conflict(lecture_id) do nothing;
-- Jobs are deliberately not enqueued here: re-extraction is an explicit, cost-bearing rollout step.

create table conversation_summaries (
 conversation_id uuid primary key references conversations(id) on delete cascade,
 user_id uuid not null references app_users(id) on delete cascade,
 summary text not null default '', current_subject_id uuid references subjects(id) on delete set null,
 current_document_id uuid references knowledge_documents(id) on delete set null,
 current_attachment_id uuid references conversation_attachments(id) on delete set null,
 current_topic text, pending_quiz_json jsonb, last_summarized_message_id uuid references messages(id) on delete set null,
 turns_since_summary integer not null default 0, updated_at timestamptz not null default now()
);
create table learning_events (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references app_users(id) on delete cascade,
 conversation_id uuid references conversations(id) on delete cascade, message_id uuid unique references messages(id) on delete cascade,
 subject_id uuid references subjects(id) on delete set null, topic text not null,
 event_type text not null check(event_type in ('topic_studied','quiz_correct','quiz_incorrect','flashcard_miss','goal','preference')),
 result boolean, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
alter table student_memory add column if not exists generation integer not null default 1;
alter table student_topic_progress add column if not exists generation integer not null default 1;
alter table conversation_attachments add column if not exists content_hash text;
alter table conversation_attachments add column if not exists cached_input_tokens integer not null default 0;
alter table conversation_attachments add column if not exists analysis_version integer not null default 1;
alter table messages add column if not exists answer_origin text;
alter table messages add column if not exists source_ids jsonb not null default '[]';
alter table usage_logs add column if not exists cached_input_tokens integer not null default 0;
alter table usage_logs add column if not exists reasoning_effort text;
alter table usage_logs add column if not exists pricing_version text;
alter table usage_logs alter column estimated_cost type numeric(16,9);
alter table generated_study_content add column if not exists content_hash text;
alter table generated_study_content add column if not exists generation integer not null default 1;
alter table question_sources add column if not exists knowledge_chunk_id uuid references knowledge_chunks(id) on delete set null;
alter table summary_knowledge_points add column if not exists knowledge_chunk_id uuid references knowledge_chunks(id) on delete set null;
alter table exams add column if not exists processing_hash text;
alter table message_feedback add column if not exists subject_id uuid references subjects(id) on delete set null;
alter table message_feedback add column if not exists answer_origin text;
alter table message_feedback add column if not exists source_ids jsonb not null default '[]';
create table curriculum_gaps (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references app_users(id) on delete cascade,
 message_id uuid unique references messages(id) on delete cascade, subject_id uuid references subjects(id) on delete set null,
 topic text not null, question text not null, reason text not null check(reason in ('general_knowledge','clarification')),
 created_at timestamptz not null default now()
);
create index learning_events_user on learning_events(user_id,created_at desc);
create index curriculum_gaps_subject on curriculum_gaps(subject_id,topic);

-- Identity is transaction-local and supplied by authenticated server code, never request JSON.
create function ai_user_id() returns uuid language sql stable as $$
 select nullif(current_setting('app.user_id',true),'')::uuid
$$;
create function ai_is_admin() returns boolean language sql stable as $$
 select exists(select 1 from profiles where user_id=ai_user_id() and role='admin' and status='active')
$$;
create function ai_is_worker() returns boolean language sql stable as $$
 select coalesce(current_setting('app.ai_worker',true),'')='on'
$$;
create function ai_document_allowed(owner uuid,subject uuid,year_id uuid,semester integer) returns boolean language sql stable as $$
 select ai_is_worker() or ai_is_admin() or (owner=ai_user_id()) or
 (owner is null and exists(select 1 from profiles p join subject_academic_years sy on sy.academic_year_id=p.academic_year_id
 join academic_years y on y.id=p.academic_year_id and y.is_active
 join subjects s on s.id=sy.subject_id and s.status='active' and s.archived_at is null
 where p.user_id=ai_user_id() and p.status='active' and sy.subject_id=subject
 and (year_id is null or year_id=p.academic_year_id)))
$$;
alter table knowledge_documents enable row level security;
alter table knowledge_documents force row level security;
create policy knowledge_documents_read on knowledge_documents for select using(ai_document_allowed(owner_id,subject_id,academic_year_id,semester_id)
 and (ai_is_worker() or ai_is_admin() or owner_id=ai_user_id() or (is_active and status='ready')));
create policy knowledge_documents_write on knowledge_documents for all using(ai_is_worker() or ai_is_admin()) with check(ai_is_worker() or ai_is_admin());
alter table knowledge_chunks enable row level security;
alter table knowledge_chunks force row level security;
create policy knowledge_chunks_read on knowledge_chunks for select using(exists(select 1 from knowledge_documents d where d.id=document_id));
create policy knowledge_chunks_write on knowledge_chunks for all using(ai_is_worker() or ai_is_admin()) with check(ai_is_worker() or ai_is_admin());
alter table knowledge_embedding_cache enable row level security;
alter table knowledge_embedding_cache force row level security;
create policy cache_worker on knowledge_embedding_cache for all using(ai_is_worker()) with check(ai_is_worker());
alter table knowledge_jobs enable row level security;
alter table knowledge_jobs force row level security;
create policy jobs_worker on knowledge_jobs for all using(ai_is_worker() or ai_is_admin()) with check(ai_is_worker() or ai_is_admin());
alter table conversation_summaries enable row level security;
alter table conversation_summaries force row level security;
create policy summary_owner on conversation_summaries for all using(user_id=ai_user_id() or ai_is_worker() or ai_is_admin())
 with check((user_id=ai_user_id() or ai_is_worker() or ai_is_admin()) and exists(select 1 from conversations c where c.id=conversation_id and c.user_id=conversation_summaries.user_id));
alter table learning_events enable row level security;
alter table learning_events force row level security;
create policy learning_owner on learning_events for all using(user_id=ai_user_id() or ai_is_worker() or ai_is_admin()) with check(user_id=ai_user_id() or ai_is_worker() or ai_is_admin());
alter table curriculum_gaps enable row level security;
alter table curriculum_gaps force row level security;
create policy gaps_owner on curriculum_gaps for all using(user_id=ai_user_id() or ai_is_worker() or ai_is_admin()) with check(user_id=ai_user_id() or ai_is_worker() or ai_is_admin());
-- Existing private attachment reads/writes are upgraded to scoped transactions by the new server path.
alter table conversation_attachments enable row level security;
alter table conversation_attachments force row level security;
create policy attachment_owner on conversation_attachments for all using(user_id=ai_user_id() or ai_is_worker() or ai_is_admin())
 with check((user_id=ai_user_id() or ai_is_worker() or ai_is_admin()) and exists(select 1 from conversations c where c.id=conversation_id and c.user_id=conversation_attachments.user_id));

alter table conversations enable row level security;
alter table conversations force row level security;
create policy conversation_owner on conversations for all using(user_id=ai_user_id() or ai_is_worker() or ai_is_admin())
 with check(user_id=ai_user_id() or ai_is_worker() or ai_is_admin());
alter table messages enable row level security;
alter table messages force row level security;
create policy message_owner on messages for all using(ai_is_worker() or ai_is_admin() or exists(select 1 from conversations c where c.id=conversation_id and c.user_id=ai_user_id()))
 with check(ai_is_worker() or ai_is_admin() or exists(select 1 from conversations c where c.id=conversation_id and c.user_id=ai_user_id()));
alter table student_memory enable row level security;
alter table student_memory force row level security;
create policy memory_owner on student_memory for all using(user_id=ai_user_id() or ai_is_worker() or ai_is_admin()) with check(user_id=ai_user_id() or ai_is_worker() or ai_is_admin());
alter table student_topic_progress enable row level security;
alter table student_topic_progress force row level security;
create policy progress_owner on student_topic_progress for all using(user_id=ai_user_id() or ai_is_worker() or ai_is_admin()) with check(user_id=ai_user_id() or ai_is_worker() or ai_is_admin());
create index attachment_hash_owner on conversation_attachments(user_id,content_hash) where status='ready' and analysis_version=2;

create table knowledge_study_cache (
 user_id uuid not null references app_users(id) on delete cascade,
 content_hash text not null, content_json jsonb not null, created_at timestamptz not null default now(),
 primary key(user_id,content_hash)
);
alter table knowledge_study_cache enable row level security;
alter table knowledge_study_cache force row level security;
create policy study_cache_owner on knowledge_study_cache for all using(user_id=ai_user_id() or ai_is_worker() or ai_is_admin()) with check(user_id=ai_user_id() or ai_is_worker() or ai_is_admin());
alter table generated_study_content enable row level security;
alter table generated_study_content force row level security;
create policy study_content_owner on generated_study_content for all using(user_id=ai_user_id() or ai_is_worker() or ai_is_admin()) with check(user_id=ai_user_id() or ai_is_worker() or ai_is_admin());

create table knowledge_exam_jobs (
 exam_id uuid primary key references exams(id) on delete cascade,
 status text not null default 'queued' check(status in ('queued','running','done','failed')),
 attempts integer not null default 0,available_at timestamptz not null default now(),lease_until timestamptz,error_message text
);
alter table knowledge_exam_jobs enable row level security;
alter table knowledge_exam_jobs force row level security;
create policy exam_jobs_worker on knowledge_exam_jobs for all using(ai_is_worker() or ai_is_admin()) with check(ai_is_worker() or ai_is_admin());

create table knowledge_vision_cache (
 user_id uuid not null references app_users(id) on delete cascade,content_hash text not null,text text not null,
 version integer not null,created_at timestamptz not null default now(),primary key(user_id,content_hash,version)
);
alter table knowledge_vision_cache enable row level security;
alter table knowledge_vision_cache force row level security;
create policy vision_cache_owner on knowledge_vision_cache for all using(user_id=ai_user_id() or ai_is_worker() or ai_is_admin()) with check(user_id=ai_user_id() or ai_is_worker() or ai_is_admin());

alter table message_ai_traces enable row level security;
alter table message_ai_traces force row level security;
create policy trace_owner on message_ai_traces for all using(user_id=ai_user_id() or ai_is_worker() or ai_is_admin())
 with check((user_id=ai_user_id() or ai_is_worker() or ai_is_admin()) and exists(select 1 from conversations c where c.id=conversation_id and c.user_id=message_ai_traces.user_id));

alter table lectures enable row level security;
alter table lectures force row level security;
create policy lecture_owner on lectures for all using(user_id=ai_user_id() or ai_is_worker() or ai_is_admin()) with check(user_id=ai_user_id() or ai_is_worker() or ai_is_admin());
alter table lecture_chunks enable row level security;
alter table lecture_chunks force row level security;
create policy lecture_chunk_owner on lecture_chunks for all using(user_id=ai_user_id() or ai_is_worker() or ai_is_admin()) with check(user_id=ai_user_id() or ai_is_worker() or ai_is_admin());
alter table stored_files enable row level security;
alter table stored_files force row level security;
create policy stored_file_owner on stored_files for all using(owner_id=ai_user_id() or ai_is_worker() or ai_is_admin()) with check(owner_id=ai_user_id() or ai_is_worker() or ai_is_admin());
