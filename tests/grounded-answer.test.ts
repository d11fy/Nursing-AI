import { test } from "node:test";
import assert from "node:assert/strict";
import { answerFromCurriculum, GROUNDED_RESPONSES, rerankEvidence } from "../lib/ai/grounded-answer";
import type { AIProvider, KnowledgeChunk } from "../lib/ai/provider";

const source:KnowledgeChunk={id:"c1",title:"دليل التقييم الصحي",pageNumber:42,
  content:"The uploaded course describes assessment as a structured process.",similarity:0.6,evidenceType:"TEXTBOOK"};
const supported={coverage:"SUPPORTED",paragraphs:[{text:"التقييم عملية منظمة.",evidence:[{sourceId:"S1",quote:source.content}]}],unsupported_parts:[]};
const approved={supported:true,unsupportedParagraphs:[]};
function fake(outputs:unknown[]){let calls=0;return {get calls(){return calls;},provider:{name:"test",generateText:async()=>{
  calls++;const output=outputs.shift();if(output instanceof Error)throw output;
  return{content:JSON.stringify(output),model:"test-model",inputTokens:1,outputTokens:2};},calculateCost:()=>0} as unknown as AIProvider};}
const input={question:"كيف أعمل تقييم؟",resolvedQuestion:"اشرح التقييم الصحي",history:[],personalization:"Prefers comparisons"};

test("generated answer receives an independent evidence review and server-owned citation",async()=>{
  const ai=fake([supported,approved]);let queries:string[]=[];
  const result=await answerFromCurriculum(input,{provider:ai.provider,retrieve:async(value)=>{queries=value;return[source];}});
  assert.equal(ai.calls,2);assert.ok(queries.includes(input.question));assert.match(result.content,/صفحة 42/);
  assert.equal(result.evidenceCoverage,"SUPPORTED");assert.deepEqual(result.finalSourceIds,["c1"]);
});

test("safe established knowledge is answered even when curriculum retrieval is empty",async()=>{
  const ai=fake([{answer:"### Assessment — التقييم\n\nAssessment is a structured process.\n\n**بمعنى بسيط:** هو جمع المعلومات بطريقة منظمة.",clarification_needed:false,out_of_scope:false}]);
  const result=await answerFromCurriculum(input,{provider:ai.provider,retrieve:async()=>[]});
  assert.equal(ai.calls,1);assert.equal(result.reason,undefined);assert.match(result.content,/Assessment/);assert.match(result.content,/بمعنى بسيط/);
});

test("an unsupported high-risk dose request does not call the model or guess",async()=>{
  const ai=fake([]);const result=await answerFromCurriculum({...input,question:"What dose should I administer to this patient?",resolvedQuestion:"What dose should I administer to this patient?"},{provider:ai.provider,retrieve:async()=>[]});
  assert.equal(ai.calls,0);assert.equal(result.reason,"NO_SOURCE");assert.equal(result.content,GROUNDED_RESPONSES.missing);
});

test("invalid evidence quote gets only one repair attempt",async()=>{
  const invalid={coverage:"SUPPORTED",paragraphs:[{text:"جرعة مخترعة",evidence:[{sourceId:"S1",quote:"900 mg invented dose"}]}],unsupported_parts:[]};
  const ai=fake([invalid,supported,approved]);
  const result=await answerFromCurriculum(input,{provider:ai.provider,retrieve:async()=>[source]});
  assert.equal(ai.calls,3);assert.doesNotMatch(result.content,/900 mg/);assert.equal(result.reason,undefined);
});

test("a matching quote cannot excuse an unsupported clinical claim",async()=>{
  const invented={coverage:"SUPPORTED",paragraphs:[{text:"الجرعة 900 mg.",evidence:[{sourceId:"S1",quote:source.content}]}],unsupported_parts:[]};
  const rejected={supported:false,unsupportedParagraphs:[0]};
  const safeFallback={answer:"### Assessment — التقييم\n\nAssessment is a structured process.\n\n**بمعنى بسيط:** هو جمع المعلومات بطريقة منظمة.",clarification_needed:false,out_of_scope:false};
  const ai=fake([invented,rejected,invented,rejected,safeFallback]);
  const result=await answerFromCurriculum(input,{provider:ai.provider,retrieve:async()=>[source]});
  assert.equal(ai.calls,5);assert.equal(result.reason,undefined);
  assert.doesNotMatch(result.content,/900 mg/);
});

test("partially supported response answers available portions and names the missing part",async()=>{
  const partial={coverage:"PARTIALLY_SUPPORTED",paragraphs:supported.paragraphs,unsupported_parts:["النقطة الثالثة"]};
  const ai=fake([partial,approved]);const result=await answerFromCurriculum(input,{provider:ai.provider,retrieve:async()=>[source]});
  assert.equal(result.evidenceCoverage,"PARTIALLY_SUPPORTED");assert.match(result.content,/النقطة الثالثة/);
});

test("current upload outranks curriculum and is a valid source without vector chunks",async()=>{
  const upload:KnowledgeChunk={id:"attachment:a:section:1",title:"الصورة التي رفعتها (1)",content:"Heart failure is shown as the slide topic.",
    similarity:1,evidenceType:"USER_UPLOAD",attachmentId:"a",attachmentOrdinal:1,sectionIndex:1};
  const answer={coverage:"SUPPORTED",paragraphs:[{text:"موضوع الشريحة هو Heart Failure.",evidence:[{sourceId:"S1",quote:upload.content}]}],unsupported_parts:[]};
  const ai=fake([answer,approved]);const result=await answerFromCurriculum({...input,attachmentSources:[upload]}, {provider:ai.provider,retrieve:async()=>[]});
  assert.equal(result.reason,undefined);assert.equal(result.sources[0].id,upload.id);assert.match(result.content,/الصورة التي رفعتها/);
});

test("deterministic reranker applies evidence priority and limits context to eight",()=>{
  const curriculum=Array.from({length:12},(_,index)=>({...source,id:`c${index}`,similarity:0.9-index/100}));
  const upload:KnowledgeChunk={id:"u",content:"relevant upload",similarity:0.1,evidenceType:"USER_UPLOAD"};
  const ranked=rerankEvidence("relevant",[...curriculum,upload],8);
  assert.equal(ranked.length,8);assert.equal(ranked[0].id,"u");
});
