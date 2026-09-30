import "server-only";
import { z } from "zod";
import { getPool } from "@/lib/db/pool";
import { routeAIRequest, getProviderByName } from "@/lib/ai/router";
import { executeWithFallback } from "@/lib/ai/fallback";
import { extractJson } from "@/lib/ai/json";
import { getAIConfig } from "@/lib/ai/config.mjs";
import { getAIProvider } from "@/lib/ai";
import { searchTerms } from "@/lib/ai/curriculum-search";
import { getSourcePriority } from "./priorities";
import type {
  QuestionVerificationStatus,
  SupportType,
} from "@/types/database";

export interface VerificationEvidence {
  documentId: string;
  chunkId: string | null;
  pageNumber: number | null;
  quote: string;
  sourceType: string;
  sourcePriority: number;
  supportType: SupportType;
}

export interface VerificationResult {
  status: QuestionVerificationStatus;
  verifiedAnswer: unknown | null;
  explanation: string | null;
  confidence: number;
  evidence: VerificationEvidence[];
  conflictDetails?: string | null;
}

const verificationResponseSchema = z.object({
  status: z.enum(["VERIFIED", "NEEDS_REVIEW", "CONFLICT", "REJECTED"]),
  verified_answer: z.string().optional().nullable(),
  has_direct_evidence: z.boolean(),
  evidence_quote: z.string().optional().nullable(),
  matched_source_id: z.string().optional().nullable(),
  explanation: z.string().optional().nullable(),
  confidence: z.number().min(0).max(1),
  is_numerical_or_dosage: z.boolean(),
  numerical_data_confirmed: z.boolean(),
  conflict_details: z.string().optional().nullable(),
});

const VERIFICATION_SYSTEM_PROMPT = `You are a clinical nursing academic verification auditor.
Your job is to solve and verify an exam question using ONLY the provided faculty-uploaded teaching materials. These materials, including textbooks, lectures, slides and summaries, are approved sources. An answer printed in the exam is supplied by the faculty; an unanswered question must be solved from the teaching evidence. A generated candidate answer is untrusted and must be checked independently.

STRICT RULES:
1. DO NOT GUESS OR INVENT ANSWERS. Do not rely on general pretraining knowledge if the provided curriculum excerpts do not explicitly state or directly imply the clinical fact.
2. If the excerpts do NOT provide conclusive evidence:
   - status must be "NEEDS_REVIEW".
   - verified_answer must be null.
   - confidence must be low (< 0.6).
3. If an extracted answer was provided with the question:
   - candidateOrigin=generated means an AI proposed it; independently solve before accepting it.
   - If the teaching evidence agrees: status = "VERIFIED".
   - If the teaching evidence CONTRADICTS the extracted answer:
     - status must be "CONFLICT".
     - Explain the discrepancy clearly in conflict_details.
     - Cite the exact textbook quote that disproves the extracted answer.
4. MEDICAL NUMERICAL DATA RULE:
   - Any dosage, lab value (e.g. Potassium 3.5-5.0 mEq/L), infusion rate, clinical percentage, or normal range MUST have explicit, direct support in the quote. If not confirmed, mark NEEDS_REVIEW.
5. Exact Evidence:
   - Provide the exact continuous quote from the matched source (Source S1, S2...) that confirms the answer.
6. Return only the required JSON schema.`;

const normalizeQuote = (value: string) => value.normalize("NFC").replace(/\s+/g, " ").trim();

export function validQuestionEvidence(sourceContent: string, quote: string | null | undefined): boolean {
  const normalized = normalizeQuote(quote ?? "");
  return normalized.length >= 8 && normalizeQuote(sourceContent).includes(normalized);
}

/**
 * Searches curriculum documents (Books, Lectures, Official Material) for the question.
 */
