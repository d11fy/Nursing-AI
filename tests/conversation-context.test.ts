import { test } from "node:test";
import assert from "node:assert/strict";
import { attachmentEvidence, resolveConversationReference, type ConversationAttachment } from "../lib/ai/conversation-context";

function attachment(id:string,ordinal:number,topic:string):ConversationAttachment{return{
  id,conversation_id:"conversation",message_id:"message",user_id:"user",file_path:`chat/${id}.webp`,file_type:"image",ordinal,
  vision_extracted_text:`${topic} Definition Signs and symptoms`,subject_id:null,lecture_id:null,status:"ready",provider:"openai",model:"vision",
  input_tokens:10,output_tokens:20,created_at:new Date().toISOString(),vision_structured_json:{document_type:"lecture_slide",
    subject_guess:"Medical-Surgical Nursing",topic,extracted_text:`${topic} Definition Signs and symptoms`,medical_terms:[topic,"Dyspnea"],tables:[],unclear_regions:[],
    sections:[{index:1,title:"Definition",text:`Definition of ${topic}`},{index:2,title:"Signs",text:"Dyspnea and fatigue"}]}};}
const first=attachment("a1",1,"Heart Failure");const second=attachment("a2",2,"Hypertension");

test("هاي resolves to the active uploaded image before classification",()=>{
  const result=resolveConversationReference({question:"اشرحلي هاي",attachments:[first],activeAttachmentId:first.id,activeSectionIndex:null});
  assert.equal(result.selectedAttachments[0].id,first.id);assert.equal(result.referenceResolved,true);
  assert.match(result.resolvedQuestion,/Heart Failure/);assert.ok(result.searchQueries.some((query)=>query.includes("Dyspnea")));
});

test("a file range from the beginning through section three is preserved and bounded",()=>{
  const file={...first,file_type:"file",vision_structured_json:{...first.vision_structured_json,sections:[
    {index:1,title:"Matter",text:"Matter has mass and occupies space."},
    {index:2,title:"Pure Substance",text:"Elements and compounds are pure substances."},
    {index:3,title:"Mixtures",text:"Homogeneous and heterogeneous mixtures."},
    {index:4,title:"Solutions",text:"This later section must not be included."},
  ]}};
  const result=resolveConversationReference({question:"اشرحلي من أول الملف لحد القسم الثالث",attachments:[file],activeAttachmentId:file.id,activeSectionIndex:null});
  assert.deepEqual(result.selectedSectionRange,{start:1,end:3});
  assert.equal(attachmentEvidence(result).length,3);
  assert.doesNotMatch(result.resolvedQuestion,/later section/);
  assert.match(result.resolvedQuestion,/Stop at the end of section 3/);
});
test("الأول resolves to section one of the active image",()=>{
  const result=resolveConversationReference({question:"طيب الأول بس",attachments:[first],activeAttachmentId:first.id,activeSectionIndex:null});
  assert.equal(result.selectedSectionIndex,1);assert.match(result.resolvedQuestion,/Definition of Heart Failure/);
  assert.equal(attachmentEvidence(result)[0].sectionIndex,1);
});
test("كمل moves to the next section without reuploading",()=>{
  const result=resolveConversationReference({question:"كمل",attachments:[first],activeAttachmentId:first.id,activeSectionIndex:1});
  assert.equal(result.selectedSectionIndex,2);assert.match(result.resolvedQuestion,/Dyspnea and fatigue/);
});
test("exam and quiz follow-ups keep active context and intent",()=>{
  const exam=resolveConversationReference({question:"شو أهم شي فيها للامتحان؟",attachments:[first],activeAttachmentId:first.id,activeSectionIndex:1});
  const quiz=resolveConversationReference({question:"اختبرني فيها",attachments:[first],activeAttachmentId:first.id,activeSectionIndex:1});
  assert.equal(exam.style,"exam");assert.equal(quiz.style,"quiz");assert.equal(quiz.selectedAttachments[0].id,first.id);
});
test("multiple images can select the second image",()=>{
  const result=resolveConversationReference({question:"اشرح الصورة الثانية",attachments:[first,second],activeAttachmentId:first.id,activeSectionIndex:null});
  assert.equal(result.selectedAttachments[0].id,second.id);assert.match(result.resolvedQuestion,/Hypertension/);
});
test("a new standalone topic does not inherit an unrelated active image",()=>{
  const result=resolveConversationReference({question:"اشرح السكري",attachments:[first],activeAttachmentId:first.id,activeSectionIndex:1});
  assert.equal(result.selectedAttachments.length,0);assert.equal(result.resolvedQuestion,"اشرح السكري");
});
