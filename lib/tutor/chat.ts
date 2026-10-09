import 'server-only';
import { NextResponse, after } from 'next/server';
import type { DatabaseClient } from '@/lib/db/server';
import { sendMessageSchema } from '@/lib/validations/chat';
import { checkRateLimit, logUsage } from '@/lib/usage';
import { accessErrorMessage, reserveUsage, refundUsage, commitUsage } from '@/lib/subscriptions/service';
import type { UsageReservation } from '@/lib/subscriptions/types';
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
import { chatErrorMessage, classifyGenerationError, type ChatErrorCode } from '@/lib/chat/errors';
import { fileSnapshot } from '@/lib/chat/file-status';
import {
  cancelRunningGeneration, claimGeneration, failGeneration, failStaleGeneration, findGeneration, loadAssistantMessage, markStreaming, registerGeneration,
  restartGeneration, saveAssistantMessage, setUserMessage, touchGeneration, unregisterGeneration, type GenerationRow,
} from './generations';
import { pickStudyDocument, resolvePageRange, resolveStudyTurn, type DocumentCandidate, type StudyTurn } from './study-flow';
import { saveStudyState, stateFromSummary } from './study-data';

/** Upper bound for one answer (long chapter parts need minutes). Overridable for operations and tests. */
const generationTimeoutMs = () => Number(process.env.CHAT_GENERATION_TIMEOUT_MS) || 240_000;
const KEEPALIVE_MS = 10_000;
const FOLLOW_MS = 120_000;
const encoder = new TextEncoder();
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** What a stream consumer can be told. Every method is a no-op once the client has left. */
type Out = {
  readonly attached: boolean;
  event(name: string, data: Record<string, unknown>): void;
  delta(text: string): void;
  keepalive(): void;
};
type Streamed = { sse: boolean; headers: Record<string, string>; work: (out: Out) => Promise<void> };

/**
 * Wraps work in a response stream. The work is NOT tied to the connection: if the phone drops, the stream is
 * cancelled but the work keeps running to completion, so the answer is still generated and saved on the server.
 */
function eventStream({ sse, headers, work }: Streamed): Response {
  let attached = true;
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let timer: ReturnType<typeof setInterval> | undefined;
  const write = (text: string) => {
    if (!attached) return;
    try { controller.enqueue(encoder.encode(text)); } catch { attached = false; }
  };
  const out: Out = {
    get attached() { return attached; },
    event: (name, data) => { if (sse) write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`); },
    delta: (text) => { if (!text) return; if (sse) write(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`); else write(text); },
    // A comment line keeps proxies and mobile networks from closing a connection that is silent while the model thinks.
    keepalive: () => { if (sse) write(': keepalive\n\n'); },
  };
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      timer = setInterval(out.keepalive, KEEPALIVE_MS);
      void work(out).catch(() => undefined).finally(() => {
        if (timer) clearInterval(timer);
        if (attached) { attached = false; try { c.close(); } catch { /* already closed */ } }
      });
    },
    cancel() {
      attached = false;
      if (timer) clearInterval(timer);
      logEvent('STREAM_CLIENT_LEFT', { requestId: headers['X-Request-Id'] ?? null, conversationId: headers['X-Conversation-Id'] ?? null });
    },
  });
  return new Response(stream, { headers: { 'Content-Type': sse ? 'text/event-stream; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no', ...headers } });
}

const failureMessage = (code: ChatErrorCode) => chatErrorMessage(code);
type Chat = { uid: string; cid: string; subjectId: string | null; sse: boolean };

async function replay(chat: Chat, generation: GenerationRow): Promise<Response> {
  const message = await loadAssistantMessage(chat.uid, generation);
  if (!message) return NextResponse.json({ error: failureMessage('INTERNAL'), code: 'INTERNAL' }, { status: 503 });
  logEvent('GENERATION_REPLAYED', { generationId: generation.id, requestId: generation.request_id, conversationId: chat.cid });
  return eventStream({ sse: chat.sse, headers: responseHeaders(chat, generation.request_id), work: async (out) => {
    out.event('started', startedPayload(chat, generation));
    out.delta(message.content);
    out.event('persisted', { messageId: message.id, userMessageId: generation.user_message_id, conversationId: chat.cid, generationId: generation.id, replayed: true });
  } });
}

