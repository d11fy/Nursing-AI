import "server-only";
import {logUsage} from "@/lib/usage";
import { z } from "zod";
import { routeAIRequest, getProviderByName } from "@/lib/ai/router";
import { executeWithFallback } from "@/lib/ai/fallback";
import { extractJson } from "@/lib/ai/json";
import type { QuestionType } from "@/types/database";

export interface ParsedQuestionRaw {
  question_number?: number;
  question_text: string;
  question_type: QuestionType;
  options: string[];
  extracted_answer?: string;
  explanation?: string;
  topic: string;
  subtopic?: string;
  difficulty_estimate: number;
  page_number?: number | null;
  confidence: number;
}

const parsedQuestionSchema = z.object({
  question_number: z.number().optional(),
  question_text: z.string().min(5),
  question_type: z.enum([
    "MCQ",
    "TRUE_FALSE",
    "SHORT_ANSWER",
    "ESSAY",
    "SATA",
    "MATCHING",
    "CASE_STUDY",
    "CALCULATION",
    "PRIORITY",
    "UNKNOWN",
  ]),
  options: z.array(z.string()).default([]),
  extracted_answer: z.string().optional().nullable(),
  explanation: z.string().optional().nullable(),
  topic: z.string().default("General Nursing"),
  subtopic: z.string().optional().nullable(),
  difficulty_estimate: z.number().min(0.1).max(1.0).default(0.5),
  confidence: z.number().min(0.1).max(1.0).default(0.8),
});

const pageExtractionSchema = z.object({
  questions: z.array(parsedQuestionSchema),
});

const EXAM_SEGMENTATION_PROMPT = `You are a high-precision medical & nursing exam parser.
Your task is to detect and extract ALL distinct questions from the provided exam text / page.

Supported question types:
- MCQ (Multiple Choice with single answer)
- TRUE_FALSE (True or False)
- SATA (Select All That Apply)
- SHORT_ANSWER (Fill in blank or brief answer)
- ESSAY (Descriptive / clinical essay question)
- MATCHING (Matching terms/definitions)
- CASE_STUDY (Clinical vignette followed by questions)
- CALCULATION (Dosage, drip rate, intake/output, BMI, ABG calculation)
- PRIORITY (First nursing action, triage, ABC, emergency priority)
- UNKNOWN (Uncertain format)

Rules:
1. Extract the exact question text.
2. For MCQ/SATA, extract all choices cleanly into the "options" array (e.g. ["A) Option 1", "B) Option 2"]).
3. If an answer key or marked correct answer is visibly indicated in the text (e.g. "Ans: B", "* marked", "Answer Key:"), extract it into "extracted_answer".
4. If NO answer is explicitly shown in the exam text, leave "extracted_answer" as null or omit it. DO NOT GUESS OR INVENT ANSWERS!
5. Classify the clinical nursing topic (e.g. "Heart Failure", "Pharmacology", "Vital Signs", "Wound Care").
6. Set difficulty_estimate between 0.1 (very easy recall) and 1.0 (complex multi-step case).
7. Return strictly valid JSON adhering to the schema.`;

/**
 * Parses a single text segment or page from an exam file into structured questions.
 * Uses AI Router with Fast/Economy provider to keep processing cost low and speed high.
 */
export async function parseExamPage(
  pageText: string,
  pageNumber: number | null,
  subjectName?: string,
  userId?:string
): Promise<ParsedQuestionRaw[]> {
  const trimmed = pageText.trim();
  if (trimmed.length < 30) return [];

  // Use fast / economy provider for bulk question parsing to minimize cost
  const route = routeAIRequest({
    feature: "exam_question_extraction",
    complexity: "SIMPLE",
  });

  const primary = getProviderByName(route.provider);
  const fallbacks = route.fallbackProviders.map(getProviderByName);

  try {
    const executed = await executeWithFallback({
      primaryProvider: primary,
      fallbackProviders: fallbacks,
      operation: (p) =>
        p.generateText({
          taskPrompt: EXAM_SEGMENTATION_PROMPT,
          messages: [
            {
              role: "user",
              content: `Subject context: ${subjectName || "Nursing"}\nPage number: ${pageNumber ?? "Unknown"}\n\nExam text to parse:\n${trimmed.slice(0, 14000)}`,
            },
          ],
          jsonSchema: {
            name: "exam_page_extraction",
            schema: z.toJSONSchema(pageExtractionSchema),
          },
          maxOutputTokens: 8000,reasoningEffort:"low",feature:"exam_question_extraction",
        }),
      operationName: `Parse Exam Page ${pageNumber ?? 1}`,
    });

    if(userId)await logUsage({userId,type:'quiz',feature:'exam_question_extraction',provider:'openai',model:executed.result.model,inputTokens:executed.result.inputTokens,cachedInputTokens:executed.result.cachedInputTokens,outputTokens:executed.result.outputTokens,reasoningEffort:'low',estimatedCost:primary.calculateCost(executed.result)});
    const parsedJson = JSON.parse(extractJson(executed.result.content));
    const validated = pageExtractionSchema.safeParse(parsedJson);

    if (!validated.success) {
      console.warn("[ExamParser] Validation warning for page", pageNumber, validated.error.message);
      return [];
    }

    return validated.data.questions.map((q, idx) => ({
      ...q,
      question_number: q.question_number || idx + 1,
      page_number: pageNumber,
      extracted_answer: q.extracted_answer || undefined,
      explanation: q.explanation || undefined,
      subtopic: q.subtopic || undefined,
    }));
  } catch (err) {
    console.error(`[ExamParser] Error parsing page ${pageNumber}:`, err);
    return [];
  }
}

/**
 * Regex-based quick heuristic detector for obvious question stems when LLM is unavailable or for fallback.
 */
export function quickHeuristicQuestionCount(text: string): number {
  const matches = text.match(/(?:Q(?:uestion)?\s*\d+|^\s*\d+[\.\-\)]\s+[A-Z\u0600-\u06FF])/gim);
  return matches ? matches.length : 0;
}
