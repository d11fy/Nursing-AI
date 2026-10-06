import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { migrate } from "../scripts/migrate.mjs";
import { calculateMastery, normalizeTopicIdentity } from "../lib/learning-progress/formula";
import { completeQuizAttempt, startQuizAttempt, submitQuizAnswer } from "../features/study-pack/db/quiz-db";
import { getMistakes, getProgressDashboard, reviewMistake } from "../lib/learning-progress/service";
import { updateFlashcardProgress } from "../features/study-pack/db/flashcards-db";

const db = new PGlite({ extensions: { vector } });
const userA = "92000000-0000-4000-8000-000000000001";
const userB = "92000000-0000-4000-8000-000000000002";
let subjectId: string;
let packId: string;
let quizId: string;
const questions: Array<{ id: string; answer: string }> = [];

let tail = Promise.resolve();
async function acquire() { let release!: () => void; const prior = tail; tail = new Promise<void>((resolve) => { release = resolve; }); await prior; return release; }
const direct = (sql: string, values?: unknown[]) => db.query<Record<string, unknown>>(sql, values);
const pool = {
  query: async (sql: string, values?: unknown[]) => { const release = await acquire(); try { return await direct(sql, values); } finally { release(); } },
  connect: async () => { let release: (() => void) | undefined; return { query: async (sql: string, values?: unknown[]) => {
    if (sql === "BEGIN") { release = await acquire(); return direct(sql, values); }
    if (release) { try { return await direct(sql, values); } finally { if (sql === "COMMIT" || sql === "ROLLBACK") { release(); release = undefined; } } }
    const once = await acquire(); try { return await direct(sql, values); } finally { once(); }
  }, release() { release?.(); release = undefined; } }; },
};

before(async () => {
  process.env.DATABASE_URL = "postgresql://test-only";
  Object.assign(globalThis, { nursingPool: pool });
  await migrate({ query: async (sql: string, values?: unknown[]) => {
    if (!values && (sql.includes(";") || sql.includes("--"))) { await db.exec(sql); return { rows: [] }; }
    return db.query(sql, values);
  } });
  const yearId = (await db.query<{ id: string }>("select id from academic_years where code='first_year'")).rows[0].id;
  subjectId = (await db.query<{ id: string }>("insert into subjects(name_ar,name_en) values('تمريض باطني','Medical Surgical Nursing') returning id")).rows[0].id;
  await db.query("insert into subject_academic_years(subject_id,academic_year_id) values($1,$2)", [subjectId, yearId]);
  for (const [id, name] of [[userA, "A"], [userB, "B"]]) {
    await db.query("insert into app_users(id,email,password_hash) values($1,$2,'hash')", [id, `${name}@test.local`]);
    await db.query("insert into profiles(user_id,email,full_name,role,academic_year_id) values($1,$2,$3,'student',$4)", [id, `${name}@test.local`, name, yearId]);
  }
  const lectureId = (await db.query<{ id: string }>(`insert into lectures(user_id,subject_id,title,file_name,original_file_name,storage_path,mime_type,file_size_bytes,file_hash,status)
    values($1,$2,'Heart Failure','hf.pdf','hf.pdf','hf.pdf','application/pdf',100,'hf-hash','ready') returning id`, [userA, subjectId])).rows[0].id;
  packId = (await db.query<{ id: string }>(`insert into study_packs(user_id,lecture_id,subject_id,title,source_hash) values($1,$2,$3,'Heart Failure','hf-hash') returning id`, [userA, lectureId, subjectId])).rows[0].id;
  quizId = (await db.query<{ id: string }>("insert into study_pack_quizzes(study_pack_id,title,question_count) values($1,'HF Quiz',4) returning id", [packId])).rows[0].id;
  for (let i = 0; i < 4; i++) {
    questions.push((await db.query<{ id: string; answer: string }>(`insert into study_pack_questions(quiz_id,question_type,question,options_json,correct_answer,rationale,topic,sort_order)
      values($1,'mcq',$2,'["A","B"]'::jsonb,'B','Clinical rationale','Preload',$3) returning id,correct_answer as answer`, [quizId, `Question ${i + 1}`, i])).rows[0]);
  }
});
after(() => db.close());

test("topic normalization and minimum evidence are deterministic", () => {
  assert.equal(normalizeTopicIdentity("Heart_Failure").topicKey, normalizeTopicIdentity("heart failure").topicKey);
  assert.equal(normalizeTopicIdentity("HF").topicKey, normalizeTopicIdentity("Heart Failure").topicKey);
  const one = calculateMastery({ quiz: [{ isCorrect: false, answeredAt: new Date() }], flashcardKnown: 0,
    flashcardReviewAgain: 0, wrongCount: 1, unresolvedMistakes: 1, recoveryCount: 0 });
  assert.equal(one.hasEnoughEvidence, false);
  assert.equal(one.label, "insufficient");
});

test("quiz completion creates mistakes once, aggregates weakness and protects ownership", async () => {
  const attempt = await startQuizAttempt(userA, quizId);
  await submitQuizAnswer({ userId: userA, attemptId: attempt.id, questionId: questions[0].id, studentAnswer: "A" });
  await submitQuizAnswer({ userId: userA, attemptId: attempt.id, questionId: questions[1].id, studentAnswer: "A" });
  await submitQuizAnswer({ userId: userA, attemptId: attempt.id, questionId: questions[2].id, studentAnswer: "A" });
  await submitQuizAnswer({ userId: userA, attemptId: attempt.id, questionId: questions[3].id, studentAnswer: "B" });
  await completeQuizAttempt(userA, attempt.id);
  const mistakes = await getMistakes(userA);
  assert.equal(mistakes.length, 3);
  assert.equal((await getMistakes(userB)).length, 0);
  const progress = await getProgressDashboard(userA);
  assert.equal(progress.summary.questionsAnswered, 4);
  assert.equal(progress.weakTopics[0].topicName, "Preload");
  assert.equal(progress.weakTopics[0].hasEnoughEvidence, true);
});

test("duplicate mistakes increment, recovery advances status and mastery", async () => {
  const attempt = await startQuizAttempt(userA, quizId);
  await submitQuizAnswer({ userId: userA, attemptId: attempt.id, questionId: questions[0].id, studentAnswer: "A" });
  await completeQuizAttempt(userA, attempt.id);
  let mistake = (await getMistakes(userA)).find((item) => item.question.includes("Question 1"))!;
  assert.equal(mistake.wrongCount, 2);
  const before = (await getProgressDashboard(userA)).topics[0].masteryScore;
  const first = await reviewMistake(userA, mistake.id, "B");
  assert.equal(first.status, "reviewing");
  const second = await reviewMistake(userA, mistake.id, "B");
  assert.equal(second.status, "mastered");
  mistake = (await getMistakes(userA)).find((item) => item.id === mistake.id)!;
  assert.equal(mistake.status, "mastered");
  assert.ok((await getProgressDashboard(userA)).topics[0].masteryScore >= before);
});

test("flashcard Review Again contributes evidence without inventing a quiz score", async () => {
  const flashcardId = (await db.query<{ id: string }>(`insert into study_pack_flashcards(study_pack_id,front,back,topic) values($1,'Define preload','Stretch before contraction','Preload') returning id`, [packId])).rows[0].id;
  await updateFlashcardProgress(userA, flashcardId, "review_again");
  const topic = (await getProgressDashboard(userA)).topics.find((item) => item.topicName === "Preload")!;
  assert.equal(topic.flashcardReviewCount, 1);
  assert.ok(topic.quizAccuracy !== null);
});
