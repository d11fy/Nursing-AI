// Release hardening regressions: subscription quotas, exam answer leakage and
// the admin usage reset. Route handlers are exercised with real sessions.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import {
  bootDatabase,
  createUser,
  db,
  formRequest,
  jsonRequest,
  minimalPdf,
  mockNextRuntime,
  setTrialLimit,
  signInAs,
} from "./helpers/harness";

mockNextRuntime();

const student = "a1000000-0000-4000-8000-000000000001";
const racer = "a1000000-0000-4000-8000-000000000002";
const admin = "a1000000-0000-4000-8000-000000000003";
const other = "a1000000-0000-4000-8000-000000000004";
type Session = { sessionToken: string; deviceToken: string };
const sessions: Record<string, Session> = {};
let subjectId: string;
let lectureId: string;

/** Every key anywhere in a JSON value. Leakage is checked on the raw response, not on a UI. */
function allKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => allKeys(item, keys));
  else if (value && typeof value === "object") for (const [key, inner] of Object.entries(value)) { keys.add(key); allKeys(inner, keys); }
  return keys;
}
const ANSWER_KEYS = ["correctAnswer", "correct_answer", "correctAnswerJson", "correct_answer_json", "extractedAnswer",
  "extracted_answer", "explanation", "rationale", "answerKey", "quote", "isCorrect"];
function assertNoAnswerKeys(body: unknown, where: string) {
  const leaked = ANSWER_KEYS.filter((key) => allKeys(body).has(key));
  assert.deepEqual(leaked, [], `${where} leaked ${leaked.join(",")}`);
}

const routes = {
  chatFiles: () => import("../app/api/chat/files/route"),
  lectures: () => import("../app/api/lectures/route"),
  images: () => import("../app/api/upload/route"),
  practice: () => import("../app/api/practice/generate/route"),
  submit: () => import("../app/api/practice/submit-answer/route"),
  attempt: () => import("../app/api/practice/attempts/[id]/route"),
  quiz: () => import("../app/api/study-packs/[id]/quiz/route"),
  quizAttempt: () => import("../app/api/study-packs/[id]/quiz/attempt/route"),
};

async function usageOf(userId: string, feature: string) {
  return Number((await db.query<{ used: number }>("select coalesce(sum(used),0)::int used from subscription_usage where user_id=$1 and feature_key=$2",
    [userId, feature])).rows[0].used);
}
async function count(table: string, where = "true", values: unknown[] = []) {
  return Number((await db.query<{ n: number }>(`select count(*)::int n from ${table} where ${where}`, values)).rows[0].n);
}
function chatForm(name: string, bytes: Buffer, type = "application/pdf") {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], name, { type }));
  form.set("subjectId", subjectId);
  return form;
}
const uniquePdf = (label: string) => Buffer.concat([minimalPdf(), Buffer.from(`% ${label}\n`)]);

before(async () => {
  process.env.OPENAI_API_KEY = "release-test-key";
  delete process.env.AI_ARCHITECTURE;
  await bootDatabase();
  const year = (await db.query<{ id: string }>("select id from academic_years where code='first_year'")).rows[0].id;
  subjectId = (await db.query<{ id: string }>("insert into subjects(name_ar,name_en) values('أساسيات','Release Fundamentals') returning id")).rows[0].id;
  await db.query("insert into subject_academic_years(subject_id,academic_year_id) values($1,$2)", [subjectId, year]);
  for (const [id, role] of [[student, "student"], [racer, "student"], [admin, "admin"], [other, "student"]] as const) {
    sessions[id] = await createUser(id, role);
    await db.query("update profiles set academic_year_id=$2 where user_id=$1", [id, year]);
  }
  for (let i = 0; i < 4; i++) {
    await db.query(`insert into exam_questions(subject_id,question_text,question_type,options_json,correct_answer_json,explanation,topic,status)
      values($1,$2,'MCQ',$3::jsonb,$4::jsonb,$5,'Oxygenation','VERIFIED')`,
    [subjectId, `Release question ${i}: which intervention is first?`, JSON.stringify(["Airway", "Fluids", "Ambulate", "Teach"]),
      JSON.stringify("Airway"), "Airway comes first in the ABC priority framework."]);
  }
  lectureId = (await db.query<{ id: string }>(`insert into lectures(user_id,subject_id,title,file_name,original_file_name,storage_path,mime_type,file_size_bytes,file_hash,status)
    values($1,$2,'Oxygenation','o.pdf','o.pdf','files/o.pdf','application/pdf',1000,'hash-oxygenation','ready') returning id`, [student, subjectId])).rows[0].id;
  await db.query(`insert into knowledge_documents(lecture_id,owner_id,title,original_file_name,storage_path,subject_id,source_type,file_hash,status,extracted_pages_json,is_active,extracted_text_length,chunk_count,embedding_count,page_count)
    values($1,$2,'Oxygenation','o.pdf','files/o.pdf',$3,'student_private_file','hash-oxygenation','ready',$4::jsonb,true,80,1,1,1)`,
  [lectureId, student, subjectId, JSON.stringify([{ pageNumber: 1, text: "Airway, breathing and circulation guide nursing priorities for hypoxic patients." }])]);
});
after(() => db.close());

