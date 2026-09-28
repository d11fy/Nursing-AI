import { NextResponse } from "next/server";
import { getAdminProfileOrNull } from "@/lib/auth";
import { processDocument } from "@/lib/knowledge";
import { getPool } from "@/lib/db/pool";

export async function GET(request: Request) {
  try {
    const admin = await getAdminProfileOrNull();
    if (!admin) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get("documentId");
    if (!documentId) {
      return NextResponse.json({ error: "معرّف المستند مطلوب" }, { status: 400 });
    }

    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT id, status, chunk_count, error_message FROM public.documents WHERE id=$1",
      [documentId]
    );

    if (!rows.length) {
      return NextResponse.json({ error: "المستند غير موجود" }, { status: 404 });
    }

    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("[LargeUpload] Process status poll error:", err);
    return NextResponse.json({ error: "تعذر التحقق من حالة المعالجة" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await getAdminProfileOrNull();
    if (!admin) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { documentId } = await request.json();
    if (!documentId || typeof documentId !== "string") {
      return NextResponse.json({ error: "معرّف المستند مطلوب" }, { status: 400 });
    }

    const pool = getPool();
    await pool.query(
      "UPDATE public.documents SET status = 'processing', error_message = null, updated_at = now() WHERE id = $1",
      [documentId]
    );

    // Execute heavy RAG extraction, chunking, and embedding generation in the background.
    // This responds in milliseconds to the client, preventing reverse-proxy 502/504 Bad Gateway timeouts.
    void processDocument(documentId).catch((err) => {
      console.error(`[ProcessDocument] Background error for document ${documentId}:`, err);
    });

    return NextResponse.json({
      success: true,
      status: "processing",
      message: "تم بدء تحليل وتجهيز المحتوى للتدريب في الخلفية بنجاح",
    });
  } catch (err) {
    console.error("[LargeUpload] Processing init error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "تعذر إكمال معالجة الملف وفهرسته للتدريب",
      },
      { status: 500 }
    );
  }
}
