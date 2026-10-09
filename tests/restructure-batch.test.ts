// knowledge:restructure — idempotent, resumable, batch-safe, one book never stops the others, no duplicates.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { migrate } from "../scripts/migrate.mjs";
import { workerDb } from "../lib/tutor/db";
import { registerDocument, processKnowledgeDocument } from "../lib/tutor/ingestion";
import { countRestructureCandidates, parseJournal, runRestructure, type RestructureResult } from "../lib/tutor/restructure-batch";
import { structureChunks } from "../lib/tutor/chunking";
import { databaseFingerprint } from "../scripts/backup-receipt.mjs";
import type { PageText } from "../lib/tutor/structure";
import { buildBook } from "./fixtures/sample-book";

const db = new PGlite({ extensions: { vector } });
const uid = "70000000-0000-4000-8000-000000000001";
let subject: string;
let tail = Promise.resolve();
async function acquire() { let release!: () => void; const previous = tail; tail = new Promise<void>((r) => { release = r; }); await previous; return release; }
async function direct(sql: string, values?: unknown[]) {
  const result = await db.query<Record<string, unknown>>(sql, values);
  for (const row of result.rows) for (const [key, value] of Object.entries(row)) if (value instanceof Uint8Array) row[key] = Buffer.from(value);
  return result;
}
const pool = {
  query: async (sql: string, values?: unknown[]) => { const unlock = await acquire(); try { return await direct(sql, values); } finally { unlock(); } },
  connect: async () => {
    let unlock: (() => void) | undefined;
    return {
      query: async (sql: string, values?: unknown[]) => {
        if (sql === "BEGIN") { unlock = await acquire(); return direct(sql, values); }
        if (unlock) { try { return await direct(sql, values); } finally { if (sql === "COMMIT" || sql === "ROLLBACK") { unlock(); unlock = undefined; } } }
        const done = await acquire(); try { return await direct(sql, values); } finally { done(); }
      },
      release() { unlock?.(); unlock = undefined; },
    };
  },
};

const embed = (text: string) => {
  const values = new Float32Array(1536);
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) { let hash = 0; for (const ch of word) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0; values[hash % 1536] += 1; }
  const norm = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0)) || 1;
  return Array.from(values, (v) => v / norm);
};
let embedded = 0, embeddingsDown = false;
const originalFetch = globalThis.fetch;
const scriptedFetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
  if (embeddingsDown) throw new TypeError("embedding service unreachable");
  const body = JSON.parse(String(init?.body));
  const texts: string[] = Array.isArray(body.input) ? body.input : [body.input];
  embedded += texts.length;
  return Response.json({ model: "text-embedding-3-small", data: texts.map((text, index) => ({ index, embedding: embed(text) })), usage: { total_tokens: texts.length * 10 } });
}) as typeof fetch;

let counter = 0;
async function ingest(pages: PageText[], title: string) {
  const index = ++counter;
  const lecture = (await db.query<{ id: string }>(`insert into lectures(user_id,subject_id,title,file_name,original_file_name,storage_path,mime_type,file_size_bytes,file_hash,status)
    values($1,$2,$3,'b.pdf','b.pdf',$4,'application/pdf',100,$5,'uploaded') returning id`, [uid, subject, title, `b-${index}`, `hash-${index}`])).rows[0].id;
  const documentId = await registerDocument(lecture, true);
  await workerDb.query("update knowledge_documents set extracted_pages_json=$2::jsonb where id=$1", [documentId, JSON.stringify(pages)]);
  await processKnowledgeDocument(documentId);
  return documentId;
}
/** Puts a ready book back into the state it had before structure detection existed. */
async function makeLegacy(documentId: string) {
  await workerDb.query("update knowledge_chunks set chapter_index=null,chapter_number=null,chapter_title=null,section_title=null,subsection_title=null,slide_number=null where document_id=$1", [documentId]);
  await workerDb.query("update knowledge_documents set outline_json=null,structure_version=0,chapter_count=0,section_count=0,structure_confidence=null,structure_method=null where id=$1", [documentId]);
}
async function legacyMidPage(documentId: string) {
  const pages: PageText[] = buildBook({ toc: false }).map((page, i, all) => (i > 0 && i < all.length - 1 && /^Chapter \d+:/.test(all[i + 1].text) ? { ...page, text: `${page.text}\n${all[i + 1].text.split("\n")[0]}` } : page));
  await workerDb.query("update knowledge_documents set extracted_pages_json=$2::jsonb where id=$1", [documentId, JSON.stringify(pages)]);
  await workerDb.query("delete from knowledge_chunks where document_id=$1", [documentId]);
  let index = 0;
  for (const page of pages) for (const chunk of structureChunks(page.text))
    await workerDb.query(`insert into knowledge_chunks(document_id,subject_id,source_type,source_priority,page_number,chunk_index,content,content_hash,embedding,token_count)
      values($1,$2,'student_private_file',100,$3,$4,$5,$6,$7::vector,$8)`, [documentId, subject, page.pageNumber, index++, chunk.content, chunk.contentHash, `[${embed(chunk.content).join(",")}]`, chunk.tokenCount]);
  await workerDb.query("update knowledge_documents set chunk_count=$2,embedding_count=$2 where id=$1", [documentId, index]);
  await makeLegacy(documentId);
}
const state = async (id: string) => (await workerDb.query<{ structure_version: number; status: string; chunk_count: number; chunks: number; chapters: number }>(
  `select d.structure_version,d.status,d.chunk_count,(select count(*)::int from knowledge_chunks where document_id=d.id) chunks,
   (select count(distinct chapter_index)::int from knowledge_chunks where document_id=d.id) chapters from knowledge_documents d where d.id=$1`, [id])).rows[0];