/** A repeated request while the first is still running: wait for that generation instead of starting another. */
function follow(chat: Chat, generation: GenerationRow): Response {
  return eventStream({ sse: chat.sse, headers: responseHeaders(chat, generation.request_id), work: async (out) => {
    out.event('started', startedPayload(chat, generation));
    const deadline = Date.now() + FOLLOW_MS;
    while (out.attached && Date.now() < deadline) {
      await sleep(1000);
      const row = await failStaleGeneration(chat.uid, (await findGeneration(chat.uid, generation.request_id)) ?? generation);
      if (row.status === 'completed') {
        const message = await loadAssistantMessage(chat.uid, row);
        if (message) {
          out.delta(message.content);
          out.event('persisted', { messageId: message.id, userMessageId: row.user_message_id, conversationId: chat.cid, generationId: row.id, replayed: true });
          return;
        }
      }
      if (row.status === 'failed' || row.status === 'cancelled') {
        const code = (row.error_code as ChatErrorCode | null) ?? 'INTERNAL';
        out.event('error', { code, error: failureMessage(code), retryable: true });
        return;
      }
      out.keepalive();
    }
    if (out.attached) out.event('error', { code: 'GENERATION_IN_PROGRESS', error: failureMessage('GENERATION_IN_PROGRESS'), retryable: false });
  } });
}

const startedPayload = (chat: Chat, generation: GenerationRow) => ({ generationId: generation.id, requestId: generation.request_id,
  conversationId: chat.cid, userMessageId: generation.user_message_id });
const responseHeaders = (chat: Chat, requestId: string) => ({ 'X-Conversation-Id': chat.cid, 'X-Subject-Id': chat.subjectId ?? '', 'X-Request-Id': requestId });

const headerRequestId = (request: Request) => {
  const raw = request.headers.get('Idempotency-Key')?.trim();
  return raw && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw) ? raw : undefined;
};

export function cancelGeneration(generationId: string) { return cancelRunningGeneration(generationId); }

