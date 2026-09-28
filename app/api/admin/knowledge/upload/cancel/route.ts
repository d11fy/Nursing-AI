import { NextResponse } from "next/server";
import { getAdminProfileOrNull } from "@/lib/auth";
import { getPool } from "@/lib/db/pool";
import { deleteKnowledgeChunks } from "@/lib/storage";

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
      `SELECT storage_path, document_id
       FROM public.knowledge_upload_sessions
       WHERE id = $1 AND admin_id = $2`,
      [uploadId, admin.user_id]
    );

    if (rows.length > 0) {
      const { storage_path, document_id } = rows[0];

      // Remove all chunk pieces from database to prevent orphan or corrupted storage
      await deleteKnowledgeChunks(storage_path);

      // Clean up stored_files and documents if any
      await pool.query("DELETE FROM public.stored_files WHERE path=$1", [storage_path]);
      if (document_id) {
        await pool.query("DELETE FROM public.documents WHERE id=$1", [document_id]);
      }

      // Mark or delete session
      await pool.query(
        "UPDATE public.knowledge_upload_sessions SET status = 'cancelled', updated_at = now() WHERE id = $1",
        [uploadId]
      );
    }

    return NextResponse.json({ success: true, message: "تم إلغاء الرفع وحذف الأجزاء المتبقية" });
  } catch (err) {
    console.error("[LargeUpload] Cancel error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء إلغاء الرفع" },
      { status: 500 }
    );
  }
}
