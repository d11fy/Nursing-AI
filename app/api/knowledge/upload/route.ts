import { limitedFormData } from "@/lib/request-body";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { getAdminProfileOrNull } from "@/lib/auth";
import { uploadKnowledgeDocument } from "@/lib/storage";
import { processDocument } from "@/lib/knowledge";
import { documentUploadSchema } from "@/lib/validations/admin";

const ALLOWED_EXTENSIONS = ["pdf", "txt", "docx"];

export async function POST(request: Request) {
  const admin = await getAdminProfileOrNull();
  if (!admin) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  const db = await createClient();

  let formData: FormData;
  try {
    formData = await limitedFormData(request, 11 * 1024 * 1024);
  } catch {
    return NextResponse.json({ error: "حجم الملف كبير جدًا أو الطلب غير صالح" }, { status: 413 });
  }
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "لم يتم إرفاق ملف" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json({ error: "نوع الملف غير مدعوم" }, { status: 400 });
  }

  const parsed = documentUploadSchema.safeParse({
    title: formData.get("title"),
    subjectId: formData.get("subjectId"),
    sourceType: formData.get("sourceType"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" },
      { status: 400 }
    );
  }

  try {
    const { path } = await uploadKnowledgeDocument(db, file);

    const { data: document, error } = await db
      .from("documents")
      .insert({
        title: parsed.data.title,
        file_url: path,
        file_name: file.name,
        file_size: file.size,
        subject_id: parsed.data.subjectId,
        source_type: parsed.data.sourceType,
        status: "uploading",
        created_by: admin.user_id,
      })
      .select("id")
      .single();

    if (error || !document) throw new Error("تعذر إنشاء سجل الملف");

    // Awaited in-request for MVP simplicity (no background job queue yet).
    await processDocument(document.id);

    return NextResponse.json({ id: document.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "صار خطأ أثناء رفع الملف" },
      { status: 500 }
    );
  }
}