export async function handleTutorChat(request:Request,db:DatabaseClient,schedule:(run:()=>Promise<void>)=>void=after):Promise<Response> {
  const user=db.actor;
  if(!user||user.status!=='active') return NextResponse.json({error:'يجب تسجيل الدخول'},{status:401});
  const parsed=sendMessageSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:parsed.error.issues[0]?.message??'بيانات غير صالحة'},{status:400});
  const {imagePath,lectureId,subjectId,attachmentId,chapterIndex:pickedChapter}=parsed.data;
  let content=parsed.data.content;
  const requestId=parsed.data.requestId??headerRequestId(request);
  const uid=user.user_id,scoped=identityDb(uid),pool=scoped;
  const sse=Boolean(request.headers.get('Accept')?.includes('text/event-stream'));

  // A request id the server already knows is never generated twice: completed -> replay, running -> follow, failed -> retry.
  let retry:GenerationRow|null=null;
  let conversationId=parsed.data.conversationId;
  if(requestId) {
    let known=await findGeneration(uid,requestId);
    if(known) {
      known=await failStaleGeneration(uid,known);
      const subject=(await pool.query<{subject_id:string|null}>('select subject_id from conversations where id=$1 and user_id=$2',[known.conversation_id,uid])).rows[0]?.subject_id??null;
      const chat={uid,cid:known.conversation_id,subjectId:subject,sse};
      if(known.status==='completed') return replay(chat,known);
      if(known.status==='pending'||known.status==='streaming') return follow(chat,known);
      retry=known; conversationId=known.conversation_id;
    }
  }
  let activeSubject=subjectId??null,activeLecture=lectureId??null;
  if(subjectId&&!await canStudentAccessSubject(uid,subjectId)) return NextResponse.json({error:'هذه المادة غير متاحة لك'},{status:403});
  if(conversationId) {
    const current=(await pool.query<{subject_id:string|null;lecture_id:string|null}>('select subject_id,lecture_id from conversations where id=$1 and user_id=$2',[conversationId,uid])).rows[0];
    if(!current) return NextResponse.json({error:'المحادثة غير موجودة'},{status:404});
    activeSubject=subjectId??current.subject_id;activeLecture=lectureId??current.lecture_id;
  }
  if(activeLecture) {
    const owned=(await pool.query<{subject_id:string;status:string;document_status:string|null;document_error:string|null}>(`select l.subject_id,l.status,d.status document_status,d.error_message document_error
      from lectures l left join knowledge_documents d on d.lecture_id=l.id where l.id=$1 and l.user_id=$2`,[activeLecture,uid])).rows[0];
    if(!owned) return NextResponse.json({error:'الملف غير موجود'},{status:404});
    const snapshot=fileSnapshot({lectureStatus:owned.status,documentStatus:owned.document_status,errorMessage:owned.document_error});
    // Nothing is answered from a file until it is fully prepared.
    if(snapshot.phase!=='ready') return NextResponse.json({error:snapshot.message,code:snapshot.code,phase:snapshot.phase,retryable:snapshot.retryable,lectureId:activeLecture},{status:409});
    activeSubject=owned.subject_id;
  }
  if(activeSubject&&!await canStudentAccessSubject(uid,activeSubject)) return NextResponse.json({error:'هذه المادة غير متاحة لك'},{status:403});
  if(!retry) {
    const rate=await checkRateLimit(uid);
    if(!rate.allowed) return NextResponse.json({error:'الرجاء الانتظار قليلًا'},{status:429,headers:{'Retry-After':String(rate.retryAfterSeconds)}});
  }
  let image:string|null=null;
  if(imagePath) {try {image=await getChatImageDataUri(db,imagePath);}catch{return NextResponse.json({error:'تعذر تحميل الصورة'},{status:404});}}
  // Validate requested attachment BEFORE creating a conversation or storing a message.
  if(attachmentId) {
    const owned=(await scoped.query<{subject_id:string|null;conversation_id:string;status:string}>('select subject_id,conversation_id,status from conversation_attachments where id=$1 and user_id=$2',[attachmentId,uid])).rows[0];
    if(!owned||owned.conversation_id!==conversationId) return NextResponse.json({error:'المرفق غير موجود في هذه المحادثة'},{status:404});
    if(owned.status!=='ready') return NextResponse.json({error:chatErrorMessage('FILE_PROCESSING'),code:'FILE_PROCESSING'},{status:409});
  }
  // The idempotency key makes a re-sent question reuse the first reservation instead of consuming another unit.
  let usageReservation:UsageReservation;
  try { usageReservation=await reserveUsage(uid,'ai_questions_daily',{idempotencyKey:requestId?`chat:${requestId}`:null}); }
  catch(error) { return NextResponse.json(accessErrorMessage(error,'أسئلة الذكاء الاصطناعي'),{status:403}); }
  if(!conversationId) {
    const created=await db.from('conversations').insert({user_id:uid,title:content.replace(/\s+/g,' ').slice(0,60),subject_id:activeSubject,lecture_id:activeLecture}).select('id').single();
    if(created.error||!created.data) {await refundUsage(usageReservation);return NextResponse.json({error:'تعذر إنشاء المحادثة'},{status:503});}
    conversationId=created.data.id;
  }
  const cid=conversationId;
  let generation:GenerationRow;
  if(retry) {
    const restarted=await restartGeneration(uid,retry.id);
    if(!restarted) {await refundUsage(usageReservation).catch(()=>undefined);return follow({uid,cid,subjectId:activeSubject,sse},retry);}
    generation=restarted;
  } else {
    const claimed=await claimGeneration(uid,cid,requestId??crypto.randomUUID());
    if(!claimed) {
      // A parallel request with the same id won the race; this one only observes its result.
      await refundUsage(usageReservation).catch(()=>undefined);
      const winner=await findGeneration(uid,requestId!);
      if(!winner) return NextResponse.json({error:failureMessage('INTERNAL'),code:'INTERNAL'},{status:503});
      const chat={uid,cid:winner.conversation_id,subjectId:activeSubject,sse};
      return winner.status==='completed'?replay(chat,winner):follow(chat,winner);
    }
    generation=claimed;
  }
  // Anything that throws before the stream starts must not leave a reserved question or a pending generation behind.
  try {
  logEvent('QUERY_RECEIVED',{userId:uid,conversationId:cid,generationId:generation.id,attempt:generation.attempts});
  const context=await loadTutorContext(uid,cid,content);
  const matched=matchAssignedSubject(content,context.subjects);
  const subjectChanged=Boolean(matched&&matched!==activeSubject&&matched!==context.summary?.current_subject_id);
  activeSubject=matched??activeSubject??context.summary?.current_subject_id??null;
  if(subjectChanged){activeLecture=null;await pool.query('update conversations set lecture_id=null,active_attachment_id=null,active_attachment_section_index=null where id=$1 and user_id=$2',[cid,uid]);}
  if(activeSubject&&!await canStudentAccessSubject(uid,activeSubject)) {
    await refundUsage(usageReservation).catch(()=>undefined);
    await failGeneration(uid,generation.id,'INTERNAL');
    return NextResponse.json({error:'المادة السابقة لم تعد متاحة لك'},{status:403});
  }
  await pool.query('update conversations set subject_id=$3,updated_at=now() where id=$1 and user_id=$2',[cid,uid,activeSubject]);
  // The question is saved once per request id: a retry reuses the stored message and its exact text.
  let userMessageId=generation.user_message_id;
  if(userMessageId) content=(await pool.query<{content:string}>('select content from messages where id=$1',[userMessageId])).rows[0]?.content??content;
  const history=(await pool.query<{role:'user'|'assistant';content:string}>(`select m.role,m.content from messages m join conversations c on c.id=m.conversation_id
    where c.id=$1 and c.user_id=$2 and m.role in ('user','assistant') and m.id is distinct from $3::uuid order by m.created_at desc limit 14`,
    [context.resumes&&context.summary?context.summary.conversation_id:cid,uid,userMessageId])).rows.reverse();
  if(!userMessageId) {
    const saved=await db.from('messages').insert({conversation_id:cid,role:'user',content,image_url:imagePath??null}).select('id').single();
    if(saved.error||!saved.data) {await refundUsage(usageReservation);await failGeneration(uid,generation.id,'INTERNAL');return NextResponse.json({error:'تعذر حفظ السؤال'},{status:503});}
    userMessageId=saved.data.id;await setUserMessage(uid,generation.id,userMessageId);
  }
  const memory={ready:Promise.resolve()};
  schedule(async()=>{await memory.ready;await summarizeConversation(uid,cid).catch(()=>logEvent('MEMORY_UPDATE_FAILED',{userId:uid,conversationId:cid}));});
  const chat:Chat={uid,cid,subjectId:activeSubject,sse};
  const turn:Turn={uid,cid,db,scoped,generation:{...generation,user_message_id:userMessageId},userMessageId,content,imagePath:imagePath??null,image,
    activeSubject,activeLecture,attachmentId:attachmentId??null,explicitLecture:lectureId??null,pickedChapter:pickedChapter??null,subjectChanged,context,history:history as ChatMessageInput[],usageReservation,memory,sse};
  return eventStream({sse,headers:responseHeaders(chat,generation.request_id),work:async out=>{
    out.event('started',startedPayload(chat,turn.generation));
    await runGeneration(turn,out);
  }});
  } catch(error) {
    await refundUsage(usageReservation).catch(()=>undefined);
    await failGeneration(uid,generation.id,'INTERNAL').catch(()=>undefined);
    throw error;
  }
}