// ---------------------------------------------------------------- quotas

test("files_limit = 0 blocks chat and subject uploads before storage or processing", async () => {
  await setTrialLimit("trial_files_total", 0);
  signInAs(sessions[student]);
  const before = { files: await count("stored_files"), lectures: await count("lectures"), jobs: await count("knowledge_jobs") };
  const chat = await (await routes.chatFiles()).POST(formRequest("/api/chat/files", chatForm("blocked.pdf", uniquePdf("blocked"))));
  assert.equal(chat.status, 403);
  assert.equal((await chat.json()).code, "USAGE_LIMIT_REACHED");
  const form = chatForm("blocked2.pdf", uniquePdf("blocked2"));
  form.set("title", "Blocked lecture");
  const lecture = await (await routes.lectures()).POST(formRequest("/api/lectures", form));
  assert.equal(lecture.status, 403);
  assert.deepEqual({ files: await count("stored_files"), lectures: await count("lectures"), jobs: await count("knowledge_jobs") }, before);
  assert.equal(await usageOf(student, "files_limit"), 0);
});

test("a file whose bytes do not match its extension is rejected before quota", async () => {
  await setTrialLimit("trial_files_total", 5);
  signInAs(sessions[student]);
  const fake = await (await routes.chatFiles()).POST(formRequest("/api/chat/files",
    chatForm("notes.pdf", Buffer.from("MZ\x90\x00 this is an executable, not a PDF"))));
  assert.equal(fake.status, 400);
  const image = new FormData();
  image.set("file", new File([Buffer.from("<svg onload=alert(1)>")], "photo.png", { type: "image/png" }));
  assert.equal((await (await routes.images()).POST(formRequest("/api/upload", image))).status, 400);
  assert.equal(await usageOf(student, "files_limit"), 0);
  assert.equal(await usageOf(student, "images_limit"), 0);
});

test("two simultaneous uploads for the last file unit: exactly one succeeds", async () => {
  await setTrialLimit("trial_files_total", 1);
  signInAs(sessions[racer]);
  const { POST } = await routes.chatFiles();
  const responses = await Promise.all([
    POST(formRequest("/api/chat/files", chatForm("race-a.pdf", uniquePdf("race-a")))),
    POST(formRequest("/api/chat/files", chatForm("race-b.pdf", uniquePdf("race-b")))),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [202, 403]);
  assert.equal(await usageOf(racer, "files_limit"), 1);
  assert.equal(await count("lectures", "user_id=$1", [racer]), 1);
});

test("concurrent reservations never exceed the limit", async () => {
  const { reserveUsage } = await import("../lib/subscriptions/service");
  await setTrialLimit("trial_images_total", 2);
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => reserveUsage(other, "images_limit")));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
  assert.equal(await usageOf(other, "images_limit"), 2);
});

