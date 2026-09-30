import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../scripts/migrate.mjs";
import { getAIProvider } from "../lib/ai";
import { retrieveCurriculum, searchTerms } from "../lib/ai/curriculum-search";
import { processDocument } from "../lib/knowledge";

const db = new PGlite();
const alice = "10000000-0000-4000-8000-000000000001";
const bob = "10000000-0000-4000-8000-000000000002";
const execute = async (sql:string,values?:unknown[]) => {
  if (!values && sql.includes(";")) { await db.exec(sql); return {rows:[]}; }
  return db.query(sql,values);
};
let subject:string, other:string, lecture:string, foreignLecture:string;
before(async()=>{
  process.env.DATABASE_URL="postgresql://test-only";
  process.env.OPENAI_API_KEY="test-only";
  process.env.AI_PROVIDER="openai";
  process.env.OPENAI_EMBEDDING_MODEL="test-embedding";
  Object.assign(globalThis,{nursingPool:{query:execute,connect:async()=>({query:execute,release(){}})}});
  await migrate({query:execute});
  const years=(await db.query<{id:string}>("SELECT id FROM academic_years ORDER BY sort_order")).rows;
  subject=(await db.query<{subject_id:string}>("SELECT subject_id FROM subject_academic_years WHERE academic_year_id=$1 LIMIT 1",[years[0].id])).rows[0].subject_id;
  other=(await db.query<{subject_id:string}>("SELECT subject_id FROM subject_academic_years WHERE academic_year_id=$1 LIMIT 1",[years[2].id])).rows[0].subject_id;
  for(const id of [alice,bob]) {
    await db.query("INSERT INTO app_users(id,email,password_hash) VALUES($1,$2,'test')",[id,`${id}@example.test`]);
    await db.query("INSERT INTO profiles(user_id,email,full_name,academic_year_id) VALUES($1,$2,'Student',$3)",[id,`${id}@example.test`,years[0].id]);
  }
  async function document(title:string,subjectId:string|null,status:string,content:string,vector:number[],model="test-embedding") {
    const id=(await db.query<{id:string}>("INSERT INTO documents(title,file_name,file_url,subject_id,status) VALUES($1,'book.txt','test',$2,$3) RETURNING id",[title,subjectId,status])).rows[0].id;
    await db.query(`INSERT INTO document_chunks(document_id,subject_id,content,page_number,chunk_index,embedding,embedding_provider,embedding_model,embedding_dimensions)
      VALUES($1,$2,$3,12,0,$4,'openai',$5,$6)`,[id,subjectId,content,vector,model,vector.length]);
    return id;
  }
  const chosen=await document("التقييم الصحي (2)",subject,"ready","hypoglycemia source paragraph from the selected textbook.",[0,1]);
  await db.query(`INSERT INTO document_chunks(document_id,subject_id,content,page_number,chunk_index)
    VALUES($1,$2,'A neighbouring explanation on the same page.',12,1)`,[chosen,subject]);
  await document("Other book",subject,"ready","Another relevant educational passage.",[1,0]);
  await document("Forbidden",other,"ready","hypoglycemia restricted year SECRET",[1,0]);
  await document("Failed",subject,"failed","hypoglycemia failed SECRET",[1,0]);
  await document("Old model",subject,"ready","Old vector unrelated text.",[1,0],"other-model");
  await document("Different dimensions",subject,"ready","Different vector unrelated text.",[1,0,0]);
  const unanswered=await document("Unanswered exam",subject,"ready","hypoglycemia question without a solution",[1,0]);
  await db.query("UPDATE documents SET source_type='PAST_EXAM' WHERE id=$1",[unanswered]);
  async function privateLecture(owner:string) {
    const id=(await db.query<{id:string}>(`INSERT INTO lectures(user_id,subject_id,title,file_name,original_file_name,storage_path,mime_type,file_size_bytes,file_hash,status)
      VALUES($1,$2,'Private lecture','test.txt','test.txt',$3,'text/plain',100,'hash','ready') RETURNING id`,[owner,subject,`${owner}/test`])).rows[0].id;
    await db.query(`INSERT INTO lecture_chunks(lecture_id,user_id,subject_id,content,page_number,chunk_index,embedding,embedding_provider,embedding_model,embedding_dimensions)
      VALUES($1,$2,$3,'hypoglycemia private lecture content',8,0,ARRAY[1.0,0.0],'openai','test-embedding',2)`,[id,owner,subject]);
    return id;
  }
  lecture=await privateLecture(alice); foreignLecture=await privateLecture(bob);
  getAIProvider().createEmbeddings=async texts=>texts.map(()=>({embedding:[1,0],tokens:1,model:"test-embedding"}));
});
after(()=>db.close());

