-- 0020: Student Learning Progress System
-- Additive evolution of the existing Study Pack, practice, memory and progress data.

alter table public.student_quiz_answers
  add column if not exists topic_key text;

alter table public.student_exam_attempt_answers
  add column if not exists topic_key text;

alter table public.student_flashcard_progress
  add column if not exists topic_key text;

alter table public.student_mistakes
  alter column study_pack_id drop not null,
  alter column question_id drop not null,
  add column if not exists mistake_key text,
  add column if not exists exam_question_id uuid references public.exam_questions(id) on delete set null,
  add column if not exists exam_attempt_id uuid references public.student_exam_attempts(id) on delete set null,
  add column if not exists quiz_id uuid references public.study_pack_quizzes(id) on delete set null,
  add column if not exists topic_key text,
  add column if not exists question_type text,
  add column if not exists question_snapshot text,
  add column if not exists options_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists rationale_snapshot text,
  add column if not exists source_document_id uuid,
  add column if not exists source_reference text,
  add column if not exists first_wrong_at timestamptz not null default now(),
  add column if not exists last_wrong_at timestamptz not null default now(),
  add column if not exists wrong_count integer not null default 1,
  add column if not exists review_status text not null default 'new'
    check (review_status in ('new', 'reviewing', 'mastered')),
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists recovery_correct_count integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table public.student_topic_progress
  add column if not exists quiz_accuracy numeric(5,2),
  add column if not exists quiz_answer_count integer not null default 0,
  add column if not exists mistake_count integer not null default 0,
  add column if not exists unresolved_mistake_count integer not null default 0,
  add column if not exists flashcard_known_count integer not null default 0,
  add column if not exists flashcard_review_count integer not null default 0,
  add column if not exists recovery_count integer not null default 0,
  add column if not exists evidence_count integer not null default 0,
  add column if not exists last_activity_at timestamptz,
  add column if not exists last_recalculated_at timestamptz;

-- Normalize the historical topic identifiers with the same v2 contract already
-- used by the tutor and practice services. The canonical display name remains intact.
update public.student_quiz_answers a
set topic_key = 'v2:' || coalesce(nullif(left(trim(both '-' from regexp_replace(lower(q.topic), '[^[:alnum:]]+', '-', 'g')), 80), ''), 'general')
from public.study_pack_questions q
where q.id = a.question_id and a.topic_key is null;

update public.student_exam_attempt_answers
set topic_key = 'v2:' || coalesce(nullif(left(trim(both '-' from regexp_replace(lower(coalesce(topic, 'General')), '[^[:alnum:]]+', '-', 'g')), 80), ''), 'general')
where topic_key is null;

update public.student_flashcard_progress p
set topic_key = 'v2:' || coalesce(nullif(left(trim(both '-' from regexp_replace(lower(coalesce(f.topic, 'General')), '[^[:alnum:]]+', '-', 'g')), 80), ''), 'general')
from public.study_pack_flashcards f
where f.id = p.flashcard_id and p.topic_key is null;

-- Preserve old mistake rows. One latest row per question becomes the canonical
-- upsert target; older duplicate history remains queryable and is never deleted.
with ranked as (
  select id, user_id, question_id,
    row_number() over (partition by user_id, question_id order by created_at desc, id desc) as rn,
    count(*) over (partition by user_id, question_id) as historical_count,
    min(created_at) over (partition by user_id, question_id) as historical_first,
    max(created_at) over (partition by user_id, question_id) as historical_last
  from public.student_mistakes
  where question_id is not null
)
update public.student_mistakes m
set mistake_key = 'study-pack:' || m.question_id::text,
    wrong_count = ranked.historical_count,
    first_wrong_at = ranked.historical_first,
    last_wrong_at = ranked.historical_last,
    topic_key = 'v2:' || coalesce(nullif(left(trim(both '-' from regexp_replace(lower(m.topic), '[^[:alnum:]]+', '-', 'g')), 80), ''), 'general'),
    question_type = q.question_type,
    question_snapshot = q.question,
    options_snapshot = q.options_json,
    rationale_snapshot = q.rationale,
    source_reference = q.source_reference,
    quiz_id = q.quiz_id,
    updated_at = now()
from ranked
join public.study_pack_questions q on q.id = ranked.question_id
where m.id = ranked.id and ranked.rn = 1;

update public.student_topic_progress
set quiz_answer_count = questions_answered,
    quiz_accuracy = case when questions_answered > 0 then round(correct_answers::numeric * 100 / questions_answered, 2) end,
    evidence_count = questions_answered,
    last_activity_at = last_studied_at,
    last_recalculated_at = now()
where quiz_answer_count = 0 and questions_answered > 0;

create unique index if not exists student_mistakes_canonical_key_idx
  on public.student_mistakes(user_id, mistake_key) where mistake_key is not null;
create index if not exists student_mistakes_user_status_activity_idx
  on public.student_mistakes(user_id, review_status, last_wrong_at desc);
create index if not exists student_mistakes_user_topic_idx
  on public.student_mistakes(user_id, subject_id, topic_key);
create index if not exists student_quiz_answers_topic_idx
  on public.student_quiz_answers(topic_key, answered_at desc);
create index if not exists student_exam_answers_topic_idx
  on public.student_exam_attempt_answers(topic_key, created_at desc);
create index if not exists student_flashcard_progress_topic_idx
  on public.student_flashcard_progress(user_id, topic_key, last_reviewed_at desc);
create index if not exists student_topic_progress_activity_idx
  on public.student_topic_progress(user_id, last_activity_at desc);
create index if not exists student_topic_progress_subject_topic_idx
  on public.student_topic_progress(user_id, subject_id, topic_key);

alter table public.student_learning_events enable row level security;
alter table public.student_learning_events force row level security;
create policy student_learning_events_owner on public.student_learning_events for all
  using (user_id = ai_user_id() or ai_is_worker() or ai_is_admin())
  with check (user_id = ai_user_id() or ai_is_worker() or ai_is_admin());

alter table public.conversation_memory enable row level security;
alter table public.conversation_memory force row level security;
create policy conversation_memory_owner on public.conversation_memory for all
  using (user_id = ai_user_id() or ai_is_worker() or ai_is_admin())
  with check (user_id = ai_user_id() or ai_is_worker() or ai_is_admin());

alter table public.unanswered_questions enable row level security;
alter table public.unanswered_questions force row level security;
create policy unanswered_questions_owner on public.unanswered_questions for all
  using (user_id = ai_user_id() or ai_is_worker() or ai_is_admin())
  with check (user_id = ai_user_id() or ai_is_worker() or ai_is_admin());

