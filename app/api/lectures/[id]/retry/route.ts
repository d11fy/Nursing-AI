import { NextResponse, after } from "next/server";
import { createClient, createSystemClient } from "@/lib/db/server";
import { processLecture } from "@/lib/lectures/processing";

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
  after(() => processLecture(id).catch((err) => console.error("processLecture retry error", err)));

  return NextResponse.json({ ok: true });
}
