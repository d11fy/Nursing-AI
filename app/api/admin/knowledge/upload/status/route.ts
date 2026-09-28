import { NextResponse } from "next/server";
import { getAdminProfileOrNull } from "@/lib/auth";
import { getPool } from "@/lib/db/pool";
import { getUploadedChunksList } from "@/lib/storage";

export async function GET(request: Request) {
  try {
    const admin = await getAdminProfileOrNull();
    if (!admin) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const uploadId = searchParams.get("uploadId");

    if (!uploadId) {
      return NextResponse.json({ error: "معرّف الرفع مطلوب" }, { status: 400 });
    }

    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, storage_path, total_chunks, uploaded_chunks, status, file_name, file_size
       FROM public.knowledge_upload_sessions
       WHERE id = $1 AND admin_id = $2`,
      [uploadId, admin.user_id]
    );

    if (!rows.length) {
      return NextResponse.json({ error: "جلسة الرفع غير موجودة" }, { status: 404 });
    }

    const session = rows[0];
    const uploadedChunkIndices = await getUploadedChunksList(session.storage_path);

    return NextResponse.json({
      uploadId: session.id,
      fileName: session.file_name,
      fileSize: session.file_size,
      totalChunks: session.total_chunks,
      uploadedChunkIndices,
      status: session.status,
    });
  } catch (err) {
    console.error("[LargeUpload] Status error:", err);
    return NextResponse.json({ error: "تعذر فحص حالة الرفع" }, { status: 500 });
  }
}
