import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { migrate } from "../scripts/migrate.mjs";
import { attachLibrarySource, getAccessibleLibraryDocument, getConversationSources, listLibraryResources, removeLibrarySource, setLibraryFavorite } from "../lib/library";
import { retrieveKnowledge } from "../lib/tutor/retrieval";
import { identityDb } from "../lib/tutor/db";
import { claimSharedStudyContent, getOrCreateLibraryStudyPack, getSharedStudyContent, saveSharedStudyContent } from "../features/study-pack/db/study-pack-db";
import { downloadKnowledgeDocument } from "../lib/storage";

const db = new PGlite({ extensions: { vector } });
const firstStudent = "81000000-0000-4000-8000-000000000001";
const secondFirstYearStudent = "81000000-0000-4000-8000-000000000002";
const secondYearStudent = "81000000-0000-4000-8000-000000000003";
const admin = "81000000-0000-4000-8000-000000000004";
let subject: string, documentId: string, firstConversation: string, peerConversation: string;
let unauthorizedConversation: string;

const execute = async (sql: string, values?: unknown[]) => {
  if (!values && (sql.includes(";") || sql.includes("--"))) { await db.exec(sql); return { rows: [] }; }
  return db.query(sql, values);
};

before(async () => {
  process.env.DATABASE_URL = "postgresql://test-only";
  process.env.OPENAI_API_KEY = "test-only";
  Object.assign(globalThis, { nursingPool: { query: execute, connect: async () => ({ query: execute, release() {} }) } });
  await migrate({ query: execute });
  const years = (await db.query<{ id: string }>("select id from academic_years order by sort_order")).rows;
  subject = (await db.query<{ id: string }>("insert into subjects(name_ar,name_en,semester) values('الكيمياء','Library Chemistry',1) returning id")).rows[0].id;
  await db.query("insert into subject_academic_years(subject_id,academic_year_id) values($1,$2)", [subject, years[0].id]);
  for (const [id, year, role] of [[firstStudent, years[0].id, "student"], [secondFirstYearStudent, years[0].id, "student"], [secondYearStudent, years[1].id, "student"], [admin, years[0].id, "admin"]]) {
    await db.query("insert into app_users(id,email,password_hash) values($1,$2,'test')", [id, `${id}@example.test`]);
    await db.query("insert into profiles(user_id,email,full_name,role,academic_year_id) values($1,$2,'Student',$3,$4)", [id, `${id}@example.test`, role, year]);
  }
  documentId = (await db.query<{ id: string }>(`insert into knowledge_documents(title,original_file_name,storage_path,subject_id,academic_year_id,semester_id,
    source_type,resource_category,visibility_scope,publication_status,status,is_active,extracted_text_length,chunk_count,embedding_count,page_count)
    values('Chapter 1 — Introduction to Chemistry','chemistry.pdf','knowledge/chemistry',$1,$2,1,'required_textbook','curriculum_book',
    'specific_subject','published','ready',true,200,1,1,12) returning id`, [subject, years[0].id])).rows[0].id;
  await db.query(`insert into knowledge_chunks(document_id,subject_id,academic_year_id,semester_id,source_type,source_priority,content,content_hash,embedding,chunk_index,token_count,page_number)
    values($1,$2,$3,1,'required_textbook',90,'Mixtures can be homogeneous or heterogeneous.','mixtures',$4::vector,0,8,6)`,
    [documentId, subject, years[0].id, `[${Array.from({ length: 1536 }, (_, index) => index === 0 ? 1 : 0).join(",")}]`]);
  await db.query("insert into stored_files(path,bucket,owner_id,mime_type,content) values('knowledge/chemistry','knowledge-documents',$1,'application/pdf',$2)", [admin, Buffer.from("one physical file")]);
  firstConversation = (await db.query<{ id: string }>("insert into conversations(user_id,subject_id,title) values($1,$2,'Chemistry') returning id", [firstStudent, subject])).rows[0].id;
  peerConversation = (await db.query<{ id: string }>("insert into conversations(user_id,subject_id,title) values($1,$2,'Chemistry') returning id", [secondFirstYearStudent, subject])).rows[0].id;
  unauthorizedConversation = (await db.query<{ id: string }>("insert into conversations(user_id,title) values($1,'Unauthorized') returning id", [secondYearStudent])).rows[0].id;
  await db.exec("create role library_runtime nosuperuser nobypassrls; grant usage on schema public to library_runtime; grant select,insert,update,delete on all tables in schema public to library_runtime; grant usage,select on all sequences in schema public to library_runtime");
});
after(() => db.close());

test("library honors academic access and rejects a forged document id", async () => {
  const visible = await listLibraryResources(firstStudent, { subjectId: subject });
  assert.equal(visible.resources[0]?.id, documentId);
  assert.equal(visible.categoryCounts.curriculum_book, 1);
  const forbidden = await listLibraryResources(secondYearStudent, {});
  assert.equal(forbidden.total, 0);
  await assert.rejects(attachLibrarySource(secondYearStudent, { documentId }), /غير متاح/);
  await db.query("set role library_runtime");
  try {
    await assert.rejects(identityDb(secondYearStudent).query(`insert into conversation_sources(conversation_id,user_id,document_id)
      values($1,$2,$3)`, [unauthorizedConversation, secondYearStudent, documentId]), /row-level security/);
  } finally { await db.query("reset role"); }
});

