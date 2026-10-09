import { z } from 'zod';
import { getAIProvider } from '@/lib/ai';
import { buildTutorContext, getNursingTutorInstructions, requiresVerifiedClinicalEvidence } from '@/lib/ai/prompts/nursing-tutor';
import type { ChatMessageInput, KnowledgeChunk, GenerateResult } from '@/lib/ai/provider';
import { AnswerStreamDecoder } from './stream-json';
import { reasoningFor } from './reasoning';

const quizSchema=z.object({question:z.string(),options:z.array(z.string()).max(6),correct_option:z.string(),explanation:z.string(),topic:z.string()});
export const tutorAnswerSchema=z.object({
  answer:z.string().min(1),
  answer_origin:z.enum(['curriculum','student_file','mixed','general_nursing_knowledge']),
  source_ids:z.array(z.string()).max(10),
  clinical_support:z.array(z.object({source_id:z.string(),quote:z.string()})).max(10),
  topic:z.string().max(200),clarification_needed:z.boolean(),out_of_scope:z.boolean(),
  quiz:z.union([quizSchema,z.null()]),quiz_result:z.enum(['correct','incorrect','not_answered']),
  preference:z.union([z.object({key:z.enum(['language','explanation_style','study_goal']),value:z.string().max(500)}),z.null()]),
});
export type TutorAnswer=z.infer<typeof tutorAnswerSchema>;
export type PendingQuiz=z.infer<typeof quizSchema>;
export function gradeQuizOption(question:string,pending:PendingQuiz|null):boolean|null {
  if(!pending) return null;
  const option=question.trim().match(/^(?:my answer is |answer:?\s*|الجواب\s*|الإجابة\s*)?([A-Fa-f])(?:[).!\s]*)$/)?.[1]?.toUpperCase();
  if(!option || !pending.options[option.charCodeAt(0)-65]) return null;
  return option===pending.correct_option.toUpperCase();
}
const CONTRACT=`\nOUTPUT CONTRACT
Return JSON matching the schema with answer as the FIRST property. It contains only the student-facing Markdown.
Do not include source labels, page references or quotes in answer: the server renders verified metadata from source_ids.
source_ids must be a subset of the supplied S1..S10 IDs that actually support claims you used. Never cite unrelated passages.
Use answer_origin=general_nursing_knowledge and empty source_ids when relevant evidence is absent and a safe established concept is answered.
Use student_file for an active upload, curriculum for official evidence, mixed when combining evidence and safe general knowledge.
For clarification, set clarification_needed=true. For unrelated topics, set out_of_scope=true, source_ids=[] and no quiz.
Set quiz only when presenting a NEW interactive question. Store its answer key here, NEVER reveal it in answer.
For quiz_result, grade ONLY a pending quiz in the supplied context and only if the student actually answers it.
The server's deterministicQuizResult, when non-null, is authoritative. Otherwise use not_answered unless you can match a clear
free-text answer to the pending question. Ordinary study questions are never assessment results.
Preference is null unless the student explicitly states a durable learning preference or study goal.
Topic is the concept studied, not a transcript of the query. Do not record non-study conversation as learning.
When current_study_context contains chapter_study or document_study, the server has already chosen the book, chapter and passages: follow its
"instructions" exactly, keep to S1..Sn, mention the book's own section names, and set source_ids to every passage you taught.`;

export function requiresClinicalEvidence(question:string) {
  return requiresVerifiedClinicalEvidence(question);
}
const normalizeQuote=(text:string)=>text.normalize('NFKC').replace(/\s+/g,' ').trim();
export function confirmedClinicalSupport(answer:TutorAnswer,sources:KnowledgeChunk[]):boolean {
  if(answer.clarification_needed) return true;
  if(!answer.clinical_support.length||!answer.source_ids.length) return false;
  const quotes:string[]=[];
  for(const item of answer.clinical_support) {
    const source=sources[Number(item.source_id.replace(/^S/,''))-1],quote=normalizeQuote(item.quote);
    if(!answer.source_ids.includes(item.source_id)||!source||source.sourceType==='exam_questions'||quote.length<8||!normalizeQuote(source.content).includes(quote)) return false;
    quotes.push(quote);
  }
  const permitted=new Set(quotes.join(' ').match(/\d+(?:\.\d+)?/g)??[]);
  // All clinical values shown to the student must occur in verified excerpts.
  return (answer.answer.replace(/^\s*\d+[.)]\s+/gm,'').match(/\d+(?:\.\d+)?/g)??[]).every(n=>permitted.has(n));
}

