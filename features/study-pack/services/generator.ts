import "server-only";
import { createHash } from "node:crypto";
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
} from "../types";
import { describeCoverage, evenExcerpt, mapLimited, pageLabel, planSections, type SourceCoverage, type SourceSection } from "./coverage";

export interface GenerateContext {
  lectureId: string;
  userId: string;
  lectureTitle: string;
  materials: Array<{ pageNumber: number | null; text: string }>;
}

const sectionDigestSchema = z.object({
  heading: z.string(),
  summary: z.string(),
  key_concepts: z.array(z.object({ concept: z.string(), explanation: z.string() })),
  definitions: z.array(z.object({ term: z.string(), definition: z.string() })),
  clinical_notes: z.array(z.string()),
  must_remember: z.array(z.string()),
});
type SectionDigest = z.infer<typeof sectionDigestSchema>;

/** Above this size a document is digested section by section before synthesis. */
const DIRECT_BUDGET = 28000;
const SECTION_CHARS = 16000;
const DIGEST_CONCURRENCY = 3;
const digestCache = new Map<string, { expires: number; digests: Promise<string[]> }>();

function formatDigest(section: SourceSection, digest: SectionDigest) {
  const lines = [`### Section ${section.index + 1} of the document (${pageLabel(section)}): ${digest.heading || section.heading || "Untitled"}`, digest.summary];
  if (digest.key_concepts.length) lines.push("Key concepts:", ...digest.key_concepts.map((c) => `- ${c.concept}: ${c.explanation}`));
  if (digest.definitions.length) lines.push("Definitions:", ...digest.definitions.map((d) => `- ${d.term}: ${d.definition}`));
  if (digest.clinical_notes.length) lines.push("Clinical notes:", ...digest.clinical_notes.map((n) => `- ${n}`));
  if (digest.must_remember.length) lines.push("Must remember:", ...digest.must_remember.map((m) => `- ${m}`));
  return lines.join("\n");
}

async function digestSection(context: GenerateContext, section: SourceSection, total: number) {
  const ai = getAIProvider();
  const result = await ai.generateText({
    taskPrompt: `${getNursingTutorInstructions({ purpose: "study_summary" })}

TASK: You are reading section ${section.index + 1} of ${total} (${pageLabel(section)}) of the lecture "${context.lectureTitle}".
Write a faithful study digest of THIS section only. Keep every distinct concept, definition, clinical point and number
that appears here, including topics mentioned only once. Do not add facts that are not in the text.
Keep English medical terminology. Return JSON matching the schema.`,
    messages: [{ role: "user", content: section.text }],
    jsonSchema: { name: "study_pack_section_digest", schema: z.toJSONSchema(sectionDigestSchema) },
    reasoningEffort: "low",
    feature: "study_pack_section_digest",
    maxOutputTokens: 2500,
  });
  await logUsage({
    userId: context.userId, type: "summary", feature: "study_pack_section_digest", provider: "openai", model: result.model,
    inputTokens: result.inputTokens, cachedInputTokens: result.cachedInputTokens, outputTokens: result.outputTokens,
    reasoningEffort: "low", estimatedCost: ai.calculateCost(result), lectureId: context.lectureId,
  });
  return formatDigest(section, sectionDigestSchema.parse(JSON.parse(result.content)));
}

/**
 * Digests every section (cached briefly so summary and key points share the
 * work), then merges digests in ordered groups until they fit one request.
 */
