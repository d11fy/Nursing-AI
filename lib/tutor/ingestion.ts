import 'server-only';
import { getPool } from '@/lib/db/pool';
import { workerDb, withIdentity } from './db';
import { hashText, structureChunks } from './chunking';
import { extractPagesFromFile, type ExtractedPage } from '@/lib/knowledge';
import { downloadKnowledgeDocument, downloadLectureFile } from '@/lib/storage';
import { getAIProvider } from '@/lib/ai';
import { toVisionDataUri } from '@/lib/vision-image';
import { transcribePage } from '@/lib/ai/document-ocr';
import { logUsage } from '@/lib/usage';

export const INDEX_VERSION = 3;
export const SOURCE_PRIORITIES: Record<string,number> = { university_lecture:98,doctor_slides:100,official_course_material:95,
  required_textbook:90,lab_manual:85,exam_questions:75,approved_notes:70,student_private_file:100 };
export function normalizeSource(value: string): string {
  const key = value.toLowerCase();
  if (Object.hasOwn(SOURCE_PRIORITIES,key)) return key;
  return ({ book:'required_textbook',reference:'required_textbook',lecture:'university_lecture',lab_material:'lab_manual',
    past_exam:'exam_questions',question_bank:'exam_questions',questions:'exam_questions' } as Record<string,string>)[key] ?? 'approved_notes';
}
export function normalizeResourceCategory(value:string|null|undefined, sourceType:string):string {
  const allowed=new Set(['curriculum_book','university_lecture','summary','previous_exam','exam_model','question_bank','explanation','notes','lab_material','other']);
  if(value&&allowed.has(value))return value;
  const key=sourceType.toLowerCase();
  return ({required_textbook:'curriculum_book',book:'curriculum_book',reference:'curriculum_book',university_lecture:'university_lecture',
    doctor_slides:'university_lecture',summary:'summary',past_exam:'previous_exam',exam_questions:'previous_exam',model_answers:'exam_model',
    question_bank:'question_bank',official_course_material:'explanation',approved_notes:'notes',review_notes:'notes',lab_manual:'lab_material',lab_material:'lab_material'} as Record<string,string>)[key]??'other';
}
type Document = { id:string; legacy_document_id:string|null; lecture_id:string|null; owner_id:string|null; subject_id:string|null;
  academic_year_id:string|null; semester_id:number|null; title:string; original_file_name:string; storage_path:string;
  source_type:string; source_priority:number; file_hash:string|null; status:string; index_version:number; uploaded_by:string|null;
  extracted_pages_json:ExtractedPage[]; resource_category:string|null; library_description:string|null; language:string|null;
  source_label:string|null; visibility_scope:string; sort_order:number };

