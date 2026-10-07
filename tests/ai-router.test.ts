import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeAIRequest,getProviderByName } from '../lib/ai/router';
import { getAIConfig } from '../lib/ai/config.mjs';
import { calculateAICost } from '../lib/ai/cost';
import { responseRequest } from '../lib/ai/providers/openai';
import { AnswerStreamDecoder } from '../lib/tutor/stream-json';
import { gradeQuizOption } from '../lib/tutor/answer';
import type { Response } from 'openai/resources/responses/responses';
import { responseResult } from '../lib/ai/providers/openai';

test('all workloads use GPT-6 Luna without provider or model fallback',()=>{
  for(const complexity of ['UTILITY','SIMPLE','NORMAL','COMPLEX','VISION'] as const) {
    const decision=routeAIRequest({complexity,budgetRatio:1,preferredProvider:'gemini'});
    assert.equal(decision.provider,'openai');assert.equal(decision.model,'gpt-6-luna');assert.deepEqual(decision.fallbackProviders,[]);
  }
  assert.throws(()=>getProviderByName('gemini'));
  assert.equal(getAIConfig({OPENAI_TEXT_MODEL:'old',OPENAI_VISION_MODEL:'old',AI_PRIMARY_PROVIDER:'groq'}).chatModel,'gpt-6-luna');
  assert.throws(()=>getAIConfig({OPENAI_MAIN_MODEL:'gpt-4o-mini'}));
});
test('Responses request keeps stable instructions separate and does not persist remote state',()=>{
  const request=responseRequest({messages:[{role:'user',content:'Explain',imageUrl:'data:image/png;base64,AA=='}],personalizationContext:'Ahmad',reasoningEffort:'high'});
  assert.equal(request.store,false);assert.equal(request.reasoning?.effort,'high');assert.equal(request.model,'gpt-6-luna');
  assert.ok(Array.isArray(request.input));assert.ok(!request.instructions?.includes('Ahmad'));
});
test('only trusted callers can accept an empty completed OpenAI response',()=>{
  const response={status:'completed',output_text:'',output:[],model:'gpt-6-luna',usage:{input_tokens:10,output_tokens:0,input_tokens_details:{cached_tokens:0}}} as unknown as Response;
  assert.throws(()=>responseResult(response,'medium'),/no usable answer/);
  assert.equal(responseResult(response,'medium',true).content,'');
});
test('cost excludes cached tokens from ordinary input billing',()=>{
  assert.equal(calculateAICost({provider:'openai',model:'gpt-6-luna',inputTokens:1000,cachedInputTokens:800,outputTokens:200}),0.000128);
  assert.throws(()=>calculateAICost({provider:'gemini',model:'gemini-2.5-flash',inputTokens:1,outputTokens:1}));
});
test('JSON answer streaming survives every possible split without revealing quiz keys',()=>{
  const answer='**Lens** — عدسة\n"hello" \\ end';
  const json=JSON.stringify({answer,quiz:{correct_option:'B'},private:'SECRET'});
  for(let split=1;split<json.length;split++) {
    const decoder=new AnswerStreamDecoder(),visible=decoder.push(json.slice(0,split))+decoder.push(json.slice(split));
    assert.equal(visible,answer);assert.ok(!visible.includes('SECRET'));
  }
});
test('chat quiz option correctness comes from the persisted answer key',()=>{
  const quiz={question:'Which lens?',options:['A','B','C'],correct_option:'B',explanation:'Lens',topic:'microscope'};
  assert.equal(gradeQuizOption('A',quiz),false);assert.equal(gradeQuizOption('b',quiz),true);assert.equal(gradeQuizOption('What is B?',quiz),null);
});
