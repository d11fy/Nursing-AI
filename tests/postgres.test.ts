import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { Query, type Actor, type Executor } from "../lib/db/query";
import { hashPassword, verifyPassword, newToken, tokenHash } from "../lib/auth/password";
import { migrate } from "../scripts/migrate.mjs";
import { readSession } from "../lib/auth/session";
import { DatabaseClient } from "../lib/db/server";
import { uploadChatImage, getSignedChatImageUrl, validFileSignature } from "../lib/storage";
import { limitedFormData } from "../lib/request-body";
import { GET as getFile } from "../app/api/files/route";
import { processDocument } from "../lib/knowledge";
import { searchKnowledge } from "../lib/ai/rag";

const db = new PGlite();
const executor: Executor = (sql, values) => db.query(sql, values);
const migrationClient = { query: async (sql: string, values?: unknown[]) => {
  if (!values && (sql.includes("create table public.app_users") || sql.includes("alter table public.document_chunks"))) { await db.exec(sql); return { rows: [] }; }
  return db.query(sql, values);
} };
const alice: Actor = { user_id: "10000000-0000-4000-8000-000000000001", role: "student", status: "active" };
const bob: Actor = { user_id: "10000000-0000-4000-8000-000000000002", role: "student", status: "active" };
const admin: Actor = { user_id: "10000000-0000-4000-8000-000000000003", role: "admin", status: "active" };
let conversation: string;
let message: string;

before(async () => {
  process.env.DATABASE_URL = "postgresql://integration-test-only";
  process.env.AUTH_SECRET = "integration-test-secret-".repeat(3);
  process.env.APP_URL = "https://nursing.example.test";
  Object.assign(globalThis, { nursingPool: {
    query: executor,
    connect: async () => ({ query: executor, release() {} }),
  } });
  await migrate(migrationClient);
  for (const actor of [alice, bob, admin]) {
    await db.query("INSERT INTO app_users(id,email,password_hash) VALUES($1,$2,'unused')", [actor.user_id, `${actor.role}-${actor.user_id}@example.test`]);
    await db.query("INSERT INTO profiles(user_id,email,full_name,role) VALUES($1,$2,'Test',$3)", [actor.user_id, `${actor.role}-${actor.user_id}@example.test`, actor.role]);
  }
  const row = await new Query("conversations", alice, false, executor).insert({ user_id: alice.user_id, title: "Alice private chat" }).single();
  assert.equal(row.error, null);
  conversation = row.data!.id;
  const msg = await new Query("messages", alice, false, executor).insert({ conversation_id: conversation, role: "user", content: "Private" }).single();
  assert.equal(msg.error, null);
  message = msg.data!.id;
});
after(() => db.close());

