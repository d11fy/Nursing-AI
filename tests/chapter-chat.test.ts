// End-to-end behaviour of chapter-aware study, server-side generations and recovery:
// real ingestion into pgvector (PGlite), the real chat handler, a scripted model and embeddings.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { migrate } from "../scripts/migrate.mjs";
import { identityDb, workerDb } from "../lib/tutor/db";
import { registerDocument, processKnowledgeDocument, publishIndex, type IndexedDocument } from "../lib/tutor/ingestion";
import { handleTutorChat } from "../lib/tutor/chat";
import { DatabaseClient } from "../lib/db/server";
import { attachProcessedLecture } from "../lib/tutor/file-attachment";
import { consumeChatResponse } from "../lib/chat/stream";
import { rebuildDocumentStructure } from "../lib/tutor/restructure";
import { structureChunks } from "../lib/tutor/chunking";
import { failStaleGeneration, findGeneration, loadAssistantMessage } from "../lib/tutor/generations";
import { loadConversationStudyView } from "../lib/tutor/conversation-state";
import type { PageText } from "../lib/tutor/structure";
import { buildBook, UNIQUE_FACTS } from "./fixtures/sample-book";

const db = new PGlite({ extensions: { vector } });
const uid = "40000000-0000-4000-8000-000000000001", other = "40000000-0000-4000-8000-000000000002";
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

// ---- scripted OpenAI -----------------------------------------------------------------------------------------
const embed = (text: string) => {
  const vectorValues = new Float32Array(1536);
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    let hash = 0;
    for (const ch of word) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    vectorValues[hash % 1536] += 1;
  }
  const norm = Math.sqrt(vectorValues.reduce((sum, v) => sum + v * v, 0)) || 1;
  return Array.from(vectorValues, (v) => v / norm);
};
type Evidence = { id: string; title: string; page: number | null; page_end: number | null; chapter: string | null; section_title: string | null; text: string };
type ModelCall = { evidence: Evidence[]; study: Record<string, unknown> | undefined; question: string; mode: string | null };
const modelCalls: ModelCall[] = [];
let embeddedTexts = 0;
const behavior: { gate: Promise<void> | null; failStream: boolean } = { gate: null, failStream: false };
const originalFetch = globalThis.fetch;

function sse(events: Array<[string, unknown]>) { return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join(""); }
function answerFor(call: ModelCall) {
  const chapter = call.evidence[0]?.chapter ?? "general";
  return {
    answer: `Teaching ${chapter} using ${call.evidence.length} passages`, answer_origin: "student_file", source_ids: call.evidence.slice(0, 10).map((_, i) => `S${i + 1}`),
    clinical_support: [], topic: chapter, clarification_needed: false, out_of_scope: false,
    quiz: call.mode === "chapter_quiz" ? { question: "Which structure is described?", options: ["Alpha", "Beta"], correct_option: "A", explanation: "From the chapter.", topic: chapter } : null,
    quiz_result: "not_answered", preference: null,
  };
}
async function modelResponse(body: { input: Array<{ content: string }> }): Promise<Response> {
  const context = JSON.parse(body.input[0].content);
  const call: ModelCall = { evidence: context.retrieved_evidence, study: context.current_study_context?.chapter_study ?? context.current_study_context?.document_study,
    question: String(body.input.at(-1)?.content), mode: (context.current_study_context?.chapter_study?.mode as string) ?? null };
  modelCalls.push(call);
  if (behavior.failStream) return new Response(sse([["response.failed", { type: "response.failed", response: { status: "failed" } }]]), { headers: { "Content-Type": "text/event-stream" } });
  const content = JSON.stringify(answerFor(call));
  const chunks = content.match(/[\s\S]{1,11}/g) ?? [];
  const completed = sse([["response.completed", { type: "response.completed", response: { status: "completed", model: "gpt-6-luna", output: [], output_text: content,
    usage: { input_tokens: 900, output_tokens: 90, input_tokens_details: { cached_tokens: 0 } } } }]]) + "data: [DONE]\n\n";
  const gate = behavior.gate;
  const encoder = new TextEncoder();
  const deltas = (parts: string[]) => parts.map((part) => `event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: part })}\n\n`).join("");
  return new Response(new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(deltas(chunks.slice(0, 2))));
      if (gate) await gate;
      controller.enqueue(encoder.encode(deltas(chunks.slice(2)) + completed));
      controller.close();
    },
  }), { headers: { "Content-Type": "text/event-stream" } });
}
async function scriptedFetch(url: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const body = JSON.parse(String(init?.body));
  if (String(url).includes("/embeddings")) {
    const texts: string[] = Array.isArray(body.input) ? body.input : [body.input];
    embeddedTexts += texts.length;
    return Response.json({ model: "text-embedding-3-small", data: texts.map((text, index) => ({ index, embedding: embed(text) })), usage: { total_tokens: texts.length * 10 } });
  }
  return modelResponse(body);
}

