import { z } from 'zod';
import { getAdminProfileOrNull } from '@/lib/auth';
import { identityDb } from '@/lib/tutor/db';
import { enqueueDocument } from '@/lib/tutor/ingestion';
const actionSchema=z.object({action:z.enum(['activate','deactivate','archive','reprocess']),priority:z.number().int().min(0).max(100).optional()});
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const admin=await getAdminProfileOrNull();if(!admin)return Response.json({error:'غير مصرح'},{status:403});
  const {id}=await params;if(!z.string().uuid().safeParse(id).success)return Response.json({error:'معرف غير صالح'},{status:400});
  const db=identityDb(admin.user_id),document=(await db.query('select * from knowledge_documents where id=$1 and owner_id is null',[id])).rows[0];
  if(!document)return Response.json({error:'المصدر غير موجود'},{status:404});
  const chunks=(await db.query('select id,heading,page_number,chunk_index,content,token_count from knowledge_chunks where document_id=$1 order by chunk_index limit 1000',[id])).rows;
  return Response.json({document,chunks},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const admin=await getAdminProfileOrNull();if(!admin)return Response.json({error:'غير مصرح'},{status:403});
  const {id}=await params,parsed=actionSchema.safeParse(await request.json().catch(()=>null));
  if(!z.string().uuid().safeParse(id).success||!parsed.success)return Response.json({error:'بيانات غير صالحة'},{status:400});
  const db=identityDb(admin.user_id),document=(await db.query('select id,status from knowledge_documents where id=$1 and owner_id is null',[id])).rows[0];
  if(!document)return Response.json({error:'المصدر غير موجود'},{status:404});
  if(parsed.data.action==='activate'&&document.status!=='ready')return Response.json({error:'المصدر يحتاج معالجة ومراجعة قبل الاعتماد'},{status:409});
  if(parsed.data.action==='reprocess'){await enqueueDocument(id,true);return Response.json({ok:true,status:'queued'});}
  await db.query(`update knowledge_documents set is_active=$2,publication_status=$3,
    source_priority=coalesce($4,source_priority),updated_at=now() where id=$1`,
    [id,parsed.data.action!=='archive',parsed.data.action==='activate'?'published':parsed.data.action==='archive'?'archived':'hidden',parsed.data.priority??null]);
  return Response.json({ok:true});
}
