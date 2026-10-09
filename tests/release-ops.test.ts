// Release operations: mobile session persistence and single-device rule,
// health endpoints, security headers, and the single Android release source
// (version, checksum, stable vs preview, in-app update contract).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { bootDatabase, createUser, db, jsonRequest, mockNextRuntime, setRequestHeaders, signInAs } from "./helpers/harness";

mockNextRuntime();
const student = "f1000000-0000-4000-8000-000000000001";
const admin = "f1000000-0000-4000-8000-000000000002";
const PASSWORD = "Correct-Horse-9";
const LATEST_APK = path.join(process.cwd(), "public", "downloads", "nursing-ai-latest.apk");
const latestSha = () => createHash("sha256").update(readFileSync(LATEST_APK)).digest("hex");
let adminSession: { sessionToken: string; deviceToken: string };

before(async () => {
  process.env.CRON_SECRET = "monitor-secret-for-tests-0123456789";
  await bootDatabase();
  await createUser(student, "student");
  adminSession = await createUser(admin, "admin");
  const { hashPassword } = await import("../lib/auth/password");
  await db.query("update app_users set password_hash=$2 where id=$1", [student, await hashPassword(PASSWORD)]);
  const { revokeAllUserSessions } = await import("../lib/auth/session-store");
  await revokeAllUserSessions(student);
});
after(() => db.close());

test("mobile session persists across app restarts and a second device is blocked", async () => {
  signInAs(null);
  setRequestHeaders({});
  const { POST: login } = await import("../app/api/auth/login/route");
  const email = `${student}@example.test`;
  const first = await (await login(jsonRequest("/api/auth/login", { email, password: PASSWORD, deviceToken: "phone-one-device-token-0001" }))).json();
  assert.equal(first.success, true);

  // "Restart": a new request carrying only the stored bearer and device tokens.
  setRequestHeaders({ authorization: `Bearer ${first.sessionToken}`, "x-device-token": first.deviceToken });
  const me = await (await (await import("../app/api/auth/me/route")).GET()).json();
  assert.equal(me.authenticated, true);
  assert.equal(me.profile.user_id, student);

  setRequestHeaders({});
  const second = await login(jsonRequest("/api/auth/login", { email, password: PASSWORD, deviceToken: "phone-two-device-token-0002" }));
  assert.equal(second.status, 409, "a second device cannot take over an active session");

  setRequestHeaders({ authorization: `Bearer ${first.sessionToken}`, "x-device-token": first.deviceToken });
  await (await import("../app/api/auth/logout/route")).POST(new Request("https://nursing.example.test/api/auth/logout", {
    method: "POST", headers: { authorization: `Bearer ${first.sessionToken}` } }));
  const after = await (await import("../app/api/auth/me/route")).GET();
  assert.notEqual((await after.json()).authenticated, true, "logout revokes the stored token");
  setRequestHeaders({});
});

test("public health exposes only status; details need an admin or the monitor secret", async () => {
  signInAs(null);
  const pub = await (await import("../app/api/health/route")).GET();
  const body = await pub.json();
  assert.equal(pub.status, 200);
  assert.deepEqual(Object.keys(body).sort(), ["checkedAt", "status"]);

  const { GET } = await import("../app/api/admin/health/route");
  assert.equal((await GET(new Request("https://x/api/admin/health"))).status, 403);
  assert.equal((await GET(new Request("https://x/api/admin/health", { headers: { authorization: "Bearer wrong" } }))).status, 403);
  await db.query(`insert into email_logs(recipient,subject_snapshot,html_snapshot,text_snapshot,status,lease_expires_at)
    values('stuck@example.test','s','h','t','sending',now()-interval '5 minutes')`);
  const monitored = await (await GET(new Request("https://x/api/admin/health", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }))).json();
  assert.equal(monitored.checks.database.status, "ok");
  assert.equal(monitored.checks.emailQueue.stuckSending, 1);
  assert.equal(monitored.checks.emailQueue.status, "degraded");
  signInAs(adminSession);
  assert.equal((await GET(new Request("https://x/api/admin/health"))).status, 200);
  assert.doesNotMatch(JSON.stringify(monitored), /OPENAI_API_KEY|password|secret/i);
});

