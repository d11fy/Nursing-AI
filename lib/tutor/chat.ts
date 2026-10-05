import 'server-only';
import { NextResponse, after } from 'next/server';
import type { DatabaseClient } from '@/lib/db/server';
import { sendMessageSchema } from '@/lib/validations/chat';
import { checkDailyLimit, checkRateLimit, logUsage } from '@/lib/usage';
import { canStudentAccessSubject } from '@/lib/subjects';
import { getChatImageDataUri } from '@/lib/storage';
import { getAIProvider } from '@/lib/ai';
import type { ChatMessageInput, KnowledgeChunk } from '@/lib/ai/provider';
import { analyzeConversationAttachment,attachmentEvidence,loadConversationAttachments,resolveConversationReference,persistResolvedAttachmentState,saveAITrace } from '@/lib/ai/conversation-context';
import { loadTutorContext,matchAssignedSubject,recordTutorTurn,summarizeConversation } from './memory';
import { retrieveKnowledge } from './retrieval';
import { streamTutorAnswer } from './answer';
import { identityDb } from './db';
import { logEvent } from '@/lib/log';

export async function handleTutorChat(request:Request,db:DatabaseClient,schedule:(run:()=>Promise<void>)=>void=after):Promise<Response> {
  const user=db.actor;
  if(!user||user.status!=='active') return NextResponse.json({error:'يجب تسجيل الدخول'},{status:401});
  const parsed=sendMessageSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:parsed.error.issues[0]?.message??'بيانات غير صالحة'},{status:400});
  const {content,imagePath,lectureId,subjectId,attachmentId}=parsed.data;
  const uid=user.user_id,scoped=identityDb(uid),pool=scoped;
  if(subjectId&&!await canStudentAccessSubject(uid,subjectId)) return NextResponse.json({error:'هذه المادة غير متاحة لك'},{status:403});
  let conversationId=parsed.data.conversationId,activeSubject=subjectId??null,activeLecture=lectureId??null;
  if(conversationId) {
    const current=(await pool.query<{subject_id:string|null;lecture_id:string|null}>('select subject_id,lecture_id from conversations where id=$1 and user_id=$2',[conversationId,uid])).rows[0];
    if(!current) return NextResponse.json({error:'المحادثة غير موجودة'},{status:404});
    activeSubject=subjectId??current.subject_id;activeLecture=lectureId??current.lecture_id;
  }
  if(activeLecture) {
    const owned=(await pool.query<{subject_id:string;status:string}>('select subject_id,status from lectures where id=$1 and user_id=$2',[activeLecture,uid])).rows[0];
    if(!owned) return NextResponse.json({error:'الملف غير موجود'},{status:404});
    if(owned.status!=='ready'&&owned.status!=='expired') return NextResponse.json({error:'الملف لم يجهز للدراسة بعد'},{status:409});
    activeSubject=owned.subject_id;
  }
  if(activeSubject&&!await canStudentAccessSubject(uid,activeSubject)) return NextResponse.json({error:'هذه المادة غير متاحة لك'},{status:403});
  const rate=await checkRateLimit(uid);
  if(!rate.allowed) return NextResponse.json({error:'الرجاء الانتظار قليلًا'},{status:429,headers:{'Retry-After':String(rate.retryAfterSeconds)}});
  if(!(await checkDailyLimit(db,uid)).allowed) return NextResponse.json({error:'وصلت للحد اليومي؛ يمكنك العودة غدًا'},{status:403});
  let image:string|null=null;
  if(imagePath) {try {image=await getChatImageDataUri(db,imagePath);}catch{return NextResponse.json({error:'تعذر تحميل الصورة'},{status:404});}}
  // Validate requested attachment BEFORE creating a conversation or storing a message.
  if(attachmentId) {
    const owned=(await scoped.query<{subject_id:string|null;conversation_id:string;status:string}>('select subject_id,conversation_id,status from conversation_attachments where id=$1 and user_id=$2',[attachmentId,uid])).rows[0];
    if(!owned||owned.conversation_id!==conversationId) return NextResponse.json({error:'المرفق غير موجود في هذه المحادثة'},{status:404});
    if(owned.status!=='ready') return NextResponse.json({error:'المرفق لم يجهز بعد'},{status:409});
  }
  if(!conversationId) {
    const created=await db.from('conversations').insert({user_id:uid,title:content.replace(/\s+/g,' ').slice(0,60),subject_id:activeSubject,lecture_id:activeLecture}).select('id').single();
    if(created.error||!created.data) return NextResponse.json({error:'تعذر إنشاء المحادثة'},{status:503});
    conversationId=created.data.id;
  }
  const cid=conversationId;
  logEvent('QUERY_RECEIVED',{userId:uid,conversationId:cid});
  const context=await loadTutorContext(uid,cid,content);
  const matched=matchAssignedSubject(content,context.subjects);
  const subjectChanged=Boolean(matched&&matched!==activeSubject&&matched!==context.summary?.current_subject_id);
  activeSubject=matched??activeSubject??context.summary?.current_subject_id??null;
  if(subjectChanged){activeLecture=null;await pool.query('update conversations set lecture_id=null,active_attachment_id=null,active_attachment_section_index=null where id=$1 and user_id=$2',[cid,uid]);}
  if(activeSubject&&!await canStudentAccessSubject(uid,activeSubject)) return NextResponse.json({error:'المادة السابقة لم تعد متاحة لك'},{status:403});
  await pool.query('update conversations set subject_id=$3,updated_at=now() where id=$1 and user_id=$2',[cid,uid,activeSubject]);
  const history=(await pool.query<{role:'user'|'assistant';content:string}>(`select m.role,m.content from messages m join conversations c on c.id=m.conversation_id
    where c.id=$1 and c.user_id=$2 and m.role in ('user','assistant') order by m.created_at desc limit 14`,[context.resumes&&context.summary?context.summary.conversation_id:cid,uid])).rows.reverse();
  const saved=await db.from('messages').insert({conversation_id:cid,role:'user',content,image_url:imagePath??null}).select('id').single();
  if(saved.error||!saved.data) return NextResponse.json({error:'تعذر حفظ السؤال'},{status:503});
  const userMessageId=saved.data.id,encoder=new TextEncoder(),start=Date.now(),sse=request.headers.get('Accept')?.includes('text/event-stream');
  const abort=new AbortController(),signal=AbortSignal.any([request.signal,abort.signal,AbortSignal.timeout(180_000)]);
  let memoryReady=Promise.resolve();
  schedule(async()=>{await memoryReady;await summarizeConversation(uid,cid).catch(()=>logEvent('MEMORY_UPDATE_FAILED',{userId:uid,conversationId:cid}));});
  const stream=new ReadableStream<Uint8Array>({
    async start(controller) {
      let answerSaved=false,answerStarted=false;
      const emit=(delta:string)=>{if(!signal.aborted){controller.enqueue(encoder.encode(sse?`event: delta\ndata: ${JSON.stringify({text:delta})}\n\n`:delta));answerStarted=true;}};
      try {
        let visionCacheHit=false;
        if(image&&imagePath) {
          const ai=getAIProvider(),analysis=await analyzeConversationAttachment({conversationId:cid,messageId:userMessageId,userId:uid,filePath:imagePath,
            imageDataUri:image,subjectId:activeSubject,lectureId:activeLecture,provider:ai,signal});
          visionCacheHit=analysis.cacheHit;
          if(!analysis.cacheHit) await logUsage({userId:uid,type:'vision',feature:'image_understanding',provider:'openai',model:analysis.attachment.model!,
            inputTokens:analysis.attachment.input_tokens,cachedInputTokens:analysis.attachment.cached_input_tokens,
            outputTokens:analysis.attachment.output_tokens,reasoningEffort:'medium',estimatedCost:ai.calculateCost({model:analysis.attachment.model!,
              inputTokens:analysis.attachment.input_tokens,cachedInputTokens:analysis.attachment.cached_input_tokens,outputTokens:analysis.attachment.output_tokens})});
        }
        let sourceConversation=cid;
        if(context.resumes&&context.summary) sourceConversation=context.summary.conversation_id;
        const attachments=await loadConversationAttachments(sourceConversation,uid);
        if(attachmentId) attachments.activeAttachmentId=attachmentId;
        // A newly supplied image is the active source even for "Explain this" in English.
        const resolved=resolveConversationReference({question:content,attachments:attachments.attachments,
          activeAttachmentId:attachments.activeAttachmentId,activeSectionIndex:attachments.activeSectionIndex,
          history:history as ChatMessageInput[],conversationSummary:context.summary?.summary});
        const active=resolved.selectedAttachments[0]??null;
        if(active) await persistResolvedAttachmentState({conversationId:cid,userId:uid,attachmentId:active.id,
          sectionIndex:resolved.selectedSectionIndex??resolved.selectedSectionRange?.end??null});
        const imageEvidence=attachmentEvidence(resolved);
        let documentId=subjectChanged?null:context.summary?.current_document_id??null;
        if(active?.lecture_id) activeLecture=active.lecture_id;
        if(activeLecture) documentId=(await scoped.query<{id:string}>('select id from knowledge_documents where lecture_id=$1 and owner_id=$2',[activeLecture,uid])).rows[0]?.id??null;
        if(documentId) {
          const accessible=(await scoped.query('select id from knowledge_documents where id=$1 and (owner_id=$2 or owner_id is null)',[documentId,uid])).rows.length;
          if(!accessible) documentId=null;
        }
        const activeLibrary=(await scoped.query<{id:string;title:string;resource_category:string}>(`select d.id,d.title,d.resource_category
          from conversation_sources cs join knowledge_documents d on d.id=cs.document_id
          where cs.conversation_id=$1 and cs.user_id=$2 and cs.is_active and d.owner_id is null
          and d.status='ready' and d.is_active and d.publication_status<>'archived' order by cs.updated_at`,[cid,uid])).rows;
        const activeDocumentIds=activeLibrary.map(source=>source.id);
        const explicitPage=content.match(/(?:page|صفحة|الصفحة)\s*(\d+)/i)?.[1];
        const page=explicitPage??(active?.file_type==='file'&&resolved.selectedSectionIndex ? String(resolved.selectedSectionIndex) : undefined);
        const searchQuestion=[content,resolved.searchQueries.slice(1).join(' '),resolved.referenceResolved||context.resumes?context.summary?.current_topic??'':''].filter(Boolean).join(' ').slice(0,1800);
        logEvent('CONTEXT_RESOLVED',{userId:uid,conversationId:cid,subjectId:activeSubject,attachmentId:active?.id??null});
        const retrieval=await retrieveKnowledge(searchQuestion,{userId:uid,subjectId:activeSubject,documentId,activeDocumentIds,pageNumber:page?Number(page):null});
        const sources:KnowledgeChunk[]=[...imageEvidence,...retrieval.sources].slice(0,10);
        logEvent('RETRIEVAL_COMPLETED',{userId:uid,candidates:retrieval.candidates.length,selected:sources.length});
        const pending=subjectChanged?null:context.summary?.pending_quiz_json??null;
        const result=await streamTutorAnswer({question:resolved.resolvedQuestion,originalQuestion:content,history:history as ChatMessageInput[],
          context:`${context.text}\nCURRENT SUBJECT: ${context.subjects.find(s=>s.id===activeSubject)?.name_en??''} (semester ${context.subjects.find(s=>s.id===activeSubject)?.semester??'unspecified'})\nACTIVE LIBRARY SOURCES: ${activeLibrary.map(source=>`${source.title} [${source.resource_category}]`).join(' | ')}\nACTIVE PAGE: ${page??''}\nREQUESTED SOURCE RANGE: ${resolved.selectedSectionRange?`${resolved.selectedSectionRange.start}-${resolved.selectedSectionRange.end}`:''}\nREQUESTED END BOUNDARY: ${resolved.requestedBoundary??''}`,sources,pendingQuiz:pending,signal,onDelta:emit});
        emit(result.references);
        const sourceIds=result.answer.source_ids.map(id=>sources[Number(id.slice(1))-1].id??id);
        const ai=getAIProvider(),cost=ai.calculateCost(result.usage),latency=Date.now()-start;
        const answer=await db.from('messages').insert({conversation_id:cid,role:'assistant',content:result.answer.answer+result.references,
          tokens_input:result.usage.inputTokens,tokens_output:result.usage.outputTokens,model:result.usage.model,
          answer_origin:result.answer.answer_origin,source_ids:sourceIds}).select('id').single();
        if(answer.error||!answer.data) throw new Error('Answer persistence failed');
        answerSaved=true;
        await logUsage({userId:uid,type:'chat',feature:'chat',provider:'openai',model:result.usage.model,inputTokens:result.usage.inputTokens,
          cachedInputTokens:result.usage.cachedInputTokens,outputTokens:result.usage.outputTokens,reasoningEffort:result.reasoningEffort,estimatedCost:cost,latencyMs:latency});
        await saveAITrace({messageId:answer.data.id,conversationId:cid,userId:uid,resolvedQuery:resolved.resolvedQuestion,
          activeAttachmentId:active?.id,attachmentIds:resolved.selectedAttachments.map(a=>a.id),retrievedSources:retrieval.candidates,
          rerankedSources:sources,evidenceCoverage:result.answer.answer_origin==='mixed'?'PARTIALLY_SUPPORTED':sourceIds.length?'SUPPORTED':'UNSUPPORTED',selectedProvider:'openai',selectedModel:result.usage.model,
          fallbackUsed:false,finalSourceIds:sourceIds,refusalReason:result.answer.clarification_needed?'CLARIFICATION':null,
          diagnostics:{architecture:'personal_tutor_v2',answer_origin:result.answer.answer_origin,subjectId:activeSubject,documentId,activeDocumentIds,
            user_query:content,resolved_context:resolved.resolvedQuestion,reasoning_effort:result.reasoningEffort,input_tokens:result.usage.inputTokens,cached_input_tokens:result.usage.cachedInputTokens??0,
            output_tokens:result.usage.outputTokens,estimated_cost:cost,latency_ms:latency,visionCacheHit,clarification:result.answer.clarification_needed,
             sourceCount:sourceIds.length,sectionRange:resolved.selectedSectionRange,requestedBoundary:resolved.requestedBoundary,query:retrieval.query}});
        if(result.answer.answer_origin==='general_nursing_knowledge'&&!result.answer.out_of_scope) logEvent('GENERAL_FALLBACK_USED',{userId:uid,subjectId:activeSubject});
        logEvent('ANSWER_GENERATED',{userId:uid,conversationId:cid,latencyMs:latency});
        memoryReady=recordTutorTurn({userId:uid,conversationId:cid,messageId:answer.data.id,subjectId:activeSubject,documentId,attachmentId:active?.id??null,
          question:content,answer:result.answer,pendingQuiz:pending});
        await memoryReady;
        logEvent('MEMORY_UPDATED',{userId:uid,conversationId:cid});
        if(sse&&!signal.aborted)controller.enqueue(encoder.encode(`event: persisted\ndata: ${JSON.stringify({messageId:answer.data.id,userMessageId,conversationId:cid})}\n\n`));
      } catch(error) {
        console.error('Tutor request failed',{conversationId:cid,error:error instanceof Error?error.name:'Unknown'});
        if(!signal.aborted&&!answerSaved) emit(`${answerStarted?'\n\n':''}صار خلل مؤقت أثناء تجهيز الإجابة. جرّب مرة ثانية بعد لحظات.`);
        await logUsage({userId:uid,type:'chat',feature:'chat',provider:'openai',model:'gpt-6-luna',inputTokens:0,outputTokens:0,estimatedCost:0,
          success:false,errorCode:signal.aborted?'ABORTED':'TUTOR_REQUEST_FAILED',latencyMs:Date.now()-start});
      } finally {if(!signal.aborted)controller.close();}
    },cancel(){abort.abort();}
  });
  return new Response(stream,{headers:{'Content-Type':sse?'text/event-stream; charset=utf-8':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Conversation-Id':cid,
    'X-Subject-Id':activeSubject??'','X-Accel-Buffering':'no'}});
}