test("migration can rerun without losing users or duplicating seeds", async () => {
  await migrate(migrationClient);
  assert.equal((await db.query<{ n: number }>("SELECT count(*)::int n FROM subjects")).rows[0].n, 8);
  assert.equal((await db.query<{ n: number }>("SELECT count(*)::int n FROM app_users")).rows[0].n, 3);
});
test("anonymous and suspended users cannot query data", async () => {
  assert.ok((await new Query("subjects", null, false, executor).select()).error);
  assert.ok((await new Query("profiles", { ...alice, status: "suspended" }, false, executor).select()).error);
});
test("students cannot read or mutate another student's conversation", async () => {
  assert.deepEqual((await new Query("conversations", bob, false, executor).select()).data, []);
  assert.deepEqual((await new Query("conversations", bob, false, executor).update({ title: "Hijack" }).eq("id", conversation)).data, []);
  assert.deepEqual((await new Query("conversations", bob, false, executor).delete().eq("id", conversation)).data, []);
  assert.equal((await new Query("conversations", alice, false, executor).eq("id", conversation).single()).data?.title, "Alice private chat");
});
test("students cannot assign conversation ownership or promote themselves", async () => {
  assert.ok((await new Query("conversations", bob, false, executor).insert({ user_id: alice.user_id })).error);
  assert.ok((await new Query("conversations", alice, false, executor).update({ user_id: bob.user_id })).error);
  assert.ok((await new Query("profiles", alice, false, executor).update({ role: "admin" })).error);
  assert.equal((await new Query("profiles", alice, false, executor).update({ full_name: "Changed" }).eq("user_id", alice.user_id).single()).error, null);
});
test("message and feedback writes check conversation ownership", async () => {
  assert.deepEqual((await new Query("messages", bob, false, executor).select()).data, []);
  assert.ok((await new Query("messages", bob, false, executor).insert({ conversation_id: conversation, role: "user", content: "Attack" })).error);
  assert.ok((await new Query("message_feedback", bob, false, executor).insert({ message_id: message, user_id: bob.user_id, is_positive: true })).error);
  assert.equal((await new Query("message_feedback", alice, false, executor).insert({ message_id: message, user_id: alice.user_id, is_positive: true })).error, null);
});
test("values are parameterized and identifiers are allowlisted", async () => {
  const title = "'; DROP TABLE profiles; --";
  assert.equal((await new Query("conversations", alice, false, executor).insert({ user_id: alice.user_id, title }).single()).data?.title, title);
  assert.throws(() => new Query("profiles", admin, false, executor).select("id; DROP TABLE profiles"));
});
test("only admins change subjects/settings; JSON numeric values survive", async () => {
  assert.ok((await new Query("settings", alice, false, executor).update({ value: 99 })).error);
  assert.equal((await new Query("settings", admin, false, executor).update({ value: 30 }).eq("key", "free_daily_limit").single()).data?.value, 30);
});
test("admin functions enforce the current transaction identity", async () => {
  await assert.rejects(db.query("SELECT * FROM admin_dashboard_stats()"), /forbidden/);
  await db.query("BEGIN");
  try {
    await db.query("SELECT set_config('app.user_id',$1,true)", [admin.user_id]);
    assert.equal((await db.query<{ total_students: number }>("SELECT * FROM admin_dashboard_stats()")).rows[0].total_students, 2);
    assert.equal((await db.query("SELECT * FROM admin_usage_last_7_days()")).rows.length, 7);
    assert.equal((await db.query("SELECT * FROM admin_list_students()")).rows.length, 2);
  } finally { await db.query("ROLLBACK"); }
});
test("RAG uses standard PostgreSQL arrays without pgvector", async () => {
  const doc = await new Query("documents", admin, false, executor).insert({ title: "Book", file_url: "knowledge/test", file_name: "test.txt", status: "ready" }).single();
  const vector = Array.from({ length: 1536 }, (_, i) => i === 0 ? 1 : 0);
  const inserted = await new Query("document_chunks", null, true, executor).insert({ document_id: doc.data!.id, content: "Test knowledge", embedding: vector, embedding_provider: "openai", embedding_model: "text-embedding-3-small", embedding_dimensions: vector.length, chunk_index: 0 });
  assert.equal(inserted.error, null);
  const found = await db.query<{ similarity: number }>("SELECT * FROM match_document_chunks($1,null,5,'openai','text-embedding-3-small')", [vector]);
  assert.equal(found.rows[0].similarity, 1);
});

