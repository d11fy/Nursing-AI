create table if not exists public.student_memory (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
  memory_type text not null check (memory_type in ('profile','preference','learning','session')),
  memory_key text not null, memory_value_json jsonb not null default '{}'::jsonb, importance integer not null default 1,
  last_used_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id,memory_type,memory_key)
);
create index if not exists student_memory_user_idx on public.student_memory(user_id,memory_type);
create table if not exists public.student_topic_progress (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null, topic_key text not null, topic_name text not null,
  questions_answered integer not null default 0, correct_answers integer not null default 0, wrong_answers integer not null default 0,
  mastery_score numeric(5,2) not null default 0, last_studied_at timestamptz, next_review_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,subject_id,topic_key)
);
create index if not exists student_topic_progress_user_idx on public.student_topic_progress(user_id,mastery_score);
create table if not exists public.student_learning_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null, lecture_id uuid references public.lectures(id) on delete set null,
  event_type text not null, topic_key text, metadata_json jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists student_learning_events_user_idx on public.student_learning_events(user_id,created_at desc);
create table if not exists public.conversation_memory (
  conversation_id uuid primary key references public.conversations(id) on delete cascade, user_id uuid not null references public.app_users(id) on delete cascade,
  summary text not null default '', current_subject_id uuid references public.subjects(id) on delete set null,
  current_lecture_id uuid references public.lectures(id) on delete set null, current_topics_json jsonb not null default '[]'::jsonb, updated_at timestamptz not null default now()
);
create index if not exists conversation_memory_user_idx on public.conversation_memory(user_id);
create table if not exists public.unanswered_questions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null, lecture_id uuid references public.lectures(id) on delete set null,
  question text not null, reason text not null check (reason in ('NO_SOURCE','LOW_CONFIDENCE','OUTSIDE_CURRICULUM','NON_NURSING')), created_at timestamptz not null default now()
);
create index if not exists unanswered_questions_created_idx on public.unanswered_questions(created_at desc);
do $$ declare t text; begin foreach t in array array['student_memory','student_topic_progress','conversation_memory'] loop execute format('drop trigger if exists %I_updated_at on public.%I',t,t); execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()',t,t); end loop; end $$;
