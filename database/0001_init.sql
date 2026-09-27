-- Plain PostgreSQL 16+; no Supabase or vector extension required.
create table public.app_users (
 id uuid primary key default gen_random_uuid(), email text not null unique, password_hash text not null, created_at timestamptz not null default now()
);
create table public.app_sessions (
 token_hash text primary key, user_id uuid not null references public.app_users(id) on delete cascade, expires_at timestamptz not null
);
create index app_sessions_user_idx on public.app_sessions(user_id);
create index app_sessions_expiry_idx on public.app_sessions(expires_at);
create table public.password_resets (
 token_hash text primary key, user_id uuid not null references public.app_users(id) on delete cascade, expires_at timestamptz not null
);
create table public.auth_attempts (key text primary key, attempts integer not null, expires_at timestamptz not null);
create table public.stored_files (
 path text primary key, bucket text not null check (bucket in ('chat-images','knowledge-documents')),
 owner_id uuid not null references public.app_users(id) on delete cascade, mime_type text not null,
 content bytea not null check (octet_length(content) <= 10485760), created_at timestamptz not null default now()
);
create or replace function public.cosine_similarity(a double precision[], b double precision[])
returns double precision language sql immutable strict as $$
 select sum(x*y) / nullif(sqrt(sum(x*x))*sqrt(sum(y*y)),0) from unnest(a,b) as v(x,y);
$$;
-- Nursing AI — initial schema
-- Extensions



-- =========================================
-- ENUM TYPES
-- =========================================
create type nursing_year as enum ('year1','year2','year3','year4','other');
create type user_role as enum ('student','admin');
create type user_status as enum ('active','suspended');
create type message_role as enum ('user','assistant','system');
create type source_type as enum ('book','lecture','notes','questions','reference');
create type document_status as enum ('uploading','processing','ready','failed');
create type subject_status as enum ('active','inactive');
create type usage_type as enum ('chat','vision','embedding');
create type feedback_reason as enum ('unclear','inaccurate','too_long','missed_question','other');

-- =========================================
-- PROFILES (extends public.app_users)
-- =========================================
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.app_users(id) on delete cascade,
  full_name text not null,
  email text not null,
  university text,
  nursing_year nursing_year not null default 'other',
  role user_role not null default 'student',
  status user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_user_id_idx on public.profiles(user_id);
create index profiles_role_idx on public.profiles(role);

-- =========================================
-- SUBJECTS
-- =========================================
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  name_en text not null unique,
  description text,
  status subject_status not null default 'active',
  created_at timestamptz not null default now()
);

-- =========================================
-- CONVERSATIONS
-- =========================================
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  title text not null default 'محادثة جديدة',
  subject_id uuid references public.subjects(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_user_id_idx on public.conversations(user_id);

-- =========================================
-- MESSAGES
-- =========================================
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role message_role not null,
  content text not null,
  image_url text,
  tokens_input integer default 0,
  tokens_output integer default 0,
  model text,
  created_at timestamptz not null default now()
);

create index messages_conversation_id_idx on public.messages(conversation_id);

-- =========================================
-- MESSAGE FEEDBACK
-- =========================================
create table public.message_feedback (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  is_positive boolean not null,
  reason feedback_reason,
  comment text,
  created_at timestamptz not null default now()
);

create index message_feedback_message_id_idx on public.message_feedback(message_id);

-- =========================================
-- DOCUMENTS (Knowledge Base)
-- =========================================
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  file_url text not null,
  file_name text not null,
  file_size bigint,
  subject_id uuid references public.subjects(id) on delete set null,
  source_type source_type not null default 'reference',
  status document_status not null default 'uploading',
  vector_store_id text,
  file_id text,
  chunk_count integer not null default 0,
  error_message text,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index documents_subject_id_idx on public.documents(subject_id);
create index documents_status_idx on public.documents(status);

-- =========================================
-- DOCUMENT CHUNKS (RAG)
-- =========================================
create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  content text not null,
  embedding double precision[] check (embedding is null or cardinality(embedding) = 1536),
  chapter text,
  page_number integer,
  chunk_index integer not null,
  created_at timestamptz not null default now()
);

