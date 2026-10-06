import { workerDb } from "@/lib/tutor/db";
import { recalculateStudentTopicProgress } from "@/lib/learning-progress/service";

type TopicRow = { user_id: string; subject_id: string; topic: string };

async function main() {
  const nextEnv = await import("@next/env");
  nextEnv.loadEnvConfig(process.cwd());
  const { rows } = await workerDb.query<TopicRow>(`
    select distinct user_id,subject_id,topic from (
      select qa.user_id,sp.subject_id,q.topic
      from student_quiz_answers a join student_quiz_attempts qa on qa.id=a.attempt_id
      join study_pack_questions q on q.id=a.question_id join study_pack_quizzes sq on sq.id=q.quiz_id
      join study_packs sp on sp.id=sq.study_pack_id
      union all
      select ea.user_id,ea.subject_id,a.topic
      from student_exam_attempt_answers a join student_exam_attempts ea on ea.id=a.attempt_id
      where a.topic is not null
      union all
      select p.user_id,sp.subject_id,coalesce(f.topic,'General')
      from student_flashcard_progress p join study_pack_flashcards f on f.id=p.flashcard_id
      join study_packs sp on sp.id=f.study_pack_id
      union all
      select user_id,subject_id,topic from student_mistakes
      where mistake_key is not null
      union all
      select user_id,subject_id,topic from learning_events
      where subject_id is not null and conversation_id is not null
        and event_type in ('quiz_correct','quiz_incorrect')
    ) evidence where subject_id is not null and nullif(trim(topic),'') is not null
    order by user_id,subject_id,topic
  `);

  let completed = 0;
  for (const row of rows) {
    await recalculateStudentTopicProgress({ userId: row.user_id, subjectId: row.subject_id,
      topic: row.topic, reason: "historical_backfill", recordHistory: false });
    completed += 1;
  }
  console.log(`Learning progress backfill complete: ${completed} student-topic records recalculated`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