const chunkIds = async (id: string) => (await workerDb.query<{ id: string }>("select id from knowledge_chunks where document_id=$1 order by chunk_index", [id])).rows.map((row) => row.id);

let a: string, b: string, c: string, d: string, e: string;
before(async () => {
  process.env.DATABASE_URL = "postgresql://test-only"; process.env.OPENAI_API_KEY = "restructure-test-key";
  Object.assign(globalThis, { nursingPool: pool, fetch: scriptedFetch });
  await migrate({ query: async (sql: string, values?: unknown[]) => { if (!values && (sql.includes(";") || sql.includes("--"))) { await db.exec(sql); return { rows: [] }; } return db.query(sql, values); } });
  const year = (await db.query<{ id: string }>("select id from academic_years where code='first_year'")).rows[0].id;
  subject = (await db.query<{ id: string }>("insert into subjects(name_ar,name_en) values('التشريح','Anatomy') returning id")).rows[0].id;
  await db.query("insert into subject_academic_years(subject_id,academic_year_id) values($1,$2)", [subject, year]);
  await db.query("insert into app_users(id,email,password_hash) values($1,'s@example.test','x')", [uid]);
  await db.query("insert into profiles(user_id,email,full_name,role,academic_year_id) values($1,'s@example.test','S','student',$2)", [uid, year]);
  a = await ingest(buildBook(), "Book A");
  b = await ingest(buildBook({ style: "chapter-words" }), "Book B");
  c = await ingest(buildBook({ toc: false }), "Book C (no saved extraction)");
  d = await ingest(buildBook({ style: "unit" }), "Book D (rebuild will fail)");
  e = await ingest(buildBook({ toc: false }), "Book E (chapters start mid-page)");
  for (const id of [a, b, c, d]) await makeLegacy(id);
  await workerDb.query("update knowledge_documents set extracted_pages_json='[]'::jsonb where id=$1", [c]);
  await legacyMidPage(e);
});
after(async () => { globalThis.fetch = originalFetch; await db.close(); });

