import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { vector } from '@electric-sql/pglite-pgvector';
import { migrate } from "../scripts/migrate.mjs";
import { gradePracticeAnswer } from "../lib/exams/answer-grading";
import { submitQuestionAnswer, completePracticeExam, getSmartReviewRecommendations } from "../lib/exams/practice-service";
import { getStudentContext } from "../lib/student-memory";

const db = new PGlite({extensions:{vector}});
const userId = "20000000-0000-4000-8000-000000000001";
const strangerId = "20000000-0000-4000-8000-000000000002";
const query = async (sql: string, values?: unknown[]) => {
  if (!values && sql.includes(";")) { await db.exec(sql); return { rows: [] }; }
  return db.query(sql, values);
};
let attemptId: string;
let questionId: string;
let subjectId: string;

before(async () => {
  process.env.DATABASE_URL = "postgresql://test-only";
  Object.assign(globalThis, { nursingPool: { query, connect: async () => ({ query, release() {} }) } });
  await migrate({ query });
  subjectId = (await db.query<{ subject_id: string }>(
    "SELECT subject_id FROM subject_academic_years LIMIT 1"
  )).rows[0].subject_id;
  for (const id of [userId, strangerId]) {
    await db.query("INSERT INTO app_users(id,email,password_hash) VALUES($1,$2,'test')", [id, `${id}@example.test`]);
  }
  questionId = (await db.query<{ id: string }>(
    `INSERT INTO exam_questions(subject_id,question_text,question_type,options_json,correct_answer_json,topic,status)
     VALUES($1,'Which answer is correct?','MCQ','["A) Wrong","B) Right"]'::jsonb,'"B"'::jsonb,'Topic One','VERIFIED') RETURNING id`,
    [subjectId]
  )).rows[0].id;
  attemptId = (await db.query<{ id: string }>(
    `INSERT INTO student_exam_attempts(user_id,subject_id,mode,total_questions)
     VALUES($1,$2,'EXAM',1) RETURNING id`, [userId, subjectId]
  )).rows[0].id;
  await db.query("INSERT INTO student_exam_attempt_questions(attempt_id,question_id) VALUES($1,$2)", [attemptId, questionId]);
});
after(() => db.close());

test("objective grading does not accept empty keys or prefix matches", () => {
  assert.equal(gradePracticeAnswer("A) Wrong", ""), false);
  assert.equal(gradePracticeAnswer("B) Right", "B"), true);
  assert.equal(gradePracticeAnswer("B) Right", "A"), false);
  assert.equal(gradePracticeAnswer("B) Right", "Right"), true);
});

test("server grades the assigned question once and owns the attempt", async () => {
  await assert.rejects(submitQuestionAnswer({ attemptId, userId: strangerId, questionId, selectedAnswer: "B) Right" }));
  await submitQuestionAnswer({ attemptId, userId, questionId, selectedAnswer: "B) Right" });
  await submitQuestionAnswer({ attemptId, userId, questionId, selectedAnswer: "A) Wrong" });
  const answers = (await db.query<{ is_correct: boolean }>(
    "SELECT is_correct FROM student_exam_attempt_answers WHERE attempt_id=$1", [attemptId]
  )).rows;
  assert.deepEqual(answers.map((row) => row.is_correct), [true]);
  const progress = (await db.query<{ questions_answered: number }>(
    "SELECT questions_answered FROM student_topic_progress WHERE user_id=$1", [userId]
  )).rows;
  assert.deepEqual(progress, [], "EXAM evidence is not published before completion");
  await assert.rejects(completePracticeExam(attemptId, strangerId));
  const score = await completePracticeExam(attemptId, userId);
  assert.equal((await db.query<{questions_answered:number}>("select questions_answered from student_topic_progress where user_id=$1",[userId])).rows[0].questions_answered,1);
  assert.equal(score.scorePercentage, 100);
  assert.equal(score.correctAnswers, 1);
  assert.equal(score.unansweredQuestions, 0);
  await db.query(`INSERT INTO exam_topic_stats(subject_id,topic,exam_count,total_exams,question_count,frequency)
    VALUES($1,'Topic One',1,1,1,100)`, [subjectId]);
  const recommendations = await getSmartReviewRecommendations(userId, subjectId);
  assert.equal(recommendations[0].studentMastery, 100);
  const context = await getStudentContext(userId, attemptId, subjectId, null);
  assert.doesNotMatch(context.text, /Topics needing review: Topic One/);
});
