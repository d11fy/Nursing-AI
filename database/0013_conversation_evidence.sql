create table if not exists conversation_attachments (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  message_id uuid references messages(id) on delete set null,
  user_id uuid not null references app_users(id) on delete cascade,
  file_path text not null,
  file_type text not null default 'image',
  ordinal integer not null,
  vision_extracted_text text not null default '',
  vision_structured_json jsonb not null default '{}'::jsonb,
  subject_id uuid references subjects(id) on delete set null,
  lecture_id uuid references lectures(id) on delete set null,
  status text not null default 'ready' check (status in ('processing','ready','failed')),
  provider text,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now(),
  unique (conversation_id, ordinal),
  unique (conversation_id, file_path)
);

alter table conversations
  add column if not exists active_attachment_id uuid references conversation_attachments(id) on delete set null,
  add column if not exists active_attachment_section_index integer;

create table if not exists message_ai_traces (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references messages(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  resolved_query text not null,
  detected_subject text,
  active_attachment_id uuid references conversation_attachments(id) on delete set null,
  attachment_ids jsonb not null default '[]'::jsonb,
  retrieved_sources_json jsonb not null default '[]'::jsonb,
  reranked_sources_json jsonb not null default '[]'::jsonb,
  evidence_coverage text not null check (evidence_coverage in ('SUPPORTED','PARTIALLY_SUPPORTED','UNSUPPORTED')),
  selected_provider text,
  selected_model text,
  fallback_used boolean not null default false,
  final_source_ids_json jsonb not null default '[]'::jsonb,
  refusal_reason text,
  diagnostics_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists conversation_attachments_conversation_idx
  on conversation_attachments(conversation_id, ordinal desc);
create index if not exists message_ai_traces_conversation_idx
  on message_ai_traces(conversation_id, created_at desc);
create index if not exists message_ai_traces_created_idx
  on message_ai_traces(created_at desc);