test("a failure after reservation releases exactly that reservation, once", async () => {
  await setTrialLimit("trial_files_total", 5);
  const { storeStudentLecture } = await import("../lib/lectures/student-upload");
  const { DatabaseClient } = await import("../lib/db/server");
  const used = await usageOf(other, "files_limit");
  // An actor that does not own the upload makes storage throw after the unit is reserved.
  const wrongActor = new DatabaseClient({ user_id: student, role: "student", status: "active" });
  await assert.rejects(storeStudentLecture({ db: wrongActor, userId: other, file: new File([minimalPdf()], "x.pdf", { type: "application/pdf" }),
    hash: "hash-fail", subjectId, title: "x", maxBytes: 10 * 1024 * 1024, settings: { lectureLargeFileMb: 20, lectureRetentionDays: 10 } }));
  assert.equal(await usageOf(other, "files_limit"), used);
  const reservation = (await db.query<{ status: string }>("select status from usage_reservations where user_id=$1 and feature_key='files_limit' order by created_at desc limit 1", [other])).rows[0];
  assert.equal(reservation.status, "released");
  const { releaseUsage } = await import("../lib/subscriptions/service");
  const row = (await db.query<{ id: string }>("select id from usage_reservations where user_id=$1 and feature_key='files_limit' order by created_at desc limit 1", [other])).rows[0];
  await releaseUsage({ id: row.id, userId: other, featureKey: "files_limit", scopeType: "trial", scopeKey: "x", amount: 1, status: "reserved", replayed: false, resultRef: null, used: 0, limit: 5 });
  assert.equal(await usageOf(other, "files_limit"), used, "a second release must not refund again");
});

test("retrying an upload with the same Idempotency-Key is charged once and returns the same file", async () => {
  await setTrialLimit("trial_files_total", 5);
  signInAs(sessions[student]);
  const { POST } = await routes.lectures();
  const send = () => {
    const form = chatForm("retry.pdf", uniquePdf("retry"));
    form.set("title", "Retry lecture");
    form.set("forceDuplicate", "true");
    return POST(formRequest("/api/lectures", form, { "Idempotency-Key": "upload-retry-0001" }));
  };
  const first = await (await send()).json();
  const second = await (await send()).json();
  assert.equal(second.id, first.id);
  assert.equal(await usageOf(student, "files_limit"), 1);
});

test("quiz_limit = 0 blocks practice and study-pack quiz generation before any AI call", async (t) => {
  await setTrialLimit("trial_quiz_total", 0);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("AI must not be called"); });
  signInAs(sessions[student]);
  const attemptsBefore = await count("student_exam_attempts");
  const practice = await (await routes.practice()).POST(jsonRequest("/api/practice/generate", { subjectId, practiceType: "MIXED", mode: "EXAM" }));
  assert.equal(practice.status, 403);
  assert.equal((await practice.json()).code, "USAGE_LIMIT_REACHED");
  assert.equal(await count("student_exam_attempts"), attemptsBefore);

  const { getOrCreateStudyPack } = await import("../features/study-pack/db/study-pack-db");
  const pack = await getOrCreateStudyPack(lectureId, student);
  const quiz = await (await routes.quiz()).POST(jsonRequest(`/api/study-packs/${pack.id}/quiz`, { questionCount: 5, difficulty: "medium", questionType: "mixed" }),
    { params: Promise.resolve({ id: pack.id }) });
  assert.equal(quiz.status, 403);
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(await count("study_pack_quizzes"), 0);
});

// ---------------------------------------------------------------- exam leakage

