// HTTP contract the Android app and the website use to recover an answer, resync a conversation and read file status.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { bootDatabase, createUser, db, mockNextRuntime, signInAs } from "./helpers/harness";

mockNextRuntime();
const alice = "50000000-0000-4000-8000-000000000001", bob = "50000000-0000-4000-8000-000000000002";
let aliceTokens: { sessionToken: string; deviceToken: string }, bobTokens: { sessionToken: string; deviceToken: string };
let conversation: string, lecture: string, documentId: string;
const params = (value: string) => ({ params: Promise.resolve({ requestId: value }) });
const idParams = (value: string) => ({ params: Promise.resolve({ id: value }) });
const request = (url: string, init?: RequestInit) => new Request(`https://nursing.example.test${url}`, init);

before(async () => {
  await bootDatabase();
  aliceTokens = await createUser(alice, "student", "Alice");
  bobTokens = await createUser(bob, "student", "Bob");
  conversation = (await db.query<{ id: string }>("insert into conversations(user_id,title) values($1,'Book') returning id", [alice])).rows[0].id;
  const subject = (await db.query<{ id: string }>("insert into subjects(name_ar,name_en) values('التشريح','Anatomy') returning id")).rows[0].id;
  lecture = (await db.query<{ id: string }>(`insert into lectures(user_id,subject_id,title,file_name,original_file_name,storage_path,mime_type,file_size_bytes,file_hash,status)
    values($1,$2,'Notes','n.pdf','n.pdf','n-path','application/pdf',10,'n-hash','uploaded') returning id`, [alice, subject])).rows[0].id;
  documentId = (await db.query<{ id: string }>(`insert into knowledge_documents(lecture_id,owner_id,title,original_file_name,storage_path,source_type,is_active,status)
    values($1,$2,'Notes','n.pdf','n-path','student_private_file',true,'embedding') returning id`, [lecture, alice])).rows[0].id;
});
after(() => db.close());

test("recovering an answer requires a signed-in student and never reveals another student's request", async () => {
  const { GET } = await import("../app/api/chat/generations/[requestId]/route");
  const requestId = crypto.randomUUID();
  const user = (await db.query<{ id: string }>("insert into messages(conversation_id,role,content) values($1,'user','سؤال') returning id", [conversation])).rows[0].id;
  const assistant = (await db.query<{ id: string }>("insert into messages(conversation_id,role,content) values($1,'assistant','الإجابة المحفوظة على السيرفر') returning id", [conversation])).rows[0].id;
  await db.query("insert into chat_generations(user_id,conversation_id,request_id,status,user_message_id,assistant_message_id) values($1,$2,$3,'completed',$4,$5)", [alice, conversation, requestId, user, assistant]);
  signInAs(null);
  assert.equal((await GET(request("/x"), params(requestId))).status, 401);
  signInAs(aliceTokens);
  const mine = await GET(request("/x"), params(requestId));
  assert.equal(mine.status, 200);
  const body = await mine.json();
  assert.equal(body.status, "completed");
  assert.deepEqual(body.assistantMessage, { id: assistant, content: "الإجابة المحفوظة على السيرفر" });
  assert.equal(body.retryable, false);
  signInAs(bobTokens);
  const theirs = await GET(request("/x"), params(requestId));
  assert.equal(theirs.status, 404);
  assert.equal((await theirs.json()).status, "not_found");
  signInAs(aliceTokens);
  assert.equal((await GET(request("/x"), params("not-a-uuid"))).status, 400);
});

test("a question that never reached the server is reported as not found so a re-send is safe", async () => {
  const { GET } = await import("../app/api/chat/generations/[requestId]/route");
  signInAs(aliceTokens);
  const response = await GET(request("/x"), params(crypto.randomUUID()));
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.deepEqual([body.status, body.code, body.retryable], ["not_found", "GENERATION_NOT_FOUND", true]);
});

test("running, lost and failed generations are reported honestly", async () => {
  const { GET } = await import("../app/api/chat/generations/[requestId]/route");
  signInAs(aliceTokens);
  const running = crypto.randomUUID(), lost = crypto.randomUUID(), failed = crypto.randomUUID();
  await db.query("insert into chat_generations(user_id,conversation_id,request_id,status) values($1,$2,$3,'streaming')", [alice, conversation, running]);
  await db.query("insert into chat_generations(user_id,conversation_id,request_id,status,updated_at) values($1,$2,$3,'streaming',now() - interval '30 minutes')", [alice, conversation, lost]);
  await db.query("insert into chat_generations(user_id,conversation_id,request_id,status,error_code) values($1,$2,$3,'failed','AI_TIMEOUT')", [alice, conversation, failed]);
  const live = await (await GET(request("/x"), params(running))).json();
  assert.deepEqual([live.status, live.retryable, live.assistantMessage], ["streaming", false, null]);
  const stale = await (await GET(request("/x"), params(lost))).json();
  assert.deepEqual([stale.status, stale.error.code, stale.retryable], ["failed", "STREAM_INTERRUPTED", true]);
  const timeout = await (await GET(request("/x"), params(failed))).json();
  assert.deepEqual([timeout.status, timeout.error.code, timeout.error.message], ["failed", "AI_TIMEOUT", "استغرقت الإجابة وقتًا أطول من المعتاد، أعد المحاولة"]);
});