test("two students attach one processed document without copying storage, chunks or embeddings", async () => {
  const before = {
    documents: (await db.query<{ count: number }>("select count(*)::int count from knowledge_documents where id=$1", [documentId])).rows[0].count,
    chunks: (await db.query<{ count: number }>("select count(*)::int count from knowledge_chunks where document_id=$1", [documentId])).rows[0].count,
    files: (await db.query<{ count: number }>("select count(*)::int count from stored_files where path='knowledge/chemistry'")).rows[0].count,
    jobs: (await db.query<{ count: number }>("select count(*)::int count from knowledge_jobs where document_id=$1", [documentId])).rows[0].count,
  };
  await attachLibrarySource(firstStudent, { conversationId: firstConversation, documentId });
  await attachLibrarySource(secondFirstYearStudent, { conversationId: peerConversation, documentId });
  assert.equal((await db.query<{ count: number }>("select count(*)::int count from conversation_sources where document_id=$1 and is_active", [documentId])).rows[0].count, 2);
  assert.deepEqual({
    documents: (await db.query<{ count: number }>("select count(*)::int count from knowledge_documents where id=$1", [documentId])).rows[0].count,
    chunks: (await db.query<{ count: number }>("select count(*)::int count from knowledge_chunks where document_id=$1", [documentId])).rows[0].count,
    files: (await db.query<{ count: number }>("select count(*)::int count from stored_files where path='knowledge/chemistry'")).rows[0].count,
    jobs: (await db.query<{ count: number }>("select count(*)::int count from knowledge_jobs where document_id=$1", [documentId])).rows[0].count,
  }, before);
});

test("favorites are private and library Study Packs reuse one shared generation", async () => {
  await setLibraryFavorite(firstStudent, documentId, true);
  assert.equal((await listLibraryResources(firstStudent, {})).resources[0]?.favorite, true);
  assert.equal((await listLibraryResources(secondFirstYearStudent, {})).resources[0]?.favorite, false);

  const firstPack = await getOrCreateLibraryStudyPack(documentId, firstStudent);
  const peerPack = await getOrCreateLibraryStudyPack(documentId, secondFirstYearStudent);
  assert.notEqual(firstPack.id, peerPack.id);
  assert.equal(firstPack.document_id, peerPack.document_id);
  assert.equal(await claimSharedStudyContent(documentId, firstPack.source_hash, "summary"), true);
  assert.equal(await claimSharedStudyContent(documentId, peerPack.source_hash, "summary"), false);
  await saveSharedStudyContent(documentId, firstPack.source_hash, "summary", { overview: "shared once" });
  const shared = await getSharedStudyContent(documentId, peerPack.source_hash, "summary", secondFirstYearStudent);
  assert.equal((shared?.content_json as { overview?: string })?.overview, "shared once");
  assert.equal((await db.query<{ count: number }>("select count(*)::int count from shared_study_content where document_id=$1", [documentId])).rows[0].count, 1);
});

test("preview and download resolve the single stored file only for an allowed student", async () => {
  const document = await getAccessibleLibraryDocument(firstStudent, documentId);
  assert.equal(document.storagePath, "knowledge/chemistry");
  assert.equal((await downloadKnowledgeDocument(document.storagePath)).toString(), "one physical file");
  await assert.rejects(getAccessibleLibraryDocument(secondYearStudent, documentId), /غير متاح/);
});

test("the selected source is prioritized for retrieval and survives reload", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ model: "text-embedding-3-small", data: [{ index: 0, embedding: Array.from({ length: 1536 }, (_, index) => index === 0 ? 1 : 0) }], usage: { total_tokens: 4 } }));
  await db.query("update knowledge_documents set publication_status='hidden' where id=$1", [documentId]);
  assert.equal((await listLibraryResources(firstStudent, {})).total, 0);
  const restored = await getConversationSources(firstStudent, firstConversation);
  assert.equal(restored[0]?.id, documentId);
  const result = await retrieveKnowledge("اشرحلي أنواع المخاليط", { userId: firstStudent, subjectId: subject, activeDocumentIds: [documentId] });
  assert.equal(result.sources[0]?.documentId, documentId);
  assert.match(result.sources[0]?.content ?? "", /Mixtures/);
});

test("removing a source only deactivates the conversation reference", async () => {
  await removeLibrarySource(firstStudent, firstConversation, documentId);
  assert.equal((await getConversationSources(firstStudent, firstConversation)).length, 0);
  assert.equal((await db.query<{ count: number }>("select count(*)::int count from knowledge_documents where id=$1", [documentId])).rows[0].count, 1);
  assert.equal((await db.query<{ count: number }>("select count(*)::int count from knowledge_chunks where document_id=$1", [documentId])).rows[0].count, 1);
  assert.equal((await db.query<{ count: number }>("select count(*)::int count from stored_files where path='knowledge/chemistry'")).rows[0].count, 1);
});