test("security headers: safe set everywhere, page CSP never overrides API file policies", async () => {
  const { securityHeaderRules, REPORT_ONLY_CSP, ENFORCED_CSP } = await import("../lib/http/security-headers.mjs");
  const rules = securityHeaderRules({ production: true });
  const all = Object.fromEntries(rules[0].headers.map((header: { key: string; value: string }) => [header.key, header.value]));
  assert.equal(all["X-Content-Type-Options"], "nosniff");
  assert.equal(all["X-Frame-Options"], "DENY");
  assert.match(all["Referrer-Policy"], /strict-origin/);
  assert.match(all["Permissions-Policy"], /camera=\(\)/);
  assert.match(all["Strict-Transport-Security"], /max-age=\d+/);
  assert.doesNotMatch(all["Strict-Transport-Security"], /preload|includeSubDomains/);
  assert.equal(securityHeaderRules({ production: false })[0].headers.some((h: { key: string }) => h.key === "Strict-Transport-Security"), false);
  assert.equal(rules[1].source, "/((?!api/).*)");
  assert.match(ENFORCED_CSP, /frame-ancestors 'none'/);
  assert.match(REPORT_ONLY_CSP, /form-action 'self' https:\/\/accounts\.google\.com/);
  assert.match(REPORT_ONLY_CSP, /report-uri \/api\/security\/csp-report/);
});

test("published stable release matches the APK actually served", async () => {
  const { getPublicReleaseInfo } = await import("../lib/version/app-version");
  const appVersion = JSON.parse(readFileSync(path.join(process.cwd(), "mobile", "app-version.json"), "utf8"));
  const release = await getPublicReleaseInfo();
  assert.equal(release.latest_version, appVersion.name, "migration publishes the version the app was built with");
  assert.equal(release.latest_version_code, appVersion.code);
  assert.equal(release.sha256, latestSha(), "published checksum equals the committed latest APK");
  assert.equal(release.integrity, "verified");
  assert.equal(release.preview?.enabled, false, "preview is not offered unless an admin enables it");
  const named = createHash("sha256").update(readFileSync(path.join(process.cwd(), "public", "downloads", `nursing-ai-v${appVersion.name}.apk`))).digest("hex");
  assert.equal(named, latestSha(), "the versioned file and the latest file are the same build");
});

test("in-app update API and APK route agree, and a checksum mismatch is never served", async () => {
  const version = await (await (await import("../app/api/app/version/route")).GET()).json();
  assert.equal(version.available, true);
  assert.equal(version.sha256, latestSha());
  assert.equal(version.apk_url, "/api/download/apk");
  assert.equal("preview" in version, false, "the update check never offers the preview channel");

  const { GET: download } = await import("../app/api/download/apk/route");
  const ok = await download();
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("X-Checksum-SHA256"), latestSha());
  await ok.body?.cancel();

  await db.query("update settings set value=jsonb_set(value,'{sha256}',to_jsonb(repeat('0',64))) where key='mobile_app_version'");
  const blocked = await download();
  assert.equal(blocked.status, 503);
  const update = await (await (await import("../app/api/app/version/route")).GET()).json();
  assert.equal(update.available, false, "apps are not told to update to an unverifiable file");
});

test("admin sessions expire after 12 idle hours; student sessions keep the long device session", async () => {
  const rows = (await db.query<{ is_admin_session: boolean; hours: number }>(
    "select is_admin_session, extract(epoch from expires_at-now())/3600 hours from app_sessions where user_id in ($1,$2)", [admin, student])).rows;
  const adminRow = rows.find((row) => row.is_admin_session);
  assert.ok(adminRow && Number(adminRow.hours) <= 12 && Number(adminRow.hours) > 11);
  const { renewSession } = await import("../lib/auth/session-store");
  assert.ok(await renewSession(adminSession.sessionToken, adminSession.deviceToken));
  const renewed = (await db.query<{ hours: number }>("select extract(epoch from expires_at-now())/3600 hours from app_sessions where user_id=$1", [admin])).rows[0];
  assert.ok(Number(renewed.hours) <= 12, "renewal slides the admin window without extending it to a year");
});