async function hierarchicalSource(context: GenerateContext, sections: SourceSection[], budget: number) {
  const key = `${context.lectureId}:${createHash("sha256").update(sections.map((section) => section.text).join("\u0000")).digest("hex")}`;
  const cached = digestCache.get(key);
  let digests: Promise<string[]>;
  if (cached && cached.expires > Date.now()) digests = cached.digests;
  else {
    digests = mapLimited(sections, DIGEST_CONCURRENCY, (section) => digestSection(context, section, sections.length));
    digestCache.set(key, { expires: Date.now() + 15 * 60_000, digests });
    digests.catch(() => digestCache.delete(key));
  }
  let level = await digests;
  let depth = 0;
  while (level.join("\n\n").length > budget) {
    if (++depth > 8) throw new Error("تعذر اختصار جميع الأقسام دون فقد التغطية؛ أعد المحاولة أو قسّم الملف");
    const groups: string[][] = [];
    for (const digest of level) {
      const group = groups.at(-1);
      if (group && group.join("\n\n").length + digest.length <= Math.floor(budget / 2)) group.push(digest);
      else groups.push([digest]);
    }
    const previousLength = level.join("\n\n").length;
    // Every complete child digest enters a semantic merge. Never cut a string:
    // a group can contain several sections, including an entire final chapter.
    level = await mapLimited(groups, DIGEST_CONCURRENCY, async (group, index) => {
      const ai = getAIProvider();
      const result = await ai.generateText({
        taskPrompt: `${getNursingTutorInstructions({ purpose: "study_summary" })}\nMerge ALL supplied study digests into a concise digest. Preserve distinct concepts, numbers, safety caveats and page references from the beginning, middle and end. Remove repetition, not sections. Aim for at most half the input length. Return the requested JSON.`,
        messages: [{ role: "user", content: group.join("\n\n") }],
        jsonSchema: { name: "study_pack_digest_merge", schema: z.toJSONSchema(sectionDigestSchema) },
        reasoningEffort: "low", feature: "study_pack_digest_merge", maxOutputTokens: 2500,
      });
      await logUsage({ userId: context.userId, type: "summary", feature: "study_pack_digest_merge", provider: "openai",
        model: result.model, inputTokens: result.inputTokens, cachedInputTokens: result.cachedInputTokens,
        outputTokens: result.outputTokens, reasoningEffort: "low", estimatedCost: ai.calculateCost(result), lectureId: context.lectureId });
      const digest = sectionDigestSchema.parse(JSON.parse(result.content));
      return formatDigest({ index, heading: `Merged group ${index + 1}`, pageStart: null, pageEnd: null, text: "" }, digest);
    });
    if (level.join("\n\n").length >= previousLength)
      throw new Error("تعذر ضغط الملخص مع الحفاظ على الأقسام؛ حاول مجددًا");
  }
  return level.join("\n\n");
}

/**
 * Source text for whole-document generators. Short material is sent as is;
 * long material is covered section by section so the end of the document is
 * not lost to a character budget.
 */
async function coveredSource(context: GenerateContext, budget: number): Promise<{ text: string; coverage: SourceCoverage }> {
  const sections = planSections(context.materials, SECTION_CHARS);
  const direct = sections.map((section) => section.text).join("\n\n");
  if (direct.length <= budget) return { text: direct, coverage: describeCoverage("direct", sections, sections.length) };
  const text = await hierarchicalSource(context, sections, budget);
  return {
    text: `The following are ordered digests of ALL ${sections.length} sections of the document, from the first page to the last.\n\n${text}`,
    coverage: describeCoverage("hierarchical", sections, sections.length),
  };
}

export async function generateSummary(context: GenerateContext): Promise<SummaryContent> {
  const { lectureId, userId, lectureTitle } = context;
  const ai = getAIProvider();
  const { text: sourceText, coverage } = await coveredSource(context, DIRECT_BUDGET);

  const taskPrompt = `${getNursingTutorInstructions({ purpose: "study_summary" })}

TASK: Generate a high-yield, structured Nursing Study Pack Summary for the lecture "${lectureTitle}".
GUIDELINES:
- Base the summary primarily and strictly on the provided lecture text excerpts.
- Primary language: Academic English.
- Provide natural, concise Arabic clarification for all difficult medical & nursing terms (e.g. "Dyspnea — ضيق التنفس", "Preload — الامتلاء/التمدد قبل الانقباض").
- Include Overview, Main Concepts, Important Definitions, Clinical Notes, and What to Remember.
- Cover every section from the first page to the last; a topic that appears only near the end is as important as the opening topics.
- In source_references, cite the page ranges your points come from.
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
  return { ...summaryResponseSchema.parse(parsedJson), coverage };
}

export async function generateKeyPoints(context: GenerateContext): Promise<KeyPointsContent> {
  const { lectureId, userId, lectureTitle } = context;
  const ai = getAIProvider();
  const { text: sourceText, coverage } = await coveredSource(context, DIRECT_BUDGET);

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
  return { ...keyPointsResponseSchema.parse(parsedJson), coverage };
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
  const sourceText = evenExcerpt(materials, 24000);

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
  const sourceText = evenExcerpt(materials, 28000);

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
