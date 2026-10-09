// Email queue reliability: a message claimed by a worker that dies is
// reclaimed after its lease, transport errors never leave "sending" rows, and
// SMTP secrets never reach the stored error.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { bootDatabase, createUser, db, mockNextRuntime } from "./helpers/harness";

mockNextRuntime();
const admin = "e1000000-0000-4000-8000-000000000001";
type Mail = { to: string; messageId?: string };

async function enqueue(recipient: string) {
  return (await db.query<{ id: string }>(`insert into email_logs(recipient,subject_snapshot,html_snapshot,text_snapshot)
    values($1,'Subject','<p>Body</p>','Body') returning id`, [recipient])).rows[0].id;
}
async function row(id: string) {
  return (await db.query<{ status: string; retry_count: number; next_retry_at: string | null; lease_expires_at: string | null; last_error: string | null }>(
    "select status,retry_count,next_retry_at,lease_expires_at,last_error from email_logs where id=$1", [id])).rows[0];
}
const recorder = (sent: Mail[]) => async () => ({ from: "Nursing AI <noreply@example.test>", secrets: [],
  transport: { sendMail: async (mail: Mail) => { sent.push(mail); return {}; } } }) as never;

before(async () => {
  await bootDatabase();
  await createUser(admin, "admin");
});
after(() => db.close());

test("a message held by a dead worker is reclaimed after its lease and sent once", async () => {
  const { processEmailQueue } = await import("../lib/email-queue");
  const id = await enqueue("crash@example.test");
  // Worker A claims the message, then hangs forever inside SMTP (a crashed process).
  const hung = processEmailQueue(10, { transport: async () => ({ from: "x", secrets: [],
    transport: { sendMail: () => new Promise(() => undefined) } }) as never });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal((await row(id)).status, "sending");
  void hung;

  // While the lease is valid nobody else may take it.
  const early: Mail[] = [];
  assert.equal((await processEmailQueue(10, { transport: recorder(early) })).processed, 0);

  await db.query("update email_logs set lease_expires_at=now()-interval '1 second' where id=$1", [id]);
  const sent: Mail[] = [];
  const result = await processEmailQueue(10, { transport: recorder(sent) });
  assert.equal(result.sent, 1);
  assert.deepEqual(sent.map((mail) => mail.to), ["crash@example.test"]);
  assert.equal(sent[0].messageId, `<${id}@nursing.alisohail.tech>`, "a stable Message-ID lets servers drop a duplicate");
  const final = await row(id);
  assert.equal(final.status, "sent");
  assert.equal(final.retry_count, 2, "the lost attempt is counted");
  assert.equal((await processEmailQueue(10, { transport: recorder(sent) })).processed, 0, "a sent message is never claimed again");
});

test("a worker whose lease expired cannot overwrite the new owner's result", async () => {
  const { processEmailQueue } = await import("../lib/email-queue");
  const id = await enqueue("fence@example.test");
  let finishA!: () => void;
  const slowA = processEmailQueue(10, { transport: async () => ({ from: "x", secrets: [],
    transport: { sendMail: () => new Promise<void>((resolve) => { finishA = resolve; }) } }) as never });
  await new Promise((resolve) => setTimeout(resolve, 50));
  await db.query("update email_logs set lease_expires_at=now()-interval '1 second' where id=$1", [id]);
  // Worker B reclaims and fails; then A's late success arrives with a stale claim token.
  await processEmailQueue(10, { transport: async () => ({ from: "x", secrets: [],
    transport: { sendMail: async () => { throw new Error("421 try later"); } } }) as never });
  finishA();
  await slowA;
  const final = await row(id);
  assert.equal(final.status, "failed");
  assert.match(final.last_error ?? "", /421/);
});

test("transport creation errors release the claim for retry and redact credentials", async () => {
  const { processEmailQueue, safeEmailError } = await import("../lib/email-queue");
  const id = await enqueue("config@example.test");
  const result = await processEmailQueue(10, { transport: async () => { throw new Error("Invalid login for user smtp-user password=Sup3rS3cret"); } });
  assert.equal(result.failed, 1);
  const failed = await row(id);
  assert.equal(failed.status, "failed", "never left in sending");
  assert.ok(failed.next_retry_at, "a retry is scheduled");
  assert.equal(failed.lease_expires_at, null);
  assert.doesNotMatch(failed.last_error ?? "", /Sup3rS3cret/);
  assert.equal(safeEmailError(new Error("535 auth failed for smtp-user with Sup3rS3cret"), ["Sup3rS3cret", "smtp-user"]),
    "535 auth failed for [redacted] with [redacted]");
});

