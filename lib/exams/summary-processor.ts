import "server-only";
import { z } from "zod";
import { getPool } from "@/lib/db/pool";
import { routeAIRequest, getProviderByName } from "@/lib/ai/router";
import { executeWithFallback } from "@/lib/ai/fallback";
import { extractJson } from "@/lib/ai/json";
import type { SummaryVerificationStatus } from "@/types/database";

export interface SummaryPointItem {
  point_type: "topic" | "key_point" | "definition" | "important_term" | "table_summary" | "list_item";
  topic: string;
  content: string;
  page_number?: number | null;
}

const summaryExtractionSchema = z.object({
  points: z.array(
    z.object({
      point_type: z.enum([
        "topic",
        "key_point",
        "definition",
        "important_term",
        "table_summary",
        "list_item",
      ]),
      topic: z.string().min(2),
      content: z.string().min(5),
      page_number: z.number().optional().nullable(),
    })
  ),
});

const SUMMARY_EXTRACTION_PROMPT = `You are a clinical nursing content analyzer.
Extract structured learning units from this student/faculty summary text:
- key_point: Essential clinical points
- definition: Medical/nursing definitions
- important_term: Vital terminology
- table_summary: Summary of clinical tables/comparisons
- list_item: Important steps or lists

Do NOT treat this summary as infallible textbook truth. Just accurately segment what is claimed in the summary. Return JSON matching the schema.`;

/**
 * Extracts and verifies points from a SUMMARY document against the official curriculum.
 * Ensures unverified summary content never gets treated as absolute academic truth.
 */
export async function processSummaryDocument(
  documentId: string,
  subjectId: string,
  pages: Array<{ pageNumber: number | null; text: string }>
): Promise<number> {
  const pool = getPool();
  const fullText = pages.map((p) => p.text).join("\n\n");
  if (fullText.trim().length < 50) return 0;

  // 1. Extract structured points using fast economy router
  const route = routeAIRequest({
    feature: "summary_extraction",
    complexity: "SIMPLE",
  });
  const primary = getProviderByName(route.provider);
  const fallbacks = route.fallbackProviders.map(getProviderByName);

  let extractedPoints: SummaryPointItem[] = [];
  try {
    const executed = await executeWithFallback({
      primaryProvider: primary,
      fallbackProviders: fallbacks,
      operation: (p) =>
        p.generateText({
          taskPrompt: SUMMARY_EXTRACTION_PROMPT,
          messages: [
            {
              role: "user",
              content: `Summary text to analyze:\n${fullText.slice(0, 16000)}`,
            },
          ],
          jsonSchema: {
            name: "summary_points_extraction",
            schema: z.toJSONSchema(summaryExtractionSchema),
          },
          maxOutputTokens: 3500,
        }),
      operationName: "Extract Summary Points",
    });

    const parsed = JSON.parse(extractJson(executed.result.content));
    const validated = summaryExtractionSchema.parse(parsed);
    extractedPoints = validated.points;
  } catch (err) {
    console.error("[SummaryProcessor] Error extracting points:", err);
    return 0;
  }

  if (!extractedPoints.length) return 0;

  // 2. Clear old summary points for this document
  await pool.query("DELETE FROM public.summary_knowledge_points WHERE document_id = $1", [documentId]);

  // 3. Verify each point against official curriculum chunks
  let insertedCount = 0;

  for (const pt of extractedPoints) {
    // Quick search against authoritative textbook chunks in this subject
    const searchTerms = pt.content
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
      .slice(0, 8)
      .join(" | ");

    let status: SummaryVerificationStatus = "UNVERIFIED";
    let matchedChunkId: string | null = null;

    if (searchTerms) {
      const { rows: matches } = await pool.query<{ id: string; content: string }>(
        `SELECT dc.id, dc.content
         FROM public.document_chunks dc
         JOIN public.documents d ON d.id = dc.document_id
         WHERE d.subject_id = $1
           AND d.status = 'ready'
           AND d.source_type IN ('BOOK', 'TEXTBOOK', 'UNIVERSITY_LECTURE', 'DOCTOR_SLIDES', 'book', 'lecture')
           AND dc.search_vector @@ to_tsquery('simple', $2)
         LIMIT 1`,
        [subjectId, searchTerms]
      );

      if (matches.length) {
        matchedChunkId = matches[0].id;
        status = "SUPPORTED"; // Found in official curriculum
      }
    }

    await pool.query(
      `INSERT INTO public.summary_knowledge_points (
         document_id, subject_id, point_type, topic, content,
         verification_status, verified_by_chunk_id, page_number
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        documentId,
        subjectId,
        pt.point_type,
        pt.topic,
        pt.content,
        status,
        matchedChunkId,
        pt.page_number || null,
      ]
    );
    insertedCount++;
  }

  return insertedCount;
}
