// Migration 0031 on a database that already holds students' data: additive, data-preserving and reversible.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { migrate } from "../scripts/migrate.mjs";

const db = new PGlite({ extensions: { vector } });
const execute = async (sql: string, values?: unknown[]) => {
  if (!values && (sql.includes(";") || sql.includes("--"))) { await db.exec(sql); return { rows: [] }; }
  return db.query(sql, values);
};
const root = process.cwd();
// Inside node_modules so the copied runner resolves the repository's packages (pg).
const cache = path.join(root, "node_modules", ".cache");
fs.mkdirSync(cache, { recursive: true });
const temp = fs.mkdtempSync(path.join(cache, "nursing-0031-"));
const uid = "60000000-0000-4000-8000-000000000001";

/** Everything the application can observe about the schema. */
async function snapshot() {
  const list = async (sql: string) => (await db.query<{ v: string }>(sql)).rows.map((row) => row.v);
  return {
    columns: await list(`select table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'') v from information_schema.columns where table_schema='public' order by 1`),
    tables: await list("select table_name v from information_schema.tables where table_schema='public' order by 1"),
    indexes: await list("select indexname v from pg_indexes where schemaname='public' order by 1"),
    policies: await list("select tablename||'.'||policyname v from pg_policies where schemaname='public' order by 1"),
  };
}
const NEW_COLUMNS = [
  "knowledge_documents.outline_json", "knowledge_documents.structure_version", "knowledge_documents.chapter_count", "knowledge_chunks.chapter_index",
  "knowledge_chunks.slide_number", "conversation_summaries.current_chapter_index", "conversation_summaries.current_position", "messages.generation_id",
];

before(async () => {
  // A copy of the runner and of every migration except 0031 = the production database before this release.
  fs.mkdirSync(path.join(temp, "scripts"));
  fs.mkdirSync(path.join(temp, "database"));
  for (const file of ["migrate.mjs", "backup-receipt.mjs"]) fs.copyFileSync(path.join(root, "scripts", file), path.join(temp, "scripts", file));
  for (const file of fs.readdirSync(path.join(root, "database")))
    if (/^\d{4}_.+\.sql$|^seed\.sql$/.test(file) && !file.startsWith("0031_")) fs.copyFileSync(path.join(root, "database", file), path.join(temp, "database", file));
});
after(async () => { fs.rmSync(temp, { recursive: true, force: true }); await db.close(); });

test("0031 upgrades a populated database without losing or rewriting anything, and the old shape keeps working", async () => {
  const previous = await import(pathToFileURL(path.join(temp, "scripts", "migrate.mjs")).href);
  await previous.migrate({ query: execute });
  assert.equal((await db.query("select 1 from app_migrations where version='0031'")).rows.length, 0);
  const before = await snapshot();
  assert.ok(!before.columns.some((column) => column.startsWith("messages.generation_id")));

  // Data written by the released application (no knowledge of the new columns).
  const year = (await db.query<{ id: string }>("select id from academic_years limit 1")).rows[0].id;
  await db.query("insert into app_users(id,email,password_hash) values($1,'legacy@example.test','x')", [uid]);
  await db.query("insert into profiles(user_id,email,full_name,role,academic_year_id) values($1,'legacy@example.test','Legacy','student',$2)", [uid, year]);
  const conversation = (await db.query<{ id: string }>("insert into conversations(user_id,title) values($1,'Old chat') returning id", [uid])).rows[0].id;
  await db.query("insert into messages(conversation_id,role,content) values($1,'user','سؤال قديم'),($1,'assistant','إجابة قديمة')", [conversation]);
  const document = (await db.query<{ id: string }>(`insert into knowledge_documents(title,original_file_name,storage_path,source_type,status,is_active,extracted_text_length,chunk_count,embedding_count,page_count,publication_status)
    values('Old book','old.pdf','old/path','required_textbook','ready',true,20,1,1,3,'published') returning id`)).rows[0].id;
  await db.query("insert into knowledge_chunks(document_id,source_type,source_priority,chunk_index,content,content_hash,embedding,token_count,page_number) values($1,'required_textbook',90,0,'Old chunk text','h0',$2::vector,4,2)",
    [document, `[${Array(1536).fill(0.05)}]`]);
  await db.query("insert into conversation_summaries(conversation_id,user_id,summary,current_document_id) values($1,$2,'old summary',$3)", [conversation, uid, document]);

  await migrate({ query: execute }); // the real runner applies only the pending 0031

  const after = await snapshot();
  const pending = new Set(after.columns);
  const missing = before.columns.filter((column) => !pending.has(column));
  assert.deepEqual(missing, [], "every pre-existing column survives with the same type, nullability and default");
  for (const column of NEW_COLUMNS) assert.ok(after.columns.some((value) => value.startsWith(`${column}:`)), `${column} was added`);
  assert.ok(after.tables.includes("chat_generations"));
  assert.deepEqual(before.tables.filter((table) => !after.tables.includes(table)), [], "no table was dropped");
  assert.deepEqual(before.indexes.filter((index) => !after.indexes.includes(index)), [], "no index was dropped");
  assert.deepEqual(before.policies.filter((policy) => !after.policies.includes(policy)), [], "no policy was dropped");

  assert.deepEqual((await db.query<{ role: string; content: string }>("select role,content from messages")).rows.map((row) => `${row.role}:${row.content}`).sort(), ["assistant:إجابة قديمة", "user:سؤال قديم"].sort());
  const doc = (await db.query<{ structure_version: number; chapter_count: number; outline_json: unknown; status: string; chunk_count: number }>("select structure_version,chapter_count,outline_json,status,chunk_count from knowledge_documents where id=$1", [document])).rows[0];
  assert.deepEqual(doc, { structure_version: 0, chapter_count: 0, outline_json: null, status: "ready", chunk_count: 1 });
  const chunk = (await db.query<{ content: string; chapter_index: number | null; chapter_title: string | null; slide_number: number | null }>("select content,chapter_index,chapter_title,slide_number from knowledge_chunks where document_id=$1", [document])).rows[0];
  assert.deepEqual(chunk, { content: "Old chunk text", chapter_index: null, chapter_title: null, slide_number: null });
  assert.equal((await db.query<{ n: number | null }>("select current_chapter_index n from conversation_summaries where conversation_id=$1", [conversation])).rows[0].n, null);

  // The released application's inserts (no generation_id, no chapter columns) still work, repeatedly.
  await db.query("insert into messages(conversation_id,role,content) values($1,'user','a'),($1,'user','b'),($1,'assistant','c')", [conversation]);
  await db.query("insert into knowledge_chunks(document_id,source_type,source_priority,chunk_index,content,content_hash,embedding,token_count) values($1,'required_textbook',90,1,'More text','h1',$2::vector,3)", [document, `[${Array(1536).fill(0.06)}]`]);
  // ...while the new unique index still forbids a second answer for one generation.
  const generation = crypto.randomUUID();
  await db.query("insert into messages(conversation_id,role,content,generation_id) values($1,'assistant','first',$2)", [conversation, generation]);
  await assert.rejects(db.query("insert into messages(conversation_id,role,content,generation_id) values($1,'assistant','second',$2)", [conversation, generation]), /unique|duplicate/i);
});

