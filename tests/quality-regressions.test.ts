// Regression tests for the defects reproduced in the 1.2.0 re-audit.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { bootDatabase, createUser, db, mockNextRuntime, signInAs, jsonRequest } from './helpers/harness';
mockNextRuntime();
const uid = 'f1000000-0000-4000-8000-000000000001';
let session: {sessionToken: string; deviceToken: string};
let subject: string;
before(async()=>{
  process.env.OPENAI_API_KEY='review-only-mocked-key';
  await bootDatabase();
  session=await createUser(uid);
  const year=(await db.query<{id:string}>("select id from academic_years where code='first_year'")).rows[0].id;
  subject=(await db.query<{id:string}>("insert into subjects(name_ar,name_en) values('مراجعة','Review') returning id")).rows[0].id;
  await db.query('insert into subject_academic_years(subject_id,academic_year_id) values($1,$2)',[subject,year]);
  await db.query('update profiles set academic_year_id=$2 where user_id=$1',[uid,year]);
  await db.query("insert into lectures(id,user_id,subject_id,title,file_name,original_file_name,storage_path,mime_type,file_size_bytes,file_hash,status) values('f1000000-0000-4000-8000-000000000002',$1,$2,'Review long book','review.txt','review.txt','review/review.txt','text/plain',590000,'review-long-book','ready')",[uid,subject]);
});
after(()=>db.close());

test('oversized digests preserve beginning, middle and end concepts through semantic merge',async(t)=>{
 let digestCalls=0, finalInput='';
 const marker='UNIQUE_LAST_SECTION_CONCEPT';
 const markers=['UNIQUE_FIRST_CONCEPT','UNIQUE_MIDDLE_CONCEPT',marker];
 t.mock.method(globalThis,'fetch',async(_url:unknown,init?:RequestInit)=>{
  const body=JSON.parse(String(init?.body));
  const input=JSON.stringify(body.input);
  const reply=(payload:unknown)=>Response.json({id:'r',status:'completed',model:'gpt-6-luna',output:[],output_text:JSON.stringify(payload),usage:{input_tokens:100,output_tokens:100,input_tokens_details:{cached_tokens:0}}});
  if(body.text?.format?.name==='study_pack_section_digest'){
   digestCalls++;
   return reply({heading:'Section',summary:'Ordinary nursing concept. '.repeat(110)+markers.filter(m=>input.includes(m)).join(' '),key_concepts:[],definitions:[],clinical_notes:[],must_remember:[]});
  }
  if(body.text?.format?.name==='study_pack_digest_merge')return reply({heading:'Merged',summary:'Merged concepts. '+markers.filter(m=>input.includes(m)).join(' '),key_concepts:[],definitions:[],clinical_notes:[],must_remember:[]});
  finalInput=input;
  return reply({overview:'Review',main_concepts:[{concept:'Review',explanation:'Source'}],important_definitions:[{term:'Review',arabic_translation:'مراجعة',definition:'Source'}],clinical_notes:[],what_to_remember:['Review'],source_references:['Pages 1-40']});
 });
 const {generateSummary}=await import('../features/study-pack/services/generator');
 const materials=Array.from({length:40},(_,i)=>({pageNumber:i+1,text:'Routine source material. '.repeat(590)+(i===0?markers[0]:i===20?markers[1]:i===39?marker:'')}));
 const result=await generateSummary({lectureId:'f1000000-0000-4000-8000-000000000002',userId:uid,lectureTitle:'Review long book',materials});
 console.log(JSON.stringify({case:'long-summary',digestCalls,markerInFinalInput:finalInput.includes(marker),coverage:result.coverage}));
 assert.equal(digestCalls,40);
 for(const m of markers)assert.ok(finalInput.includes(m),m);
 assert.equal(result.coverage?.processedSections,40);
});

test('a crash on the final email attempt becomes a visible terminal failure',async()=>{
 const {processEmailQueue,EMAIL_MAX_ATTEMPTS}=await import('../lib/email-queue');
 const id=(await db.query<{id:string}>("insert into email_logs(recipient,subject_snapshot,html_snapshot,text_snapshot,status,retry_count,lease_expires_at) values('review@example.test','Review','Body','Body','sending',$1,now()-interval '1 hour') returning id",[EMAIL_MAX_ATTEMPTS])).rows[0].id;
 const result=await processEmailQueue(10,{transport:async()=>({from:'review@example.test',secrets:[],transport:{sendMail:async()=>({})}}) as never});
 const row=(await db.query<{status:string;retry_count:number}>('select status,retry_count from email_logs where id=$1',[id])).rows[0];
 console.log(JSON.stringify({case:'final-mail-crash',result,row}));
 assert.equal(result.processed,0); assert.equal(row.status,'failed');
});

test('EXAM feedback stays private until atomic, idempotent completion',async()=>{
 signInAs(session);
 const qid=(await db.query<{id:string}>("insert into exam_questions(subject_id,question_text,question_type,options_json,correct_answer_json,explanation,topic,status) values($1,'Review question','MCQ','[\"Correct\",\"Wrong\"]'::jsonb,'\"Correct\"'::jsonb,'Review rationale','Review topic','VERIFIED') returning id",[subject])).rows[0].id;
 const attempt=(await db.query<{id:string}>("insert into student_exam_attempts(user_id,subject_id,mode,practice_type,total_questions) values($1,$2,'EXAM','PAST_EXAM',1) returning id",[uid,subject])).rows[0].id;
 await db.query('insert into student_exam_attempt_questions(attempt_id,question_id) values($1,$2)',[attempt,qid]);
 const {POST}=await import('../app/api/practice/submit-answer/route');
 const submitted=await POST(jsonRequest('/api/practice/submit-answer',{attemptId:attempt,questionId:qid,selectedAnswer:'Wrong'}));
 assert.equal((await submitted.json()).review,null);
 const {GET}=await import('../app/api/learning-progress/mistakes/route');
 const response=await GET(new Request('https://nursing.example.test/api/learning-progress/mistakes'));
 const result=await response.json();
 const state=(await db.query<{completed_at:string|null}>('select completed_at from student_exam_attempts where id=$1',[attempt])).rows[0];
 console.log(JSON.stringify({case:'exam-mistakes-leak',completed:state.completed_at,mistakes:result.mistakes}));
 assert.equal(state.completed_at,null);
 assert.ok(!JSON.stringify(result.mistakes).includes('Correct'));
 const complete=()=>POST(jsonRequest('/api/practice/submit-answer',{action:'COMPLETE',attemptId:attempt}));
 const completed=await complete();assert.equal(completed.status,200,await completed.clone().text());
 assert.equal((await completed.json()).review[0].correctAnswer,'Correct');
 await complete();
 const published=await (await GET(new Request('https://nursing.example.test/api/learning-progress/mistakes'))).json();
 assert.equal(published.mistakes.length,1);assert.equal(published.mistakes[0].wrongCount,1);
 assert.equal((await db.query<{n:number}>("select count(*)::int n from learning_events where metadata->>'attemptId'=$1",[attempt])).rows[0].n,1);
});
