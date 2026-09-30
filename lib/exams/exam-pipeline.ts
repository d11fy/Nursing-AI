import "server-only";
import {workerDb} from "@/lib/tutor/db";
import {structureChunks} from "@/lib/tutor/chunking";
import { getPool } from "@/lib/db/pool";
import { parseExamPage } from "./exam-parser";
import { verifyExamQuestion } from "./question-verifier";
import { assignQuestionToCluster } from "./cluster-service";
import { syncExamTopicStats } from "./analytics-service";

export interface ExamProcessingProgress {
  examId: string;
  status: "UPLOADED" | "EXTRACTING" | "PROCESSING" | "VERIFYING" | "READY" | "FAILED";
  totalQuestions: number;
  verifiedQuestions: number;
  needsReviewQuestions: number;
  conflictQuestions: number;
  currentStepMessage: string;
}

/**
 * Full autonomous background processing pipeline for an Exam or Question Bank document.
 */
export async function processExamDocument(
  examId: string,
  onProgress?: (progress: ExamProcessingProgress) => void
): Promise<void> {
  const pool = getPool();

  // 1. Fetch exam and associated document record
  const { rows } = await pool.query<{
    id: string;
    subject_id: string;
    title: string;
    exam_year: number | null;
    exam_type: string;
    document_id: string;
    file_url: string;
    file_name: string;
    source_type: string;
    file_hash: string | null;
    created_by:string;processing_hash:string|null;status:string;
  }>(
    `SELECT
       e.id, e.subject_id, e.title, e.exam_year, e.exam_type, e.document_id,
       d.file_url, d.file_name, d.source_type, d.file_hash, d.created_by, e.processing_hash, e.status
     FROM public.exams e
     JOIN public.documents d ON d.id = e.document_id
     WHERE e.id = $1`,
    [examId]
  );

  if (!rows.length) {
    throw new Error(`Exam not found: ${examId}`);
  }

  const exam = rows[0];

  try {
    // Update status to EXTRACTING
    await pool.query(
      `UPDATE public.exams SET status = 'EXTRACTING', error_message = null, updated_at = now() WHERE id = $1`,
      [examId]
    );

    // Audit log
    await pool.query(
      `INSERT INTO public.exam_audit_logs (subject_id, exam_id, event_type, details_json)
       VALUES ($1, $2, 'EXAM_UPLOADED', $3::jsonb)`,
      [exam.subject_id, exam.id, JSON.stringify({ title: exam.title, exam_year: exam.exam_year })]
    );

    // Reuse the saved extraction, including visual pages, after original expiry.
    const canonical=(await workerDb.query<{extracted_pages_json:Array<{pageNumber:number|null;text:string}>;file_hash:string}>("select extracted_pages_json,file_hash from knowledge_documents where legacy_document_id=$1 and owner_id is null and status='ready'",[exam.document_id])).rows[0];
    if(!canonical)throw new Error('افهرس مصدر الامتحان في مركز المعرفة أولًا');
    const pages=canonical.extracted_pages_json,contentHash=`exam-v2:${canonical.file_hash}`;
    if(exam.status==='READY'&&exam.processing_hash===contentHash){await pool.query("update exams set status='READY' where id=$1",[examId]);return;}
    if (!pages.length) {
      throw new Error("لم يتم العثور على محتوى نصي داخل ملف الامتحان");
    }

    // 3. Segment and detect questions across pages
    await pool.query(
      `UPDATE public.exams SET status = 'PROCESSING', updated_at = now() WHERE id = $1`,
      [examId]
    );

    const allParsedQuestions: Array<ReturnType<typeof parseExamPage> extends Promise<infer U> ? (U extends Array<infer Q> ? Q : never) : never> = [];

    // Parse each page
    for (const page of pages) {
      for(const segment of structureChunks(page.text,800,900)){
        const pageQuestions=await parseExamPage(segment.content,page.pageNumber,exam.title,exam.created_by);
        allParsedQuestions.push(...pageQuestions);
      }
    }

    if (!allParsedQuestions.length) {
      throw new Error("لم يتم العثور على أسئلة قابلة للقراءة في هذا الامتحان. تأكد من وضوح الملف.");
    }

    // Update status to VERIFYING
    await pool.query(
      `UPDATE public.exams
       SET status = 'VERIFYING', total_questions = $2, updated_at = now()
       WHERE id = $1`,
      [examId, allParsedQuestions.length]
    );

    // Audit log
    await pool.query(
      `INSERT INTO public.exam_audit_logs (subject_id, exam_id, event_type, details_json)
       VALUES ($1, $2, 'QUESTION_EXTRACTED', $3::jsonb)`,
      [exam.subject_id, exam.id, JSON.stringify({ count: allParsedQuestions.length })]
    );

    let verifiedCount = 0;
    let needsReviewCount = 0;
    let conflictCount = 0;

    // Preserve question IDs and existing student attempts during retries.
    const existing=(await pool.query<{question_text:string}>("select question_text from exam_questions where exam_id=$1",[examId])).rows;
    const known=new Set(existing.map(q=>q.question_text));

    // 4. Verify each question strictly against curriculum sources
    for (const [idx, q] of allParsedQuestions.entries()) {
      try {
        if(known.has(q.question_text))continue;
        known.add(q.question_text);
        const verification = await verifyExamQuestion({
          userId:exam.created_by,subjectId: exam.subject_id,
          questionText: q.question_text,
          questionType: q.question_type,
          options: q.options,
          extractedAnswer: q.extracted_answer,
          examYear: exam.exam_year,
        });

        if (verification.status === "VERIFIED") verifiedCount++;
        else if (verification.status === "CONFLICT") conflictCount++;
        else needsReviewCount++;

        // Insert question record into exam_questions
        const { rows: insertedQ } = await pool.query<{ id: string }>(
          `INSERT INTO public.exam_questions (
             exam_id, subject_id, question_text, question_type, options_json,
             correct_answer_json, extracted_answer, explanation, topic, subtopic,
             difficulty, difficulty_estimate, status, confidence, page_number,
             source_document_id, question_number
           ) VALUES (
             $1, $2, $3, $4, $5::jsonb,
             $6::jsonb, $7, $8, $9, $10,
             $11, $12, $13, $14, $15,
             $16, $17
           ) RETURNING id`,
          [
            exam.id,
            exam.subject_id,
            q.question_text,
            q.question_type,
            JSON.stringify(q.options || []),
            verification.verifiedAnswer ? JSON.stringify(verification.verifiedAnswer) : null,
            q.extracted_answer || null,
            verification.explanation || q.explanation || null,
            q.topic || "General Nursing",
            q.subtopic || null,
            (q.difficulty_estimate ?? 0.5) > 0.7 ? "HARD" : (q.difficulty_estimate ?? 0.5) < 0.4 ? "EASY" : "MEDIUM",
            Math.min(0.99, Math.max(0.1, q.difficulty_estimate ?? 0.5)),
            verification.status,
            Math.min(0.99, Math.max(0.1, verification.confidence ?? 0.5)),
            q.page_number || null,
            exam.document_id,
            q.question_number || idx + 1,
          ]
        );

        if (insertedQ.length) {
          const questionId = insertedQ[0].id;

          // Insert question_sources
          for (const ev of verification.evidence) {
            await pool.query(
              `INSERT INTO public.question_sources (
                 question_id, document_id, knowledge_chunk_id, page_number, quote, support_type, source_priority
               ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                questionId,
                ev.documentId,
                ev.chunkId,
                ev.pageNumber,
                ev.quote,
                ev.supportType,
                ev.sourcePriority,
              ]
            );
          }

          // If conflict detected, record in audit logs
          if (verification.status === "CONFLICT") {
            await pool.query(
              `INSERT INTO public.exam_audit_logs (subject_id, exam_id, question_id, event_type, details_json)
               VALUES ($1, $2, $3, 'CONFLICT_DETECTED', $4::jsonb)`,
              [
                exam.subject_id,
                exam.id,
                questionId,
                JSON.stringify({
                  extractedAnswer: q.extracted_answer,
                  conflictDetails: verification.conflictDetails,
                }),
              ]
            );
          }

          // 5. Cluster question to track recurrence
          await assignQuestionToCluster(
            questionId,
            exam.subject_id,
            q.question_text,
            q.topic || "General Nursing",
            exam.exam_year
          );
        }
      } catch (qErr) {
        console.error(`[ExamPipeline] Error processing question ${idx + 1} of exam ${examId}:`, qErr);
        needsReviewCount++;
      }
    }

    const counts=(await pool.query<{verified:number;review:number;conflict:number;total:number}>(`select count(*)::int total,count(*) filter(where status='VERIFIED')::int verified,count(*) filter(where status='NEEDS_REVIEW')::int review,count(*) filter(where status='CONFLICT')::int conflict from exam_questions where exam_id=$1`,[examId])).rows[0];
    verifiedCount=counts.verified;needsReviewCount=counts.review;conflictCount=counts.conflict;
    await pool.query('update exams set total_questions=$2 where id=$1',[examId,counts.total]);
    // 6. Mark exam READY and update counts
    await pool.query(
      `UPDATE public.exams
       SET status = 'READY',
           verified_questions = $2,
           needs_review_questions = $3,
           conflict_questions = $4,
           error_message = null,processing_hash=$5,
           updated_at = now()
       WHERE id = $1`,
      [examId, verifiedCount, needsReviewCount, conflictCount,contentHash]
    );

    // 7. Sync topic recurrence statistics
    await syncExamTopicStats(exam.subject_id);
  } catch (err) {
    console.error(`[ExamPipeline] Failed to process exam ${examId}:`, err);
    const msg = err instanceof Error ? err.message : "فشلت معالجة الامتحان";
    await pool.query(
      `UPDATE public.exams SET status = 'FAILED', error_message = $2, updated_at = now() WHERE id = $1`,
      [examId, msg]
    );
    throw err;
  }
}
