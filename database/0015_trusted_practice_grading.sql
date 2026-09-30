-- The server records the questions assigned to each attempt and grades one answer per question.
create table if not exists public.student_exam_attempt_questions (
  attempt_id uuid not null references public.student_exam_attempts(id) on delete cascade,
  question_id uuid not null references public.exam_questions(id) on delete cascade,
  primary key (attempt_id, question_id)
);
