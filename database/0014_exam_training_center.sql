-- =========================================
-- 0014: EXAM TRAINING CENTER & KNOWLEDGE AGGREGATION
-- Safe, additive migration without data loss
-- =========================================

-- 1. Extend documents table for comprehensive curriculum & exam metadata
alter table public.documents
  add column if not exists academic_year_id uuid references public.academic_years(id) on delete set null,
  add column if not exists semester integer check (semester is null or semester in (1, 2)),
  add column if not exists exam_year integer,
  add column if not exists doctor_name text,
  add column if not exists exam_type text,
  add column if not exists notes text,
  add column if not exists file_hash text,
  add column if not exists content_hash text,
  add column if not exists processing_version integer not null default 1;

-- Widen source_type on documents to text to support all 9 standard source types safely
alter table public.documents alter column source_type type text;

-- Allow upload sessions to store extended metadata
alter table public.knowledge_upload_sessions
  add column if not exists metadata_json jsonb default '{}'::jsonb;

create index if not exists documents_file_hash_idx on public.documents(file_hash) where file_hash is not null;
create index if not exists documents_source_type_idx on public.documents(source_type);

-- 2. Exams Table (Uploaded Past Exams & Question Banks)
create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  title text not null,
  exam_year integer,
  semester integer check (semester is null or semester in (1, 2)),
  exam_type text not null default 'PAST_EXAM', -- PAST_EXAM, QUESTION_BANK, MIDTERM, FINAL, QUIZ
  doctor_name text,
  document_id uuid references public.documents(id) on delete set null,
  status text not null default 'UPLOADED' check (status in ('UPLOADED','EXTRACTING','PROCESSING','VERIFYING','READY','FAILED')),
  total_questions integer not null default 0,
  verified_questions integer not null default 0,
  needs_review_questions integer not null default 0,
  conflict_questions integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists exams_subject_id_idx on public.exams(subject_id);
create index if not exists exams_status_idx on public.exams(status);
create index if not exists exams_exam_year_idx on public.exams(exam_year);

create trigger set_exams_updated_at before update on public.exams
  for each row execute function public.set_updated_at();

