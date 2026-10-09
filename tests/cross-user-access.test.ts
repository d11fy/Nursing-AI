// Student B must not read or change any of student A's data through the
// public API, and admin APIs are admin-only. Requests run as a non-superuser
// database role so row-level security is enforced as in production.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { asRuntimeRole, bootDatabase, createUser, db, jsonRequest, mockNextRuntime, signInAs } from "./helpers/harness";

mockNextRuntime();

const alice = "c1000000-0000-4000-8000-000000000001";
const bob = "c1000000-0000-4000-8000-000000000002";
const MARK = "ALICE-PRIVATE-MARKER";
type Session = { sessionToken: string; deviceToken: string };
let aliceSession: Session, bobSession: Session;
const ids: Record<string, string> = {};
const url = (path: string) => `https://nursing.example.test${path}`;
const params = (id: string) => ({ params: Promise.resolve({ id }) });

before(async () => {
  await bootDatabase();
  aliceSession = await createUser(alice, "student", MARK);
  bobSession = await createUser(bob, "student", "Bob");
  const year = (await db.query<{ id: string }>("select id from academic_years where code='first_year'")).rows[0].id;
  await db.query("update profiles set academic_year_id=$1", [year]);
  const subject = (await db.query<{ id: string }>("insert into subjects(name_ar,name_en) values('خصوصية','Privacy Subject') returning id")).rows[0].id;
  await db.query("insert into subject_academic_years(subject_id,academic_year_id) values($1,$2)", [subject, year]);
  ids.conversation = (await db.query<{ id: string }>("insert into conversations(user_id,title,subject_id) values($1,$2,$3) returning id", [alice, MARK, subject])).rows[0].id;
  await db.query("insert into messages(conversation_id,role,content) values($1,'user',$2)", [ids.conversation, MARK]);
  ids.lecture = (await db.query<{ id: string }>(`insert into lectures(user_id,subject_id,title,file_name,original_file_name,storage_path,mime_type,file_size_bytes,file_hash,status)
    values($1,$2,$3,'a.pdf','a.pdf','alice/a.pdf','application/pdf',10,'alice-hash','ready') returning id`, [alice, subject, MARK])).rows[0].id;
  await db.query(`insert into knowledge_documents(lecture_id,owner_id,title,original_file_name,storage_path,subject_id,source_type,file_hash,status,extracted_pages_json,is_active,extracted_text_length,chunk_count,embedding_count,page_count)
    values($1,$2,$3,'a.pdf','alice/a.pdf',$4,'student_private_file','alice-hash','ready',$5::jsonb,true,40,1,1,1)`,
  [ids.lecture, alice, MARK, subject, JSON.stringify([{ pageNumber: 1, text: MARK }])]);
  ids.pack = (await db.query<{ id: string }>("insert into study_packs(user_id,lecture_id,subject_id,title,status,source_hash) values($1,$2,$3,$4,'ready','alice-hash') returning id",
    [alice, ids.lecture, subject, MARK])).rows[0].id;
  ids.attempt = (await db.query<{ id: string }>("insert into student_exam_attempts(user_id,subject_id,mode,total_questions) values($1,$2,'EXAM',0) returning id", [alice, subject])).rows[0].id;
  const plan = (await db.query<{ id: string }>("select id from subscription_plans limit 1")).rows[0].id;
  await db.query("insert into stored_files(path,bucket,owner_id,mime_type,content) values('payments/alice/r','payment-receipts',$1,'application/pdf',$2)",
    [alice, Buffer.from(`%PDF-1.4 ${MARK}`)]);
  ids.payment = (await db.query<{ id: string }>(`insert into payment_requests(payment_reference,user_id,plan_id,amount,currency,plan_name_snapshot,price_snapshot,duration_days_snapshot,payment_method_snapshot,receipt_path)
    values('PAY-TEST-1',$1,$2,10,'ILS',$3,10,30,'{}'::jsonb,'payments/alice/r') returning id`, [alice, plan, MARK])).rows[0].id;
  await db.query(`insert into student_mistakes(user_id,subject_id,topic,question_snapshot,student_answer,correct_answer,mistake_key,first_wrong_at,last_wrong_at,wrong_count,review_status)
    values($1,$2,'Privacy',$3,'x','y','privacy:1',now(),now(),1,'new')`, [alice, subject, MARK]);
});
after(() => db.close());

async function expectHidden(name: string, response: Response) {
  const body = await response.text();
  assert.ok([401, 403, 404].includes(response.status) || !body.includes(MARK),
    `${name}: status ${response.status} exposed Alice's data`);
  assert.doesNotMatch(body, new RegExp(MARK), `${name} leaked Alice's data`);
}

