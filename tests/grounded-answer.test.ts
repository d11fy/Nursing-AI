import { test } from "node:test";
import assert from "node:assert/strict";
import { answerFromCurriculum, GROUNDED_RESPONSES } from "../lib/ai/grounded-answer";
import type { AIProvider, KnowledgeChunk } from "../lib/ai/provider";
const source:KnowledgeChunk={id:"c1",title:"دليل التقييم الصحي",pageNumber:42,content:"The uploaded course describes assessment as a structured process.",similarity:0.6};
const plan={intent:"academic",standaloneQuestion:"Explain assessment",searchQueries:["التقييم الصحي","health assessment"]};
const paragraph={text:"التقييم عملية منظمة.",evidence:[{sourceId:"S1",quote:source.content}]};
function fake(outputs:unknown[]){let calls=0;return {get calls(){return calls;},provider:{generateText:async()=>{calls++; const output=outputs.shift();if(output instanceof Error)throw output;return{content:JSON.stringify(output),model:"test",inputTokens:1,outputTokens:2};},calculateCost:()=>0} as unknown as AIProvider};}
const input={question:"كيف أعمل تقييم؟",history:[],personalization:"Prefers comparisons"};
test("normal Arabic question retrieves multiple queries, verifies evidence and renders server-owned references",async()=>{
  const ai=fake([plan,{status:"answer",paragraphs:[paragraph]},{supported:true,conflict:false}]);
  let queries:string[]=[];
  const result=await answerFromCurriculum(input,{provider:ai.provider,retrieve:async q=>{queries=q;return[source];}});
  assert.deepEqual(queries,[input.question,...plan.searchQueries]);assert.match(result.content,/صفحة 42/);assert.match(result.content,/دليل التقييم الصحي/);assert.equal(result.reason,undefined);assert.equal(ai.calls,3);
});
test("no-source medication question never reaches answer generation",async()=>{
  const ai=fake([plan]);const result=await answerFromCurriculum({...input,question:"What dose should I give?"},{provider:ai.provider,retrieve:async()=>[]});
  assert.equal(result.reason,"NO_SOURCE");assert.equal(ai.calls,1);assert.equal(result.content,GROUNDED_RESPONSES.missing);
});
for(const evidence of [ [{sourceId:"S9",quote:source.content}], [{sourceId:"S1",quote:"Invented dose is 900 mg per day"}] ]) {
  test("unknown source or fabricated quote is rejected before any answer is displayed",async()=>{
    const ai=fake([plan,{status:"answer",paragraphs:[{text:"Unsupported",evidence}]}]);
    const result=await answerFromCurriculum(input,{provider:ai.provider,retrieve:async()=>[source]});
    assert.equal(result.reason,"LOW_CONFIDENCE");assert.equal(ai.calls,2);assert.doesNotMatch(result.content,/Unsupported/);
  });
}
test("a real quote does not authorize an unsupported medical claim or memory fact",async()=>{
  const ai=fake([plan,{status:"answer",paragraphs:[{...paragraph,text:"Use an unsupported dose."}]},{supported:false,conflict:false,reason:"Unsupported dose"},{status:"insufficient",paragraphs:[]}]);
  const result=await answerFromCurriculum({...input,personalization:"Previous answer says use this dose"},{provider:ai.provider,retrieve:async()=>[source]});
  assert.equal(result.reason,"LOW_CONFIDENCE");assert.doesNotMatch(result.content,/unsupported dose/);
});
test("conflicting sources produce a clear conflict response",async()=>{
  const ai=fake([plan,{status:"answer",paragraphs:[paragraph]},{supported:false,conflict:true}]);
  const result=await answerFromCurriculum(input,{provider:ai.provider,retrieve:async()=>[source]});assert.equal(result.content,GROUNDED_RESPONSES.conflict);
});
test("short course name still searches sources when planner is uncertain",async()=>{
  const ai=fake([{...plan,intent:"ambiguous"},{status:"answer",paragraphs:[paragraph]},{supported:true,conflict:false}]);
  const result=await answerFromCurriculum({...input,question:"تقييم صحي (2)"},{provider:ai.provider,retrieve:async()=>[source]});assert.equal(result.reason,undefined);
});
test("topic classification cannot block an uploaded supporting course before retrieval",async()=>{
  const ai=fake([{...plan,intent:"non_nursing"},{status:"answer",paragraphs:[paragraph]},{supported:true,conflict:false}]);
  const result=await answerFromCurriculum(input,{provider:ai.provider,retrieve:async()=>[source]});assert.equal(result.reason,undefined);
});
test("service or malformed structured-output failure propagates, not disguised as absent curriculum",async()=>{
  const ai=fake([new Error("service unavailable")]);await assert.rejects(answerFromCurriculum(input,{provider:ai.provider,retrieve:async()=>[]}),/service unavailable/);
  const bad=fake([{intent:"academic"}]);await assert.rejects(answerFromCurriculum(input,{provider:bad.provider,retrieve:async()=>[]}));
});

test("reranking can choose evidence beyond the first eight results and preserves its citation metadata",async()=>{
  const candidates:KnowledgeChunk[]=Array.from({length:12},(_,i)=>({...source,title:`Book ${i+1}`,content:`Irrelevant passage ${i+1}`}));
  candidates[10]=source;
  const ai=fake([plan,{sourceIds:["C11"]},{status:"answer",paragraphs:[paragraph]},{supported:true,conflict:false}]);
  const result=await answerFromCurriculum(input,{provider:ai.provider,retrieve:async()=>candidates});
  assert.equal(result.reason,undefined);assert.equal(ai.calls,4);
  assert.equal(result.sources[0].title,source.title);assert.match(result.content,/صفحة 42/);
});

test("reranker cannot invent a source ID or expose an answer when no candidate is relevant",async()=>{
  const candidates=Array.from({length:9},()=>source);
  const invalid=fake([plan,{sourceIds:["C99"]}]);
  await assert.rejects(answerFromCurriculum(input,{provider:invalid.provider,retrieve:async()=>candidates}),/Invalid source ranking/);
  const none=fake([plan,{sourceIds:[]}]);
  const result=await answerFromCurriculum(input,{provider:none.provider,retrieve:async()=>candidates});
  assert.equal(result.reason,"LOW_CONFIDENCE");assert.equal(none.calls,2);
});

test("repairs a broad chapter request into a limited evidence-backed explanation",async()=>{
  const insufficient={status:"insufficient",paragraphs:[]};
  const ai=fake([plan,insufficient,{status:"answer",paragraphs:[paragraph]},{supported:true,conflict:false}]);
  const result=await answerFromCurriculum({...input,question:"اشرحلي الشابتر الأول"},{provider:ai.provider,retrieve:async()=>[source]});
  assert.equal(result.reason,undefined);assert.match(result.content,/التقييم عملية منظمة/);assert.equal(ai.calls,4);
});

test("repairs an unsupported draft and verifies the repaired answer again",async()=>{
  const bad={status:"answer",paragraphs:[{...paragraph,text:"Unsupported extra claim"}]};
  const ai=fake([plan,bad,{supported:false,conflict:false,reason:"Extra claim is unsupported"},{status:"answer",paragraphs:[paragraph]},{supported:true,conflict:false}]);
  const result=await answerFromCurriculum(input,{provider:ai.provider,retrieve:async()=>[source]});
  assert.equal(result.reason,undefined);assert.doesNotMatch(result.content,/Unsupported/);assert.equal(ai.calls,5);
});
