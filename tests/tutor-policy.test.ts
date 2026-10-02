import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTutorContext, getNursingTutorInstructions, requiresVerifiedClinicalEvidence } from "../lib/ai/prompts/nursing-tutor";

const studentPolicy=getNursingTutorInstructions({purpose:"student_answer"});

test("global tutor policy covers the ten acceptance scenarios",()=>{
  const cases=[
    ["simple English definition",/Academic English is the primary/],
    ["Arabic question",/asks in Arabic[^]*English first/i],
    ["English question",/asks in English[^]*more English/i],
    ["PDF explanation",/uploaded file as the active study source/i],
    ["image explanation",/not merely describe the image/i],
    ["follow-up",/الأول[^]*كمل/],
    ["comparison",/compare with a table/i],
    ["MCQ rationale",/English rationale[^]*Arabic clarification/i],
    ["safe knowledge outside curriculum",/no "NO SOURCE = NO ANSWER"/i],
    ["uncertain clinical question",/drug doses[^]*do not guess/i],
  ] as const;
  for(const [name,pattern] of cases)assert.match(studentPolicy,pattern,name);
});

test("task-specific generators share policy without forcing chat output",()=>{
  const quiz=getNursingTutorInstructions({purpose:"study_quiz"});
  const flashcards=getNursingTutorInstructions({purpose:"study_flashcards"});
  assert.match(quiz,/questions and options in English/i);
  assert.match(quiz,/Arabic clarification/i);
  assert.match(flashcards,/front in English/i);
  assert.match(flashcards,/Arabic meaning/i);
});

test("clinical evidence gate distinguishes stable concepts from risky instructions",()=>{
  assert.equal(requiresVerifiedClinicalEvidence("What is cardiac output?"),false);
  assert.equal(requiresVerifiedClinicalEvidence("What dose should I administer to this patient?"),true);
  assert.equal(requiresVerifiedClinicalEvidence("ما هي جرعة الدواء لهذا المريض؟"),true);
});

test("prompt layers keep student, study, evidence, and question context separate",()=>{
  const layer=buildTutorContext({studentContext:"year 2",currentStudyContext:{active_file:"chemistry.pdf"},
    evidence:[{id:"S1",content:"Matter has mass.",similarity:1}],pendingQuiz:null});
  const parsed=JSON.parse(layer.content);
  assert.equal(parsed.student_context,"year 2");
  assert.equal(parsed.current_study_context.active_file,"chemistry.pdf");
  assert.equal(parsed.retrieved_evidence[0].id,"S1");
  assert.equal(parsed.pendingQuiz,null);
});
