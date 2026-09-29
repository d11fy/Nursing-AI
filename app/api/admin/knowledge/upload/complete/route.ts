import { NextResponse } from "next/server";
import { getAdminProfileOrNull } from "@/lib/auth";
import { getPool } from "@/lib/db/pool";

export async function POST(request: Request) {
  try {
    const admin = await getAdminProfileOrNull();
    if (!admin) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { uploadId } = await request.json();
    if (!uploadId || typeof uploadId !== "string") {
      return NextResponse.json({ error: "معرّف الرفع مطلوب" }, { status: 400 });
    }

    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, admin_id, file_name, file_size, mime_type, total_chunks,
              title, subject_id, source_type, storage_path, status, document_id, metadata_json
       FROM public.knowledge_upload_sessions
       WHERE id = $1 AND admin_id = $2`,
      [uploadId, admin.user_id]
    );

    if (!rows.length) {
      return NextResponse.json({ error: "جلسة الرفع غير موجودة" }, { status: 404 });
    }

    const session = rows[0];
    const meta = (session.metadata_json as Record<string, unknown>) || {};

    // Verify all chunks are accounted for
    const chunkCheck = await pool.query(
      "SELECT count(*)::int AS count FROM public.knowledge_document_chunks WHERE path = $1",
      [session.storage_path]
    );
    const uploadedCount = chunkCheck.rows[0]?.count ?? 0;

    if (uploadedCount < session.total_chunks) {
      return NextResponse.json(
        {
          error: `لم يكتمل رفع جميع أجزاء الملف (${uploadedCount} من ${session.total_chunks})`,
          missingChunks: true,
        },
        { status: 400 }
      );
    }

    // Insert or reuse document record in public.documents
    let documentId = session.document_id;
    if (!documentId) {
      const docRes = await pool.query(
        `INSERT INTO public.documents (
          title, file_url, file_name, file_size, subject_id,
          source_type, status, created_by,
          academic_year_id, semester, exam_year, doctor_name, exam_type, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, 'processing', $7, $8, $9, $10, $11, $12, $13)
        RETURNING id`,
        [
          session.title,
          session.storage_path,
          session.file_name,
          session.file_size,
          session.subject_id,
          session.source_type,
          admin.user_id,
          meta.academicYearId || null,
          meta.semester || null,
          meta.examYear || null,
          meta.doctorName || null,
          meta.examType || null,
          meta.notes || null,
        ]
      );
      documentId = docRes.rows[0].id;
    } else {
      await pool.query(
        `UPDATE public.documents
         SET status = 'processing',
             academic_year_id = coalesce($2, academic_year_id),
             semester = coalesce($3, semester),
             exam_year = coalesce($4, exam_year),
             doctor_name = coalesce($5, doctor_name),
             exam_type = coalesce($6, exam_type),
             notes = coalesce($7, notes),
             updated_at = now()
         WHERE id = $1`,
        [
          documentId,
          meta.academicYearId || null,
          meta.semester || null,
          meta.examYear || null,
          meta.doctorName || null,
          meta.examType || null,
          meta.notes || null,
        ]
      );
    }

    // Insert a stub in stored_files so any legacy references or integrity queries are satisfied
    await pool.query(
      `INSERT INTO public.stored_files (path, bucket, owner_id, mime_type, content)
       VALUES ($1, 'knowledge-documents', $2, $3, E''::bytea)
       ON CONFLICT (path) DO NOTHING`,
      [session.storage_path, admin.user_id, session.mime_type]
    );

    // Update upload session
    await pool.query(
      `UPDATE public.knowledge_upload_sessions
       SET status = 'completed', document_id = $1, updated_at = now()
       WHERE id = $2`,
      [documentId, uploadId]
    );

    return NextResponse.json({
      success: true,
      documentId,
      message: "اكتمل الرفع بنجاح",
    });
  } catch (err) {
    console.error("[LargeUpload] Complete error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء إنهاء عملية الرفع" },
      { status: 500 }
    );
  }
}