test("one failing book never stops the others, every outcome is reported, and the run is resumable", async () => {
  assert.equal(await countRestructureCandidates({ includePrivate: true }), 5);
  const first: RestructureResult[] = [];
  embeddingsDown = true; // E needs new embeddings (its chapters start mid-page), so it genuinely fails
  const before = { a: await chunkIds(a), e: await state(e) };
  const run1 = await runRestructure({
    includePrivate: true, batchSize: 2,
    rebuild: async (id, options) => { if (id === d) throw new Error("simulated provider outage"); return (await import("../lib/tutor/restructure")).rebuildDocumentStructure(id, options); },
    onResult: (result) => { first.push(result); },
  });
  embeddingsDown = false;
  const byTitle = Object.fromEntries(first.map((r) => [r.title.split(" ")[1], r]));
  assert.equal(first.length, 5, "every document is reported, in a stable order");
  assert.deepEqual([run1.attempted, run1.updated, run1.skipped, run1.failed, run1.busy], [5, 2, 1, 2, 0]);
  assert.equal(byTitle.A.status, "updated"); assert.equal(byTitle.A.mode, "metadata"); assert.equal(byTitle.A.embedded, 0); assert.equal(byTitle.A.chapterCount, 10);
  assert.equal(byTitle.B.status, "updated");
  assert.deepEqual([byTitle.C.status, byTitle.C.reason], ["skipped", "no_extracted_pages"]);
  assert.deepEqual([byTitle.D.status, byTitle.D.error], ["failed", "simulated provider outage"]);
  assert.equal(byTitle.E.status, "failed");
  assert.match(byTitle.E.error ?? "", /connection|unreachable/i);
  assert.ok(first.every((result) => result.durationMs >= 0));
  // The failed books are untouched: still ready, still stale, same chunks.
  const eAfter = await state(e);
  assert.deepEqual([eAfter.status, eAfter.chunks, eAfter.structure_version], ["ready", before.e.chunks, 0]);
  assert.equal((await state(d)).structure_version, 0);
  assert.deepEqual(await chunkIds(a), before.a, "metadata-only rebuild keeps the very same chunk rows");

  // Second run (the outage is over): only what is left is attempted, nothing is repeated, nothing is duplicated.
  const embeddedBefore = embedded;
  const second: RestructureResult[] = [];
  const run2 = await runRestructure({ includePrivate: true, batchSize: 2, onResult: (result) => { second.push(result); } });
  assert.deepEqual(second.map((r) => r.title.split(" ")[1]).sort(), ["C", "D", "E"], "A and B are current and are not visited again");
  assert.deepEqual([run2.updated, run2.skipped, run2.failed], [2, 1, 0]);
  assert.equal(second.find((r) => r.title.includes("Book E"))!.mode, "reindexed");
  assert.ok(embedded - embeddedBefore < 40, `only the changed chunks of E were embedded (${embedded - embeddedBefore})`);
  for (const id of [a, b, d, e]) {
    const s = await state(id);
    assert.deepEqual([s.status, s.structure_version, s.chunks, s.chunks === s.chunk_count, s.chapters], ["ready", 1, s.chunks, true, 10], id);
  }
  assert.equal((await workerDb.query<{ n: number }>("select count(*)::int n from knowledge_documents")).rows[0].n, 5, "no document was duplicated");
  assert.equal((await workerDb.query<{ n: number }>("select count(*)::int n from (select document_id,chunk_index from knowledge_chunks group by 1,2 having count(*)>1) x")).rows[0].n, 0, "no duplicate chunk rows");

  // Third run: fully idempotent. Only the unreadable book is offered, and it changes nothing and embeds nothing.
  const idsBefore = { a: await chunkIds(a), d: await chunkIds(d) };
  const embeddedAgain = embedded;
  const run3 = await runRestructure({ includePrivate: true });
  assert.deepEqual([run3.attempted, run3.updated, run3.unchanged, run3.skipped, run3.failed], [1, 0, 0, 1, 0]);
  assert.equal(embedded, embeddedAgain);
  assert.deepEqual([await chunkIds(a), await chunkIds(d)], [idsBefore.a, idsBefore.d]);

  // --force is also safe to repeat: everything is rebuilt as metadata, zero embeddings, zero new rows.
  const run4 = await runRestructure({ includePrivate: true, force: true });
  assert.equal(run4.failed, 0);
  assert.equal(embedded, embeddedAgain, "unchanged texts are never embedded twice");
  assert.deepEqual(await chunkIds(a), idsBefore.a);
});

test("slices, journal skipping, failure limits, graceful stop and busy documents behave", async () => {
  for (const id of [a, b, d]) await makeLegacy(id);
  const visited: string[] = [];
  const fake = (outcome: (id: string) => "ok" | "fail" | "busy") => async (id: string) => {
    visited.push(id);
    const result = outcome(id);
    if (result === "fail") throw new Error("boom");
    if (result === "busy") throw new Error("Document is already processing");
    return { status: "unchanged", chapterCount: 10 } as const;
  };
  const common = { includePrivate: true, force: true, batchSize: 2 };
  const everything = await runRestructure({ ...common, rebuild: fake(() => "ok") });
  const order = [...visited];
  assert.equal(everything.attempted, 5);

  visited.length = 0;
  const sliced = await runRestructure({ ...common, limit: 2, rebuild: fake(() => "ok") });
  assert.deepEqual([sliced.attempted, sliced.stopped, visited], [2, "limit", order.slice(0, 2)], "a run can be done in slices");

  visited.length = 0;
  const resumed = await runRestructure({ ...common, skip: new Set(order.slice(0, 3)), rebuild: fake(() => "ok") });
  assert.deepEqual(visited, order.slice(3), "a journal's finished books are skipped");
  assert.equal(resumed.stopped, "completed");

  visited.length = 0;
  const limited = await runRestructure({ ...common, maxFailures: 1, rebuild: fake((id) => (id === order[1] ? "fail" : "ok")) });
  assert.deepEqual([limited.failed, limited.stopped, visited.length], [1, "max-failures", 2]);

  visited.length = 0;
  const survivors = await runRestructure({ ...common, rebuild: fake((id) => (id === order[0] ? "fail" : id === order[1] ? "busy" : "ok")) });
  assert.deepEqual([survivors.failed, survivors.busy, survivors.unchanged, survivors.attempted], [1, 1, 3, 5], "without maxFailures nothing stops the run; a locked book is busy, not failed");

  visited.length = 0;
  let stop = false;
  const interrupted = await runRestructure({ ...common, shouldStop: () => stop, rebuild: async (id) => { visited.push(id); if (visited.length === 2) stop = true; return { status: "unchanged", chapterCount: 10 }; } });
  assert.deepEqual([interrupted.stopped, interrupted.attempted], ["signal", 2], "the current book finishes, then the run stops");

  await assert.rejects(runRestructure({ ...common, rebuild: fake(() => "ok"), onResult: () => { throw new Error("journal not writable"); } }), /journal not writable/, "a run never continues without its journal");
  const onlyShared = await countRestructureCandidates({ force: true });
  assert.equal(onlyShared, 0, "private files are only touched with --include-private");
});

