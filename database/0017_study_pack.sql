-- ============================================================================
-- 0017_study_pack.sql: Production-Grade Study Pack Feature
-- Additive migration for Study Packs, Content, Flashcards, Quizzes, Progress,
-- Attempts, and Mistake Tracking for future Weak Topics analysis.
-- ============================================================================

-- 1. Study Packs Table
create table if not exists public.study_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  document_id uuid references public.knowledge_documents(id) on delete set null,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  title text not null,
  status text not null default 'ready' check (status in ('processing', 'ready', 'failed')),
  source_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(lecture_id)
);

create index if not exists study_packs_user_id_idx on public.study_packs(user_id);
create index if not exists study_packs_subject_id_idx on public.study_packs(subject_id);
create index if not exists study_packs_lecture_id_idx on public.study_packs(lecture_id);

-- 2. Study Pack Content Table (Summary & Key Points)
create table if not exists public.study_pack_content (
  id uuid primary key default gen_random_uuid(),
  study_pack_id uuid not null references public.study_packs(id) on delete cascade,
  content_type text not null check (content_type in ('summary', 'key_points')),
  content_json jsonb not null,
  source_hash text not null,
  generation_status text not null default 'ready' check (generation_status in ('not_generated', 'generating', 'ready', 'failed', 'outdated')),
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(study_pack_id, content_type)
);

create index if not exists study_pack_content_pack_idx on public.study_pack_content(study_pack_id, content_type);

-- 3. Study Pack Flashcards Table
create table if not exists public.study_pack_flashcards (
  id uuid primary key default gen_random_uuid(),
  study_pack_id uuid not null references public.study_packs(id) on delete cascade,
  front text not null,
  back text not null,
  card_type text check (card_type is null or card_type in ('definition', 'concept', 'signs_symptoms', 'causes', 'interventions', 'comparison', 'terminology', 'important_fact')),
  explanation text,
  source_reference text,
  topic text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists study_pack_flashcards_pack_idx on public.study_pack_flashcards(study_pack_id, sort_order);

-- 4. Study Pack Quizzes Table
create table if not exists public.study_pack_quizzes (
  id uuid primary key default gen_random_uuid(),
  study_pack_id uuid not null references public.study_packs(id) on delete cascade,
  title text not null,
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard', 'mixed')),
  question_count integer not null default 10,
  created_at timestamptz not null default now()
);

create index if not exists study_pack_quizzes_pack_idx on public.study_pack_quizzes(study_pack_id);

-- 5. Study Pack Questions Table
create table if not exists public.study_pack_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.study_pack_quizzes(id) on delete cascade,
  question_type text not null check (question_type in ('mcq', 'true_false')),
  question text not null,
  options_json jsonb not null,
  correct_answer text not null,
  rationale text not null,
  source_reference text,
  difficulty text not null default 'medium',
  topic text not null default 'General',
  sort_order integer not null default 0
);

create index if not exists study_pack_questions_quiz_idx on public.study_pack_questions(quiz_id, sort_order);

-- 6. Student Flashcard Progress Table
create table if not exists public.student_flashcard_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  flashcard_id uuid not null references public.study_pack_flashcards(id) on delete cascade,
  status text not null check (status in ('new', 'known', 'review_again')),
  review_count integer not null default 1,
  last_reviewed_at timestamptz not null default now(),
  unique(user_id, flashcard_id)
);

create index if not exists student_flashcard_progress_user_idx on public.student_flashcard_progress(user_id, status);

-- 7. Student Quiz Attempts Table
create table if not exists public.student_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  quiz_id uuid not null references public.study_pack_quizzes(id) on delete cascade,
  score numeric(5,2) not null default 0,
  correct_count integer not null default 0,
  total_questions integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists student_quiz_attempts_user_idx on public.student_quiz_attempts(user_id, quiz_id);

-- 8. Student Quiz Answers Table
create table if not exists public.student_quiz_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.student_quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.study_pack_questions(id) on delete cascade,
  student_answer text not null,
  is_correct boolean not null,
  answered_at timestamptz not null default now()
);

create index if not exists student_quiz_answers_attempt_idx on public.student_quiz_answers(attempt_id);