export async function registerDocument(id:string, privateLecture = false): Promise<string> {
  const pool = getPool();
  if (privateLecture) {
    const { rows } = await workerDb.query(`select * from lectures where id=$1`,[id]);
    const d=rows[0]; if(!d) throw new Error('Lecture not found');
    return withIdentity(null,async db => {
      const result=await db.query(`insert into knowledge_documents(lecture_id,owner_id,title,original_file_name,storage_path,subject_id,
        source_type,source_priority,file_hash,file_size,uploaded_by,is_active) values($1,$2,$3,$4,$5,$6,'student_private_file',100,$7,$8,$2,true)
        on conflict(lecture_id) do update set title=excluded.title,subject_id=excluded.subject_id returning id`,
      [id,d.user_id,d.title,d.original_file_name,d.storage_path,d.subject_id,d.file_hash,d.file_size_bytes]);
      return result.rows[0].id;
    },true);
  }
  const {rows}=await pool.query('select * from documents where id=$1',[id]);
  const d=rows[0]; if(!d) throw new Error('Document not found');
  const type=normalizeSource(d.source_type);
  return withIdentity(null,async db => {
    const category=normalizeResourceCategory(d.resource_category,d.source_type);
    const result=await db.query(`insert into knowledge_documents(legacy_document_id,title,original_file_name,storage_path,subject_id,
      academic_year_id,semester_id,source_type,source_priority,file_hash,file_size,uploaded_by,resource_category,library_description,
      language,source_label,visibility_scope,sort_order)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) on conflict(legacy_document_id) do update set
      title=excluded.title,subject_id=excluded.subject_id,academic_year_id=excluded.academic_year_id,semester_id=excluded.semester_id,
      source_type=excluded.source_type,source_priority=excluded.source_priority,resource_category=excluded.resource_category,
      library_description=excluded.library_description,language=excluded.language,source_label=excluded.source_label,
      visibility_scope=excluded.visibility_scope,sort_order=excluded.sort_order returning id`,[id,d.title,d.file_name,d.file_url,d.subject_id,d.academic_year_id,d.semester,type,
      d.source_priority??SOURCE_PRIORITIES[type],d.file_hash,d.file_size,d.created_by,category,d.library_description,d.language,d.source_label,
      d.visibility_scope??'specific_subject',d.sort_order??0]);
    return result.rows[0].id;
  },true);
}
export async function enqueueDocument(documentId:string, reindex=false) {
  await withIdentity(null,async db=>{
    const queued=await db.query(`insert into knowledge_jobs(document_id) values($1) on conflict(document_id) do update
    set status='queued',attempts=0,available_at=now(),lease_until=null,error_message=null,updated_at=now()
    where knowledge_jobs.status<>'running' or knowledge_jobs.lease_until<now() returning document_id`,[documentId]);
    if(reindex&&queued.rows.length)await db.query("update knowledge_documents set status='uploaded',index_version=0,error_message=null,updated_at=now() where id=$1",[documentId]);
  },true);
}
export async function processKnowledgeDocument(id:string, forceExtraction=false):Promise<void> {
  const connection=await getPool().connect();
  let acquired=false;
  try {
    acquired=(await connection.query('select pg_try_advisory_lock(hashtext($1)) acquired',[`knowledge-v2:${id}`])).rows[0].acquired;
    if(!acquired) throw new Error('Document is already processing');
    await ingest(id,forceExtraction);
  } finally { try { if(acquired) await connection.query('select pg_advisory_unlock(hashtext($1))',[`knowledge-v2:${id}`]); } finally { connection.release(); } }
}
async function ingest(id:string,force:boolean) {
  const doc=(await workerDb.query<Document>('select * from knowledge_documents where id=$1',[id])).rows[0];
  if(!doc) throw new Error('Knowledge document not found');
  const start=Date.now(), ai=getAIProvider();
  try {
    let pages:ExtractedPage[], fileHash=doc.file_hash;
    if(!force && doc.extracted_pages_json.length) {
      // Originals may have expired. The saved extraction remains usable and unchanged.
      if(doc.status==='ready'&&doc.index_version===INDEX_VERSION) return;
      pages=doc.extracted_pages_json;
    } else {
      await workerDb.query("update knowledge_documents set status='extracting',error_message=null,updated_at=now() where id=$1",[id]);
      const file=doc.lecture_id ? await downloadLectureFile(doc.storage_path) : {content:await downloadKnowledgeDocument(doc.storage_path),mimeType:''};
      fileHash=hashText(file.content);
      if(!force && doc.file_hash===fileHash && doc.index_version===INDEX_VERSION && doc.extracted_pages_json.length) pages=doc.extracted_pages_json;
      else pages=file.mimeType.startsWith('image/') ? [{pageNumber:1,text:await transcribePage(await toVisionDataUri(file.content),ai,doc.uploaded_by ?? undefined)}]
        : await extractPagesFromFile(file.content,doc.original_file_name,doc.uploaded_by ?? undefined);
      // Persist extraction before embeddings so a retry does not repeat Vision calls.
      await workerDb.query(`update knowledge_documents set file_hash=$2,extracted_pages_json=$3::jsonb,updated_at=now() where id=$1`,[id,fileHash,JSON.stringify(pages)]);
    }
    const length=pages.reduce((sum,p)=>sum+p.text.length,0);
    const chunks=pages.flatMap(page=>structureChunks(page.text).map(chunk=>({...chunk,pageNumber:page.pageNumber})));
    if(!length || !chunks.length) {
      await workerDb.query("update knowledge_documents set status='needs_review',error_message='No readable content',extracted_text_length=$2,page_count=$3 where id=$1",[id,length,pages.length]);
      throw new Error('No readable content; document needs review');
    }
    await workerDb.query("update knowledge_documents set status='chunking',extracted_text_length=$2,page_count=$3,updated_at=now() where id=$1",[id,length,pages.length]);
    const scope=doc.owner_id ?? 'curriculum', unique=[...new Map(chunks.map(chunk=>[chunk.contentHash,chunk])).values()];
    const cached=(await workerDb.query<{content_hash:string;embedding:string}>(`select content_hash,embedding::text from knowledge_embedding_cache
      where scope_key=$1 and model='text-embedding-3-small' and content_hash=any($2::text[])`,[scope,unique.map(c=>c.contentHash)])).rows;
    const vectors=new Map(cached.map(row=>[row.content_hash,row.embedding]));
    const missing=unique.filter(c=>!vectors.has(c.contentHash));
    await workerDb.query("update knowledge_documents set status='embedding',updated_at=now() where id=$1",[id]);
    for(let i=0;i<missing.length;i+=32) {
      const batch=missing.slice(i,i+32), embeddings=await ai.createEmbeddings(batch.map(c=>c.content));
      if(embeddings.length!==batch.length) throw new Error('Embedding count mismatch');
      for(let j=0;j<batch.length;j++) {
        const embedding=embeddings[j];
        if(embedding.model!=='text-embedding-3-small' || embedding.embedding.length!==1536 || !embedding.embedding.every(Number.isFinite)) throw new Error('Invalid embedding space');
        const vector=`[${embedding.embedding.join(',')}]`; vectors.set(batch[j].contentHash,vector);
        await workerDb.query(`insert into knowledge_embedding_cache(scope_key,content_hash,model,embedding,token_count) values($1,$2,$3,$4::vector,$5)
          on conflict do nothing`,[scope,batch[j].contentHash,embedding.model,vector,embedding.tokens]);
      }
      const inputTokens=embeddings.reduce((n,e)=>n+e.tokens,0);
      if(doc.uploaded_by) await logUsage({userId:doc.uploaded_by,type:'embedding',feature:'knowledge_embedding',model:'text-embedding-3-small',
        provider:'openai',inputTokens,outputTokens:0,estimatedCost:ai.calculateCost({model:'text-embedding-3-small',inputTokens,outputTokens:0})});
    }
    // Replace atomically after all extraction/embeddings succeed. Legacy vectors are never touched here.
    await withIdentity(null,async db=>{
      await db.query('delete from knowledge_chunks where document_id=$1',[id]);
      for(let i=0;i<chunks.length;i++) {
        const c=chunks[i];
        await db.query(`insert into knowledge_chunks(document_id,subject_id,academic_year_id,semester_id,source_type,source_priority,
          chapter,section,heading,page_number,chunk_index,content,content_hash,embedding,token_count)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::vector,$15)`,
        [id,doc.subject_id,doc.academic_year_id,doc.semester_id,doc.source_type,doc.source_priority,c.chapter,c.section,c.heading,c.pageNumber,i,c.content,c.contentHash,vectors.get(c.contentHash),c.tokenCount]);
      }
      await db.query(`update knowledge_documents set status='ready',file_hash=$2,page_count=$3,extracted_text_length=$4,
        chunk_count=$5,embedding_count=$5,index_version=$6,processing_time_ms=$7,processed_at=now(),updated_at=now(),error_message=null where id=$1`,
      [id,fileHash,pages.length,length,chunks.length,INDEX_VERSION,Date.now()-start]);
      if(doc.legacy_document_id) await db.query(`update documents set status='ready',file_hash=$2,chunk_count=$3,extraction_page_count=$4,
        ocr_page_count=$5,index_version=$6,error_message=null,updated_at=now() where id=$1`,[doc.legacy_document_id,fileHash,chunks.length,pages.length,pages.filter(p=>p.ocr).length,INDEX_VERSION]);
      if(doc.lecture_id) await db.query("update lectures set status='ready',processing_completed_at=now(),error_message=null where id=$1",[doc.lecture_id]);
    },true);
  } catch(error) {
    await workerDb.query(`update knowledge_documents set status=case when status='needs_review' then status else 'failed' end,
      error_message=$2,updated_at=now() where id=$1`,[id,error instanceof Error ? error.message.slice(0,600) : 'Processing failed']);
    if(doc.legacy_document_id) await getPool().query("update documents set status='failed',error_message='تعذرت معالجة المصدر؛ راجع النص والصور وأعد المحاولة' where id=$1",[doc.legacy_document_id]);
    if(doc.lecture_id) await workerDb.query("update lectures set status='failed',error_message='تعذرت معالجة الملف؛ راجع جودة المصدر وأعد المحاولة' where id=$1",[doc.lecture_id]);
    throw error;
  }
}
export async function runKnowledgeJobs() {
  const job=await withIdentity(null,async db=>{
    const result=await db.query(`select document_id from knowledge_jobs where (status='queued' and available_at<=now())
      or (status='running' and lease_until<now()) order by available_at for update skip locked limit 1`);
    if(!result.rows[0]) return null;
    await db.query("update knowledge_jobs set status='running',attempts=attempts+1,lease_until=now()+interval '5 minutes',updated_at=now() where document_id=$1",[result.rows[0].document_id]);
    return result.rows[0].document_id as string;
  },true);
  if(!job) return;
  const heartbeat=setInterval(()=>void workerDb.query("update knowledge_jobs set lease_until=now()+interval '5 minutes' where document_id=$1 and status='running'",[job]).catch(()=>{}),30_000);
  try {
    await processKnowledgeDocument(job);
    const completed=(await workerDb.query<{lecture_id:string|null;legacy_document_id:string|null;source_type:string}>('select lecture_id,legacy_document_id,source_type from knowledge_documents where id=$1',[job])).rows[0];
    if(completed?.legacy_document_id&&completed.source_type==='exam_questions'){const {registerExam}=await import('./exam-jobs');await registerExam(completed.legacy_document_id);}
    if(completed?.lecture_id) {
      const {submitContributionIfRequested}=await import('@/lib/lectures/contribution');
      await submitContributionIfRequested(completed.lecture_id);
    }
    await workerDb.query("update knowledge_jobs set status='done',lease_until=null,updated_at=now() where document_id=$1",[job]);
  } catch(error) {
    await workerDb.query(`update knowledge_jobs set status=case when attempts<3 then 'queued' else 'failed' end,
      available_at=now()+interval '1 minute',lease_until=null,error_message=$2,updated_at=now() where document_id=$1`,[job,error instanceof Error ? error.message.slice(0,600) : 'Failed']);
  } finally { clearInterval(heartbeat); }
}
