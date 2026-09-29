import { NextResponse } from "next/server";
import { getAdminProfileOrNull } from "@/lib/auth";
import { getPool } from "@/lib/db/pool";
import { verifyExamQuestion } from "@/lib/exams/question-verifier";

export async function GET(request: Request) {
  try {
    const admin = await getAdminProfileOrNull();
    if (!admin) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const subjectId = searchParams.get("subjectId");
    const status = searchParams.get("status");
    const questionType = searchParams.get("questionType");
    const topic = searchParams.get("topic");
    const examYear = searchParams.get("examYear");
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));

    const pool = getPool();
    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (subjectId) {
      params.push(subjectId);
      whereClauses.push(`eq.subject_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      whereClauses.push(`eq.status = $${params.length}`);
    }
    if (questionType) {
      params.push(questionType);
      whereClauses.push(`eq.question_type = $${params.length}`);
    }
    if (topic) {
      params.push(`%${topic}%`);
      whereClauses.push(`eq.topic ILIKE $${params.length}`);
    }
    if (examYear) {
      params.push(parseInt(examYear, 10));
      whereClauses.push(`e.exam_year = $${params.length}`);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const countQuery = `
      SELECT count(*)::int AS total
      FROM public.exam_questions eq
      LEFT JOIN public.exams e ON e.id = eq.exam_id
      ${whereSql}
    `;
    const { rows: countRows } = await pool.query<{ total: number }>(countQuery, params);
    const total = countRows[0]?.total ?? 0;

    const dataQuery = `
      SELECT
        eq.id, eq.exam_id, eq.subject_id, s.name_ar AS subject_name,
        e.title AS exam_title, e.exam_year,
        eq.question_text, eq.question_type, eq.options_json,
        eq.correct_answer_json, eq.extracted_answer, eq.explanation,
        eq.topic, eq.subtopic, eq.difficulty, eq.difficulty_estimate,
        eq.status, eq.confidence, eq.page_number, eq.question_number,
        eq.review_notes, eq.reviewed_at, eq.created_at,
        coalesce(
          (
            SELECT json_agg(
              json_build_object(
                'id', qs.id,
                'documentId', qs.document_id,
                'documentTitle', d.title,
                'pageNumber', qs.page_number,
                'quote', qs.quote,
                'supportType', qs.support_type,
                'sourcePriority', qs.source_priority
              )
            )
            FROM public.question_sources qs
            JOIN public.documents d ON d.id = qs.document_id
            WHERE qs.question_id = eq.id
          ),
          '[]'::json
        ) AS sources
      FROM public.exam_questions eq
      JOIN public.subjects s ON s.id = eq.subject_id
      LEFT JOIN public.exams e ON e.id = eq.exam_id
      ${whereSql}
      ORDER BY eq.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const { rows } = await pool.query(dataQuery, [...params, limit, offset]);

    return NextResponse.json({
      total,
      limit,
      offset,
      questions: rows,
    });
  } catch (err) {
    console.error("[QuestionBankAPI] GET error:", err);
    return NextResponse.json({ error: "تعذر جلب بنك الأسئلة" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await getAdminProfileOrNull();
    if (!admin) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const body = await request.json();
    const { questionId, action, questionText, options, correctAnswer, reviewNotes } = body;

    if (!questionId) {
      return NextResponse.json({ error: "معرّف السؤال مطلوب" }, { status: 400 });
    }

    const pool = getPool();
    const { rows: existing } = await pool.query<{
      id: string;
      subject_id: string;
      exam_id: string | null;
      question_text: string;
      question_type: string;
      options_json: unknown;
      status: string;
    }>(
      `SELECT id, subject_id, exam_id, question_text, question_type, options_json, status
       FROM public.exam_questions WHERE id = $1`,
      [questionId]
    );

    if (!existing.length) {
      return NextResponse.json({ error: "السؤال غير موجود" }, { status: 404 });
    }

    const q = existing[0];

    // Case 1: Manual Edit (e.g. OCR text correction)
    // Rule 39: If text edited, re-verify ONLY this question, not the full exam.
    if (action === "EDIT" && questionText) {
      const opts = options || (Array.isArray(q.options_json) ? q.options_json : []);
      const reVerification = await verifyExamQuestion({
        subjectId: q.subject_id,
        questionText,
        questionType: q.question_type,
        options: opts,
        extractedAnswer: correctAnswer || null,
      });

      await pool.query(
        `UPDATE public.exam_questions
         SET question_text = $2,
             options_json = $3::jsonb,
             correct_answer_json = coalesce($4::jsonb, correct_answer_json),
             status = $5,
             confidence = $6,
             review_notes = $7,
             reviewed_by = $8,
             reviewed_at = now(),
             updated_at = now()
         WHERE id = $1`,
        [
          questionId,
          questionText,
          JSON.stringify(opts),
          correctAnswer ? JSON.stringify(correctAnswer) : (reVerification.verifiedAnswer ? JSON.stringify(reVerification.verifiedAnswer) : null),
          reVerification.status,
          reVerification.confidence,
          reviewNotes || "تم تعديل النص وإعادة التحقق من المصادر",
          admin.user_id,
        ]
      );

      // Refresh question sources
      await pool.query(`DELETE FROM public.question_sources WHERE question_id = $1`, [questionId]);
      for (const ev of reVerification.evidence) {
        await pool.query(
          `INSERT INTO public.question_sources (
             question_id, document_id, chunk_id, page_number, quote, support_type, source_priority
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

      // Log edit
      await pool.query(
        `INSERT INTO public.exam_audit_logs (subject_id, exam_id, question_id, user_id, event_type, details_json)
         VALUES ($1, $2, $3, $4, 'QUESTION_EDITED', $5::jsonb)`,
        [q.subject_id, q.exam_id, questionId, admin.user_id, JSON.stringify({ oldText: q.question_text, newText: questionText, newStatus: reVerification.status })]
      );

      return NextResponse.json({
        success: true,
        message: "تم تعديل السؤال وإعادة التحقق منه بنجاح",
        status: reVerification.status,
      });
    }

    // Case 2: APPROVE Question
    if (action === "APPROVE") {
      await pool.query(
        `UPDATE public.exam_questions
         SET status = 'VERIFIED',
             correct_answer_json = coalesce($2::jsonb, correct_answer_json),
             review_notes = $3,
             reviewed_by = $4,
             reviewed_at = now(),
             updated_at = now()
         WHERE id = $1`,
        [questionId, correctAnswer ? JSON.stringify(correctAnswer) : null, reviewNotes || "تم الاعتماد يدويًا بواسطة المشرف", admin.user_id]
      );

      await pool.query(
        `INSERT INTO public.exam_audit_logs (subject_id, exam_id, question_id, user_id, event_type, details_json)
         VALUES ($1, $2, $3, $4, 'QUESTION_APPROVED', $5::jsonb)`,
        [q.subject_id, q.exam_id, questionId, admin.user_id, JSON.stringify({ reviewNotes })]
      );

      return NextResponse.json({ success: true, message: "تم اعتماد السؤال بنجاح" });
    }

    // Case 3: REJECT Question
    if (action === "REJECT") {
      await pool.query(
        `UPDATE public.exam_questions
         SET status = 'REJECTED',
             review_notes = $2,
             reviewed_by = $3,
             reviewed_at = now(),
             updated_at = now()
         WHERE id = $1`,
        [questionId, reviewNotes || "تم رفض السؤال بواسطة المشرف", admin.user_id]
      );

      await pool.query(
        `INSERT INTO public.exam_audit_logs (subject_id, exam_id, question_id, user_id, event_type, details_json)
         VALUES ($1, $2, $3, $4, 'QUESTION_REJECTED', $5::jsonb)`,
        [q.subject_id, q.exam_id, questionId, admin.user_id, JSON.stringify({ reviewNotes })]
      );

      return NextResponse.json({ success: true, message: "تم استبعاد السؤال" });
    }

    // Case 4: MARK NEEDS_REVIEW
    if (action === "NEEDS_REVIEW") {
      await pool.query(
        `UPDATE public.exam_questions
         SET status = 'NEEDS_REVIEW',
             review_notes = $2,
             reviewed_by = $3,
             reviewed_at = now(),
             updated_at = now()
         WHERE id = $1`,
        [questionId, reviewNotes || "تم وضع علامة للمراجعة", admin.user_id]
      );

      return NextResponse.json({ success: true, message: "تم تعيين السؤال للمراجعة" });
    }

    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
  } catch (err) {
    console.error("[QuestionBankAPI] PATCH error:", err);
    return NextResponse.json({ error: "تعذر تحديث السؤال" }, { status: 500 });
  }
}