test("only the Stop button cancels a running generation, and only for its owner", async () => {
  const { DELETE } = await import("../app/api/chat/generations/[requestId]/route");
  const { registerGeneration, unregisterGeneration } = await import("../lib/tutor/generations");
  const requestId = crypto.randomUUID();
  const id = (await db.query<{ id: string }>("insert into chat_generations(user_id,conversation_id,request_id,status) values($1,$2,$3,'streaming') returning id", [alice, conversation, requestId])).rows[0].id;
  const controller = new AbortController();
  registerGeneration(id, controller);
  signInAs(bobTokens);
  assert.equal((await DELETE(request("/x", { method: "DELETE" }), params(requestId))).status, 404);
  assert.equal(controller.signal.aborted, false);
  signInAs(aliceTokens);
  assert.equal((await (await DELETE(request("/x", { method: "DELETE" }), params(requestId))).json()).cancelled, true);
  assert.equal(controller.signal.aborted, true);
  unregisterGeneration(id);
});

test("the conversation resync endpoint returns the book, the chapter position and the unanswered question", async () => {
  const { GET } = await import("../app/api/conversations/[id]/study/route");
  const outline = { version: 1, bookTitle: "Notes", confidence: "high", method: "keyword", tocDetected: false, tocOnly: [], warnings: [], chapterCount: 2, sectionCount: 0,
    chapters: [{ index: 1, number: 1, title: "One", prefix: "Chapter", sections: [] }, { index: 2, number: 2, title: "Two", prefix: "Chapter", sections: [{ index: 1 }] }] };
  await db.query("insert into knowledge_chunks(document_id,source_type,source_priority,chunk_index,content,content_hash,embedding,token_count) values($1,'student_private_file',100,0,'x','h',$2::vector,1)", [documentId, `[${Array(1536).fill(0.1)}]`]);
  await db.query("update knowledge_documents set status='ready',extracted_text_length=10,chunk_count=1,embedding_count=1,outline_json=$2::jsonb,chapter_count=2,structure_confidence='high',structure_version=1 where id=$1", [documentId, JSON.stringify(outline)]);
  await db.query("update conversations set lecture_id=$2 where id=$1", [conversation, lecture]);
  await db.query(`insert into conversation_summaries(conversation_id,user_id,current_document_id,current_chapter_index,current_chapter_number,current_chapter_title,current_part,total_parts,current_position)
    values($1,$2,$3,2,2,'Two',1,3,40) on conflict(conversation_id) do update set current_document_id=excluded.current_document_id,current_chapter_index=2,current_chapter_number=2,current_chapter_title='Two',current_part=1,total_parts=3,current_position=40`, [conversation, alice, documentId]);
  signInAs(bobTokens);
  assert.equal((await GET(request("/x"), idParams(conversation))).status, 404);
  signInAs(aliceTokens);
  const view = await (await GET(request("/x"), idParams(conversation))).json();
  assert.equal(view.activeDocument.title, "Notes");
  assert.equal(view.activeDocument.kind, "private");
  assert.deepEqual([view.studyContext.chapterIndex, view.studyContext.part, view.studyContext.totalParts], [2, 1, 3]);
  assert.deepEqual(view.outline.map((chapter: { label: string }) => chapter.label), ["Chapter 1 — One", "Chapter 2 — Two"]);
  assert.equal(view.pendingGeneration.status !== "completed", true, "the newest unanswered question is surfaced");
});

test("file preparation is reported as uploading, processing, ready or failed with a retry hint", async () => {
  const { GET } = await import("../app/api/chat/files/route");
  const status = async () => (await GET(request(`/api/chat/files?conversationId=${conversation}&lectureId=${lecture}`))).json();
  signInAs(aliceTokens);
  await db.query("update knowledge_documents set status='embedding' where id=$1", [documentId]);
  await db.query("update lectures set status='uploaded' where id=$1", [lecture]);
  const processing = await status();
  assert.deepEqual([processing.phase, processing.message, processing.retryable], ["processing", "جارٍ تجهيز الملف للدراسة...", false]);
  await db.query("update lectures set status='failed' where id=$1", [lecture]);
  await db.query("update knowledge_documents set status='needs_review',error_message='No readable content' where id=$1", [documentId]);
  const empty = await status();
  assert.deepEqual([empty.phase, empty.code, empty.retryable, empty.error], ["failed", "NO_TEXT_EXTRACTED", true, "تعذر تجهيز الملف: لم أجد نصًا مقروءًا فيه. جرّب نسخة أوضح أو ملف PDF نصيًا"]);
  await db.query("update knowledge_documents set status='failed',error_message='boom' where id=$1", [documentId]);
  const failed = await status();
  assert.deepEqual([failed.phase, failed.code, failed.error], ["failed", "FILE_PROCESSING_FAILED", "تعذر تجهيز الملف"]);
  signInAs(bobTokens);
  assert.equal((await GET(request(`/api/chat/files?conversationId=${conversation}&lectureId=${lecture}`))).status, 404);
});
