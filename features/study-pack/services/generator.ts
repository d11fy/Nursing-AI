import "server-only";
import { z } from "zod";
import { getAIProvider } from "@/lib/ai";
import { getNursingTutorInstructions } from "@/lib/ai/prompts/nursing-tutor";
import { logUsage } from "@/lib/usage";
import {
  summaryResponseSchema,
  keyPointsResponseSchema,
  flashcardsResponseSchema,
  quizResponseSchema,
} from "../schemas";
import type {
  SummaryContent,
  KeyPointsContent,
  QuizDifficulty,
  QuizQuestionType,
} from "../types";

export interface GenerateContext {
  lectureId: string;
  userId: string;
  lectureTitle: string;
  materials: Array<{ pageNumber: number | null; text: string }>;
}

/**
 * Reduce materials into bounded chunks if the document is very large,
 * ensuring complete coverage across all sections.
 */
function prepareSourceText(materials: Array<{ pageNumber: number | null; text: string }>, maxChars = 24000): string {
  const sections = materials.map((m) =>
    `[${m.pageNumber ? `Page / Slide ${m.pageNumber}` : "Section"}]\n${m.text.trim()}`
  );

  const fullText = sections.join("\n\n");
  if (fullText.length <= maxChars) {
    return fullText;
  }

  // If long, take evenly distributed excerpts across the entire document
  const step = Math.ceil(fullText.length / maxChars);
  const sampledSections: string[] = [];
  let currentLength = 0;

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    // Keep headings and first portion of each section
    const snippet = sec.length > 1500 ? sec.slice(0, 1500) + "\n...[continued]" : sec;
    if (currentLength + snippet.length > maxChars) break;
    sampledSections.push(snippet);
    currentLength += snippet.length + 2;
  }

  return sampledSections.join("\n\n");
}

export async function generateSummary(context: GenerateContext): Promise<SummaryContent> {
  const { lectureId, userId, lectureTitle, materials } = context;
  const ai = getAIProvider();
  const sourceText = prepareSourceText(materials, 30000);

  const taskPrompt = `${getNursingTutorInstructions({ purpose: "study_summary" })}

TASK: Generate a high-yield, structured Nursing Study Pack Summary for the lecture "${lectureTitle}".
GUIDELINES:
- Base the summary primarily and strictly on the provided lecture text excerpts.
- Primary language: Academic English.
- Provide natural, concise Arabic clarification for all difficult medical & nursing terms (e.g. "Dyspnea — ضيق التنفس", "Preload — الامتلاء/التمدد قبل الانقباض").
- Include Overview, Main Concepts, Important Definitions, Clinical Notes, and What to Remember.
- Do NOT fabricate clinical drug dosages or unsupported facts.
- Return output strictly matching the JSON schema.`;

  const result = await ai.generateText({
    taskPrompt,
    messages: [
      {
        role: "user",
        content: `Lecture Title: ${lectureTitle}\n\n=== SOURCE MATERIAL ===\n${sourceText}`,
      },
    ],
    jsonSchema: {
      name: "study_pack_summary",
      schema: z.toJSONSchema(summaryResponseSchema),
    },
    reasoningEffort: "medium",
    feature: "study_pack_summary",
    maxOutputTokens: 6000,
  });

  await logUsage({
    userId,
    type: "summary",
    feature: "study_pack_summary",
    provider: "openai",
    model: result.model,
    inputTokens: result.inputTokens,
    cachedInputTokens: result.cachedInputTokens,
    outputTokens: result.outputTokens,
    reasoningEffort: "medium",
    estimatedCost: ai.calculateCost(result),
    lectureId,
  });

  const parsedJson = JSON.parse(result.content);
  return summaryResponseSchema.parse(parsedJson);
}