test("EXAM mode: no answer key in generate, answer, resume or next question until COMPLETE", async () => {
  await setTrialLimit("trial_quiz_total", 10);
  signInAs(sessions[student]);
  const generated = await (await routes.practice()).POST(jsonRequest("/api/practice/generate",
    { subjectId, practiceType: "PAST_EXAM", mode: "EXAM", questionCount: 3 }, { headers: { "Idempotency-Key": "exam-generate-0001" } }));
  assert.equal(generated.status, 200);
  const exam = await generated.json();
  assertNoAnswerKeys(exam, "generate");
  assert.equal(exam.questions.length, 3);

  const { POST: submit } = await routes.submit();
  const answer = await (await submit(jsonRequest("/api/practice/submit-answer", { attemptId: exam.attemptId, questionId: exam.questions[0].id, selectedAnswer: "Fluids" }))).json();
  assertNoAnswerKeys(answer, "exam answer");
  assert.equal(answer.review, null);

  const { GET: resume } = await routes.attempt();
  const resumed = await (await resume(new Request("https://nursing.example.test/x"), { params: Promise.resolve({ id: exam.attemptId }) })).json();
  assertNoAnswerKeys(resumed, "resume");
  assert.deepEqual(resumed.review, []);

  const retried = await (await routes.practice()).POST(jsonRequest("/api/practice/generate",
    { subjectId, practiceType: "PAST_EXAM", mode: "EXAM", questionCount: 3 }, { headers: { "Idempotency-Key": "exam-generate-0001" } }));
  const replay = await retried.json();
  assert.equal(replay.attemptId, exam.attemptId, "a retried generate returns the same attempt");
  assertNoAnswerKeys(replay, "replayed generate");
  assert.equal(await usageOf(student, "quiz_limit"), 1, "a retried generate is not charged twice");

  const completed = await (await submit(jsonRequest("/api/practice/submit-answer", { action: "COMPLETE", attemptId: exam.attemptId }))).json();
  assert.equal(completed.review.length, 3);
  assert.ok(completed.review.every((item: { correctAnswer: unknown }) => item.correctAnswer === "Airway"));
  assert.equal(completed.review.find((item: { questionId: string }) => item.questionId === exam.questions[0].id).isCorrect, false);
});

test("STUDY mode reveals a question's key only after that answer is recorded", async () => {
  signInAs(sessions[student]);
  const study = await (await (await routes.practice()).POST(jsonRequest("/api/practice/generate",
    { subjectId, practiceType: "PAST_EXAM", mode: "STUDY", questionCount: 3 }))).json();
  assertNoAnswerKeys(study, "study generate");
  const answer = await (await (await routes.submit()).POST(jsonRequest("/api/practice/submit-answer",
    { attemptId: study.attemptId, questionId: study.questions[0].id, selectedAnswer: "Airway" }))).json();
  assert.equal(answer.review.correctAnswer, "Airway");
  assert.equal(answer.review.isCorrect, true);
  const resumed = await (await (await routes.attempt()).GET(new Request("https://nursing.example.test/x"), { params: Promise.resolve({ id: study.attemptId }) })).json();
  assert.equal(resumed.review.length, 1, "resume reveals only the answered question");
  assertNoAnswerKeys(resumed.questions, "study resume questions");
});

test("a student cannot read another student's attempt", async () => {
  signInAs(sessions[student]);
  const mine = await (await (await routes.practice()).POST(jsonRequest("/api/practice/generate",
    { subjectId, practiceType: "PAST_EXAM", mode: "EXAM", questionCount: 3 }))).json();
  signInAs(sessions[other]);
  const response = await (await routes.attempt()).GET(new Request("https://nursing.example.test/x"), { params: Promise.resolve({ id: mine.attemptId }) });
  assert.equal(response.status, 404);
  const answer = await (await routes.submit()).POST(jsonRequest("/api/practice/submit-answer",
    { attemptId: mine.attemptId, questionId: mine.questions[0].id, selectedAnswer: "Airway" }));
  assert.equal(answer.status, 500);
  assertNoAnswerKeys(await answer.json(), "foreign answer");
});

