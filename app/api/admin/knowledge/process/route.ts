import { NextResponse } from "next/server";
import { getAdminProfileOrNull } from "@/lib/auth";
import { processDocument } from "@/lib/knowledge";

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

    // Run RAG extraction, chunking, and embedding generation
    await processDocument(documentId);

    return NextResponse.json({
      success: true,
      message: "تم تحليل وتجهيز المحتوى بنجاح وإضافته إلى قاعدة المعرفة والتدريب",
    });
  } catch (err) {
    console.error("[LargeUpload] Processing error:", err);
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
