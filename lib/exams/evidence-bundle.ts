import "server-only";
import { getPool } from "@/lib/db/pool";
import { getSourcePriority, SOURCE_HIERARCHY, formatSourceTypeArabic } from "./priorities";
import type { KnowledgeChunk } from "@/lib/ai/provider";

export interface EvidenceBundleItem {
  id: string;
  category: "PRIMARY" | "SUPPORTING" | "EXAM_EXAMPLE";
  title: string;
  sourceType: string;
  sourceLabelArabic: string;
  pageNumber: number | null;
  content: string;
  priority: number;
  examYear?: number | null;
}

export interface EvidenceBundle {
  primarySources: EvidenceBundleItem[];
  supportingSources: EvidenceBundleItem[];
  examExamples: EvidenceBundleItem[];
  formattedSummaryPrompt: string;
}

/**
 * Builds a stratified, prioritized evidence bundle for a student question in Chat.
 * Distinguishes between:
 * - Primary Sources (Official Textbook, Syllabus)
 * - Supporting Sources (Doctor Lecture, Slides, Verified Summaries)
 * - Exam Examples (Past Exam Questions illustrating how this concept is tested)
 */
export async function buildEvidenceBundle(
  subjectId: string | null,
  query: string
): Promise<EvidenceBundle> {
  const pool = getPool();
  if (!subjectId) {
    return {
      primarySources: [],
      supportingSources: [],
      examExamples: [],
      formattedSummaryPrompt: "",
    };
  }

  const cleanQuery = query
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 10)
    .join(" | ");

  if (!cleanQuery) {
    return {
      primarySources: [],
      supportingSources: [],
      examExamples: [],
      formattedSummaryPrompt: "",
    };
  }

  // 1. Retrieve curriculum chunks
  const { rows: docRows } = await pool.query<{
    id: string;
    title: string;
    source_type: string;
    page_number: number | null;
    content: string;
  }>(
    `SELECT dc.id, d.title, d.source_type, dc.page_number, dc.content
     FROM public.document_chunks dc
     JOIN public.documents d ON d.id = dc.document_id
     WHERE d.subject_id = $1
       AND d.status = 'ready'
       AND dc.search_vector @@ to_tsquery('simple', $2)
     ORDER BY ts_rank_cd(dc.search_vector, to_tsquery('simple', $2)) DESC
     LIMIT 12`,
    [subjectId, cleanQuery]
  );

  // 2. Retrieve past exam questions matching this query
  const { rows: examRows } = await pool.query<{
    id: string;
    question_text: string;
    options_json: unknown;
    correct_answer_json: unknown;
    extracted_answer: string | null;
    page_number: number | null;
    exam_year: number | null;
    exam_title: string | null;
  }>(
    `SELECT
       eq.id, eq.question_text, eq.options_json, eq.correct_answer_json,
       eq.extracted_answer, eq.page_number, e.exam_year, e.title AS exam_title
     FROM public.exam_questions eq
     LEFT JOIN public.exams e ON e.id = eq.exam_id
     WHERE eq.subject_id = $1
       AND eq.status = 'VERIFIED'
       AND to_tsvector('simple', eq.question_text) @@ to_tsquery('simple', $2)
     LIMIT 4`,
    [subjectId, cleanQuery]
  );

  const primarySources: EvidenceBundleItem[] = [];
  const supportingSources: EvidenceBundleItem[] = [];
  const examExamples: EvidenceBundleItem[] = [];

  for (const row of docRows) {
    const priority = getSourcePriority(row.source_type);
    const item: EvidenceBundleItem = {
      id: row.id,
      category: priority >= SOURCE_HIERARCHY.TEXTBOOK ? "PRIMARY" : "SUPPORTING",
      title: row.title,
      sourceType: row.source_type,
      sourceLabelArabic: formatSourceTypeArabic(row.source_type),
      pageNumber: row.page_number,
      content: row.content.slice(0, 1800),
      priority,
    };

    if (item.category === "PRIMARY") {
      primarySources.push(item);
    } else {
      supportingSources.push(item);
    }
  }

  for (const eq of examRows) {
    const answer = eq.correct_answer_json || eq.extracted_answer || "";
    examExamples.push({
      id: eq.id,
      category: "EXAM_EXAMPLE",
      title: eq.exam_title || "امتحان سابق",
      sourceType: "PAST_EXAM",
      sourceLabelArabic: "سؤال امتحان سابق",
      pageNumber: eq.page_number,
      content: `السؤال: ${eq.question_text}\nالإجابة المعتمدة: ${typeof answer === "object" ? JSON.stringify(answer) : answer}`,
      priority: SOURCE_HIERARCHY.PAST_EXAMS,
      examYear: eq.exam_year,
    });
  }

  // Construct structured prompt guide
  const promptLines: string[] = [];
  if (primarySources.length) {
    promptLines.push("=== PRIMARY CURRICULUM SOURCES (HIGHEST PRIORITY TRUTH) ===");
    for (const p of primarySources.slice(0, 4)) {
      promptLines.push(`[${p.sourceLabelArabic}: ${p.title} (p.${p.pageNumber ?? "?"})]:\n${p.content}`);
    }
  }
  if (supportingSources.length) {
    promptLines.push("\n=== SUPPORTING SOURCES (Doctor Lectures / Slides / Summaries) ===");
    for (const s of supportingSources.slice(0, 3)) {
      promptLines.push(`[${s.sourceLabelArabic}: ${s.title} (p.${s.pageNumber ?? "?"})]:\n${s.content}`);
    }
  }
  if (examExamples.length) {
    promptLines.push("\n=== PAST EXAM EXAMPLES (How this concept was tested) ===");
    for (const e of examExamples.slice(0, 2)) {
      promptLines.push(`[سؤال امتحان ${e.examYear ?? "سابق"}: ${e.title}]:\n${e.content}`);
    }
  }

  return {
    primarySources,
    supportingSources,
    examExamples,
    formattedSummaryPrompt: promptLines.join("\n\n"),
  };
}