test("retries back off and stop after the attempt cap; admin requeue starts a new round", async () => {
  const { processEmailQueue, EMAIL_MAX_ATTEMPTS, emailRetryDelaySeconds, requeueEmail } = await import("../lib/email-queue");
  assert.deepEqual([1, 2, 3, 4].map(emailRetryDelaySeconds), [60, 120, 240, 480]);
  assert.equal(emailRetryDelaySeconds(30), 6 * 3600);
  const id = await enqueue("bounce@example.test");
  const failing = async () => ({ from: "x", secrets: [], transport: { sendMail: async () => { throw new Error("550 mailbox unavailable"); } } }) as never;
  for (let attempt = 1; attempt <= EMAIL_MAX_ATTEMPTS; attempt++) {
    await db.query("update email_logs set next_retry_at=now()-interval '1 second' where id=$1", [id]);
    await processEmailQueue(10, { transport: failing });
  }
  const exhausted = await row(id);
  assert.equal(exhausted.retry_count, EMAIL_MAX_ATTEMPTS);
  assert.equal(exhausted.next_retry_at, null, "no further automatic retries");
  assert.equal((await processEmailQueue(10, { transport: failing })).processed, 0);

  await requeueEmail(admin, id);
  const sent: Mail[] = [];
  await processEmailQueue(10, { transport: recorder(sent) });
  assert.equal((await row(id)).status, "sent");
  assert.equal((await db.query<{ n: number }>("select count(*)::int n from admin_audit_logs where event_type='EMAIL_REQUEUED'")).rows[0].n, 1);
});

test("every template is fully rendered by the variables its sender supplies", async () => {
  const SENDERS: Record<string, string[]> = {
    welcome: ["student_name"],
    device_transfer: ["transfer_code", "student_name"],
    password_reset: ["reset_url"],
    device_reset: ["student_name"],
    support_received: [],
    security_alert: [],
    payment_received: ["student_name", "plan_name", "amount", "currency", "payment_reference"],
    payment_approved: ["student_name", "plan_name", "amount", "currency", "payment_reference", "expiry_date", "rejection_reason"],
    payment_rejected: ["student_name", "plan_name", "amount", "currency", "payment_reference", "expiry_date", "rejection_reason"],
    subscription_renewed: ["student_name", "plan_name", "expiry_date"],
    trial_ending: ["student_name", "plan_name", "expiry_date", "days_remaining"],
    trial_expired: ["student_name", "plan_name", "expiry_date", "days_remaining"],
    subscription_expiring: ["student_name", "plan_name", "expiry_date", "days_remaining"],
    subscription_expired: ["student_name", "plan_name", "expiry_date", "days_remaining"],
  };
  const templates = (await db.query<{ template_key: string; subject: string; html_body: string; text_body: string }>(
    "select template_key,subject,html_body,text_body from email_templates")).rows;
  assert.deepEqual(templates.map((t) => t.template_key).sort(), Object.keys(SENDERS).sort(), "every template has a sender");
  const { enqueueTemplateEmail } = await import("../lib/email-queue");
  for (const template of templates) {
    const used = [...`${template.subject}${template.html_body}${template.text_body}`.matchAll(/{{\s*([a-z0-9_]+)\s*}}/gi)].map((m) => m[1]);
    const missing = used.filter((name) => !SENDERS[template.template_key].includes(name));
    assert.deepEqual(missing, [], `${template.template_key} uses variables its sender never provides`);
    const values = Object.fromEntries(SENDERS[template.template_key].map((name) => [name, `<${name}>`]));
    const id = await enqueueTemplateEmail("render@example.test", template.template_key, values);
    const rendered = (await db.query<{ subject_snapshot: string; html_snapshot: string; text_snapshot: string }>(
      "select subject_snapshot,html_snapshot,text_snapshot from email_logs where id=$1", [id])).rows[0];
    assert.doesNotMatch(`${rendered.subject_snapshot}${rendered.html_snapshot}${rendered.text_snapshot}`, /{{/, template.template_key);
    assert.doesNotMatch(rendered.html_snapshot, /<student_name>|<plan_name>/, "HTML values are escaped");
  }
});
