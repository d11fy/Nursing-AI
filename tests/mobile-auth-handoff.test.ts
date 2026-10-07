import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  decryptHandoff,
  encryptHandoff,
  exchangeMobileHandoff,
} from "../lib/auth/mobile";
const db = new PGlite();
const digest = (value: string, encoding: "hex" | "base64url") =>
  createHash("sha256").update(value).digest(encoding);
const session = { sessionToken: "a".repeat(64), deviceToken: "b".repeat(64) };
before(async () => {
  process.env.DATABASE_URL = "postgresql://handoff-test";
  process.env.AUTH_SECRET = "handoff-test-secret-".repeat(3);
  Object.assign(globalThis, {
    nursingPool: {
      query: (sql: string, values?: unknown[]) => db.query(sql, values),
    },
  });
  await db.exec(readFileSync("database/0028_mobile_auth_handoffs.sql", "utf8"));
});
after(() => db.close());
const insert = async (code: string, verifier: string, expiry = "2 minutes") =>
  db.query(
    "insert into mobile_auth_handoffs values($1,$2,$3,now()+$4::interval)",
    [
      digest(code, "hex"),
      digest(verifier, "base64url"),
      encryptHandoff(session),
      expiry,
    ],
  );
test("handoff credentials are authenticated encryption, and modified ciphertext is rejected", () => {
  const cipher = encryptHandoff(session);
  assert.ok(!cipher.includes(session.sessionToken));
  assert.deepEqual(decryptHandoff(cipher), session);
  const bytes = Buffer.from(cipher, "base64url");
  bytes[28] ^= 1;
  assert.throws(() => decryptHandoff(bytes.toString("base64url")));
});
test("only the initiating app can exchange a code, and a bad proof cannot consume it", async () => {
  await insert("first", "valid-proof");
  assert.equal(await exchangeMobileHandoff("first", "other-proof"), null);
  assert.deepEqual(
    await exchangeMobileHandoff("first", "valid-proof"),
    session,
  );
  assert.equal(await exchangeMobileHandoff("first", "valid-proof"), null);
});
test("concurrent exchanges have a single winner, and expired codes never authenticate", async () => {
  await insert("concurrent", "proof");
  const results = await Promise.all([
    exchangeMobileHandoff("concurrent", "proof"),
    exchangeMobileHandoff("concurrent", "proof"),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
  await insert("expired", "proof", "-1 second");
  assert.equal(await exchangeMobileHandoff("expired", "proof"), null);
});

test("Google start validates callback schemes and keeps device credentials out of browser URLs", async () => {
  const { POST } = await import("../app/api/auth/mobile/start/route");
  const input = {
    challenge: digest("verifier", "base64url"),
    state: "a".repeat(64),
    deviceToken: "b".repeat(64),
    scheme: "nursingai-preview",
  };
  const request = (value: unknown) =>
    new Request("https://nursing.example/api/auth/mobile/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
  assert.equal((await POST(request({ ...input, scheme: "evil" }))).status, 400);
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  assert.equal((await POST(request(input))).status, 503);
  process.env.GOOGLE_CLIENT_ID = "test-client";
  process.env.GOOGLE_CLIENT_SECRET = "test-secret";
  process.env.APP_URL = "https://nursing.example";
  const response = await POST(request(input));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(!body.url.includes(input.deviceToken));
  assert.ok(!body.url.includes(input.state));
  const ticket = new URL(body.url, "https://nursing.example").searchParams.get(
    "ticket",
  )!;
  const payload = decryptHandoff<typeof input & { expires: number }>(ticket);
  assert.equal(payload.deviceToken, input.deviceToken);
  assert.equal(payload.scheme, "nursingai-preview");
  assert.ok(payload.expires > Date.now());
});