test("hybrid search finds a question across books without naming a source, with exact metadata and neighbours",async()=>{
  const result=await retrieveCurriculum(["hypoglycemia"],{userId:alice,subjectId:null,lectureId:null});
  const found=result.find(c=>c.title==="التقييم الصحي (2)");
  assert.ok(found); assert.equal(found.pageNumber,12); assert.match(found.content,/neighbouring explanation/);
  assert.equal(found.similarity,0); // Keyword path rescues a low semantic score.
  assert.ok(!result.some(c=>/SECRET|private lecture/.test(c.content)));
  assert.ok(!result.some(c=>/Old model|Different dimensions/.test(c.title??"")));
  assert.ok(!result.some(c=>c.title==="Unanswered exam"));
});
test("Arabic title normalization is searchable without a manually specified book",async()=>{
  const result=await retrieveCurriculum(["التَّقييم الصحي"],{userId:alice,subjectId:null,lectureId:null});
  assert.ok(result.some(c=>c.title==="التقييم الصحي (2)"));
  assert.equal(searchTerms("أَدْوِيَة القلب | ' ;"),"ادوية | القلب");
});
test("lecture-only search cannot return shared documents or another student's lectures",async()=>{
  const result=await retrieveCurriculum(["hypoglycemia"],{userId:alice,subjectId:subject,lectureId:lecture});
  assert.equal(result.length,1);assert.equal(result[0].documentId,lecture);assert.equal(result[0].pageNumber,8);
  assert.deepEqual(await retrieveCurriculum(["hypoglycemia"],{userId:alice,subjectId:null,lectureId:foreignLecture}),[]);
});
test("new migration is repeatable and preserves existing chunks",async()=>{
  const before=(await db.query("SELECT id FROM document_chunks ORDER BY id")).rows;
  await migrate({query:execute});
  assert.deepEqual((await db.query("SELECT id FROM document_chunks ORDER BY id")).rows,before);
});
test("failed reindex preserves previous chunks and successful reindex swaps the complete index",async()=>{
  const id=(await db.query<{id:string}>("INSERT INTO documents(title,file_name,file_url,status) VALUES('Atomic','atomic.txt','knowledge/atomic','ready') RETURNING id")).rows[0].id;
  await db.query("INSERT INTO stored_files(path,bucket,owner_id,mime_type,content) VALUES('knowledge/atomic','knowledge-documents',$1,'text/plain',$2)",[alice,Buffer.from("A complete course passage from the uploaded textbook.")]);
  await db.query("INSERT INTO document_chunks(document_id,content,chunk_index) VALUES($1,'previous complete index',0)",[id]);
  const provider=getAIProvider(), saved=provider.createEmbeddings;
  try {
    provider.createEmbeddings=async()=>{throw new Error("embedding offline");};
    await assert.rejects(processDocument(id),/embedding offline/);
    assert.equal((await db.query<{content:string}>("SELECT content FROM document_chunks WHERE document_id=$1",[id])).rows[0].content,"previous complete index");
    provider.createEmbeddings=saved;
    await processDocument(id);
    assert.equal((await db.query<{content:string}>("SELECT content FROM document_chunks WHERE document_id=$1",[id])).rows[0].content,"A complete course passage from the uploaded textbook.");
    const doc=(await db.query<{status:string;index_version:number;extraction_page_count:number}>("SELECT * FROM documents WHERE id=$1",[id])).rows[0];
    assert.equal(doc.status,"ready");assert.equal(doc.index_version,2);assert.equal(doc.extraction_page_count,1);
  } finally {provider.createEmbeddings=saved;}
});