type Turn={uid:string;cid:string;db:DatabaseClient;scoped:ReturnType<typeof identityDb>;generation:GenerationRow;userMessageId:string;content:string;
  imagePath:string|null;image:string|null;activeSubject:string|null;activeLecture:string|null;attachmentId:string|null;explicitLecture:string|null;pickedChapter:number|null;subjectChanged:boolean;
  context:Awaited<ReturnType<typeof loadTutorContext>>;history:ChatMessageInput[];usageReservation:UsageReservation;memory:{ready:Promise<void>};sse:boolean};

const clip=(text:string,max:number)=>text.length>max?`${text.slice(0,max)}…`:text;

async function runGeneration(turn:Turn,out:Out):Promise<void> {
  const {uid,cid,scoped,context,generation,userMessageId,content}=turn;
  const start=Date.now();
  let answerStarted=false,providerStarted=false,answerSaved=false,activeLecture=turn.activeLecture;
  const activeSubject=turn.activeSubject;
  const abort=new AbortController();
  registerGeneration(generation.id,abort);
  const timeout=AbortSignal.timeout(generationTimeoutMs());
  const signal=AbortSignal.any([abort.signal,timeout]);
  const heartbeat=setInterval(()=>void touchGeneration(uid,generation.id).catch(()=>undefined),30_000);
  const emit=(delta:string)=>{if(!delta)return;answerStarted=true;out.delta(delta);};
  logEvent('GENERATION_STARTED',{generationId:generation.id,conversationId:cid,attempt:generation.attempts});
  try {
    let visionCacheHit=false;
    if(turn.image&&turn.imagePath) {
      const ai=getAIProvider(),analysis=await analyzeConversationAttachment({conversationId:cid,messageId:userMessageId,userId:uid,filePath:turn.imagePath,
        imageDataUri:turn.image,subjectId:activeSubject,lectureId:activeLecture,provider:ai,signal});
      visionCacheHit=analysis.cacheHit;
      if(!analysis.cacheHit) await logUsage({userId:uid,type:'vision',feature:'image_understanding',provider:'openai',model:analysis.attachment.model!,
        inputTokens:analysis.attachment.input_tokens,cachedInputTokens:analysis.attachment.cached_input_tokens,
        outputTokens:analysis.attachment.output_tokens,reasoningEffort:'medium',estimatedCost:ai.calculateCost({model:analysis.attachment.model!,
          inputTokens:analysis.attachment.input_tokens,cachedInputTokens:analysis.attachment.cached_input_tokens,outputTokens:analysis.attachment.output_tokens})});
    }
    let sourceConversation=cid;
    if(context.resumes&&context.summary) sourceConversation=context.summary.conversation_id;
    const attachments=await loadConversationAttachments(sourceConversation,uid);
    if(turn.attachmentId) attachments.activeAttachmentId=turn.attachmentId;
    // A newly supplied image is the active source even for "Explain this" in English.
    const resolved=resolveConversationReference({question:content,attachments:attachments.attachments,
      activeAttachmentId:attachments.activeAttachmentId,activeSectionIndex:attachments.activeSectionIndex,
      history:turn.history,conversationSummary:context.summary?.summary});
    const active=resolved.selectedAttachments[0]??null;
    if(active) await persistResolvedAttachmentState({conversationId:cid,userId:uid,attachmentId:active.id,
      sectionIndex:resolved.selectedSectionIndex??resolved.selectedSectionRange?.end??null});
    const imageEvidence=attachmentEvidence(resolved);
    let documentId=turn.subjectChanged?null:context.summary?.current_document_id??null;
    const lectureDocument=activeLecture?(await scoped.query<{id:string;title:string}>('select id,title from knowledge_documents where lecture_id=$1 and owner_id=$2',[activeLecture,uid])).rows[0]:undefined;
    if(active?.lecture_id) activeLecture=active.lecture_id;
    if(activeLecture) documentId=lectureDocument?.id??(await scoped.query<{id:string}>('select id from knowledge_documents where lecture_id=$1 and owner_id=$2',[activeLecture,uid])).rows[0]?.id??null;
    if(documentId) {
      const accessible=(await scoped.query('select id from knowledge_documents where id=$1 and (owner_id=$2 or owner_id is null)',[documentId,uid])).rows.length;
      if(!accessible) documentId=null;
    }
    const activeLibrary=(await scoped.query<{id:string;title:string;resource_category:string}>(`select d.id,d.title,d.resource_category
      from conversation_sources cs join knowledge_documents d on d.id=cs.document_id
      where cs.conversation_id=$1 and cs.user_id=$2 and cs.is_active and d.owner_id is null
      and d.status='ready' and d.is_active and d.publication_status<>'archived' order by cs.updated_at`,[cid,uid])).rows;
    const activeDocumentIds=activeLibrary.map(source=>source.id);

    // ---- which book are we studying, and is the student asking for a chapter? (decided before any retrieval) ----
    const candidates:DocumentCandidate[]=[];
    const addCandidate=(id:string|null|undefined,title?:string)=>{if(id&&!candidates.some(c=>c.id===id))candidates.push({id,title:title??''});};
    const lectureDocId=activeLecture?documentId:null;
    const summaryDocId=turn.subjectChanged?null:context.summary?.current_document_id??null;
    const activeIds=new Set([lectureDocId,...activeLibrary.map(source=>source.id)]);
    // Priority: a file attached with this message, the book already being studied (if still attached), the chat's file, newest library source, last resort the remembered book.
    if(turn.explicitLecture||turn.attachmentId) addCandidate(lectureDocId,lectureDocument?.title);
    if(summaryDocId&&activeIds.has(summaryDocId)) addCandidate(summaryDocId);
    addCandidate(lectureDocId,lectureDocument?.title);
    for(const source of [...activeLibrary].reverse()) addCandidate(source.id,source.title);
    addCandidate(summaryDocId);
    const titles=candidates.some(c=>!c.title)?(await scoped.query<{id:string;title:string}>('select id,title from knowledge_documents where id=any($1::uuid[])',[candidates.map(c=>c.id)])).rows:[];
    for(const candidate of candidates) candidate.title=candidate.title||titles.find(row=>row.id===candidate.id)?.title||'';
    const studyDocument=pickStudyDocument(content,candidates);
    const studyState=turn.subjectChanged?null:stateFromSummary(context.summary);
    let study:StudyTurn=await resolveStudyTurn({userId:uid,question:content,document:studyDocument,state:studyState,forcedChapterIndex:turn.pickedChapter});
    if(study.kind==='none'&&studyDocument&&active?.file_type==='file'&&resolved.selectedSectionRange) study=await resolvePageRange(uid,studyDocument.id,resolved.selectedSectionRange);
    if(studyDocument&&study.kind!=='none') documentId=studyDocument.id;

    if(study.kind==='reply') {
      // The server answers directly (chapter not found, uncertain structure, end of book): no model call, no quota used.
      await refundUsage(turn.usageReservation).catch(()=>undefined);
      emit(study.text);
      logEvent('GENERATION_COMPLETED',{generationId:generation.id,direct:true,code:study.code});
      await finish(turn,out,{content:study.text,answerOrigin:null,sourceIds:[]});
      answerSaved=true;
      return;
    }

    const explicitPage=content.match(/(?:page|صفحة|الصفحة)\s*(\d+)/i)?.[1];
    const page=explicitPage??(active?.file_type==='file'&&resolved.selectedSectionIndex ? String(resolved.selectedSectionIndex) : undefined);
    const searchQuestion=[content,resolved.searchQueries.slice(1).join(' '),resolved.referenceResolved||context.resumes?context.summary?.current_topic??'':''].filter(Boolean).join(' ').slice(0,1800);
    logEvent('CONTEXT_RESOLVED',{userId:uid,conversationId:cid,subjectId:activeSubject,attachmentId:active?.id??null,documentId,studyMode:study.kind==='none'?null:study.kind});
    let sources:KnowledgeChunk[],candidatesFound:unknown[],query:unknown=null;
    if(study.kind==='coverage') {
      // Chapter coverage: the chapter's own passages, in book order. No similarity search can pull in another chapter.
      sources=study.sources;candidatesFound=[];
    } else {
      const retrieval=await retrieveKnowledge(study.kind==='focused'?`${study.topic} ${searchQuestion}`.slice(0,1800):searchQuestion,
        {userId:uid,subjectId:activeSubject,documentId,activeDocumentIds,pageNumber:page?Number(page):null,chapter:study.kind==='focused'?study.scope:null});
      sources=[...(study.kind==='focused'?[]:imageEvidence),...retrieval.sources].slice(0,10);candidatesFound=retrieval.candidates;query=retrieval.query;
    }
    logEvent('RETRIEVAL_COMPLETED',{userId:uid,conversationId:cid,candidates:candidatesFound.length,selected:sources.length,documentId,
      chapter:study.kind==='coverage'||study.kind==='focused'?study.chapter?.index??null:null,
      chunkIds:sources.flatMap(s=>s.chunkIds??(s.id?[s.id]:[])).slice(0,40).join(','),sourceCount:sources.length});
    const pending=turn.subjectChanged?null:context.summary?.pending_quiz_json??null;
    await commitUsage(turn.usageReservation);
    providerStarted=true;
    await markStreaming(uid,generation.id);
    const studied=study.kind==='coverage'||study.kind==='focused'?study:null;
    const header=studied?.header??'',footer=study.kind==='coverage'?study.footer:'';
    emit(header);
    const result=await streamTutorAnswer({question:study.kind==='coverage'?content:resolved.resolvedQuestion,originalQuestion:content,
      // Long chapter answers would otherwise flood the context window on every following turn.
      history:studied?turn.history.slice(-4).map(m=>({...m,content:clip(m.content,1200)})):turn.history,
      context:`${context.text}\nCURRENT SUBJECT: ${context.subjects.find(s=>s.id===activeSubject)?.name_en??''} (semester ${context.subjects.find(s=>s.id===activeSubject)?.semester??'unspecified'})\nACTIVE LIBRARY SOURCES: ${activeLibrary.map(source=>`${source.title} [${source.resource_category}]`).join(' | ')}\nACTIVE PAGE: ${page??''}\nREQUESTED SOURCE RANGE: ${resolved.selectedSectionRange?`${resolved.selectedSectionRange.start}-${resolved.selectedSectionRange.end}`:''}\nREQUESTED END BOUNDARY: ${resolved.requestedBoundary??''}`,
      sources,pendingQuiz:pending,signal,onDelta:emit,studyContext:studied?.promptContext});
    emit(result.references);emit(footer);
    const sourceIds=result.answer.source_ids.map(id=>sources[Number(id.slice(1))-1].id??id);
    const ai=getAIProvider(),cost=ai.calculateCost(result.usage),latency=Date.now()-start;
    const full=header+result.answer.answer+result.references+footer;
    const savedMessageId=await finish(turn,out,{content:full,answerOrigin:result.answer.answer_origin,sourceIds,tokensInput:result.usage.inputTokens,tokensOutput:result.usage.outputTokens,model:result.usage.model});
    answerSaved=true;
    // From here on the answer is safely stored and shown; the rest is bookkeeping.
    if(studied?.state) {
      const saved=studied.state;
      await saveStudyState(uid,cid,saved).catch(()=>logEvent('MEMORY_UPDATE_FAILED',{userId:uid,conversationId:cid}));
      logEvent('STUDY_CONTEXT_SAVED',{conversationId:cid,documentId:saved.documentId,chapterIndex:saved.chapterIndex,part:saved.part,position:saved.position});
    }
    await logUsage({userId:uid,type:'chat',feature:'chat',provider:'openai',model:result.usage.model,inputTokens:result.usage.inputTokens,
      cachedInputTokens:result.usage.cachedInputTokens,outputTokens:result.usage.outputTokens,reasoningEffort:result.reasoningEffort,estimatedCost:cost,latencyMs:latency});
    await saveAITrace({messageId:savedMessageId,conversationId:cid,userId:uid,resolvedQuery:resolved.resolvedQuestion,
      activeAttachmentId:active?.id,attachmentIds:resolved.selectedAttachments.map(a=>a.id),retrievedSources:candidatesFound,
      rerankedSources:study.kind==='coverage'?sources.map(s=>({...s,content:clip(s.content,300)})):sources,evidenceCoverage:result.answer.answer_origin==='mixed'?'PARTIALLY_SUPPORTED':sourceIds.length?'SUPPORTED':'UNSUPPORTED',selectedProvider:'openai',selectedModel:result.usage.model,
      fallbackUsed:false,finalSourceIds:sourceIds,refusalReason:result.answer.clarification_needed?'CLARIFICATION':null,
      diagnostics:{architecture:'personal_tutor_v2',answer_origin:result.answer.answer_origin,subjectId:activeSubject,documentId,activeDocumentIds,
        user_query:content,resolved_context:resolved.resolvedQuestion,reasoning_effort:result.reasoningEffort,input_tokens:result.usage.inputTokens,cached_input_tokens:result.usage.cachedInputTokens??0,
        output_tokens:result.usage.outputTokens,estimated_cost:cost,latency_ms:latency,visionCacheHit,clarification:result.answer.clarification_needed,
        sourceCount:sourceIds.length,sectionRange:resolved.selectedSectionRange,requestedBoundary:resolved.requestedBoundary,query,
        generationId:generation.id,study:study.kind==='coverage'?study.trace:study.kind==='focused'?{mode:'focused',documentId:study.document.id,chapterIndex:study.chapter.index}:null}});
    if(result.answer.answer_origin==='general_nursing_knowledge'&&!result.answer.out_of_scope) logEvent('GENERAL_FALLBACK_USED',{userId:uid,subjectId:activeSubject});
    logEvent('ANSWER_GENERATED',{userId:uid,conversationId:cid,latencyMs:latency});
    turn.memory.ready=recordTutorTurn({userId:uid,conversationId:cid,messageId:savedMessageId,subjectId:activeSubject,documentId,attachmentId:active?.id??null,
      question:content,answer:result.answer,pendingQuiz:pending});
    await turn.memory.ready;
    logEvent('MEMORY_UPDATED',{userId:uid,conversationId:cid});
    logEvent('GENERATION_COMPLETED',{generationId:generation.id,conversationId:cid,latencyMs:latency,sourceCount:sourceIds.length});
  } catch(error) {
    if(answerSaved) {
      // The student already has the answer; a bookkeeping failure must not turn it into an error.
      console.error('Tutor bookkeeping failed',{conversationId:cid,generationId:generation.id,error:error instanceof Error?error.name:'Unknown'});
      return;
    }
    const cancelled=abort.signal.aborted;
    const code:ChatErrorCode=cancelled?'STREAM_INTERRUPTED':timeout.aborted?'AI_TIMEOUT':classifyGenerationError(error);
    if(!providerStarted) await refundUsage(turn.usageReservation).catch(()=>undefined);
    console.error('Tutor request failed',{conversationId:cid,generationId:generation.id,code,error:error instanceof Error?error.name:'Unknown'});
    await failGeneration(uid,generation.id,code,cancelled?'cancelled':'failed').catch(()=>undefined);
    logEvent(cancelled?'GENERATION_CANCELLED':'GENERATION_FAILED',{generationId:generation.id,conversationId:cid,errorType:code,providerStarted});
    // SSE clients get a typed error event; plain-text clients keep the old inline message.
    if(!cancelled) {
      if(turn.sse) out.event('error',{code,error:failureMessage(code),retryable:true,generationId:generation.id,requestId:generation.request_id});
      else emit(`${answerStarted?'\n\n':''}${failureMessage(code)}`);
    }
    await logUsage({userId:uid,type:'chat',feature:'chat',provider:'openai',model:'gpt-6-luna',inputTokens:0,outputTokens:0,estimatedCost:0,
      success:false,errorCode:cancelled?'ABORTED':'TUTOR_REQUEST_FAILED',latencyMs:Date.now()-start}).catch(()=>undefined);
  } finally {
    clearInterval(heartbeat);
    unregisterGeneration(generation.id);
    logEvent('STREAM_ENDED',{generationId:generation.id,conversationId:cid,clientAttached:out.attached,saved:answerSaved,durationMs:Date.now()-start});
  }
}

/** Saves the answer on the server first, then tells the client. The phone never decides whether the answer exists. */
async function finish(turn:Turn,out:Out,message:{content:string;answerOrigin:string|null;sourceIds:string[];tokensInput?:number;tokensOutput?:number;model?:string}):Promise<string> {
  const saved=await saveAssistantMessage(turn.uid,{conversationId:turn.cid,generationId:turn.generation.id,content:message.content,tokensInput:message.tokensInput,
    tokensOutput:message.tokensOutput,model:message.model,answerOrigin:message.answerOrigin,sourceIds:message.sourceIds});
  logEvent('MESSAGE_SAVED',{generationId:turn.generation.id,conversationId:turn.cid,messageId:saved.id,created:saved.created});
  out.event('persisted',{messageId:saved.id,userMessageId:turn.userMessageId,conversationId:turn.cid,generationId:turn.generation.id,requestId:turn.generation.request_id});
  return saved.id;
}