test("the manual rollback restores the previous schema exactly, keeps every message and book, and 0031 can be applied again", async () => {
  const upgraded = await snapshot();
  const messagesBefore = (await db.query<{ n: number }>("select count(*)::int n from messages")).rows[0].n;
  const chunksBefore = (await db.query<{ n: number }>("select count(*)::int n from knowledge_chunks")).rows[0].n;

  await db.exec(fs.readFileSync(path.join(root, "database", "rollback", "0031_rollback.sql"), "utf8"));

  const rolledBack = await snapshot();
  // The schema the previous release saw = the upgraded schema minus exactly the 0031 additions.
  const expected = new Set(upgraded.columns.filter((column) => !rolledBack.columns.includes(column)).map((column) => column.split(":")[0]));
  assert.ok(expected.size >= NEW_COLUMNS.length, "the rollback removed the new columns");
  for (const column of NEW_COLUMNS) assert.ok(expected.has(column), `${column} was removed by the rollback`);
  assert.ok(!rolledBack.tables.includes("chat_generations"));
  assert.ok(!rolledBack.indexes.includes("messages_generation_unique") && !rolledBack.indexes.includes("knowledge_chunks_chapter"));
  assert.equal((await db.query("select 1 from app_migrations where version='0031'")).rows.length, 0, "the runner will offer 0031 again");
  assert.equal((await db.query<{ n: number }>("select count(*)::int n from messages")).rows[0].n, messagesBefore, "no message was lost");
  assert.equal((await db.query<{ n: number }>("select count(*)::int n from knowledge_chunks")).rows[0].n, chunksBefore, "no chunk or embedding was lost");

  await migrate({ query: execute });
  assert.deepEqual(await snapshot(), upgraded, "re-applying after a rollback gives the identical schema");
});

test("0031 sets a lock timeout so it fails fast instead of blocking the application", () => {
  const sql = fs.readFileSync(path.join(root, "database", "0031_document_structure_and_generations.sql"), "utf8");
  assert.match(sql, /set local lock_timeout\s*=\s*'\d+s'/);
  assert.doesNotMatch(sql, /\bdrop\s+(table|column)\b|\balter\s+column\b|\btruncate\b|\bdelete\s+from\b/i, "nothing is dropped, retyped or deleted");
  assert.doesNotMatch(sql, /create\s+index\s+concurrently/i, "the runner uses one transaction, where CONCURRENTLY is not allowed");
});
