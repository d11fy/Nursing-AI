import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getAdminProfileOrNull } from "@/lib/auth";
import { getPool } from "@/lib/db/pool";
import { documentUploadSchema } from "@/lib/validations/admin";

const ALLOWED_EXTENSIONS = new Set(["pdf", "txt", "docx", "doc", "pptx", "ppt", "xlsx", "xls", "csv", "md"]);
const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per chunk

export async function POST(request: Request) {
  try {
    const admin = await getAdminProfileOrNull();
    if (!admin) {
      return NextResponse.json({ error: "غير مصرح، يجب تسجيل الدخول كمسؤول" }, { status: 403 });
    }

    const body = await request.json();
    const { fileName, fileSize, mimeType, totalChunks } = body;

    const parsed = documentUploadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "بيانات الملف غير صالحة" },
        { status: 400 }
      );
    }

    if (!fileName || typeof fileName !== "string") {
      return NextResponse.json({ error: "اسم الملف مطلوب" }, { status: 400 });
    }

    const ext = fileName.split(".").pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: "نوع الملف غير مدعوم. الصيغ المدعومة: PDF, DOCX, PPTX, TXT, XLSX" },
        { status: 400 }
      );
    }

    if (!fileSize || typeof fileSize !== "number" || fileSize <= 0) {
      return NextResponse.json({ error: "حجم الملف غير صالح" }, { status: 400 });
    }

    const chunksCount = Number(totalChunks);
    if (!chunksCount || chunksCount < 1) {
      return NextResponse.json({ error: "عدد أجزاء الملف غير صالح" }, { status: 400 });
    }

    const storagePath = `knowledge/${randomUUID()}`;
    const pool = getPool();

    // Verify subject exists
    const subjectCheck = await pool.query("SELECT id FROM public.subjects WHERE id=$1", [parsed.data.subjectId]);
    if (!subjectCheck.rows.length) {
      return NextResponse.json({ error: "المادة الدراسية المحددة غير موجودة" }, { status: 404 });
    }

    const { rows } = await pool.query(
      `INSERT INTO public.knowledge_upload_sessions (
        admin_id, file_name, file_size, mime_type, total_chunks,
        title, subject_id, source_type, storage_path, status, metadata_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'uploading', $10::jsonb)
      RETURNING id, storage_path, total_chunks`,
      [
        admin.user_id,
        fileName,
        fileSize,
        mimeType || "application/octet-stream",
        chunksCount,
        parsed.data.title,
        parsed.data.subjectId,
        parsed.data.sourceType,
        storagePath,
        JSON.stringify({
          academicYearId: parsed.data.academicYearId || null,
          resourceCategory: parsed.data.resourceCategory,
          description: parsed.data.description || null,
          language: parsed.data.language || null,
          sourceLabel: parsed.data.sourceLabel || null,
          visibilityScope: parsed.data.visibilityScope,
          sortOrder: parsed.data.sortOrder,
          priority:parsed.data.priority??null,
          semester: parsed.data.semester || null,
          examYear: parsed.data.examYear || null,
          doctorName: parsed.data.doctorName || null,
          examType: parsed.data.examType || null,
          notes: parsed.data.notes || null,
        }),
      ]
    );

    const session = rows[0];

    return NextResponse.json({
      uploadId: session.id,
      storagePath: session.storage_path,
      totalChunks: session.total_chunks,
      chunkSize: CHUNK_SIZE,
    });
  } catch (err) {
    console.error("[LargeUpload] Init error:", err);
    return NextResponse.json(
      { error: "تعذر بدء جلسة الرفع. يرجى المحاولة مرة أخرى." },
      { status: 500 }
    );
  }
}
