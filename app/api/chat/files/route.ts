import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createClient } from '@/lib/db/server';
import { identityDb } from '@/lib/tutor/db';
import { registerDocument, enqueueDocument } from '@/lib/tutor/ingestion';
import { getSettings } from '@/lib/usage';
import { canStudentAccessSubject } from '@/lib/subjects';
import { limitedFormData } from '@/lib/request-body';
import { uploadLectureFile } from '@/lib/storage';
import { LECTURE_EXTENSION_MIME_MAP } from '@/lib/validations/lectures';
import { attachProcessedLecture } from '@/lib/tutor/file-attachment';
const schema=z.object({conversationId:z.string().uuid().nullable(),subjectId:z.string().uuid().nullable(),largeFileAcknowledged:z.boolean()});
export async function POST(request:Request) {
  const db=await createClient(),user=db.actor;
  if(!user||user.status!=='active') return Response.json({error:'يجب تسجيل الدخول'},{status:401});
  const settings=await getSettings(db),max=settings.lectureMaxFileMb*1024*1024;
  let form:FormData;try{form=await limitedFormData(request,max+65536);}catch{return Response.json({error:'حجم الملف كبير أو الطلب غير صالح'},{status:413});}
  const file=form.get('file'),meta=schema.safeParse({conversationId:form.get('conversationId')||null,subjectId:form.get('subjectId')||null,
    largeFileAcknowledged:form.get('largeFileAcknowledged')==='true'});
  if(!(file instanceof File)||!meta.success) return Response.json({error:'بيانات الملف غير صالحة'},{status:400});
  let cid=meta.data.conversationId,subject=meta.data.subjectId;
  if(cid) {
    const owned=(await identityDb(user.user_id).query<{subject_id:string|null}>('select subject_id from conversations where id=$1 and user_id=$2',[cid,user.user_id])).rows[0];
    if(!owned)return Response.json({error:'المحادثة غير موجودة'},{status:404});
    subject=subject??owned.subject_id;
  }
  if(!subject)return Response.json({error:'اختر المادة أو أخبر المدرس بما تريد دراسته قبل رفع الملف'},{status:400});
  if(!await canStudentAccessSubject(user.user_id,subject))return Response.json({error:'المادة غير متاحة لك'},{status:403});
  const extension=file.name.split('.').pop()?.toLowerCase()??'';
  if(!LECTURE_EXTENSION_MIME_MAP[extension]||LECTURE_EXTENSION_MIME_MAP[extension]!==file.type)return Response.json({error:'استخدم PDF أو DOCX أو PPTX أو TXT'},{status:400});
  const large=file.size>20*1024*1024;
  if(large&&!meta.data.largeFileAcknowledged)return Response.json({error:'الملف الأصلي الأكبر من 20MB يحذف بعد 10 أيام؛ المحتوى المستخرج يبقى للدراسة. أكد الاطلاع على التنويه.',requiresAcknowledgement:true},{status:400});
  const buffer=Buffer.from(await file.arrayBuffer()),hash=createHash('sha256').update(buffer).digest('hex');
  if(!cid) {
    const created=await db.from('conversations').insert({user_id:user.user_id,title:file.name.slice(0,60),subject_id:subject}).select('id').single();
    if(!created.data)return Response.json({error:'تعذر إنشاء المحادثة'},{status:503});cid=created.data.id;
  }
  const duplicate=(await identityDb(user.user_id).query<{id:string;status:string}>('select id,status from lectures where user_id=$1 and file_hash=$2 and subject_id=$3 and deleted_at is null limit 1',[user.user_id,hash,subject])).rows[0];
  if(duplicate?.status==='ready') {
    const attachmentId=await attachProcessedLecture(user.user_id,cid,duplicate.id);
    return Response.json({conversationId:cid,lectureId:duplicate.id,attachmentId,status:'ready'});
  }
  const {path}=await uploadLectureFile(db,user.user_id,file,max);
  const lecture=await db.from('lectures').insert({user_id:user.user_id,subject_id:subject,title:file.name.slice(0,180),file_name:file.name.replace(/[/\\\x00-\x1f]/g,'_'),
    original_file_name:file.name,storage_path:path,mime_type:file.type,file_size_bytes:file.size,file_hash:hash,status:'uploaded',
    delete_after:large?new Date(Date.now()+10*86400000).toISOString():null}).select('id').single();
  if(!lecture.data)return Response.json({error:'تعذر حفظ الملف'},{status:503});
  const lectureId=lecture.data.id,conversationId=cid;
  await enqueueDocument(await registerDocument(lectureId,true));
  return Response.json({conversationId,lectureId,status:'processing',deleteAfter:large?new Date(Date.now()+10*86400000).toISOString():null},{status:202});
}
export async function GET(request:Request) {
  const db=await createClient(),user=db.actor;if(!user)return Response.json({error:'يجب تسجيل الدخول'},{status:401});
  const url=new URL(request.url),cid=url.searchParams.get('conversationId'),lecture=url.searchParams.get('lectureId');
  if(!z.string().uuid().safeParse(cid).success||!z.string().uuid().safeParse(lecture).success)return Response.json({error:'بيانات غير صالحة'},{status:400});
  const owned=(await identityDb(user.user_id).query(`select l.status,l.error_message from lectures l join conversations c on c.id=$2 and c.user_id=$1 where l.id=$3 and l.user_id=$1`,[user.user_id,cid,lecture])).rows[0];
  if(!owned)return Response.json({error:'الملف غير موجود'},{status:404});
  if(owned.status==='ready')return Response.json({status:'ready',attachmentId:await attachProcessedLecture(user.user_id,cid!,lecture!)});
  return Response.json({status:owned.status,error:owned.status==='failed'?'تعذر تجهيز الملف؛ أعد المحاولة من صفحة المادة':null},{headers:{'Cache-Control':'no-store'}});
}
