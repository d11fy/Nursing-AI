// The evaluation harness records human verdicts and must never invent a score.
import { test } from "node:test";
import assert from "node:assert/strict";
import { REVIEW_CATEGORIES, reviewDatasetSchema, reviewTemplate, summarizeReview, type ReviewDataset } from "../lib/evaluation/nursing-review";

function filled(reviewed: number, verdict: "correct" | "unsafe" = "correct"): ReviewDataset {
  const template = reviewTemplate(120);
  return { ...template, cases: template.cases.map((item, index) => ({
    ...item, question: `Question ${index}?`, subject: "Fundamentals of Nursing", source: "Lecture 1, p. 3",
    expected_concepts: ["airway first"], model_answer: index < reviewed ? "Answer" : null,
    reviewer_result: index < reviewed ? { verdict: index === 0 ? verdict : "correct", concepts_covered: ["airway first"],
      critical_error: index === 0 && verdict === "unsafe", reviewer: "RN reviewer", reviewed_at: new Date().toISOString() } : null,
  })) };
}

test("template covers every category and supports 100-200 cases", () => {
  const template = reviewTemplate(120);
  assert.equal(template.cases.length, 120);
  for (const category of REVIEW_CATEGORIES) assert.ok(template.cases.some((item) => item.category === category));
  assert.equal(reviewDatasetSchema.safeParse(filled(0)).success, true);
  assert.equal(reviewDatasetSchema.safeParse({ ...filled(0), cases: filled(0).cases.slice(0, 50) }).success, false);
});

test("no accuracy figure until every case has a human verdict", () => {
  const partial = summarizeReview(filled(60));
  assert.equal(partial.complete, false);
  assert.equal(partial.correctRate, null);
  assert.equal(partial.reviewedCases, 60);
  const complete = summarizeReview(filled(120));
  assert.equal(complete.complete, true);
  assert.equal(complete.correctRate, 100);
});

test("unsafe answers are counted as critical errors and must be marked as such", () => {
  const report = summarizeReview(filled(120, "unsafe"));
  assert.equal(report.unsafeAnswers, 1);
  assert.equal(report.criticalErrors, 1);
  const inconsistent = filled(120, "unsafe");
  inconsistent.cases[0].reviewer_result!.critical_error = false;
  assert.equal(reviewDatasetSchema.safeParse(inconsistent).success, false);
});