-- 3. Exam Questions Table
create table if not exists public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references public.exams(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  question_text text not null,
  question_type text not null default 'MCQ' check (question_type in (
    'MCQ','TRUE_FALSE','SHORT_ANSWER','ESSAY','SATA','MATCHING','CASE_STUDY','CALCULATION','PRIORITY','UNKNOWN'
  )),
  options_json jsonb not null default '[]'::jsonb,
  correct_answer_json jsonb,
  extracted_answer text,
  explanation text,
  topic text not null default 'General',
  subtopic text,
  difficulty text not null default 'MEDIUM' check (difficulty in ('EASY','MEDIUM','HARD')),
  difficulty_estimate numeric(3,2) not null default 0.50,
  status text not null default 'EXTRACTED' check (status in (
    'EXTRACTED','VERIFIED','NEEDS_REVIEW','CONFLICT','REJECTED'
  )),
  confidence numeric(3,2) not null default 0.50,
  page_number integer,
  source_document_id uuid references public.documents(id) on delete set null,
  question_number integer,
  review_notes text,
  reviewed_by uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists exam_questions_exam_id_idx on public.exam_questions(exam_id);
create index if not exists exam_questions_subject_id_idx on public.exam_questions(subject_id);
create index if not exists exam_questions_status_idx on public.exam_questions(status);
create index if not exists exam_questions_topic_idx on public.exam_questions(subject_id, topic);
create index if not exists exam_questions_type_idx on public.exam_questions(question_type);

create trigger set_exam_questions_updated_at before update on public.exam_questions
  for each row execute function public.set_updated_at();

-- 4. Question Sources & Evidence Table
create table if not exists public.question_sources (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.exam_questions(id) on delete cascade,
  document_id uuid references public.documents(id) on delete cascade,
  chunk_id uuid references public.document_chunks(id) on delete set null,
  page_number integer,
  quote text,
  support_type text not null default 'DIRECT' check (support_type in ('DIRECT','SUPPORTING','CONFLICTING')),
  source_priority integer not null default 50,
  created_at timestamptz not null default now()
);

create index if not exists question_sources_question_idx on public.question_sources(question_id);
create index if not exists question_sources_doc_idx on public.question_sources(document_id);
create index if not exists question_sources_chunk_idx on public.question_sources(chunk_id);

-- 5. Question Clusters (Detect and track duplicates/recurrent concepts across exam years)
create table if not exists public.question_clusters (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  topic text not null,
  canonical_question text not null,
  cluster_summary text,
  occurrences_count integer not null default 1,
  exam_years_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists question_clusters_subject_topic_idx on public.question_clusters(subject_id, topic);

create trigger set_question_clusters_updated_at before update on public.question_clusters
  for each row execute function public.set_updated_at();

create table if not exists public.question_cluster_members (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.question_clusters(id) on delete cascade,
  question_id uuid not null references public.exam_questions(id) on delete cascade,
  similarity numeric(4,3) not null default 1.000,
  created_at timestamptz not null default now(),
  unique(cluster_id, question_id)
);

create index if not exists question_cluster_members_cluster_idx on public.question_cluster_members(cluster_id);
create index if not exists question_cluster_members_question_idx on public.question_cluster_members(question_id);

-- 6. Exam Topic Statistics Table (Pre-calculated deterministic exam pattern analytics)
create table if not exists public.exam_topic_stats (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  topic text not null,
  exam_count integer not null default 0,
  total_exams integer not null default 0,
  question_count integer not null default 0,
  frequency numeric(5,2) not null default 0.00,
  common_question_types_json jsonb not null default '[]'::jsonb,
  avg_difficulty numeric(3,2) not null default 0.50,
  updated_at timestamptz not null default now(),
  unique(subject_id, topic)
);

create index if not exists exam_topic_stats_subject_freq_idx on public.exam_topic_stats(subject_id, frequency desc);

create trigger set_exam_topic_stats_updated_at before update on public.exam_topic_stats
  for each row execute function public.set_updated_at();

-- 7. Summary Knowledge Points Table (Extracted structured points from summaries)
create table if not exists public.summary_knowledge_points (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  point_type text not null check (point_type in ('topic','key_point','definition','important_term','table_summary','list_item')),
  topic text not null,
  content text not null,
  verification_status text not null default 'UNVERIFIED' check (verification_status in ('VERIFIED','SUPPORTED','UNVERIFIED','CONFLICTING')),
  verified_by_chunk_id uuid references public.document_chunks(id) on delete set null,
  page_number integer,
  created_at timestamptz not null default now()
);

create index if not exists summary_points_subject_idx on public.summary_knowledge_points(subject_id);
create index if not exists summary_points_doc_idx on public.summary_knowledge_points(document_id);
create index if not exists summary_points_status_idx on public.summary_knowledge_points(verification_status);

-- 8. Exam Audit Logs Table
create table if not exists public.exam_audit_logs (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references public.subjects(id) on delete set null,
  exam_id uuid references public.exams(id) on delete set null,
  question_id uuid references public.exam_questions(id) on delete set null,
  user_id uuid references public.app_users(id) on delete set null,
  event_type text not null check (event_type in (
    'EXAM_UPLOADED','QUESTION_EXTRACTED','QUESTION_VERIFIED','QUESTION_EDITED','QUESTION_APPROVED','QUESTION_REJECTED','CONFLICT_DETECTED'
  )),
  details_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists exam_audit_logs_event_idx on public.exam_audit_logs(event_type, created_at desc);
create index if not exists exam_audit_logs_subject_idx on public.exam_audit_logs(subject_id, created_at desc);

-- 9. Student Exam Practice & Attempts Tables
create table if not exists public.student_exam_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  exam_id uuid references public.exams(id) on delete set null,
  mode text not null check (mode in ('STUDY','EXAM')),
  practice_type text not null default 'PAST_EXAM' check (practice_type in ('PAST_EXAM','UNIVERSITY_STYLE','MIXED')),
  total_questions integer not null default 0,
  answered_questions integer not null default 0,
  correct_answers integer not null default 0,
  wrong_answers integer not null default 0,
  score_percentage numeric(5,2) not null default 0.00,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists student_exam_attempts_user_sub_idx on public.student_exam_attempts(user_id, subject_id, created_at desc);

create table if not exists public.student_exam_attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.student_exam_attempts(id) on delete cascade,
  question_id uuid references public.exam_questions(id) on delete set null,
  selected_answer jsonb,
  is_correct boolean,
  topic text,
  created_at timestamptz not null default now()
);

create index if not exists student_attempt_answers_idx on public.student_exam_attempt_answers(attempt_id);