// ---- fixtures ----------------------------------------------------------------------------------------------------
let fileCounter = 0;
async function ingest(pages: PageText[], title: string, fileName = "book.pdf") {
  const index = ++fileCounter;
  const lecture = (await db.query<{ id: string }>(`insert into lectures(user_id,subject_id,title,file_name,original_file_name,storage_path,mime_type,file_size_bytes,file_hash,status)
    values($1,$2,$3,$4,$4,$5,'application/pdf',100,$6,'uploaded') returning id`, [uid, subject, title, fileName, `book-${index}`, `hash-${index}`])).rows[0].id;
  const documentId = await registerDocument(lecture, true);
  await workerDb.query("update knowledge_documents set extracted_pages_json=$2::jsonb where id=$1", [documentId, JSON.stringify(pages)]);
  await processKnowledgeDocument(documentId);
  return { lecture, documentId };
}
async function conversationFor(lecture: string) {
  const conversation = (await db.query<{ id: string }>("insert into conversations(user_id,subject_id,title) values($1,$2,'Book') returning id", [uid, subject])).rows[0].id;
  const attachment = await attachProcessedLecture(uid, conversation, lecture);
  return { conversation, attachment, lecture };
}
const student = () => new DatabaseClient({ user_id: uid, role: "student", status: "active" });
function chatRequest(conversationId: string, content: string, extra: Record<string, unknown> = {}) {
  const requestId = (extra.requestId as string | undefined) ?? crypto.randomUUID();
  return { requestId, request: new Request("https://nursing.example.test/api/chat", { method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ conversationId, content, requestId, ...extra }) }) };
}
async function ask(book: { conversation: string; attachment: string; lecture: string }, content: string, extra: Record<string, unknown> = {}) {
  const { requestId, request } = chatRequest(book.conversation, content, { lectureId: book.lecture, attachmentId: book.attachment, ...extra });
  const response = await handleTutorChat(request, student(), () => {});
  assert.equal(response.status, 200, `${content}: ${response.status}`);
  let text = "", messageId = "";
  const replayed = false;
  await consumeChatResponse(response, { onConversationId() {}, onChunk(chunk) { text += chunk; }, onMessageIds(id) { messageId = id; }, onComplete() {} });
  return { text, requestId, messageId, replayed, call: modelCalls.at(-1)! };
}
const used = async () => Number((await db.query<{ used: number }>("select coalesce(sum(used),0)::int used from subscription_usage where user_id=$1 and feature_key='ai_questions_daily'", [uid])).rows[0].used);
const sections = (call: ModelCall) => call.evidence.flatMap((item) => [...item.text.matchAll(/section (\d+) explains/g)].map((match) => Number(match[1])));
async function waitFor(check: () => Promise<boolean>, ms = 8000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await check()) return; await new Promise((r) => setTimeout(r, 25)); }
  throw new Error("condition not reached in time");
}

let book: Awaited<ReturnType<typeof ingest>>, chat: Awaited<ReturnType<typeof conversationFor>>;
const BULK = { 4: { sections: 12, repeat: 40 } };

before(async () => {
  process.env.DATABASE_URL = "postgresql://test-only"; process.env.OPENAI_API_KEY = "chapter-test-key"; delete process.env.AI_ARCHITECTURE;
  Object.assign(globalThis, { nursingPool: pool, fetch: scriptedFetch });
  await migrate({ query: async (sql: string, values?: unknown[]) => { if (!values && (sql.includes(";") || sql.includes("--"))) { await db.exec(sql); return { rows: [] }; } return db.query(sql, values); } });
  const year = (await db.query<{ id: string }>("select id from academic_years where code='first_year'")).rows[0].id;
  subject = (await db.query<{ id: string }>("insert into subjects(name_ar,name_en) values('التشريح','Anatomy (ANAT 101)') returning id")).rows[0].id;
  await db.query("insert into subject_academic_years(subject_id,academic_year_id) values($1,$2)", [subject, year]);
  for (const [id, name] of [[uid, "Student"], [other, "Other"]]) {
    await db.query("insert into app_users(id,email,password_hash) values($1,$2,'test')", [id, `${id}@example.test`]);
    await db.query("insert into profiles(user_id,email,full_name,role,academic_year_id) values($1,$2,$3,'student',$4)", [id, `${id}@example.test`, name, year]);
  }
  await db.query("update settings set value='0'::jsonb where key='rate_limit_seconds'");
  await db.query("update settings set value='500'::jsonb where key in ('free_daily_limit','trial_ai_questions_daily')");
  await db.exec("create role chapter_runtime nosuperuser nobypassrls; grant usage on schema public to chapter_runtime; grant select,insert,update,delete on all tables in schema public to chapter_runtime; grant usage,select on all sequences in schema public to chapter_runtime");
  book = await ingest(buildBook({ bulk: BULK }), "Anatomy & Physiology");
  chat = await conversationFor(book.lecture);
});
after(async () => { globalThis.fetch = originalFetch; await db.close(); });

