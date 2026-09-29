import "server-only";

/**
 * Strict Hierarchy of Academic Truth for Nursing AI:
 * 1. Official University Material (100)
 * 2. Required Textbook (90)
 * 3. Doctor Lecture / Slides (80)
 * 4. Official Model Answers (70)
 * 5. Lab Material (60)
 * 6. Past Exams (50)
 * 7. Approved Summaries (40)
 * 8. Student Notes (30)
 *
 * Past exams and summaries help uncover style patterns and recurring topics,
 * but CANNOT override or contradict the official textbook or lecture.
 */
export const SOURCE_HIERARCHY = {
  OFFICIAL_UNIVERSITY: 100,
  TEXTBOOK: 90,
  DOCTOR_LECTURE: 80,
  MODEL_ANSWERS: 70,
  LAB_MATERIAL: 60,
  PAST_EXAMS: 50,
  APPROVED_SUMMARIES: 40,
  STUDENT_NOTES: 30,
} as const;

export function getSourcePriority(sourceType: string | null | undefined): number {
  if (!sourceType) return SOURCE_HIERARCHY.STUDENT_NOTES;
  const s = sourceType.toUpperCase().trim();

  if (s.includes("OFFICIAL") || s === "UNIVERSITY_LECTURE") {
    return SOURCE_HIERARCHY.OFFICIAL_UNIVERSITY;
  }
  if (s === "BOOK" || s === "TEXTBOOK") {
    return SOURCE_HIERARCHY.TEXTBOOK;
  }
  if (s === "DOCTOR_SLIDES" || s === "LECTURE") {
    return SOURCE_HIERARCHY.DOCTOR_LECTURE;
  }
  if (s === "MODEL_ANSWERS") {
    return SOURCE_HIERARCHY.MODEL_ANSWERS;
  }
  if (s === "LAB_MATERIAL") {
    return SOURCE_HIERARCHY.LAB_MATERIAL;
  }
  if (s === "PAST_EXAM" || s === "QUESTION_BANK" || s === "QUESTIONS") {
    return SOURCE_HIERARCHY.PAST_EXAMS;
  }
  if (s === "SUMMARY" || s === "REVIEW_NOTES") {
    return SOURCE_HIERARCHY.APPROVED_SUMMARIES;
  }
  return SOURCE_HIERARCHY.STUDENT_NOTES;
}

/**
 * Is this source an official academic curriculum authority that can establish ground truth?
 */
export function isAuthoritativeCurriculumSource(sourceType: string | null | undefined): boolean {
  const priority = getSourcePriority(sourceType);
  return priority >= SOURCE_HIERARCHY.DOCTOR_LECTURE;
}

/**
 * Maps source type to a user-friendly Arabic badge label
 */
export function formatSourceTypeArabic(sourceType: string | null | undefined): string {
  if (!sourceType) return "ملاحظات";
  const s = sourceType.toUpperCase().trim();
  switch (s) {
    case "BOOK":
    case "TEXTBOOK":
      return "كتاب معتمد";
    case "UNIVERSITY_LECTURE":
      return "مادة جامعية رسمية";
    case "DOCTOR_SLIDES":
    case "LECTURE":
      return "سلايدات الدكتور";
    case "MODEL_ANSWERS":
      return "إجابات نموذجية معتمدة";
    case "LAB_MATERIAL":
      return "مادة المعمل السريري";
    case "PAST_EXAM":
      return "امتحان سنوات سابقة";
    case "QUESTION_BANK":
      return "بنك أسئلة";
    case "SUMMARY":
      return "ملخص دراسي";
    case "REVIEW_NOTES":
      return "ملاحظات مراجعة";
    default:
      return "ملاحظات إضافية";
  }
}