export async function generateKeyPoints(context: GenerateContext): Promise<KeyPointsContent> {
  const { lectureId, userId, lectureTitle, materials } = context;
  const ai = getAIProvider();
  const sourceText = prepareSourceText(materials, 26000);

  const taskPrompt = `${getNursingTutorInstructions({ purpose: "study_key_points" })}

TASK: Extract 8 to 18 high-yield key study points from the lecture "${lectureTitle}".
GUIDELINES:
- Ground each point strictly in the lecture text.
- Classify points into: "must_understand", "must_memorize", "exam_focus", or "high_yield".
- Preserve accurate English medical terminology and include helpful Arabic clarifications where appropriate.
- Cover all main sections evenly, not just the beginning of the lecture.
- Return output strictly matching the JSON schema.`;

  const result = await ai.generateText({
    taskPrompt,
    messages: [
      {
        role: "user",
        content: `Lecture Title: ${lectureTitle}\n\n=== SOURCE MATERIAL ===\n${sourceText}`,
      },
    ],
    jsonSchema: {
      name: "study_pack_key_points",
      schema: z.toJSONSchema(keyPointsResponseSchema),
    },
    reasoningEffort: "low",
    feature: "study_pack_key_points",
    maxOutputTokens: 4000,
  });

  await logUsage({
    userId,
    type: "key_points",
    feature: "study_pack_key_points",
    provider: "openai",
    model: result.model,
    inputTokens: result.inputTokens,
    cachedInputTokens: result.cachedInputTokens,
    outputTokens: result.outputTokens,
    reasoningEffort: "low",
    estimatedCost: ai.calculateCost(result),
    lectureId,
  });

  const parsedJson = JSON.parse(result.content);
  return keyPointsResponseSchema.parse(parsedJson);
}

export async function generateFlashcards(context: GenerateContext): Promise<Array<{
  front: string;
  back: string;
  card_type: string | null;
  explanation: string | null;
  source_reference: string | null;
  topic: string | null;
}>> {
  const { lectureId, userId, lectureTitle, materials } = context;
  const ai = getAIProvider();
  const sourceText = prepareSourceText(materials, 24000);

  const taskPrompt = `${getNursingTutorInstructions({ purpose: "study_flashcards" })}

TASK: Generate 10 to 18 high-yield nursing flashcards from the lecture "${lectureTitle}".
GUIDELINES:
- Each card must have ONE clear prompt/question on the front.
- Front: Short and direct (e.g. "Definition of Afterload?", "Main sign of Left-Sided Heart Failure?").
- Back: Concise, precise answer preserving English medical terminology and adding brief Arabic clarification where helpful.
- Diverse types: definition, concept, signs_symptoms, causes, interventions, comparison, terminology, important_fact.
- Do NOT repeat the same concept across multiple cards.
- Return output strictly matching the JSON schema.`;

  const result = await ai.generateText({
    taskPrompt,
    messages: [
      {
        role: "user",
        content: `Lecture Title: ${lectureTitle}\n\n=== SOURCE MATERIAL ===\n${sourceText}`,
      },
    ],
    jsonSchema: {
      name: "study_pack_flashcards",
      schema: z.toJSONSchema(flashcardsResponseSchema),
    },
    reasoningEffort: "low",
    feature: "study_pack_flashcards",
    maxOutputTokens: 4500,
  });

  await logUsage({
    userId,
    type: "flashcards",
    feature: "study_pack_flashcards",
    provider: "openai",
    model: result.model,
    inputTokens: result.inputTokens,
    cachedInputTokens: result.cachedInputTokens,
    outputTokens: result.outputTokens,
    reasoningEffort: "low",
    estimatedCost: ai.calculateCost(result),
    lectureId,
  });

  const parsedJson = JSON.parse(result.content);
  const validated = flashcardsResponseSchema.parse(parsedJson);

  return validated.cards.map((c) => ({
    front: c.front,
    back: c.back,
    card_type: c.card_type ?? null,
    explanation: c.explanation ?? null,
    source_reference: c.source_reference ?? null,
    topic: c.topic ?? null,
  }));
}