-- 9. Student Mistakes Table (Prepared for future Weak Topics & My Mistakes)
create table if not exists public.student_mistakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  study_pack_id uuid not null references public.study_packs(id) on delete cascade,
  question_id uuid not null references public.study_pack_questions(id) on delete cascade,
  topic text not null,
  student_answer text not null,
  correct_answer text not null,
  attempt_id uuid references public.student_quiz_attempts(id) on delete cascade,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists student_mistakes_user_subject_idx on public.student_mistakes(user_id, subject_id, topic);
create index if not exists student_mistakes_pack_idx on public.student_mistakes(study_pack_id);

-- 10. Enable & Force Row Level Security (RLS) on all new tables
alter table public.study_packs enable row level security;
alter table public.study_packs force row level security;
create policy study_packs_owner on public.study_packs for all
  using (user_id = ai_user_id() or ai_is_worker() or ai_is_admin())
  with check (user_id = ai_user_id() or ai_is_worker() or ai_is_admin());

alter table public.study_pack_content enable row level security;
alter table public.study_pack_content force row level security;
create policy study_pack_content_owner on public.study_pack_content for all
  using (exists (select 1 from public.study_packs sp where sp.id = study_pack_id and (sp.user_id = ai_user_id() or ai_is_worker() or ai_is_admin())))
  with check (exists (select 1 from public.study_packs sp where sp.id = study_pack_id and (sp.user_id = ai_user_id() or ai_is_worker() or ai_is_admin())));

alter table public.study_pack_flashcards enable row level security;
alter table public.study_pack_flashcards force row level security;
create policy study_pack_flashcards_owner on public.study_pack_flashcards for all
  using (exists (select 1 from public.study_packs sp where sp.id = study_pack_id and (sp.user_id = ai_user_id() or ai_is_worker() or ai_is_admin())))
  with check (exists (select 1 from public.study_packs sp where sp.id = study_pack_id and (sp.user_id = ai_user_id() or ai_is_worker() or ai_is_admin())));

alter table public.study_pack_quizzes enable row level security;
alter table public.study_pack_quizzes force row level security;
create policy study_pack_quizzes_owner on public.study_pack_quizzes for all
  using (exists (select 1 from public.study_packs sp where sp.id = study_pack_id and (sp.user_id = ai_user_id() or ai_is_worker() or ai_is_admin())))
  with check (exists (select 1 from public.study_packs sp where sp.id = study_pack_id and (sp.user_id = ai_user_id() or ai_is_worker() or ai_is_admin())));

alter table public.study_pack_questions enable row level security;
alter table public.study_pack_questions force row level security;
create policy study_pack_questions_owner on public.study_pack_questions for all
  using (exists (select 1 from public.study_pack_quizzes sq join public.study_packs sp on sp.id = sq.study_pack_id where sq.id = quiz_id and (sp.user_id = ai_user_id() or ai_is_worker() or ai_is_admin())))
  with check (exists (select 1 from public.study_pack_quizzes sq join public.study_packs sp on sp.id = sq.study_pack_id where sq.id = quiz_id and (sp.user_id = ai_user_id() or ai_is_worker() or ai_is_admin())));

alter table public.student_flashcard_progress enable row level security;
alter table public.student_flashcard_progress force row level security;
create policy student_flashcard_progress_owner on public.student_flashcard_progress for all
  using (user_id = ai_user_id() or ai_is_worker() or ai_is_admin())
  with check (user_id = ai_user_id() or ai_is_worker() or ai_is_admin());

alter table public.student_quiz_attempts enable row level security;
alter table public.student_quiz_attempts force row level security;
create policy student_quiz_attempts_owner on public.student_quiz_attempts for all
  using (user_id = ai_user_id() or ai_is_worker() or ai_is_admin())
  with check (user_id = ai_user_id() or ai_is_worker() or ai_is_admin());

alter table public.student_quiz_answers enable row level security;
alter table public.student_quiz_answers force row level security;
create policy student_quiz_answers_owner on public.student_quiz_answers for all
  using (exists (select 1 from public.student_quiz_attempts a where a.id = attempt_id and (a.user_id = ai_user_id() or ai_is_worker() or ai_is_admin())))
  with check (exists (select 1 from public.student_quiz_attempts a where a.id = attempt_id and (a.user_id = ai_user_id() or ai_is_worker() or ai_is_admin())));

alter table public.student_mistakes enable row level security;
alter table public.student_mistakes force row level security;
create policy student_mistakes_owner on public.student_mistakes for all
  using (user_id = ai_user_id() or ai_is_worker() or ai_is_admin())
  with check (user_id = ai_user_id() or ai_is_worker() or ai_is_admin());