test("study-pack quiz: generate and reload carry no keys; answering reveals; completion reviews all", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({
    id: "quiz", status: "completed", model: "gpt-6-luna", output: [], usage: { input_tokens: 10, output_tokens: 10, input_tokens_details: { cached_tokens: 0 } },
    output_text: JSON.stringify({ title: "Oxygenation", questions: [
      { question_type: "mcq", question: "What is assessed first in a hypoxic patient?", options: ["Airway", "Diet", "Mobility", "Teaching"],
        correct_answer: "Airway", rationale: "ABC prioritization starts with the airway.", topic: "Priorities", difficulty: "medium" },
      { question_type: "true_false", question: "Circulation is assessed before airway.", options: ["True", "False"],
        correct_answer: "False", rationale: "Airway precedes circulation.", topic: "Priorities", difficulty: "easy" },
    ] }),
  }));
  await setTrialLimit("trial_quiz_total", 10);
  signInAs(sessions[student]);
  const { getOrCreateStudyPack } = await import("../features/study-pack/db/study-pack-db");
  const pack = await getOrCreateStudyPack(lectureId, student);
  const params = { params: Promise.resolve({ id: pack.id }) };
  const generated = await (await (await routes.quiz()).POST(jsonRequest(`/api/study-packs/${pack.id}/quiz`,
    { questionCount: 5, difficulty: "medium", questionType: "mixed" }), params)).json();
  assert.ok(generated.quiz, JSON.stringify(generated));
  assertNoAnswerKeys(generated, "study-pack generate");
  const reloaded = await (await (await routes.quiz()).GET(new Request("https://nursing.example.test/x"), params)).json();
  assertNoAnswerKeys(reloaded, "study-pack reload");

  const { POST: attempt } = await routes.quizAttempt();
  const call = (action: string, body: unknown) => attempt(jsonRequest(`/api/study-packs/${pack.id}/quiz/attempt?action=${action}`, body));
  const started = await (await call("start", { quizId: generated.quiz.id })).json();
  const first = await (await call("answer", { attemptId: started.id, questionId: generated.quiz.questions[0].id, studentAnswer: "Diet" })).json();
  assert.equal(first.correctAnswer, "Airway");
  assert.equal(first.isCorrect, false);
  const again = await (await call("answer", { attemptId: started.id, questionId: generated.quiz.questions[0].id, studentAnswer: "Airway" })).json();
  assert.equal(again.isCorrect, false, "the first recorded answer stands");
  assert.equal(await count("student_quiz_answers", "attempt_id=$1", [started.id]), 1);
  const done = await (await call("complete", { attemptId: started.id })).json();
  assert.equal(done.review.length, 2);
  assert.equal(done.review[1].correctAnswer, "False");
});

// ---------------------------------------------------------------- admin reset

test("admin reset changes the enforced counter, keeps history and is audited", async () => {
  const { reserveUsage, getRemainingUsage } = await import("../lib/subscriptions/service");
  await setTrialLimit("trial_ai_questions_daily", 10);
  for (let i = 0; i < 10; i++) await reserveUsage(racer, "ai_questions_daily");
  await assert.rejects(reserveUsage(racer, "ai_questions_daily"), /استخدمت الحد/);
  await db.query("insert into usage_logs(user_id,type,model,input_tokens,output_tokens,estimated_cost) values($1,'chat','m',1,1,0)", [racer]);
  const historyBefore = await count("usage_logs", "user_id=$1", [racer]);

  const { adjustStudentUsageAction } = await import("../app/admin/actions");
  const form = new FormData();
  form.set("userId", racer); form.set("feature", "ai_questions_daily"); form.set("reason", "Provider outage consumed questions");
  signInAs(sessions[student]);
  await assert.rejects(adjustStudentUsageAction({}, form), "a student cannot reset usage");
  signInAs(sessions[admin]);
  const result = await adjustStudentUsageAction({}, form);
  assert.equal(result.error, undefined);

  assert.deepEqual(await getRemainingUsage(racer, "ai_questions_daily"), { used: 0, limit: 10, remaining: 10, scope: "daily" });
  await reserveUsage(racer, "ai_questions_daily");
  assert.equal(await count("usage_logs", "user_id=$1", [racer]), historyBefore, "usage history is not deleted");
  const audit = (await db.query<{ admin_id: string; target_user_id: string; metadata: { reason: string; changes: Array<{ previousValue: number; newValue: number; feature: string }> }; created_at: string }>(
    "select admin_id,target_user_id,metadata,created_at from admin_audit_logs where event_type='USAGE_ADJUSTED' order by created_at desc limit 1")).rows[0];
  assert.equal(audit.admin_id, admin);
  assert.equal(audit.target_user_id, racer);
  assert.equal(audit.metadata.reason, "Provider outage consumed questions");
  assert.deepEqual(audit.metadata.changes.map((change) => [change.feature, change.previousValue, change.newValue]), [["ai_questions_daily", 10, 0]]);
  assert.ok(audit.created_at);
});
