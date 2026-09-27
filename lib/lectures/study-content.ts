import "server-only";
import { createSystemClient } from "@/lib/db/server";
import { getAIProvider } from "@/lib/ai";
import { extractJson } from "@/lib/ai/json";
import { logUsage } from "@/lib/usage";
import type { StudyContentType } from "@/types/database";

/** Reads previously generated content for a lecture. Callers must already
 * have verified the caller owns the lecture via their own scoped client —
 * this always uses the system client, matching the documents/document_chunks
 * pattern (no direct student table access, gated procedurally instead). */
export async function getStudyContent(lectureId: string): Promise<Partial<Record<StudyContentType, unknown>>> {
  const db = createSystemClient();
  const { data } = await db
    .from("generated_study_content")
    .select("content_type, content_json")
    .eq("lecture_id", lectureId);
  const result: Partial<Record<StudyContentType, unknown>> = {};
  for (const row of data ?? []) result[row.content_type] = row.content_json;
  return result;
}

const PROMPTS: Record<StudyContentType, string> = {
  summary:
    `بناءً على محتوى المحاضرة المرفق فقط (Lecture Only)، اكتب ملخصًا تعليميًا منظمًا. لا تخترع معلومات غير موجودة في النص.
أجب بصيغة JSON فقط بهذا الشكل بدون أي نص إضافي:
{"overview": "...", "key_concepts": ["..."], "terminology": ["..."], "must_know": ["..."], "memorize": ["..."], "exam_points": ["..."]}`,
  key_points:
    `استخرج أهم النقاط التعليمية من محتوى المحاضرة المرفق فقط، كقائمة نقاط مختصرة وواضحة. لا تخترع معلومات غير موجودة في النص.
أجب بصيغة JSON فقط: {"points": ["...", "..."]}`,
  quiz:
    `أنشئ 10 أسئلة (اختيار من متعدد أو صح/خطأ، وإجابة صحيحة واحدة فقط لكل سؤال) من محتوى المحاضرة المرفق فقط.
أجب بصيغة JSON فقط:
{"questions": [{"type": "mcq", "question": "...", "options": ["...", "...", "...", "..."], "answer": "...", "explanation": "..."}]}`,
  flashcards:
    `أنشئ 15 بطاقة تعليمية (Flashcards) من محتوى المحاضرة المرفق فقط، كل بطاقة لها وجه (Front) وخلف (Back).
أجب بصيغة JSON فقط: {"cards": [{"front": "...", "back": "..."}]}`,
};

export async function generateStudyContent(
  lectureId: string,
  userId: string,
  type: StudyContentType,
  lectureTitle: string
): Promise<unknown> {
  const db = createSystemClient();
  const { data: chunks } = await db
    .from("lecture_chunks")
    .select("content")
    .eq("lecture_id", lectureId)
    .order("chunk_index", { ascending: true });
  const text = (chunks ?? []).map((c) => c.content).join("\n\n").trim();
  if (!text) throw new Error("لا يوجد محتوى لهذه المحاضرة بعد");

  const provider = getAIProvider();
  const result = await provider.generateText({
    messages: [{
      role: "user",
      content: `${PROMPTS[type]}\n\n---\nمحتوى المحاضرة "${lectureTitle}":\n${text.slice(0, 12000)}`,
    }],
  });

  let contentJson: unknown;
  try {
    contentJson = JSON.parse(extractJson(result.content));
  } catch {
    throw new Error("تعذر إنشاء المحتوى، حاول مرة أخرى");
  }

  // No native upsert in the query builder — replace on regenerate.
  await db.from("generated_study_content").delete().eq("lecture_id", lectureId).eq("content_type", type);
  const { error } = await db.from("generated_study_content").insert({
    lecture_id: lectureId,
    user_id: userId,
    content_type: type,
    content_json: contentJson,
    model: result.model,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
  });
  if (error) throw new Error(error.message);

  await logUsage({
    userId,
    type,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    estimatedCost: provider.calculateCost({ model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens }),
    lectureId,
  });

  return contentJson;
}
