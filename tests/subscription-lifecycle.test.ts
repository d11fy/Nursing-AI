// Subscription lifecycle: trial expiry, expired access, and grace period.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { bootDatabase, createUser, db, jsonRequest, mockNextRuntime, signInAs } from "./helpers/harness";

mockNextRuntime();
const student = "b2000000-0000-4000-8000-000000000001";
let session: { sessionToken: string; deviceToken: string };
let conversationId: string;

before(async () => {
  await bootDatabase();
  session = await createUser(student);
  conversationId = (await db.query<{ id: string }>("insert into conversations(user_id,title) values($1,'My notes') returning id", [student])).rows[0].id;
});
after(() => db.close());

async function setGrace(enabled: boolean, hours = 24) {
  for (const [key, value] of [["payment_grace_enabled", enabled], ["payment_grace_hours", hours]] as const)
    await db.query("insert into settings(key,value) values($1,$2) on conflict(key) do update set value=excluded.value", [key, JSON.stringify(value)]);
}

test("an active trial grants its configured limits", async () => {
  const { getStudentEntitlements } = await import("../lib/subscriptions/service");
  const access = await getStudentEntitlements(student);
  assert.equal(access.kind, "trial");
  assert.equal(access.active, true);
  assert.equal(access.entitlements.quiz_limit, 3, "trial quizzes are limited by trial_quiz_total");
});

test("after the trial ends the student keeps their account and data but paid actions are blocked", async () => {
  await db.query("update user_trials set starts_at=now()-interval '4 days',ends_at=now()-interval '1 minute' where user_id=$1", [student]);
  const { getStudentEntitlements, reserveUsage } = await import("../lib/subscriptions/service");
  const access = await getStudentEntitlements(student);
  assert.equal(access.kind, "expired");
  assert.equal(access.active, false);
  await assert.rejects(reserveUsage(student, "ai_questions_daily"), (error: { code?: string }) => error.code === "SUBSCRIPTION_EXPIRED");

  signInAs(session);
  const me = await (await (await import("../app/api/auth/me/route")).GET()).json();
  assert.equal(me.authenticated, true, "an expired student can still sign in");
  const own = await (await import("../app/api/conversations/[id]/route")).GET(new Request("https://x/c"), { params: Promise.resolve({ id: conversationId }) });
  assert.equal(own.status, 200, "existing study data stays readable");
  const quiz = await (await import("../app/api/practice/generate/route")).POST(jsonRequest("/api/practice/generate",
    { subjectId: "00000000-0000-4000-8000-000000000000" }));
  assert.ok([403].includes(quiz.status));
});

test("grace applies only with a recent pending payment and only when enabled", async () => {
  const { getStudentEntitlements } = await import("../lib/subscriptions/service");
  const plan = (await db.query<{ id: string }>("select id from subscription_plans where slug='one-month'")).rows[0].id;
  await setGrace(true, 24);
  assert.equal((await getStudentEntitlements(student)).kind, "expired", "no pending payment, no grace");

  await db.query(`insert into payment_requests(payment_reference,user_id,plan_id,amount,currency,plan_name_snapshot,price_snapshot,duration_days_snapshot,payment_method_snapshot,receipt_path,status)
    values('PAY-GRACE-1',$1,$2,15,'ILS','شهر',15,30,'{}'::jsonb,'payments/x','pending')`, [student, plan]);
  const grace = await getStudentEntitlements(student);
  assert.equal(grace.kind, "grace");
  assert.equal(grace.pendingPayment, true);

  await setGrace(false);
  assert.equal((await getStudentEntitlements(student)).kind, "expired", "disabled grace grants nothing");

  await setGrace(true, 24);
  await db.query("update payment_requests set created_at=now()-interval '2 days' where payment_reference='PAY-GRACE-1'");
  assert.equal((await getStudentEntitlements(student)).kind, "expired", "an old pending payment does not extend access indefinitely");
});