export async function streamTutorAnswer(input:{question:string;originalQuestion?:string;history:ChatMessageInput[];context:string;sources:KnowledgeChunk[];
  pendingQuiz:PendingQuiz|null;signal?:AbortSignal;onDelta:(delta:string)=>void;studyContext?:Record<string,unknown>}):Promise<{answer:TutorAnswer;usage:GenerateResult;references:string;reasoningEffort:ReturnType<typeof reasoningFor>}> {
  const ai=getAIProvider(),decoder=new AnswerStreamDecoder(),reasoningEffort=reasoningFor(input.question);
  const sourceData=input.sources.slice(0,10).map((source,index)=>({id:`S${index+1}`,type:source.sourceType,title:source.title,
    page:source.pageNumber,page_end:source.pageEnd??null,section:source.sectionIndex,chapter:source.chapterTitle??source.chapter??null,section_title:source.sectionTitle??null,text:source.content}));
  const original=input.originalQuestion??input.question;
  const previousQuestion=[...input.history].reverse().find(message=>message.role==='user')?.content??'';
  const followUp=/\b(?:it|that|this|what about|why|continue)\b|ليش|هذا|هاي|كمل|ماذا عن/i.test(original)&&original.length<180;
  const deterministic=gradeQuizOption(original,input.pendingQuiz),clinical=requiresClinicalEvidence(original)||(followUp&&requiresClinicalEvidence(previousQuestion));
  const messages:ChatMessageInput[]=[buildTutorContext({studentContext:input.context,evidence:sourceData,
    currentStudyContext:{current_request:original,follow_up:followUp,high_risk_clinical_request:clinical,...input.studyContext},
    pendingQuiz:input.pendingQuiz,deterministicQuizResult:deterministic}),...input.history.slice(-14),{role:'user',content:input.question}];
  const generator=ai.generateStream({taskPrompt:getNursingTutorInstructions({purpose:'student_answer'})+CONTRACT+`\nclinical_support is [] for ordinary concepts. For drug dosage or administration, contraindications, variable ranges, patient-specific decisions, or local protocols, include exact continuous supporting quotes with S IDs. Every numerical clinical value must appear in a quote. Unanswered exam stems cannot establish clinical facts. If support or necessary context is absent, ask specifically for the relevant lecture, drug, patient context, or local protocol.`,messages,reasoningEffort,
    jsonSchema:{name:'nursing_tutor_turn',schema:z.toJSONSchema(tutorAnswerSchema)},maxOutputTokens:9000,signal:input.signal,feature:'chat'});
  let usage:GenerateResult;
  while(true) {const next=await generator.next();if(next.done){usage=next.value;break;}const delta=decoder.push(next.value.delta);if(delta&&!clinical)input.onDelta(delta);}
  const answer=tutorAnswerSchema.parse(JSON.parse(usage.content));
  const available=new Set(sourceData.map(s=>s.id));
  if(answer.source_ids.some(id=>!available.has(id))) throw new Error('Answer contains an unknown source ID');
  if(clinical&&!confirmedClinicalSupport(answer,input.sources)) {
    answer.answer='I couldn’t confirm the dose, range or protocol from your course materials. Send the related lecture or slide, and clarify the drug or clinical context so we can check it together.\n\nابعث الشريحة أو المحاضرة المتعلقة بالسؤال حتى نتحقق من المعلومة بدقة.';
    answer.source_ids=[];answer.clinical_support=[];answer.clarification_needed=true;answer.quiz=null;answer.quiz_result='not_answered';
  }
  if(!answer.source_ids.length) answer.answer_origin='general_nursing_knowledge';
  else if(answer.answer_origin!=='mixed') answer.answer_origin=answer.source_ids.every(id=>{
    const source=input.sources[Number(id.slice(1))-1];return source.evidenceType==='USER_UPLOAD'||source.evidenceType==='PRIVATE_LECTURE';
  })?'student_file':'curriculum';
  if(clinical) input.onDelta(answer.answer);
  if(!input.pendingQuiz) answer.quiz_result='not_answered';
  if(deterministic!==null) answer.quiz_result=deterministic?'correct':'incorrect';
  if(answer.quiz && !/^[A-F]$/.test(answer.quiz.correct_option)) throw new Error('Invalid quiz answer key');
  if(answer.quiz && !answer.quiz.options[answer.quiz.correct_option.charCodeAt(0)-65]) throw new Error('Quiz answer outside options');
  const metadata=(s:KnowledgeChunk)=>[s.evidenceType==='USER_UPLOAD'||s.evidenceType==='PRIVATE_LECTURE'?'Your uploaded source':null,
    s.title,s.chapterTitle??null,s.sectionTitle??null,s.pageNumber?(s.pageEnd&&s.pageEnd!==s.pageNumber?`Pages ${s.pageNumber}–${s.pageEnd}`:`Page ${s.pageNumber}`):null,s.sectionIndex?`Section ${s.sectionIndex}`:null]
    .filter(Boolean).join(' — ').replace(/[\r\n\[\]<>`*_]/g,' ');
  const references=answer.source_ids.length?'\n\n**Sources:**\n\n'+[...new Set(answer.source_ids)].map(id=>`- ${metadata(input.sources[Number(id.slice(1))-1])}`).join('\n'):'';
  return {answer,usage,references,reasoningEffort};
}