test("the command refuses to touch a database without the right target and a fresh backup, before connecting", () => {
  const script = path.join(process.cwd(), "scripts", "restructure-documents.ts");
  const url = "postgresql://user:secret@127.0.0.1:1/nursing";
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "restructure-guard-"));
  const dump = path.join(temp, "backup.dump");
  fs.writeFileSync(dump, Buffer.concat([Buffer.from("PGDMP"), Buffer.alloc(200)]));
  const receipt = (createdAt: string) => {
    const file = path.join(temp, `receipt-${Date.parse(createdAt)}.json`);
    fs.writeFileSync(file, JSON.stringify({ path: dump, createdAt, format: "pg_dump-custom", databaseFingerprint: databaseFingerprint(url) }));
    return file;
  };
  const run = (args: string[], env: Record<string, string> = {}) => {
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", script, ...args], {
      encoding: "utf8", timeout: 60_000, env: { ...process.env, DATABASE_URL: url, BACKUP_RECEIPT: "", ...env },
    });
    return { code: result.status, text: `${result.stdout}${result.stderr}` };
  };
  try {
    const noTarget = run(["--run"]);
    assert.equal(noTarget.code, 2);
    assert.match(noTarget.text, /Refusing to run: pass --confirm-target 127\.0\.0\.1/);
    const wrongTarget = run(["--run", "--confirm-target", "other-host"]);
    assert.match(wrongTarget.text, /Refusing to run/);
    const noBackup = run(["--run", "--confirm-target", "127.0.0.1"]);
    assert.equal(noBackup.code, 2);
    assert.match(noBackup.text, /requires a database backup first/);
    const old = run(["--run", "--confirm-target", "127.0.0.1"], { BACKUP_RECEIPT: receipt(new Date(Date.now() - 3 * 86_400_000).toISOString()) });
    assert.equal(old.code, 2);
    assert.match(old.text, /older than 24 hours/);
    const stale = run(["--run", "--confirm-target", "127.0.0.1"], { BACKUP_RECEIPT: receipt(new Date(Date.now() - 3 * 3_600_000).toISOString()), BACKUP_MAX_AGE_HOURS: "1" });
    assert.match(stale.text, /older than 1 hours/, "the age limit is configurable");
    const guarded = run(["--run", "--confirm-target", "127.0.0.1"], { BACKUP_RECEIPT: receipt(new Date().toISOString()) });
    assert.doesNotMatch(guarded.text, /Refusing to run|backup/i, "with the target confirmed and a fresh backup the guards pass (the unreachable test database then fails the run)");
    assert.equal(guarded.code, 2);
    assert.ok(!fs.existsSync(path.join(process.cwd(), "logs", "restructure")) || fs.readdirSync(path.join(process.cwd(), "logs", "restructure")).length === 0, "no journal for a run that never started");
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test("a journal tells a resumed run which books are done; failures and torn lines are retried", () => {
  const line = (row: Record<string, unknown>) => JSON.stringify({ at: "2026-10-09T10:00:00Z", ...row });
  const journal = [line({ event: "run-start", candidates: 4 }), line({ documentId: "done-1", status: "updated" }), line({ documentId: "done-2", status: "unchanged" }),
    line({ documentId: "failed-1", status: "failed", error: "boom" }), line({ documentId: "busy-1", status: "busy" }), line({ documentId: "skipped-1", status: "skipped" }),
    '{"documentId":"torn","status":"upd'].join("\n");
  assert.deepEqual([...parseJournal(journal)].sort(), ["done-1", "done-2"]);
});