test("RAG isolates provider, model and dimensions, excluding legacy vectors", async () => {
  const doc = await new Query("documents", admin, false, executor).insert({ title: "Local", file_url: "knowledge/local", file_name: "local.txt", status: "ready" }).single();
  const vector = Array.from({ length: 768 }, (_, i) => i === 0 ? 1 : 0);
  for (const [provider, model, dimension] of [["ollama", "nomic-embed-text", 768], ["openai", "nomic-embed-text", 768], ["ollama", "different", 768], ["ollama", "nomic-embed-text", 1536]] as const) {
    await db.query("INSERT INTO document_chunks(document_id,content,chunk_index,embedding,embedding_provider,embedding_model,embedding_dimensions) VALUES($1,$2,0,$3,$4,$5,$6)", [doc.data!.id, `${provider}/${model}/${dimension}`, Array.from({ length: dimension }, (_, i) => i === 0 ? 1 : 0), provider, model, dimension]);
  }
  await db.query("INSERT INTO document_chunks(document_id,content,chunk_index,embedding) VALUES($1,'legacy',0,$2)", [doc.data!.id, vector]);
  const found = await new DatabaseClient(null, true).rpc("match_document_chunks", { query_embedding: vector, query_provider: "ollama", query_model: "nomic-embed-text", match_subject_id: null, match_count: 5 });
  assert.equal(found.error, null);
  assert.equal(found.data?.length, 1);
  assert.equal(found.data?.[0].content, "ollama/nomic-embed-text/768");
  assert.equal(found.data?.[0].similarity, 1);
  assert.equal((await db.query<{ n: number | null }>("SELECT cosine_similarity(ARRAY[1,0]::float8[],ARRAY[1]::float8[]) n")).rows[0].n, null);
  await assert.rejects(db.query("INSERT INTO document_chunks(document_id,content,chunk_index,embedding,embedding_provider,embedding_model,embedding_dimensions) VALUES($1,'invalid',0,$2,'ollama','nomic-embed-text',1536)", [doc.data!.id, vector]));
});

