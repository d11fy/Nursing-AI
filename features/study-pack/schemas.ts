import { z } from "zod";

// ============================================================================
// AI Structured Output Schemas
// ============================================================================

export const summaryResponseSchema = z.object({
  overview: z.string().describe("Comprehensive academic overview of the lecture material"),
  main_concepts: z.array(
    z.object({
      concept: z.string(),
      explanation: z.string(),
      arabic_term: z.string().nullable().optional(),
    })
  ).min(1).describe("Core nursing concepts from the lecture"),
  important_definitions: z.array(
    z.object({
      term: z.string(),
      arabic_translation: z.string(),
      definition: z.string(),
    })
  ).min(1).describe("Key medical/nursing terms with concise Arabic translation"),
  clinical_notes: z.array(
    z.object({
      note: z.string(),
      importance: z.string().nullable().optional(),
    })
  ).default([]).describe("Clinical points, nursing interventions, or precautions"),
  what_to_remember: z.array(z.string()).min(1).describe("Actionable takeaways and high-yield retention items"),
  source_references: z.array(z.string()).default([]),
});

export const keyPointsResponseSchema = z.object({
  points: z.array(
    z.object({
      category: z.enum(["must_understand", "must_memorize", "exam_focus", "high_yield"]),
      point: z.string(),
      arabic_clarification: z.string().nullable().optional(),
      source_reference: z.string().nullable().optional(),
    })
  ).min(3).max(25),
});

export const flashcardItemSchema = z.object({
  front: z.string().describe("Clear, concise prompt or question"),
  back: z.string().describe("Concise, accurate answer preserving medical terminology"),
  card_type: z.enum([
    "definition",
    "concept",
    "signs_symptoms",
    "causes",
    "interventions",
    "comparison",
    "terminology",
    "important_fact",
  ]).nullable().optional(),
  explanation: z.string().nullable().optional(),
  source_reference: z.string().nullable().optional(),
  topic: z.string().nullable().optional(),
});

export const flashcardsResponseSchema = z.object({
  cards: z.array(flashcardItemSchema).min(1).max(25),
});

export const quizQuestionSchema = z.object({
  question_type: z.enum(["mcq", "true_false"]),
  question: z.string().describe("Specific question grounded strictly in lecture content"),
  options: z.array(z.string()).min(2).max(4).describe("Options for MCQ (4 options) or True/False (['True', 'False'])"),
  correct_answer: z.string().describe("Exact matching string of the correct option"),
  rationale: z.string().describe("Educational explanation of why the answer is correct and clinical context"),
  topic: z.string().describe("Specific lecture subtopic, e.g. 'Pulmonary Congestion'"),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  source_reference: z.string().nullable().optional(),
});

export const quizResponseSchema = z.object({
  title: z.string(),
  questions: z.array(quizQuestionSchema).min(1).max(20),
});

// ============================================================================
// API Request Validation Schemas
// ============================================================================

export const contentRequestSchema = z.object({
  type: z.enum(["summary", "key_points"]),
  regenerate: z.boolean().optional().default(false),
});

export const quizGenerateRequestSchema = z.object({
  questionCount: z.coerce.number().int().min(5).max(20).default(10),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]).default("medium"),
  questionType: z.enum(["mcq", "true_false", "mixed"]).default("mixed"),
});

export const flashcardProgressRequestSchema = z.object({
  flashcardId: z.string().uuid("معرف بطاقة غير صالح"),
  eventId: z.string().uuid().optional(),
  status: z.enum(["known", "review_again"]),
});

export const quizAnswerSubmitRequestSchema = z.object({
  attemptId: z.string().uuid("معرف المحاولة غير صالح"),
  questionId: z.string().uuid("معرف السؤال غير صالح"),
  studentAnswer: z.string().trim().min(1, "الرجاء تحديد إجابة"),
});

export const quizAttemptCompleteRequestSchema = z.object({
  attemptId: z.string().uuid("معرف المحاولة غير صالح"),
});
