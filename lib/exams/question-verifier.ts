import "server-only";
import { z } from "zod";
import {workerDb} from "@/lib/tutor/db";
import {logUsage} from "@/lib/usage";
import {understandQuery} from "@/lib/tutor/retrieval";
import { routeAIRequest, getProviderByName } from "@/lib/ai/router";
import { executeWithFallback } from "@/lib/ai/fallback";
import { extractJson } from "@/lib/ai/json";
import { getAIProvider } from "@/lib/ai";
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
async function retrieveCurriculumEvidence(subjectId:string,questionText:string,options:string[],userId?:string) {
 const queryText=`${questionText} ${options.slice(0,4).join(' ')}`.slice(0,1500),query=understandQuery(queryText),ai=getAIProvider();
 const embedded=await ai.createEmbedding(queryText);
 if(userId)await logUsage({userId,type:'embedding',feature:'exam_retrieval',provider:'openai',model:embedded.model,inputTokens:embedded.tokens,outputTokens:0,estimatedCost:ai.calculateCost({model:embedded.model,inputTokens:embedded.tokens,outputTokens:0})});
 const rows=(await workerDb.query<{chunk_id:string;document_id:string;doc_title:string;source_type:string;source_priority:number;page_number:number|null;content:string;similarity:number}>(`
 with eligible as materialized (select k.* from knowledge_chunks k join knowledge_documents d on d.id=k.document_id where d.subject_id=$1 and d.owner_id is null and d.is_active and d.status='ready' and d.source_type<>'exam_questions'),
 semantic as(select id,row_number() over(order by embedding <=> $2::vector) n from eligible order by embedding <=> $2::vector limit 25),
 lexical as(select id,row_number() over(order by ts_rank_cd(search_vector,to_tsquery('simple',$3)) desc) n from eligible where $3<>'' and search_vector @@ to_tsquery('simple',$3) limit 25)
 select k.id chunk_id,d.legacy_document_id document_id,d.title doc_title,d.source_type,d.source_priority,k.page_number,k.content,1-(k.embedding <=> $2::vector) similarity
 from eligible k join knowledge_documents d on d.id=k.document_id left join semantic v on v.id=k.id left join lexical l on l.id=k.id
 where (v.id is not null or l.id is not null) and d.legacy_document_id is not null
 order by coalesce(1.0/(60+v.n),0)+coalesce(1.0/(60+l.n),0)+d.source_priority*0.00003 desc limit 10`,[subjectId,`[${embedded.embedding.join(',')}]`,query.lexical])).rows;
 return rows.map(r=>({chunkId:r.chunk_id,documentId:r.document_id,documentTitle:r.doc_title,sourceType:r.source_type,priority:r.source_priority,pageNumber:r.page_number,content:r.content,similarity:r.similarity}));
}

/**
 * Strict verification of an exam question against official curriculum evidence.
 * Uses the shared pgvector index and one GPT-6 Luna Responses request.
 */
export async function verifyExamQuestion(input: {
  userId?: string;
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
      input.options, input.userId
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

    // Use the same main model at high reasoning effort.
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
          maxOutputTokens: 3000,reasoningEffort:"high",feature:"question_verification",
        }),
      operationName: "Verify Exam Question",
    });

    if(input.userId)await logUsage({userId:input.userId,type:'quiz',feature:'question_verification',provider:'openai',model:executed.result.model,inputTokens:executed.result.inputTokens,cachedInputTokens:executed.result.cachedInputTokens,outputTokens:executed.result.outputTokens,reasoningEffort:'high',estimatedCost:primary.calculateCost(executed.result)});
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