create index document_chunks_document_id_idx on public.document_chunks(document_id);
create index document_chunks_subject_id_idx on public.document_chunks(subject_id);
-- similarity search RPC
create or replace function public.match_document_chunks(
  query_embedding double precision[],
  match_subject_id uuid default null,
  match_count int default 5
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  chapter text,
  page_number int,
  similarity float
)
language sql stable
as $$
  select
    dc.id,
    dc.document_id,
    dc.content,
    dc.chapter,
    dc.page_number,
    public.cosine_similarity(dc.embedding, query_embedding) as similarity
  from public.document_chunks dc
  where (match_subject_id is null or dc.subject_id = match_subject_id)
    and exists (select 1 from public.documents d where d.id=dc.document_id and d.status='ready')
  order by similarity desc nulls last
  limit match_count;
$$;

-- =========================================
-- USAGE LOGS
-- =========================================
create table public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  type usage_type not null default 'chat',
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost numeric(10,6) not null default 0,
  created_at timestamptz not null default now()
);

create index usage_logs_user_id_created_at_idx on public.usage_logs(user_id, created_at);

-- =========================================
-- SETTINGS (key-value, admin editable)
-- =========================================
create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.settings (key, value) values
  ('free_daily_limit', '20'),
  ('rate_limit_seconds', '3'),
  ('max_image_size_mb', '8');

-- =========================================
-- updated_at triggers
-- =========================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_conversations_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();

-- =========================================
-- Auto-create a profile row when a new auth user signs up.
-- Reads full_name / university / nursing_year from the signUp() metadata
-- (options.data) so the client never has to insert into `profiles`
-- directly under RLS timing constraints (e.g. before email confirmation).
-- =========================================


-- =========================================
-- Helper: is_admin()
-- =========================================
create or replace function public.is_admin()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = nullif(current_setting('app.user_id', true), '')::uuid and role = 'admin' and status = 'active'
  );
$$;

-- =========================================
-- Helper: today's usage count for a user
-- =========================================
create or replace function public.get_today_usage_count(p_user_id uuid)
returns integer
language sql stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.usage_logs
  where user_id = p_user_id
    and type in ('chat','vision')
    and created_at >= date_trunc('day', now())
    and created_at < date_trunc('day', now()) + interval '1 day';
$$;

-- =========================================
-- Admin dashboard aggregates.
-- security definer + explicit is_admin() guard: these summarize data
-- across ALL students, which must never be reachable by a student caller.
-- =========================================
create or replace function public.admin_dashboard_stats()
returns table (
  total_students bigint,
  active_students bigint,
  questions_today bigint,
  questions_month bigint,
  images_uploaded bigint,
  cost_today numeric,
  cost_month numeric
)
language plpgsql stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  return query
  select
    (select count(*) from public.profiles where role = 'student'),
    (select count(*) from public.profiles where role = 'student' and status = 'active'),
    (select count(*) from public.usage_logs
      where created_at >= date_trunc('day', now())),
    (select count(*) from public.usage_logs
      where created_at >= date_trunc('month', now())),
    (select count(*) from public.usage_logs where type = 'vision'),
    (select coalesce(sum(estimated_cost), 0) from public.usage_logs
      where created_at >= date_trunc('day', now())),
    (select coalesce(sum(estimated_cost), 0) from public.usage_logs
      where created_at >= date_trunc('month', now()));
end;
$$;

create or replace function public.admin_usage_last_7_days()
returns table (day date, questions_count bigint, cost numeric)
language plpgsql stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  return query
  select
    d::date as day,
    coalesce(count(u.id), 0) as questions_count,
    coalesce(sum(u.estimated_cost), 0) as cost
  from generate_series(
    date_trunc('day', now()) - interval '6 days',
    date_trunc('day', now()),
    interval '1 day'
  ) as d
  left join public.usage_logs u
    on date_trunc('day', u.created_at) = d
  group by d
  order by d;
end;
$$;

create or replace function public.admin_list_students()
returns table (
  user_id uuid,
  full_name text,
  email text,
  university text,
  nursing_year nursing_year,
  status user_status,
  created_at timestamptz,
  questions_count bigint,
  last_activity timestamptz
)
language plpgsql stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  return query
  select
    p.user_id,
    p.full_name,
    p.email,
    p.university,
    p.nursing_year,
    p.status,
    p.created_at,
    coalesce(u.questions_count, 0),
    u.last_activity
  from public.profiles p
  left join (
    select
      log.user_id,
      count(*) as questions_count,
      max(log.created_at) as last_activity
    from public.usage_logs log
    group by log.user_id
  ) u on u.user_id = p.user_id
  where p.role = 'student'
  order by p.created_at desc;
end;
$$;