test("student B cannot read student A's conversations, files, study packs, attempts, payments or mistakes", async () => {
  await asRuntimeRole(async () => {
    signInAs(aliceSession);
    const own = await (await import("../app/api/conversations/[id]/route")).GET(new Request(url("/x")), params(ids.conversation));
    assert.equal(own.status, 200, "the owner can read it (control)");
    const ownReceipt = await (await import("../app/api/subscription/receipts/[id]/route")).GET(new Request(url("/x")), params(ids.payment));
    assert.equal(ownReceipt.status, 200);
    assert.match(Buffer.from(await ownReceipt.arrayBuffer()).toString(), new RegExp(MARK));
    const ownPack = await (await import("../app/api/study-packs/[id]/route")).GET(new Request(url("/x?type=lecture")), params(ids.lecture));
    assert.equal(ownPack.status, 200);
    const ownAttempt = await (await import("../app/api/practice/attempts/[id]/route")).GET(new Request(url("/x")), params(ids.attempt));
    assert.equal(ownAttempt.status, 200);

    signInAs(bobSession);
    const get = new Request(url("/x"));
    await expectHidden("conversation", await (await import("../app/api/conversations/[id]/route")).GET(get, params(ids.conversation)));
    await expectHidden("lecture", await (await import("../app/api/lectures/[id]/route")).GET(get, params(ids.lecture)));
    await expectHidden("lecture content", await (await import("../app/api/lectures/[id]/content/route")).GET(get, params(ids.lecture)));
    await expectHidden("study pack", await (await import("../app/api/study-packs/[id]/route")).GET(new Request(url("/x?type=lecture")), params(ids.lecture)));
    await expectHidden("flashcards", await (await import("../app/api/study-packs/[id]/flashcards/route")).GET(get, params(ids.pack)));
    await expectHidden("quiz", await (await import("../app/api/study-packs/[id]/quiz/route")).GET(get, params(ids.pack)));
    await expectHidden("quiz mistakes", await (await import("../app/api/study-packs/[id]/quiz/mistakes/route")).GET(new Request(url("/x")), params(ids.pack)));
    await expectHidden("practice attempt", await (await import("../app/api/practice/attempts/[id]/route")).GET(get, params(ids.attempt)));
    await expectHidden("receipt", await (await import("../app/api/subscription/receipts/[id]/route")).GET(get, params(ids.payment)));
    await expectHidden("subscription", await (await import("../app/api/subscription/route")).GET());
    await expectHidden("mistakes", await (await import("../app/api/learning-progress/mistakes/route")).GET(new Request(url("/api/learning-progress/mistakes"))));
    await expectHidden("progress", await (await import("../app/api/learning-progress/route")).GET());
    await expectHidden("chat file status", await (await import("../app/api/chat/files/route")).GET(
      new Request(url(`/api/chat/files?conversationId=${ids.conversation}&lectureId=${ids.lecture}`))));
  });
});

test("student B cannot change or delete student A's resources", async () => {
  await asRuntimeRole(async () => {
    signInAs(bobSession);
    const route = await import("../app/api/conversations/[id]/route");
    await route.PATCH(new Request(url("/x"), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "hacked" }) }), params(ids.conversation));
    await route.DELETE(new Request(url("/x"), { method: "DELETE" }), params(ids.conversation));
    const retry = await (await import("../app/api/lectures/[id]/retry/route")).POST(new Request(url("/x"), { method: "POST" }), params(ids.lecture));
    assert.ok([403, 404].includes(retry.status));
    const answer = await (await import("../app/api/practice/submit-answer/route")).POST(jsonRequest("/api/practice/submit-answer", { action: "COMPLETE", attemptId: ids.attempt }));
    assert.notEqual(answer.status, 200);
  });
  const conversation = (await db.query<{ title: string }>("select title from conversations where id=$1", [ids.conversation])).rows[0];
  assert.equal(conversation?.title, MARK, "Alice's conversation is unchanged and not deleted");
  assert.equal((await db.query<{ completed_at: string | null }>("select completed_at from student_exam_attempts where id=$1", [ids.attempt])).rows[0].completed_at, null);
});

test("admin APIs reject students and anonymous requests", async () => {
  await asRuntimeRole(async () => {
    for (const session of [bobSession, null]) {
      signInAs(session);
      const get = new Request(url("/api/admin/x"));
      assert.equal((await (await import("../app/api/admin/exams/route")).GET(get)).status, 403);
      assert.equal((await (await import("../app/api/admin/question-bank/route")).GET(get)).status, 403);
      assert.equal((await (await import("../app/api/admin/ai-providers/status/route")).GET()).status, 403);
    }
  });
});
