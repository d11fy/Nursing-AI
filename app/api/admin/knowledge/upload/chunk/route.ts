import { NextResponse } from "next/server";
import { getAdminProfileOrNull } from "@/lib/auth";
import { getPool } from "@/lib/db/pool";
import { saveKnowledgeChunk } from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const admin = await getAdminProfileOrNull();
    if (!admin) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const formData = await request.formData();
    const uploadId = formData.get("uploadId");
    const chunkIndexStr = formData.get("chunkIndex");
    const chunkFile = formData.get("chunk");

    if (!uploadId || typeof uploadId !== "string") {
      return NextResponse.json({ error: "معرّف الرفع مطلوب" }, { status: 400 });
    }

    const chunkIndex = Number(chunkIndexStr);
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
      return NextResponse.json({ error: "رقم الجزء غير صالح" }, { status: 400 });
    }

    if (!(chunkFile instanceof Blob)) {
      return NextResponse.json({ error: "بيانات الجزء غير موجودة" }, { status: 400 });
    }

    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT storage_path, total_chunks, status
       FROM public.knowledge_upload_sessions
       WHERE id = $1 AND admin_id = $2`,
      [uploadId, admin.user_id]
    );

    if (!rows.length) {
      return NextResponse.json({ error: "جلسة الرفع غير موجودة أو ملغاة" }, { status: 404 });
    }

    const session = rows[0];
    if (session.status !== "uploading") {
      return NextResponse.json(
        { error: `جلسة الرفع في حالة غير صالحة (${session.status})` },
        { status: 400 }
      );
    }

    if (chunkIndex >= session.total_chunks) {
      return NextResponse.json({ error: "رقم الجزء يتجاوز العدد الكلي" }, { status: 400 });
    }

    const chunkBuffer = Buffer.from(await chunkFile.arrayBuffer());
    await saveKnowledgeChunk(session.storage_path, chunkIndex, chunkBuffer);

    // Update session uploaded_chunks count
    const countRes = await pool.query(
      "SELECT count(*)::int AS count FROM public.knowledge_document_chunks WHERE path = $1",
      [session.storage_path]
    );
    const uploadedChunks = countRes.rows[0]?.count ?? 0;

    await pool.query(
      "UPDATE public.knowledge_upload_sessions SET uploaded_chunks = $1, updated_at = now() WHERE id = $2",
      [uploadedChunks, uploadId]
    );

    return NextResponse.json({
      success: true,
      chunkIndex,
      uploadedChunks,
      totalChunks: session.total_chunks,
    });
  } catch (err) {
    console.error("[LargeUpload] Chunk upload error:", err);
    return NextResponse.json(
      { error: "تعذر حفظ جزء الملف. تحقق من الاتصال وحاول مجددًا." },
      { status: 500 }
    );
  }
}
