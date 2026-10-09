import { NextResponse } from "next/server";
import { createClient, createSystemClient } from "@/lib/db/server";
import { registerDocument, enqueueDocument } from "@/lib/tutor/ingestion";
import { workerDb } from "@/lib/tutor/db";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });

  const { data: lecture } = await db.from("lectures").select("id, status").eq("id", id).single();
  if (!lecture) return NextResponse.json({ error: "المحاضرة غير موجودة" }, { status: 404 });
  if (lecture.status !== "failed") {
    return NextResponse.json({ error: "لا يمكن إعادة معالجة هذه المحاضرة الآن" }, { status: 400 });
  }

  await createSystemClient().from("lectures").update({ status: "uploaded", error_message: null }).eq("id", id);
  const documentId = await registerDocument(id, true);
  // A file whose text extraction produced nothing is read again from the original; otherwise the saved extraction (and its paid OCR) is reused.
  const saved = (await workerDb.query<{ status: string; extracted_text_length: number }>("select status,extracted_text_length from knowledge_documents where id=$1", [documentId])).rows[0];
  await enqueueDocument(documentId, saved?.status === "needs_review" || !saved?.extracted_text_length);

  return NextResponse.json({ ok: true });
}