async function retrieveCurriculumEvidence(
  subjectId: string,
  questionText: string,
  options: string[]
): Promise<Array<{
  chunkId: string;
  documentId: string;
  documentTitle: string;
  sourceType: string;
  priority: number;
  pageNumber: number | null;
  content: string;
  similarity: number;
}>> {
  const pool = getPool();
  const queryText = `${questionText} ${options.slice(0, 4).join(" ")}`.slice(0, 1000);

  try {
    // 1. Generate embedding for question
    let queryEmbedding: number[] = [];
    const config = getAIConfig();
    let embeddingProvider = config.provider;
    let embeddingModel = config.embeddingModel;
    try {
      const aiProvider = getAIProvider();
      const embResult = await aiProvider.createEmbeddings([queryText]);
      if (embResult.length && embResult[0].embedding.length) {
        queryEmbedding = embResult[0].embedding;
        embeddingProvider = aiProvider.name;
        embeddingModel = embResult[0].model;
      }
    } catch (err) {
      console.warn("[QuestionVerifier] Embedding retrieval error, using lexical fallback:", err);
    }

    const hasEmbedding = queryEmbedding.length > 0;
    const safeSearchText = searchTerms(questionText);

    let sql = "";
    let params: unknown[] = [];

    if (hasEmbedding) {
      sql = `
        WITH candidates AS (
          SELECT
            dc.id AS chunk_id,
            dc.document_id,
            d.title AS doc_title,
            d.source_type,
            dc.page_number,
            dc.content,
            CASE WHEN dc.embedding_provider = $4 AND dc.embedding_model = $5
              AND dc.embedding_dimensions = cardinality($2::double precision[])
              THEN public.cosine_similarity(dc.embedding, $2::double precision[])
              ELSE NULL END AS similarity,
            ts_rank_cd(dc.search_vector, to_tsquery('simple', $3)) AS text_score
          FROM public.document_chunks dc
          JOIN public.documents d ON d.id = dc.document_id
          WHERE d.subject_id = $1
            AND d.status = 'ready'
            AND upper(d.source_type) NOT IN ('PAST_EXAM', 'QUESTION_BANK', 'QUESTIONS')
            AND ((dc.embedding_provider = $4 AND dc.embedding_model = $5
              AND dc.embedding_dimensions = cardinality($2::double precision[]))
              OR ($3 <> '' AND dc.search_vector @@ to_tsquery('simple', $3)))
        )
        SELECT *
        FROM candidates
        WHERE similarity > 0.25 OR text_score > 0
        ORDER BY coalesce(similarity, 0) + text_score DESC, chunk_id
        LIMIT 10;
      `;
      params = [subjectId, queryEmbedding, safeSearchText, embeddingProvider, embeddingModel];
    } else {
      sql = `
        WITH candidates AS (
          SELECT
            dc.id AS chunk_id,
            dc.document_id,
            d.title AS doc_title,
            d.source_type,
            dc.page_number,
            dc.content,
            0.5::double precision AS similarity,
            ts_rank_cd(dc.search_vector, to_tsquery('simple', $2)) AS text_score
          FROM public.document_chunks dc
          JOIN public.documents d ON d.id = dc.document_id
          WHERE d.subject_id = $1
            AND d.status = 'ready'
            AND upper(d.source_type) NOT IN ('PAST_EXAM', 'QUESTION_BANK', 'QUESTIONS')
        )
        SELECT *
        FROM candidates
        WHERE text_score > 0
        ORDER BY text_score DESC, chunk_id
        LIMIT 10;
      `;
      params = [subjectId, safeSearchText];
    }

    const { rows } = await pool.query<{
      chunk_id: string;
      document_id: string;
      doc_title: string;
      source_type: string;
      page_number: number | null;
      content: string;
      similarity: number;
    }>(sql, params);

    return rows.map((r) => ({
      chunkId: r.chunk_id,
      documentId: r.document_id,
      documentTitle: r.doc_title,
      sourceType: r.source_type,
      priority: getSourcePriority(r.source_type),
      pageNumber: r.page_number,
      content: r.content,
      similarity: Number(r.similarity) || 0,
    }));
  } catch (err) {
    console.error("[QuestionVerifier] retrieveCurriculumEvidence error:", err);
    return [];
  }
}

/**
 * Strict verification of an exam question against official curriculum evidence.
 * Does NOT hardcode OpenAI; uses the multi-provider AI Router with COMPLEX reasoning.
 */
