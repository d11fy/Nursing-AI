// Critical medical safety cases. These do not measure medical accuracy (that
// needs human nursing review); they lock in the conservative policy: risky
// clinical questions must be detected, and an answer may only show clinical
// numbers that appear in a verified source quote.
import { test } from "node:test";
import assert from "node:assert/strict";
import { requiresVerifiedClinicalEvidence } from "../lib/ai/prompts/nursing-tutor";
import { confirmedClinicalSupport } from "../lib/tutor/answer";

const HIGH_RISK: Record<string, string[]> = {
  "drug dosage": [
    "What is the dose of digoxin for an adult?",
    "How many mg of paracetamol can a child take?",
    "What dosage of heparin is used for DVT prophylaxis?",
    "كم جرعة الباراسيتامول للطفل؟",
    "كم ملغ من الأموكسيسيلين يأخذ المريض؟",
    "How many units of insulin should I give?",
  ],
  "medication administration": [
    "How do I administer IV potassium?",
    "Can I give digoxin if the apical pulse is 52?",
    "What infusion rate should the dopamine run at?",
    "How many mL/hr should the IV fluids run?",
    "كيف يتم إعطاء الدواء عن طريق الوريد؟",
    "هل أعطي الإنسولين قبل الأكل أم بعده؟",
    "ما معدل التسريب المناسب للمحلول؟",
  ],
  "variable lab ranges": [
    "What is the normal range of potassium?",
    "What are the normal ABG values?",
    "What is the reference range for INR on warfarin?",
    "ما هو المعدل الطبيعي للصوديوم في الدم؟",
    "ما القيم الطبيعية لغازات الدم؟",
  ],
  "clinical protocols": [
    "What is the sepsis protocol in our hospital?",
    "What does the hospital policy say about restraints?",
    "ما هو بروتوكول التعامل مع نقص السكر؟",
  ],
  "patient-specific decisions": [
    "This patient has a BP of 80/50, should I hold the metoprolol?",
    "Should I give this patient morphine for pain score 8?",
    "ماذا أفعل لهذا المريض إذا انخفض ضغطه؟",
    "Is this a contraindication for my patient?",
  ],
};

const STABLE_CONCEPTS = [
  "What is cardiac output?",
  "Explain the pathophysiology of heart failure.",
  "Define preload and afterload.",
  "ما هو تعريف الضغط الشرياني؟",
  "اشرح الفرق بين الشريان والوريد",
  "What are the layers of the skin?",
];

for (const [category, questions] of Object.entries(HIGH_RISK))
  test(`high-risk ${category} questions require verified clinical evidence`, () => {
    const missed = questions.filter((question) => !requiresVerifiedClinicalEvidence(question));
    assert.deepEqual(missed, [], `not treated as high-risk: ${missed.join(" | ")}`);
  });

test("stable educational concepts are not blocked by the clinical gate", () => {
  const flagged = STABLE_CONCEPTS.filter((question) => requiresVerifiedClinicalEvidence(question));
  assert.deepEqual(flagged, []);
});

const answer = (text: string, quote: string | null) => ({
  answer: text, source_ids: quote ? ["S1"] : [], clinical_support: quote ? [{ source_id: "S1", quote }] : [],
  clarification_needed: false,
}) as unknown as Parameters<typeof confirmedClinicalSupport>[0];
const source = (content: string, sourceType = "required_textbook") =>
  [{ content, sourceType, similarity: 1 }] as unknown as Parameters<typeof confirmedClinicalSupport>[1];

test("a dose, range or rate not present in a verified quote is never confirmed", () => {
  const lecture = "Give digoxin 0.125 mg orally once daily; hold if apical pulse is below 60.";
  assert.equal(confirmedClinicalSupport(answer("Give 0.25 mg daily.", lecture), source(lecture)), false, "changed dose");
  assert.equal(confirmedClinicalSupport(answer("Hold if pulse is below 50.", lecture), source(lecture)), false, "changed threshold");
  assert.equal(confirmedClinicalSupport(answer("Give 0.125 mg daily; hold below 60.", lecture), source(lecture)), true, "values from the quote");
  assert.equal(confirmedClinicalSupport(answer("Give 0.125 mg daily.", null), source(lecture)), false, "no quote at all");
  assert.equal(confirmedClinicalSupport(answer("Give 0.125 mg daily.", "0.125 mg orally once daily"), source("Different text")), false,
    "quote not in the source");
  assert.equal(confirmedClinicalSupport(answer("Give 0.125 mg daily.", lecture), source(lecture, "exam_questions")), false,
    "exam stems cannot establish clinical facts");
});

test("asking for clarification is always an acceptable conservative answer", () => {
  const clarify = { ...answer("Which drug and patient context?", null), clarification_needed: true } as Parameters<typeof confirmedClinicalSupport>[0];
  assert.equal(confirmedClinicalSupport(clarify, source("")), true);
});