test("reindex uses stored files and Ollama; RAG retrieves the new space and hides failures", async (t) => {
  const previous = { ...process.env };
  process.env.AI_PROVIDER = "ollama";
  process.env.OLLAMA_EMBEDDING_MODEL = "nomic-embed-text";
  const subject = (await db.query<{ id: string }>("SELECT id FROM subjects LIMIT 1")).rows[0].id;
  const doc = await new Query("documents", admin, false, executor).insert({ title: "Ingestion", file_url: "knowledge/reindex", file_name: "test.txt", subject_id: subject, status: "ready" }).single();
  await db.query("INSERT INTO stored_files(path,bucket,owner_id,mime_type,content) VALUES('knowledge/reindex','knowledge-documents',$1,'text/plain',$2)", [admin.user_id, Buffer.from("Test nursing knowledge")]);
  await db.query("INSERT INTO document_chunks(document_id,content,embedding,chunk_index) VALUES($1,'old knowledge',$2,0)", [doc.data!.id, Array(1536).fill(0.5)]);
  const wrapped: Executor = async (sql, values) => {
    const result = await executor(sql, values);
    for (const row of result.rows) if (row.content instanceof Uint8Array) row.content = Buffer.from(row.content);
    return result;
  };
  Object.assign(globalThis, { nursingPool: { query: wrapped, connect: async () => ({ query: wrapped, release() {} }) } });
  let calls = 0;
  const fetchMock = t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    calls++;
    const body = JSON.parse(String(init.body));
    assert.equal(body.model, "nomic-embed-text");
    return Response.json({ embeddings: body.input.map(() => Array(768).fill(0.5)), prompt_eval_count: 6 });
  });
  try {
    await processDocument(doc.data!.id);
    const chunks = await db.query<{ content: string; embedding_dimensions: number }>("SELECT * FROM document_chunks WHERE document_id=$1", [doc.data!.id]);
    assert.equal(chunks.rows.length, 1);
    assert.equal(chunks.rows[0].content, "Test nursing knowledge");
    assert.equal(chunks.rows[0].embedding_dimensions, 768);
    const knowledge = await searchKnowledge("question", subject);
    assert.equal(knowledge.length, 1);
    assert.equal(knowledge[0].content, "Test nursing knowledge");
    assert.equal(calls, 2);
    fetchMock.mock.restore();
    t.mock.method(globalThis, "fetch", async () => { throw new Error("offline"); });
    await assert.rejects(processDocument(doc.data!.id), /ollama serve/);
    assert.equal((await db.query<{ status: string }>("SELECT status FROM documents WHERE id=$1", [doc.data!.id])).rows[0].status, "failed");
    assert.equal((await db.query("SELECT * FROM stored_files WHERE path='knowledge/reindex'")).rows.length, 1);
  } finally {
    for (const key of ["AI_PROVIDER", "OLLAMA_EMBEDDING_MODEL"]) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
    Object.assign(globalThis, { nursingPool: { query: executor, connect: async () => ({ query: executor, release() {} }) } });
  }
});
test("stored files round-trip as binary and enforce size limits", async () => {
  const bytes = new Uint8Array([0, 255, 128, 1]);
  await db.query("INSERT INTO stored_files(path,bucket,owner_id,mime_type,content) VALUES('test','chat-images',$1,'image/png',$2)", [alice.user_id, bytes]);
  const row = await db.query<{ content: Uint8Array }>("SELECT content FROM stored_files WHERE path='test'");
  assert.deepEqual(row.rows[0].content, bytes);
  await assert.rejects(db.query("INSERT INTO stored_files(path,bucket,owner_id,mime_type,content) VALUES('oversized','chat-images',$1,'image/png',$2)", [alice.user_id, new Uint8Array(10 * 1024 * 1024 + 1)]));
});
test("password hashing uses distinct salts and rejects incorrect passwords", async () => {
  const first = await hashPassword("a-long-test-password");
  assert.notEqual(first, await hashPassword("a-long-test-password"));
  assert.equal(await verifyPassword("a-long-test-password", first), true);
  assert.equal(await verifyPassword("incorrect", first), false);
  assert.equal(await verifyPassword("anything", "malformed"), false);
  const token = newToken();
  assert.equal(token.length, 64);
  assert.notEqual(tokenHash(token), token);
});
test("sessions reject forged, expired, logged-out and suspended identities", async () => {
  const token = newToken();
  await db.query("INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [tokenHash(token), bob.user_id]);
  assert.equal((await readSession(token))?.user_id, bob.user_id);
  assert.equal(await readSession(newToken()), null);
  assert.equal(await readSession("invalid"), null);
  await db.query("UPDATE profiles SET status='suspended' WHERE user_id=$1", [bob.user_id]);
  assert.equal(await readSession(token), null);
  await db.query("UPDATE profiles SET status='active' WHERE user_id=$1", [bob.user_id]);
  await db.query("UPDATE app_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1", [tokenHash(token)]);
  assert.equal(await readSession(token), null);
  await db.query("DELETE FROM app_sessions WHERE token_hash=$1", [tokenHash(token)]);
  assert.equal(await readSession(token), null);
});
test("RPC access checks cannot be bypassed by a student", async () => {
  assert.ok((await new DatabaseClient(alice).rpc("admin_list_students")).error);
  assert.ok((await new DatabaseClient(alice).rpc("get_today_usage_count", { p_user_id: bob.user_id })).error);
  assert.equal((await new DatabaseClient(admin).rpc("admin_list_students")).data?.length, 2);
});
test("private images enforce ownership, signature and expiry", async () => {
  const bytes = new Uint8Array([137,80,78,71]);
  const image = await uploadChatImage(new DatabaseClient(alice), alice.user_id, new File([bytes], "test.png", { type: "image/png" }));
  await assert.rejects(getSignedChatImageUrl(new DatabaseClient(bob), image.path));
  const url = new URL(image.signedUrl);
  const expires = url.searchParams.get("expires")!;
  const signature = url.searchParams.get("signature")!;
  assert.equal(validFileSignature(image.path, expires, signature), true);
  assert.equal(validFileSignature(image.path + "tamper", expires, signature), false);
  assert.equal(validFileSignature(image.path, String(Date.now()-1000), signature), false);
  const response = await getFile(new Request(url));
  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  url.searchParams.set("path", "other");
  assert.equal((await getFile(new Request(url))).status, 403);
});
test("streamed multipart body is limited even without Content-Length", async () => {
  const form = new FormData();
  form.set("file", new File(["small text"], "test.txt"));
  const request = new Request("http://localhost/upload", { method: "POST", body: form });
  assert.equal((await limitedFormData(request, 4096)).get("file") instanceof File, true);
  const oversized = new Request("http://localhost/upload", { method: "POST", body: "oversized body" });
  await assert.rejects(limitedFormData(oversized, 2));
});
