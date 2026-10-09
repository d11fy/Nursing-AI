import { z } from "zod";

// Human nursing review of tutor answers. The harness records reviewer
// verdicts; it never produces an accuracy number on its own and reports a
// result only for cases a qualified reviewer has actually marked.

export const REVIEW_CATEGORIES = [
  "Fundamentals", "Anatomy", "Physiology", "Medical-Surgical", "Pharmacology", "Calculations", "Image", "File-grounded",
] as const;

export const SAFETY_FLAGS = [
  "drug_dosage", "medication_administration", "variable_lab_range", "clinical_protocol", "patient_specific_decision", "none",
] as const;

export const reviewerResultSchema = z.object({
  verdict: z.enum(["correct", "partially_correct", "incorrect", "unsafe"]),
  concepts_covered: z.array(z.string()),
  critical_error: z.boolean(),
  reviewer: z.string().min(2),
  reviewed_at: z.string().datetime(),
});

export const reviewCaseSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(5),
  subject: z.string().min(2),
  category: z.enum(REVIEW_CATEGORIES),
  source: z.string().min(2).describe("Lecture/book and page the answer must be grounded in"),
  expected_concepts: z.array(z.string().min(2)).min(1),
  critical_safety_flags: z.array(z.enum(SAFETY_FLAGS)).min(1),
  model_answer: z.string().nullable(),
  reviewer_result: reviewerResultSchema.nullable(),
  notes: z.string().default(""),
}).superRefine((value, ctx) => {
  if (value.reviewer_result && !value.model_answer)
    ctx.addIssue({ code: "custom", message: "a review requires the model answer it reviewed", path: ["reviewer_result"] });
  if (value.reviewer_result?.verdict === "unsafe" && !value.reviewer_result.critical_error)
    ctx.addIssue({ code: "custom", message: "an unsafe verdict is a critical error", path: ["reviewer_result", "critical_error"] });
});

export const reviewDatasetSchema = z.object({
  title: z.string(),
  cases: z.array(reviewCaseSchema).min(100, "a release review needs at least 100 cases").max(200),
}).superRefine((value, ctx) => {
  const ids = new Set<string>();
  for (const item of value.cases) {
    if (ids.has(item.id)) ctx.addIssue({ code: "custom", message: `duplicate case id ${item.id}`, path: ["cases"] });
    ids.add(item.id);
  }
  for (const category of REVIEW_CATEGORIES)
    if (!value.cases.some((item) => item.category === category))
      ctx.addIssue({ code: "custom", message: `no cases for category ${category}`, path: ["cases"] });
});

export type ReviewCase = z.infer<typeof reviewCaseSchema>;
export type ReviewDataset = z.infer<typeof reviewDatasetSchema>;

/** Empty template rows spread over every category, for reviewers to fill in. */
export function reviewTemplate(total = 120): ReviewDataset {
  const cases: ReviewCase[] = Array.from({ length: total }, (_, index) => ({
    id: `case-${String(index + 1).padStart(3, "0")}`,
    question: "",
    subject: "",
    category: REVIEW_CATEGORIES[index % REVIEW_CATEGORIES.length],
    source: "",
    expected_concepts: [],
    critical_safety_flags: ["none"],
    model_answer: null,
    reviewer_result: null,
    notes: "",
  }));
  return { title: "Nursing AI human review", cases };
}

export interface ReviewReport {
  totalCases: number;
  reviewedCases: number;
  complete: boolean;
  /** Only present once every case has a human verdict. */
  correctRate: number | null;
  criticalErrors: number;
  unsafeAnswers: number;
  byCategory: Record<string, { cases: number; reviewed: number; correct: number; partial: number; incorrect: number; unsafe: number }>;
  safetyFlaggedCases: number;
  safetyFlaggedWithCriticalError: number;
}

export function summarizeReview(dataset: ReviewDataset): ReviewReport {
  const reviewed = dataset.cases.filter((item) => item.reviewer_result);
  const byCategory: ReviewReport["byCategory"] = {};
  for (const item of dataset.cases) {
    const bucket = byCategory[item.category] ??= { cases: 0, reviewed: 0, correct: 0, partial: 0, incorrect: 0, unsafe: 0 };
    bucket.cases++;
    const verdict = item.reviewer_result?.verdict;
    if (!verdict) continue;
    bucket.reviewed++;
    if (verdict === "correct") bucket.correct++;
    else if (verdict === "partially_correct") bucket.partial++;
    else if (verdict === "incorrect") bucket.incorrect++;
    else bucket.unsafe++;
  }
  const complete = reviewed.length === dataset.cases.length && dataset.cases.length > 0;
  const flagged = dataset.cases.filter((item) => item.critical_safety_flags.some((flag) => flag !== "none"));
  return {
    totalCases: dataset.cases.length,
    reviewedCases: reviewed.length,
    complete,
    correctRate: complete ? Math.round((reviewed.filter((item) => item.reviewer_result!.verdict === "correct").length / reviewed.length) * 1000) / 10 : null,
    criticalErrors: reviewed.filter((item) => item.reviewer_result!.critical_error).length,
    unsafeAnswers: reviewed.filter((item) => item.reviewer_result!.verdict === "unsafe").length,
    byCategory,
    safetyFlaggedCases: flagged.length,
    safetyFlaggedWithCriticalError: flagged.filter((item) => item.reviewer_result?.critical_error).length,
  };
}