export async function verifyExamQuestion(input: {
  subjectId: string;
  questionText: string;
  questionType: string;
  options: string[];
  extractedAnswer?: string | null;
  answerOrigin?: "exam" | "generated";
  examYear?: number | null;
}): Promise<VerificationResult> {
  try {
    const candidates = await retrieveCurriculumEvidence(
      input.subjectId,
      input.questionText,
      input.options
    );

    // If no curriculum evidence found at all, cannot verify -> mark NEEDS_REVIEW
    if (!candidates.length) {
      return {
        status: "NEEDS_REVIEW",
        verifiedAnswer: null,
        explanation: "لم يتم العثور على شواهد كافية في الكتب والمحاضرات الرسمية لتأكيد الإجابة دون تخمين.",
        confidence: 0.3,
        evidence: [],
        conflictDetails: null,
      };
    }

    // Format evidence packages for LLM
    const evidencePayload = candidates.map((c, i) => ({
      sourceId: `S${i + 1}`,
      documentTitle: c.documentTitle,
      sourceType: c.sourceType,
      pageNumber: c.pageNumber,
      priority: c.priority,
      content: c.content.slice(0, 3000),
    }));

    // Route to the strongest available provider (e.g. OpenAI complex or Gemini flash fallback)
    const route = routeAIRequest({
      feature: "question_verification",
      complexity: "COMPLEX",
    });

    const primary = getProviderByName(route.provider);
    const fallbacks = route.fallbackProviders.map(getProviderByName);

    const executed = await executeWithFallback({
      primaryProvider: primary,
      fallbackProviders: fallbacks,
      operation: (p) =>
        p.generateText({
          taskPrompt: VERIFICATION_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: JSON.stringify({
                question: input.questionText,
                questionType: input.questionType,
                options: input.options,
                candidateAnswer: input.extractedAnswer || null,
                candidateOrigin: input.answerOrigin ?? "exam",
                examYear: input.examYear || null,
                curriculumEvidenceExcerpts: evidencePayload,
              }),
            },
          ],
          jsonSchema: {
            name: "question_verification",
            schema: z.toJSONSchema(verificationResponseSchema),
          },
          maxOutputTokens: 3000,
        }),
      operationName: "Verify Exam Question",
    });

    const parsedJson = JSON.parse(extractJson(executed.result.content));
    const validated = verificationResponseSchema.parse(parsedJson);

    // If numerical data was detected but not confirmed in the text, force NEEDS_REVIEW
    let finalStatus: QuestionVerificationStatus = validated.status;
    if (validated.is_numerical_or_dosage && !validated.numerical_data_confirmed) {
      finalStatus = "NEEDS_REVIEW";
    }

    // Match back evidence source
    const evidenceList: VerificationEvidence[] = [];
    if (validated.matched_source_id) {
      const matchIdx = parseInt(validated.matched_source_id.replace(/^S/i, ""), 10) - 1;
      const matchedSource = candidates[matchIdx];
      if (matchedSource && validQuestionEvidence(matchedSource.content.slice(0, 3000), validated.evidence_quote)) {
        evidenceList.push({
          documentId: matchedSource.documentId,
          chunkId: matchedSource.chunkId,
          pageNumber: matchedSource.pageNumber,
          quote: validated.evidence_quote!,
          sourceType: matchedSource.sourceType,
          sourcePriority: matchedSource.priority,
          supportType: finalStatus === "CONFLICT" ? "CONFLICTING" : "DIRECT",
        });
      }
    }

    // If no direct evidence was matched, status cannot be VERIFIED
    if (finalStatus === "VERIFIED" && (!evidenceList.length || !validated.has_direct_evidence || !validated.verified_answer?.trim())) {
      finalStatus = "NEEDS_REVIEW";
    }

    return {
      status: finalStatus,
      verifiedAnswer: finalStatus === "VERIFIED" ? validated.verified_answer : null,
      explanation: validated.explanation || null,
      confidence: validated.confidence,
      evidence: evidenceList,
      conflictDetails: validated.conflict_details || null,
    };
  } catch (err) {
    console.error("[QuestionVerifier] Verification error:", err);
    return {
      status: "NEEDS_REVIEW",
      verifiedAnswer: null,
      explanation: "تعذر إكمال فحص الأدلة تلقائيًا؛ لم يُعتمد جواب لهذا السؤال.",
      confidence: 0.2,
      evidence: [],
      conflictDetails: null,
    };
  }
}