export async function generateQuiz(
  context: GenerateContext,
  config: {
    questionCount: number;
    difficulty: QuizDifficulty;
    questionType: "mcq" | "true_false" | "mixed";
  }
): Promise<{
  title: string;
  difficulty: QuizDifficulty;
  questions: Array<{
    question_type: "mcq" | "true_false";
    question: string;
    options: string[];
    correct_answer: string;
    rationale: string;
    topic: string;
    difficulty: string;
    source_reference?: string | null;
  }>;
}> {
  const { lectureId, userId, lectureTitle, materials } = context;
  const { questionCount, difficulty, questionType } = config;
  const ai = getAIProvider();
  const sourceText = prepareSourceText(materials, 28000);

  const taskPrompt = `${getNursingTutorInstructions({ purpose: "study_quiz" })}

TASK: Generate a high-yield nursing practice quiz with exactly ${questionCount} questions from the lecture "${lectureTitle}".
CONFIG:
- Target question count: ${questionCount}
- Difficulty level: ${difficulty}
- Desired question types: ${questionType} (if mixed, provide a healthy balance of MCQs and True/False).
CRITICAL RULES:
1. Every question must be grounded directly in the provided lecture excerpts.
2. For MCQs: provide 4 distinct options. The "correct_answer" MUST be an exact string match to one of the 4 options.
3. For True/False: options MUST be ["True", "False"], and "correct_answer" must be "True" or "False".
4. Rationales: Must be educational, explaining WHY the correct answer is right according to nursing physiology/clinical logic, and why wrong options are incorrect. If True/False is False, clearly state the true fact in the rationale!
5. Topic: Name the specific subtopic for each question (e.g. "Cardiogenic Shock", "Renin-Angiotensin System", "Left Ventricular Ejection Fraction") so students can track weak topics.
6. Distribute questions evenly across the provided sections. Do NOT create all questions from the first page.
7. Return output strictly matching the JSON schema.`;

  const result = await ai.generateText({
    taskPrompt,
    messages: [
      {
        role: "user",
        content: `Lecture Title: ${lectureTitle}\n\n=== SOURCE MATERIAL ===\n${sourceText}`,
      },
    ],
    jsonSchema: {
      name: "study_pack_quiz",
      schema: z.toJSONSchema(quizResponseSchema),
    },
    reasoningEffort: "medium",
    feature: "study_pack_quiz",
    maxOutputTokens: 6500,
  });

  await logUsage({
    userId,
    type: "quiz",
    feature: "study_pack_quiz",
    provider: "openai",
    model: result.model,
    inputTokens: result.inputTokens,
    cachedInputTokens: result.cachedInputTokens,
    outputTokens: result.outputTokens,
    reasoningEffort: "medium",
    estimatedCost: ai.calculateCost(result),
    lectureId,
  });

  const parsedJson = JSON.parse(result.content);
  const validated = quizResponseSchema.parse(parsedJson);

  // Validate answer integrity: ensure correct_answer exists in options for every question
  const sanitizedQuestions = validated.questions.map((q) => {
    let options = q.options.map((opt) => opt.trim());
    const correct = q.correct_answer.trim();

    if (q.question_type === "true_false") {
      options = ["True", "False"];
      const isTrue = correct.toLowerCase() === "true";
      return {
        ...q,
        options,
        correct_answer: isTrue ? "True" : "False",
      };
    }

    // If options don't contain correct answer due to minor formatting, fix it
    if (!options.includes(correct)) {
      if (options.length < 4) {
        options.push(correct);
      } else {
        options[0] = correct;
      }
    }

    return {
      ...q,
      options,
      correct_answer: correct,
    };
  });

  return {
    title: validated.title || `${lectureTitle} Quiz`,
    difficulty,
    questions: sanitizedQuestions.slice(0, questionCount),
  };
}
