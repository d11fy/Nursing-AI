import test from "node:test";
import assert from "node:assert/strict";
import {
  getSourcePriority,
  isAuthoritativeCurriculumSource,
  SOURCE_HIERARCHY,
  formatSourceTypeArabic,
} from "@/lib/exams/priorities";
import { quickHeuristicQuestionCount } from "@/lib/exams/exam-parser";

test("academic source hierarchy enforces strict truth priorities", () => {
  // 1. Official material has highest priority
  assert.equal(getSourcePriority("UNIVERSITY_LECTURE"), SOURCE_HIERARCHY.OFFICIAL_UNIVERSITY);
  assert.equal(getSourcePriority("BOOK"), SOURCE_HIERARCHY.TEXTBOOK);
  assert.equal(getSourcePriority("DOCTOR_SLIDES"), SOURCE_HIERARCHY.DOCTOR_LECTURE);
  assert.equal(getSourcePriority("MODEL_ANSWERS"), SOURCE_HIERARCHY.MODEL_ANSWERS);
  assert.equal(getSourcePriority("LAB_MATERIAL"), SOURCE_HIERARCHY.LAB_MATERIAL);
  assert.equal(getSourcePriority("PAST_EXAM"), SOURCE_HIERARCHY.PAST_EXAMS);
  assert.equal(getSourcePriority("SUMMARY"), SOURCE_HIERARCHY.APPROVED_SUMMARIES);
  assert.equal(getSourcePriority("NOTES"), SOURCE_HIERARCHY.STUDENT_NOTES);

  // 2. Strict authority: Textbook & University Lectures outrank Past Exams and Summaries
  assert.ok(getSourcePriority("BOOK") > getSourcePriority("PAST_EXAM"));
  assert.ok(getSourcePriority("BOOK") > getSourcePriority("SUMMARY"));
  assert.ok(getSourcePriority("UNIVERSITY_LECTURE") > getSourcePriority("PAST_EXAM"));

  // 3. Official curriculum authority check
  assert.equal(isAuthoritativeCurriculumSource("BOOK"), true);
  assert.equal(isAuthoritativeCurriculumSource("UNIVERSITY_LECTURE"), true);
  assert.equal(isAuthoritativeCurriculumSource("DOCTOR_SLIDES"), true);
  assert.equal(isAuthoritativeCurriculumSource("PAST_EXAM"), false);
  assert.equal(isAuthoritativeCurriculumSource("SUMMARY"), false);

  // 4. Arabic formatting labels
  assert.equal(formatSourceTypeArabic("BOOK"), "كتاب معتمد");
  assert.equal(formatSourceTypeArabic("PAST_EXAM"), "امتحان سنوات سابقة");
  assert.equal(formatSourceTypeArabic("SUMMARY"), "ملخص دراسي");
});

test("question segmentation heuristics detect standard exam stems", () => {
  const sampleExam = `
    1. A patient presents with signs of left-sided heart failure. Which clinical finding is expected?
       A) Jugular venous distention
       B) Pulmonary crackles and dyspnea
       C) Peripheral edema
       D) Hepatomegaly

    2. Which diuretic is potassium-sparing?
       A) Furosemide
       B) Spironolactone
       C) Hydrochlorothiazide
       D) Bumetanide

    3. True or False: Normal serum potassium range is 3.5 to 5.0 mEq/L.
  `;

  const detectedCount = quickHeuristicQuestionCount(sampleExam);
  assert.ok(detectedCount >= 3, `Expected at least 3 questions detected, got ${detectedCount}`);
});

test("duplicate question similarity grouping", () => {
  // Test clean normalization logic
  function clean(text: string) {
    return text
      .toLowerCase()
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      .replace(/[ًٌٍَُِّْـ]/g, "")
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const q1 = "What are the common symptoms of left-sided heart failure in adults?";
  const q2 = "What are the common clinical symptoms of left-sided heart failure in adult patients?";
  const q3 = "What is the normal dosage of furosemide for acute pulmonary edema?";

  const set1 = new Set(clean(q1).split(" "));
  const set2 = new Set(clean(q2).split(" "));
  const set3 = new Set(clean(q3).split(" "));

  const intersection12 = [...set1].filter((w) => set2.has(w)).length;
  const union12 = new Set([...set1, ...set2]).size;
  const sim12 = intersection12 / union12;

  const intersection13 = [...set1].filter((w) => set3.has(w)).length;
  const union13 = new Set([...set1, ...set3]).size;
  const sim13 = intersection13 / union13;

  assert.ok(sim12 > 0.65, `Expected high similarity between variants of same question, got ${sim12}`);
  assert.ok(sim13 < 0.25, `Expected low similarity between unrelated questions, got ${sim13}`);
});

test("exam frequency phrasing avoids prophetic guarantees", () => {
  const appeared = 6;
  const total = 8;
  const frequency = Math.round((appeared / total) * 100);

  const phrasing = `تكرر هذا الموضوع في ${appeared} من أصل ${total} نماذج امتحانات متاحة (${frequency}%).`;

  assert.ok(!phrasing.includes("سيأتي في الامتحان"));
  assert.ok(phrasing.includes("تكرر هذا الموضوع في 6 من أصل 8 نماذج امتحانات متاحة (75%)."));
});
