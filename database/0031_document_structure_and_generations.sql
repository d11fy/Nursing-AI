-- Additive migration: book structure (chapters/sections), chapter-aware chunks,
-- per-conversation study position and server-side chat generations.
-- Existing documents keep working: structure columns stay empty until a rebuild
-- (lazy on first chapter request, or `npm run knowledge:restructure`).
--
-- Safety: everything below is additive (new nullable/defaulted columns, one new table,
-- two indexes). No existing column is rewritten, retyped or dropped, and the migration
-- runs inside the runner's single transaction, so a failure leaves nothing behind.
-- lock_timeout makes it fail fast instead of queueing behind a long-running query and
-- blocking the application; just run `npm run db:migrate` again when the database is quiet.
-- The two index builds briefly block writes to knowledge_chunks / messages (seconds).
-- Manual rollback: database/rollback/0031_rollback.sql (stop the new application build first).
set local lock_timeout = '15s';

alter table knowledge_documents
  add column if not exists outline_json jsonb,
  add column if not exists structure_version integer not null default 0,
  add column if not exists structure_confidence text,
  add column if not exists structure_method text,
  add column if not exists chapter_count integer not null default 0,
  add column if not exists section_count integer not null default 0;

alter table knowledge_chunks
  add column if not exists chapter_index integer,
  add column if not exists chapter_number integer,
  add column if not exists chapter_title text,
  add column if not exists section_title text,
  add column if not exists subsection_title text,
  add column if not exists slide_number integer;
create index if not exists knowledge_chunks_chapter on knowledge_chunks(document_id, chapter_index, chunk_index);

-- The student's place in the book, kept on the server so it survives app restarts and device changes.
alter table conversation_summaries
  add column if not exists current_chapter_index integer,
  add column if not exists current_chapter_number integer,
  add column if not exists current_chapter_title text,
  add column if not exists current_section_title text,
  add column if not exists current_part integer,
  add column if not exists total_parts integer,
  add column if not exists current_position integer,
  add column if not exists study_mode text,
  add column if not exists study_updated_at timestamptz;

-- One row per question: the server, not the phone, is the source of truth for the answer.
create table chat_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  request_id uuid not null,
  status text not null default 'pending' check(status in ('pending','streaming','completed','failed','cancelled')),
  user_message_id uuid references messages(id) on delete set null,
  assistant_message_id uuid references messages(id) on delete set null,
  error_code text,
  attempts integer not null default 1,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, request_id)
);
create index chat_generations_conversation on chat_generations(conversation_id, created_at desc);
create index chat_generations_open on chat_generations(updated_at) where status in ('pending','streaming');
alter table chat_generations enable row level security;
alter table chat_generations force row level security;
create policy generation_owner on chat_generations for all
  using(user_id=ai_user_id() or ai_is_worker() or ai_is_admin())
  with check((user_id=ai_user_id() or ai_is_worker() or ai_is_admin())
    and exists(select 1 from conversations c where c.id=conversation_id and c.user_id=chat_generations.user_id));

-- An assistant message belongs to at most one generation, so a retry can never save a second answer.
alter table messages add column if not exists generation_id uuid;
create unique index if not exists messages_generation_unique on messages(generation_id) where generation_id is not null;
