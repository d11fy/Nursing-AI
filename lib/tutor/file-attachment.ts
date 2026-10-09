import 'server-only';
import { withIdentity, identityDb } from './db';
/**
 * Links a processed private file to a conversation. The conversation keeps only a pointer (lecture + document);
 * the full text lives in knowledge_chunks, so nothing is truncated or duplicated here.
 */
export async function attachProcessedLecture(userId:string,conversationId:string,lectureId:string) {
  const scoped=identityDb(userId);
  const doc=(await scoped.query<{id:string;title:string;storage_path:string;subject_id:string|null;page_count:number;chapter_count:number}>(`
    select d.id,d.title,d.storage_path,d.subject_id,d.page_count,d.chapter_count from knowledge_documents d
    join conversations c on c.id=$2 and c.user_id=$1 where d.lecture_id=$3 and d.owner_id=$1 and d.status='ready'`,[userId,conversationId,lectureId])).rows[0];
  if(!doc) throw new Error('Processed private file not found');
  return withIdentity(userId,async db=>{
    // Serialize ordinal allocation across simultaneous uploads in one conversation.
    await db.query('select id from conversations where id=$1 and user_id=$2 for update',[conversationId,userId]);
    const result=await db.query(`insert into conversation_attachments(conversation_id,user_id,file_path,file_type,ordinal,vision_extracted_text,
      vision_structured_json,subject_id,lecture_id,status,provider,model,analysis_version)
      values($1,$2,$3,'file',(select coalesce(max(ordinal),0)+1 from conversation_attachments where conversation_id=$1),'',$4::jsonb,$5,$6,'ready','openai','gpt-6-luna',2)
      on conflict(conversation_id,file_path) do update set vision_extracted_text='',vision_structured_json=excluded.vision_structured_json,status='ready'
      returning id`,[conversationId,userId,doc.storage_path,JSON.stringify({document_type:'lecture',subject_guess:null,topic:doc.title,
        extracted_text:'',sections:[],medical_terms:[],tables:[],unclear_regions:[],document_id:doc.id,page_count:doc.page_count,chapter_count:doc.chapter_count}),doc.subject_id,lectureId]);
    const attachmentId=result.rows[0].id;
    await db.query('update conversations set active_attachment_id=$3,lecture_id=$4,subject_id=$5,updated_at=now() where id=$1 and user_id=$2',
      [conversationId,userId,attachmentId,lectureId,doc.subject_id]);
    // The active book is remembered on the server; a different book clears the previous chapter position.
    await db.query(`insert into conversation_summaries(conversation_id,user_id,current_document_id,current_attachment_id) values($1,$2,$3,$4)
      on conflict(conversation_id) do update set
        current_chapter_index=case when conversation_summaries.current_document_id is not distinct from excluded.current_document_id then conversation_summaries.current_chapter_index end,
        current_chapter_number=case when conversation_summaries.current_document_id is not distinct from excluded.current_document_id then conversation_summaries.current_chapter_number end,
        current_chapter_title=case when conversation_summaries.current_document_id is not distinct from excluded.current_document_id then conversation_summaries.current_chapter_title end,
        current_section_title=case when conversation_summaries.current_document_id is not distinct from excluded.current_document_id then conversation_summaries.current_section_title end,
        current_part=case when conversation_summaries.current_document_id is not distinct from excluded.current_document_id then conversation_summaries.current_part end,
        total_parts=case when conversation_summaries.current_document_id is not distinct from excluded.current_document_id then conversation_summaries.total_parts end,
        current_position=case when conversation_summaries.current_document_id is not distinct from excluded.current_document_id then conversation_summaries.current_position end,
        current_document_id=excluded.current_document_id,current_attachment_id=excluded.current_attachment_id,updated_at=now()
      where conversation_summaries.user_id=excluded.user_id`,[conversationId,userId,doc.id,attachmentId]);
    return attachmentId as string;
  });
}