test("ingestion stores the outline and labels every chunk with its own chapter, never mixing two", async () => {
  const doc = (await workerDb.query<{ chapter_count: number; section_count: number; structure_confidence: string; structure_version: number; status: string }>("select * from knowledge_documents where id=$1", [book.documentId])).rows[0];
  assert.equal(doc.status, "ready");
  assert.equal(doc.chapter_count, 10);
  assert.equal(doc.structure_confidence, "high");
  assert.equal(doc.structure_version, 1);
  const chunks = (await workerDb.query<{ chunk_index: number; chapter_index: number | null; chapter_title: string | null; section_title: string | null; content: string }>(
    "select chunk_index,chapter_index,chapter_title,section_title,content from knowledge_chunks where document_id=$1 order by chunk_index", [book.documentId])).rows;
  chunks.forEach((chunk, i) => assert.equal(chunk.chunk_index, i));
  for (const chunk of chunks.filter((c) => c.chapter_index !== null)) {
    const mentioned = new Set([...chunk.content.matchAll(/Chapter (\d+) section/g)].map((match) => Number(match[1])));
    assert.ok([...mentioned].every((n) => n === chunk.chapter_index), `chunk ${chunk.chunk_index} mixes chapters ${[...mentioned]} inside chapter ${chunk.chapter_index}`);
  }
  assert.ok(chunks.some((c) => c.chapter_index === 4 && c.chapter_title === "Chapter 4 — The Skeletal System"));
  assert.ok(chunks.filter((c) => c.chapter_index === 4).some((c) => c.section_title?.startsWith("Topic")), "sections are labelled");
  assert.ok(chunks.some((c) => c.chapter_index === null), "front matter and the table of contents belong to no chapter");
  assert.equal(new Set(chunks.filter((c) => c.chapter_index !== null).map((c) => c.chapter_index)).size, 10);
  const stored = (await workerDb.query<{ outline_json: { chapters: Array<{ number: number; title: string }> } }>("select outline_json from knowledge_documents where id=$1", [book.documentId])).rows[0].outline_json;
  assert.deepEqual(stored.chapters.map((c) => c.number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("'اشرحلي Chapter 4' retrieves only Chapter 4 and starts an ordered walkthrough", async () => {
  const usedBefore = await used();
  const result = await ask(chat, "اشرحلي Chapter 4");
  assert.ok(result.call.evidence.length > 0 && result.call.evidence.length <= 10);
  assert.ok(result.call.evidence.every((item) => item.chapter === "Chapter 4 — The Skeletal System"), "every retrieved passage is from chapter 4");
  assert.ok(result.call.evidence.some((item) => item.text.includes(UNIQUE_FACTS[4])), "the unique chapter-4 fact is in the first part");
  for (const n of [1, 7, 10]) assert.ok(!result.call.evidence.some((item) => item.text.includes(UNIQUE_FACTS[n].split(" ")[0])), `no fact from chapter ${n}`);
  assert.equal(result.call.study?.mode, "chapter_walkthrough");
  assert.match(result.text, /### Chapter 4 — The Skeletal System — الجزء 1 من \d/);
  assert.match(result.text, /اكتب «كمل»/);
  assert.match(result.text, /Chapter 4 — The Skeletal System/);
  const ordered = sections(result.call);
  assert.deepEqual(ordered, [...ordered].sort((a, b) => a - b), "passages arrive in book order");
  const state = (await db.query<{ current_chapter_index: number; current_part: number; total_parts: number; current_position: number }>("select * from conversation_summaries where conversation_id=$1", [chat.conversation])).rows[0];
  assert.equal(state.current_chapter_index, 4);
  assert.equal(state.current_part, 1);
  assert.ok(state.total_parts >= 2, "chapter 4 is large enough to need several parts");
  assert.equal(await used(), usedBefore + 1);
});

test("'كمل' continues chapter 4 from where it stopped, in order, until the chapter ends", async () => {
  const state = async () => (await db.query<{ current_chapter_index: number; current_part: number; total_parts: number; current_position: number }>("select * from conversation_summaries where conversation_id=$1", [chat.conversation])).rows[0];
  const first = await state();
  let previousMax = Math.max(...sections(modelCalls.at(-1)!));
  let previousPosition = first.current_position;
  for (let part = 2; part <= first.total_parts; part++) {
    const result = await ask(chat, "كمل");
    assert.ok(result.call.evidence.every((item) => item.chapter === "Chapter 4 — The Skeletal System"));
    assert.match(result.text, new RegExp(`الجزء ${part} من ${first.total_parts}`));
    const now = sections(result.call);
    assert.ok(Math.min(...now) >= previousMax, `part ${part} starts where the previous part ended (${Math.min(...now)} >= ${previousMax})`);
    assert.ok(!result.call.evidence.some((item) => item.text.includes(UNIQUE_FACTS[4])), "does not restart the chapter");
    previousMax = Math.max(...now);
    const saved = await state();
    assert.equal(saved.current_part, part);
    assert.ok(saved.current_position > previousPosition);
    previousPosition = saved.current_position;
  }
  const next = await ask(chat, "كمل");
  assert.ok(next.call.evidence.every((item) => item.chapter === "Chapter 5 — The Muscular System"), "after the last part the study moves to the next chapter");
  assert.match(next.text, /أنهينا الفصل السابق/);
  assert.equal((await state()).current_chapter_index, 5);
});

test("'ارجع شوي' returns to the previous part and 'اشرح الجزء الثاني' jumps to a part of the chapter", async () => {
  await ask(chat, "اشرحلي الفصل الرابع");
  const part2 = await ask(chat, "اشرح الجزء الثاني");
  assert.match(part2.text, /الجزء 2 من/);
  assert.ok(part2.call.evidence.every((item) => item.chapter === "Chapter 4 — The Skeletal System"));
  const back = await ask(chat, "ارجع شوي");
  assert.match(back.text, /الجزء 1 من/);
  assert.ok(back.call.evidence.some((item) => item.text.includes(UNIQUE_FACTS[4])));
});

test("'اختبرني فيه' builds the quiz from the studied chapter only", async () => {
  await ask(chat, "اشرحلي Chapter 4");
  const quiz = await ask(chat, "اختبرني فيه");
  assert.equal(quiz.call.study?.mode, "chapter_quiz");
  assert.ok(quiz.call.evidence.length > 0);
  assert.ok(quiz.call.evidence.every((item) => item.chapter === "Chapter 4 — The Skeletal System"));
});

test("navigation: 'روح للشابتر الخامس', 'اللي بعده' and 'السابق' land on exactly that chapter", async () => {
  const five = await ask(chat, "روح للشابتر الخامس");
  assert.ok(five.call.evidence.every((item) => item.chapter === "Chapter 5 — The Muscular System"), "chapter 5 only");
  const six = await ask(chat, "روح للشابتر اللي بعده");
  assert.ok(six.call.evidence.every((item) => item.chapter === "Chapter 6 — The Nervous System"));
  const back = await ask(chat, "ارجع للشابتر السابق");
  assert.ok(back.call.evidence.every((item) => item.chapter === "Chapter 5 — The Muscular System"));
  for (const spelling of ["شابتر 7", "الفصل السابع", "رابع شابتر", "chapter seven"]) {
    const wanted = spelling === "رابع شابتر" ? "Chapter 4 — The Skeletal System" : "Chapter 7 — The Cardiovascular System";
    const result = await ask(chat, spelling);
    assert.ok(result.call.evidence.every((item) => item.chapter === wanted), spelling);
  }
});

test("a chapter that does not exist is reported, not invented, and costs no question", async () => {
  const calls = modelCalls.length, before = await used();
  const result = await ask(chat, "اشرحلي Chapter 12");
  assert.equal(modelCalls.length, calls, "the model is not called");
  assert.match(result.text, /لا يوجد الفصل 12/);
  assert.match(result.text, /10 فصلًا/);
  assert.match(result.text, /4\. The Skeletal System/);
  assert.equal(await used(), before, "no question is consumed");
  const saved = (await db.query<{ content: string }>("select content from messages where id=$1", [result.messageId])).rows[0];
  assert.equal(saved.content, result.text, "the answer is stored like any other");
  const refused = (await db.query<{ status: string; usage: string }>(`select status,(select status from usage_reservations r where r.idempotency_key='chat:'||g.request_id::text) usage from chat_generations g where request_id=$1`, [result.requestId])).rows[0];
  assert.equal(refused.status, "completed");
  assert.equal(refused.usage, "released");
});

test("closing and reopening the app restores the same book, conversation and chapter position", async () => {
  await ask(chat, "اشرحلي الفصل 3");
  const reopened = await loadConversationStudyView(uid, chat.conversation);
  assert.equal(reopened.activeDocument?.id, book.documentId);
  assert.equal(reopened.activeDocument?.kind, "private");
  assert.equal(reopened.activeDocument?.chapterCount, 10);
  assert.equal(reopened.studyContext?.chapterIndex, 3);
  assert.equal(reopened.studyContext?.chapterTitle, "The Tissues".replace("The ", ""));
  assert.equal(reopened.outline.length, 10);
  assert.equal(reopened.outline[3].label, "Chapter 4 — The Skeletal System");
  assert.equal(reopened.pendingGeneration, null);
  const next = await ask(chat, "كمل");
  assert.ok(next.call.evidence.every((item) => item.chapter === "Chapter 4 — The Skeletal System"), "chapter 3 was a single part, so 'كمل' continues with chapter 4 from the stored position");
});

test("dropping the connection mid-answer does not lose the answer; a retry replays it without a second AI call or charge", async () => {
  const { requestId, request } = chatRequest(chat.conversation, "اشرحلي Chapter 8", { lectureId: chat.lecture, attachmentId: chat.attachment });
  const usedBefore = await used(), callsBefore = modelCalls.length;
  let release!: () => void;
  behavior.gate = new Promise<void>((resolve) => { release = resolve; });
  const response = await handleTutorChat(request, student(), () => {});
  const reader = response.body!.getReader();
  let seen = "";
  while (!seen.includes("Chapter 8")) { const { value, done } = await reader.read(); if (done) break; seen += new TextDecoder().decode(value); }
  await reader.cancel(); // the phone loses the network here
  behavior.gate = null;
  release();
  await waitFor(async () => (await findGeneration(uid, requestId))?.status === "completed");
  const generation = (await findGeneration(uid, requestId))!;
  const message = (await loadAssistantMessage(uid, generation))!;
  assert.match(message.content, /Chapter 8 — The Respiratory System/);
  assert.match(message.content, /Teaching Chapter 8/);
  assert.equal(modelCalls.length, callsBefore + 1);
  // The app comes back and presses retry with the same request id.
  const retried = await handleTutorChat(chatRequest(chat.conversation, "اشرحلي Chapter 8", { requestId, lectureId: chat.lecture, attachmentId: chat.attachment }).request, student(), () => {});
  let replayed = "", replayedId = "";
  await consumeChatResponse(retried, { onConversationId() {}, onChunk(chunk) { replayed += chunk; }, onMessageIds(id) { replayedId = id; }, onComplete() {} });
  assert.equal(replayed, message.content);
  assert.equal(replayedId, message.id);
  assert.equal(modelCalls.length, callsBefore + 1, "no duplicate AI generation");
  assert.equal(await used(), usedBefore + 1, "one question consumed in total");
  const rows = (await db.query<{ users: number; assistants: number }>(`select count(*) filter (where role='user' and content='اشرحلي Chapter 8')::int users, count(*) filter (where role='assistant' and generation_id=$2)::int assistants
    from messages where conversation_id=$1`, [chat.conversation, generation.id])).rows[0];
  assert.deepEqual(rows, { users: 1, assistants: 1 });
});

test("a repeated request while the first is still generating waits for that answer instead of starting another", async () => {
  const { requestId, request } = chatRequest(chat.conversation, "اشرحلي Chapter 9", { lectureId: chat.lecture, attachmentId: chat.attachment });
  const callsBefore = modelCalls.length, usedBefore = await used();
  let release!: () => void;
  behavior.gate = new Promise<void>((resolve) => { release = resolve; });
  const first = await handleTutorChat(request, student(), () => {});
  const firstReader = first.body!.getReader();
  await firstReader.read();
  const second = await handleTutorChat(chatRequest(chat.conversation, "اشرحلي Chapter 9", { requestId, lectureId: chat.lecture, attachmentId: chat.attachment }).request, student(), () => {});
  behavior.gate = null;
  release();
  let secondText = "", secondId = "", firstText = "";
  await consumeChatResponse(second, { onConversationId() {}, onChunk(chunk) { secondText += chunk; }, onMessageIds(id) { secondId = id; }, onComplete() {} });
  for (let chunk = await firstReader.read(); !chunk.done; chunk = await firstReader.read()) firstText += new TextDecoder().decode(chunk.value);
  assert.equal(modelCalls.length, callsBefore + 1);
  assert.match(secondText, /Teaching Chapter 9/);
  assert.ok(secondId);
  assert.match(firstText, /persisted/);
  assert.equal(await used(), usedBefore + 1);
});

test("a failed generation is retryable with the same request id, saves one answer and charges once", async () => {
  const requestId = crypto.randomUUID(), usedBefore = await used();
  behavior.failStream = true;
  const failing = chatRequest(chat.conversation, "اشرحلي Chapter 2", { requestId, lectureId: chat.lecture, attachmentId: chat.attachment });
  const response = await handleTutorChat(failing.request, student(), () => {});
  await assert.rejects(consumeChatResponse(response, { onConversationId() {}, onChunk() {}, onComplete() {} }), /خلل مؤقت/);
  behavior.failStream = false;
  const failed = (await findGeneration(uid, requestId))!;
  assert.equal(failed.status, "failed");
  assert.ok(failed.user_message_id);
  const retry = await handleTutorChat(chatRequest(chat.conversation, "اشرحلي Chapter 2", { requestId, lectureId: chat.lecture, attachmentId: chat.attachment }).request, student(), () => {});
  let text = "";
  await consumeChatResponse(retry, { onConversationId() {}, onChunk(chunk) { text += chunk; }, onComplete() {} });
  assert.match(text, /Chapter 2 — The Cell/);
  const done = (await findGeneration(uid, requestId))!;
  assert.equal(done.status, "completed");
  assert.equal(done.attempts, 2);
  const counts = (await db.query<{ users: number; assistants: number }>(`select count(*) filter (where role='user' and content='اشرحلي Chapter 2')::int users, count(*) filter (where role='assistant' and generation_id=$2)::int assistants
    from messages where conversation_id=$1`, [chat.conversation, done.id])).rows[0];
  assert.deepEqual(counts, { users: 1, assistants: 1 });
  assert.equal(await used(), usedBefore + 1, "the retry did not consume a second question");
});

test("a generation lost to a server restart becomes a visible, retryable failure", async () => {
  const requestId = crypto.randomUUID();
  const conversation = chat.conversation;
  await db.query("insert into messages(conversation_id,role,content) values($1,'user','lost question')", [conversation]);
  const row = (await db.query<{ id: string }>(`insert into chat_generations(user_id,conversation_id,request_id,status,updated_at) values($1,$2,$3,'streaming',now() - interval '10 minutes') returning id`, [uid, conversation, requestId])).rows[0];
  const found = (await findGeneration(uid, requestId))!;
  assert.equal(found.stale, true);
  const repaired = await failStaleGeneration(uid, found);
  assert.equal(repaired.status, "failed");
  assert.equal(repaired.error_code, "STREAM_INTERRUPTED");
  assert.equal((await findGeneration(uid, requestId))!.status, "failed");
  const view = await loadConversationStudyView(uid, conversation);
  assert.equal(view.pendingGeneration?.requestId, requestId);
  assert.equal(view.pendingGeneration?.retryable, true);
  await db.query("delete from chat_generations where id=$1", [row.id]);
});

test("generations are private to their owner under row-level security", async () => {
  const { requestId } = chatRequest(chat.conversation, "x");
  await db.query("insert into chat_generations(user_id,conversation_id,request_id) values($1,$2,$3)", [uid, chat.conversation, requestId]);
  await db.query("set role chapter_runtime");
  try {
    assert.equal((await identityDb(other).query("select id from chat_generations where request_id=$1", [requestId])).rows.length, 0);
    assert.equal((await identityDb(uid).query("select id from chat_generations where request_id=$1", [requestId])).rows.length, 1);
    await assert.rejects(identityDb(other).query("insert into chat_generations(user_id,conversation_id,request_id) values($1,$2,$3)", [other, chat.conversation, crypto.randomUUID()]), /row-level security/);
  } finally { await db.query("reset role"); }
});

test("books written 'Chapter Four', without page numbers, or without chapter numbers all resolve 'Chapter 4'", async () => {
  const cases: Array<[string, PageText[], boolean]> = [
    ["words", buildBook({ style: "chapter-words" }), false],
    ["no page numbers", buildBook({ pageNumbers: false }), false],
    ["arabic headings", buildBook({ style: "arabic" }), false],
    ["unnumbered chapters", buildBook({ style: "numberless", toc: false }), true],
  ];
  for (const [label, pages, inferred] of cases) {
    const target = await conversationFor((await ingest(pages, `Book ${label}`)).lecture);
    const result = await ask(target, "اشرحلي Chapter 4");
    assert.ok(result.call.evidence.length > 0, label);
    assert.ok(result.call.evidence.every((item) => item.chapter?.endsWith("— The Skeletal System")), `${label}: ${result.call.evidence.map((e) => e.chapter)}`);
    assert.equal((result.call.study as { chapter_order_inferred?: boolean }).chapter_order_inferred, inferred, label);
    if (label === "no page numbers") assert.ok(result.call.evidence.every((item) => item.page === null));
  }
});

test("a file with no detectable chapters asks the student to choose instead of guessing", async () => {
  const pages: PageText[] = Array.from({ length: 6 }, (_, i) => ({ pageNumber: i + 1, text: `Plain page ${i + 1} about nursing notes without any headings. `.repeat(20) }));
  const target = await conversationFor((await ingest(pages, "Plain notes")).lecture);
  const calls = modelCalls.length;
  const result = await ask(target, "اشرحلي Chapter 2");
  assert.equal(modelCalls.length, calls);
  assert.match(result.text, /لم أستطع تحديد فصول/);
});

test("facts at the beginning, middle and end of a 45-page file are all reachable, and an overview samples the whole file", async () => {
  const facts: Record<number, string> = { 2: "Glyphrex2 starts the beginning", 23: "Plorvane23 sits in the middle", 44: "Quillston44 closes the ending" };
  const pages: PageText[] = Array.from({ length: 45 }, (_, i) => ({ pageNumber: i + 1,
    text: `Page ${i + 1} covers general nursing fundamentals and documentation practice. `.repeat(8) + (facts[i + 1] ? `\n\n${facts[i + 1]}.` : "") }));
  const target = await conversationFor((await ingest(pages, "Forty five page notes")).lecture);
  for (const [page, fact] of Object.entries(facts)) {
    const result = await ask(target, `ما هو ${fact.split(" ")[0]}؟`);
    assert.ok(result.call.evidence.some((item) => item.page === Number(page) && item.text.includes(fact)), `page ${page} is retrieved`);
  }
  const overview = await ask(target, "لخص الملف");
  const starts = overview.call.evidence.map((item) => item.page!).filter(Boolean), ends = overview.call.evidence.map((item) => item.page_end ?? item.page!).filter(Boolean);
  assert.ok(Math.min(...starts) <= 3, "the beginning is represented");
  assert.ok(Math.max(...ends) >= 44, "the end of the file is represented");
  assert.ok(starts.some((p) => p > 15 && p < 35) || ends.some((p) => p > 15 && p < 35), "the middle is represented");
  assert.match(overview.text, /نظرة عامة/);
  const ranged = await ask(target, "اشرحلي من أول الملف لحد القسم الثالث");
  assert.ok(ranged.call.evidence.every((item) => item.page! <= 3), "a requested range stops at its end");
});

test("rebuilding an existing book updates chapters and metadata without re-embedding or duplicating it", async () => {
  const old = await ingest(buildBook(), "Legacy book");
  await workerDb.query(`update knowledge_chunks set chapter_index=null,chapter_number=null,chapter_title=null,section_title=null,subsection_title=null where document_id=$1`, [old.documentId]);
  await workerDb.query("update knowledge_documents set outline_json=null,structure_version=0,chapter_count=0,section_count=0,structure_confidence=null where id=$1", [old.documentId]);
  const chunksBefore = (await workerDb.query<{ n: number }>("select count(*)::int n from knowledge_chunks where document_id=$1", [old.documentId])).rows[0].n;
  const embeddedBefore = embeddedTexts;
  const result = await rebuildDocumentStructure(old.documentId);
  assert.equal(result.status, "updated");
  assert.equal(result.status === "updated" && result.mode, "metadata");
  assert.equal(embeddedTexts, embeddedBefore, "no embeddings were requested");
  const after = (await workerDb.query<{ chapter_count: number; chunks: number; labelled: number; documents: number }>(
    `select d.chapter_count,(select count(*)::int from knowledge_chunks where document_id=d.id) chunks,
     (select count(distinct chapter_index)::int from knowledge_chunks where document_id=d.id and chapter_index is not null) labelled,
     (select count(*)::int from knowledge_documents where lecture_id=d.lecture_id) documents from knowledge_documents d where d.id=$1`, [old.documentId])).rows[0];
  assert.deepEqual(after, { chapter_count: 10, chunks: chunksBefore, labelled: 10, documents: 1 });
  assert.equal((await rebuildDocumentStructure(old.documentId)).status, "unchanged");
});

test("a chapter heading in the middle of a page re-chunks safely and keeps every vector whose text is unchanged", async () => {
  const pages: PageText[] = buildBook({ toc: false }).map((page, i, all) => {
    // Move the first lines of each chapter's page onto the end of the previous page: headings now start mid-page.
    return i > 0 && i < all.length - 1 && /^Chapter \d+:/.test(all[i + 1].text) ? { ...page, text: `${page.text}\n${all[i + 1].text.split("\n")[0]}` } : page;
  });
  const created = await ingest(buildBook({ toc: false }), "Midpage");
  // Simulate an index made before chapter detection: per-page chunks, no structure.
  await workerDb.query("update knowledge_documents set extracted_pages_json=$2::jsonb where id=$1", [created.documentId, JSON.stringify(pages)]);
  const doc = (await workerDb.query<IndexedDocument>("select * from knowledge_documents where id=$1", [created.documentId])).rows[0];
  await workerDb.query("delete from knowledge_chunks where document_id=$1", [created.documentId]);
  let index = 0;
  for (const page of pages) for (const chunk of structureChunks(page.text)) {
    await workerDb.query(`insert into knowledge_chunks(document_id,subject_id,source_type,source_priority,page_number,chunk_index,content,content_hash,embedding,token_count)
      values($1,$2,'student_private_file',100,$3,$4,$5,$6,$7::vector,$8)`, [created.documentId, doc.subject_id, page.pageNumber, index++, chunk.content, chunk.contentHash, `[${embed(chunk.content).join(",")}]`, chunk.tokenCount]);
  }
  await workerDb.query("update knowledge_documents set chunk_count=$2,embedding_count=$2,structure_version=0,outline_json=null,chapter_count=0 where id=$1", [created.documentId, index]);
  const before = embeddedTexts;
  const rebuilt = await rebuildDocumentStructure(created.documentId);
  assert.equal(rebuilt.status, "updated");
  assert.equal(rebuilt.status === "updated" && rebuilt.mode, "reindexed");
  assert.ok(rebuilt.status === "updated" && rebuilt.embedded < rebuilt.chunkCount, "only the chunks that changed were embedded");
  assert.ok(embeddedTexts - before < index / 2, "most vectors were reused");
  const mixed = (await workerDb.query<{ chapter_index: number; content: string }>("select chapter_index,content from knowledge_chunks where document_id=$1 and chapter_index is not null", [created.documentId])).rows
    .filter((chunk) => [...chunk.content.matchAll(/Chapter (\d+) section/g)].some((match) => Number(match[1]) !== chunk.chapter_index));
  assert.equal(mixed.length, 0, "no chunk spans two chapters");
  assert.equal((await workerDb.query<{ n: number }>("select count(*)::int n from knowledge_documents where lecture_id=(select lecture_id from knowledge_documents where id=$1)", [created.documentId])).rows[0].n, 1);
});

test("a book indexed before structure detection is upgraded the first time a chapter is requested", async () => {
  const old = await ingest(buildBook(), "Lazy book");
  const target = await conversationFor(old.lecture);
  await workerDb.query(`update knowledge_chunks set chapter_index=null,chapter_number=null,chapter_title=null,section_title=null where document_id=$1`, [old.documentId]);
  await workerDb.query("update knowledge_documents set outline_json=null,structure_version=0,chapter_count=0,structure_confidence=null where id=$1", [old.documentId]);
  const result = await ask(target, "اشرحلي Chapter 4");
  assert.ok(result.call.evidence.length > 0 && result.call.evidence.every((item) => item.chapter === "Chapter 4 — The Skeletal System"));
  assert.equal((await workerDb.query<{ structure_version: number }>("select structure_version from knowledge_documents where id=$1", [old.documentId])).rows[0].structure_version, 1);
});

test("publishIndex keeps a ready document readable during a rebuild and leaves it untouched if embedding fails", async () => {
  const created = await ingest(buildBook(), "Resilient");
  const doc = (await workerDb.query<IndexedDocument>("select * from knowledge_documents where id=$1", [created.documentId])).rows[0];
  const pages = doc.extracted_pages_json.map((page) => ({ ...page, text: `${page.text}\nNew sentence ${page.pageNumber} that was never embedded.` }));
  const chunksBefore = (await workerDb.query<{ n: number }>("select count(*)::int n from knowledge_chunks where document_id=$1", [created.documentId])).rows[0].n;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("embedding service down"); }) as typeof fetch;
  try { await assert.rejects(publishIndex(doc, pages, doc.file_hash, { mode: "rebuild", start: Date.now() }), /embedding|connection/i); }
  finally { globalThis.fetch = original; }
  const after = (await workerDb.query<{ status: string; chunks: number }>("select d.status,(select count(*)::int from knowledge_chunks where document_id=d.id) chunks from knowledge_documents d where d.id=$1", [created.documentId])).rows[0];
  assert.equal(after.status, "ready");
  assert.equal(after.chunks, chunksBefore, "the previous chunks are still there");
});

test("a topic question that names a chapter searches that chapter only, even when the term lives in another chapter", async () => {
  const result = await ask(chat, "what is Quenthar-Four in chapter 7");
  assert.equal(result.call.study?.mode, "chapter_focused");
  assert.ok(result.call.evidence.length > 0);
  assert.ok(result.call.evidence.every((item) => item.chapter === "Chapter 7 — The Cardiovascular System"), `chapter 7 only: ${result.call.evidence.map((e) => e.chapter)}`);
  assert.ok(!result.call.evidence.some((item) => item.text.includes(UNIQUE_FACTS[4])), "the chapter-4 passage is excluded by the chapter filter");
  assert.match(result.text, /### Chapter 7 — The Cardiovascular System/);
});

test("a library book attached to the conversation gets the same chapter handling and wins over general sources", async () => {
  const year = (await db.query<{ id: string }>("select id from academic_years where code='first_year'")).rows[0].id;
  const documentId = (await db.query<{ id: string }>(`insert into knowledge_documents(title,original_file_name,storage_path,subject_id,academic_year_id,semester_id,source_type,
    resource_category,visibility_scope,publication_status,status,is_active) values('University Anatomy Textbook','anatomy.pdf','library/anatomy',$1,$2,1,'required_textbook','curriculum_book',
    'specific_subject','published','extracting',false) returning id`, [subject, year])).rows[0].id;
  const pages = buildBook();
  const row = (await workerDb.query<IndexedDocument>("select * from knowledge_documents where id=$1", [documentId])).rows[0];
  await publishIndex(row, pages, "library-hash", { mode: "ingest", start: Date.now() });
  await workerDb.query("update knowledge_documents set is_active=true,publication_status='published' where id=$1", [documentId]);
  const conversation = (await db.query<{ id: string }>("insert into conversations(user_id,subject_id,title) values($1,$2,'Library') returning id", [uid, subject])).rows[0].id;
  await db.query("insert into conversation_sources(conversation_id,user_id,document_id,is_active) values($1,$2,$3,true)", [conversation, uid, documentId]);
  const { request } = chatRequest(conversation, "اشرحلي Chapter 4");
  const response = await handleTutorChat(request, student(), () => {});
  let text = "";
  await consumeChatResponse(response, { onConversationId() {}, onChunk(chunk) { text += chunk; }, onComplete() {} });
  const call = modelCalls.at(-1)!;
  assert.ok(call.evidence.length > 0 && call.evidence.every((item) => item.chapter === "Chapter 4 — The Skeletal System" && item.title === "University Anatomy Textbook"));
  assert.match(text, /University Anatomy Textbook — Chapter 4 — The Skeletal System/);
  const state = (await db.query<{ current_document_id: string; current_chapter_index: number }>("select * from conversation_summaries where conversation_id=$1", [conversation])).rows[0];
  assert.deepEqual([state.current_document_id, state.current_chapter_index], [documentId, 4]);
  const more = chatRequest(conversation, "كمل");
  const next = await handleTutorChat(more.request, student(), () => {});
  await consumeChatResponse(next, { onConversationId() {}, onChunk() {}, onComplete() {} });
  assert.ok(modelCalls.at(-1)!.evidence.every((item) => item.chapter === "Chapter 5 — The Muscular System"), "chapter 4 was a single part, so 'كمل' moves to chapter 5 of the same library book");
});

test("when the structure is uncertain the detected chapters are listed, and a chapter the student picks is honoured", async () => {
  const low = await ingest(buildBook(), "Uncertain book");
  const target = await conversationFor(low.lecture);
  await workerDb.query(`update knowledge_documents set structure_confidence='low',outline_json=jsonb_set(outline_json,'{confidence}','"low"') where id=$1`, [low.documentId]);
  const calls = modelCalls.length;
  const refused = await ask(target, "اشرحلي Chapter 2");
  assert.equal(modelCalls.length, calls, "no guess is made");
  assert.match(refused.text, /لم أتأكد من ترتيب فصول/);
  assert.match(refused.text, /2\. The Cell/);
  const picked = await ask(target, "اشرحلي الفصل 2", { chapterIndex: 2 });
  assert.ok(picked.call.evidence.every((item) => item.chapter === "Chapter 2 — The Cell"), "the chapter chosen from the list is studied");
});

test("an explicitly named book wins when several books are attached", async () => {
  const { pickStudyDocument } = await import("../lib/tutor/study-flow");
  const books = [{ id: "a", title: "Anatomy and Physiology" }, { id: "b", title: "Pharmacology Handbook" }];
  assert.equal(pickStudyDocument("اشرحلي Chapter 3 من كتاب Pharmacology Handbook", books)?.id, "b");
  assert.equal(pickStudyDocument("اشرحلي Chapter 3", books)?.id, "a", "otherwise the highest-priority source is used");
  assert.equal(pickStudyDocument("اشرحلي Chapter 3", []), null);
});

test("a model that never finishes ends as a retryable AI_TIMEOUT instead of hanging", async () => {
  process.env.CHAT_GENERATION_TIMEOUT_MS = "400";
  behavior.gate = new Promise<void>(() => undefined); // the stream stalls after its first bytes and never completes
  const requestId = crypto.randomUUID();
  const usedBefore = await used();
  try {
    const { request } = chatRequest(chat.conversation, "اشرحلي Chapter 6", { requestId, lectureId: chat.lecture, attachmentId: chat.attachment });
    const response = await handleTutorChat(request, student(), () => {});
    await assert.rejects(consumeChatResponse(response, { onConversationId() {}, onChunk() {}, onComplete() {} }), /استغرقت الإجابة وقتًا أطول/);
  } finally { behavior.gate = null; delete process.env.CHAT_GENERATION_TIMEOUT_MS; }
  const failed = (await findGeneration(uid, requestId))!;
  assert.equal(failed.status, "failed");
  assert.equal(failed.error_code, "AI_TIMEOUT");
  const retry = chatRequest(chat.conversation, "اشرحلي Chapter 6", { requestId, lectureId: chat.lecture, attachmentId: chat.attachment }).request;
  let text = "";
  await consumeChatResponse(await handleTutorChat(retry, student(), () => {}), { onConversationId() {}, onChunk(chunk) { text += chunk; }, onComplete() {} });
  assert.match(text, /Chapter 6 — The Nervous System/);
  assert.equal(await used(), usedBefore + 1, "the timed-out attempt and its retry cost one question");
});

test("studying a different book clears the previous book's chapter position", async () => {
  const { recordTutorTurn } = await import("../lib/tutor/memory");
  const other = await ingest(buildBook({ style: "unit" }), "Another book");
  const target = await conversationFor(book.lecture);
  await ask(target, "اشرحلي الفصل 2");
  const before = (await db.query<{ current_chapter_index: number | null }>("select current_chapter_index from conversation_summaries where conversation_id=$1", [target.conversation])).rows[0];
  assert.equal(before.current_chapter_index, 2);
  const message = (await db.query<{ id: string }>("insert into messages(conversation_id,role,content) values($1,'assistant','x') returning id", [target.conversation])).rows[0].id;
  await recordTutorTurn({ userId: uid, conversationId: target.conversation, messageId: message, subjectId: subject, documentId: other.documentId, attachmentId: null, question: "q",
    answer: { answer: "a", answer_origin: "curriculum", source_ids: [], clinical_support: [], topic: "t", clarification_needed: false, out_of_scope: false, quiz: null, quiz_result: "not_answered", preference: null }, pendingQuiz: null });
  const after = (await db.query<{ current_document_id: string; current_chapter_index: number | null; current_position: number | null }>("select * from conversation_summaries where conversation_id=$1", [target.conversation])).rows[0];
  assert.equal(after.current_document_id, other.documentId);
  assert.equal(after.current_chapter_index, null);
  assert.equal(after.current_position, null);
});
