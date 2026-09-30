import 'server-only';
import { withIdentity, identityDb } from './db';
export async function attachProcessedLecture(userId:string,conversationId:string,lectureId:string) {
  const scoped=identityDb(userId);
  const doc=(await scoped.query<{id:string;title:string;storage_path:string;subject_id:string|null;extracted_pages_json:Array<{pageNumber:number|null;text:string}>}>(`
    select d.id,d.title,d.storage_path,d.subject_id,d.extracted_pages_json from knowledge_documents d
    join conversations c on c.id=$2 and c.user_id=$1 where d.lecture_id=$3 and d.owner_id=$1 and d.status='ready'`,[userId,conversationId,lectureId])).rows[0];
  if(!doc) throw new Error('Processed private file not found');
  const sections=doc.extracted_pages_json.slice(0,30).map((page,index)=>({index:page.pageNumber??index+1,title:`Page ${page.pageNumber??index+1}`,text:page.text.slice(0,10000)}));
  const text=doc.extracted_pages_json.map(page=>`Page ${page.pageNumber??''}:\n${page.text}`).join('\n\n');
  return withIdentity(userId,async db=>{
    // Serialize ordinal allocation across simultaneous uploads in one conversation.
    await db.query('select id from conversations where id=$1 and user_id=$2 for update',[conversationId,userId]);
    const result=await db.query(`insert into conversation_attachments(conversation_id,user_id,file_path,file_type,ordinal,vision_extracted_text,
      vision_structured_json,subject_id,lecture_id,status,provider,model,analysis_version)
      values($1,$2,$3,'file',(select coalesce(max(ordinal),0)+1 from conversation_attachments where conversation_id=$1),$4,$5::jsonb,$6,$7,'ready','openai','gpt-6-luna',2)
      on conflict(conversation_id,file_path) do update set vision_extracted_text=excluded.vision_extracted_text,vision_structured_json=excluded.vision_structured_json,status='ready'
      returning id`,[conversationId,userId,doc.storage_path,text,JSON.stringify({document_type:'lecture',subject_guess:null,topic:doc.title,
        extracted_text:text.slice(0,30000),sections,medical_terms:[],tables:[],unclear_regions:[]}),doc.subject_id,lectureId]);
    const attachmentId=result.rows[0].id;
    await db.query('update conversations set active_attachment_id=$3,lecture_id=$4,subject_id=$5,updated_at=now() where id=$1 and user_id=$2',
      [conversationId,userId,attachmentId,lectureId,doc.subject_id]);
    return attachmentId as string;
  });
}
