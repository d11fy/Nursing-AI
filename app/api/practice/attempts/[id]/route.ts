import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/db/server";
import { getPracticeAttempt } from "@/lib/exams/practice-service";

/** Resume a practice attempt. Exam-mode answer keys stay hidden until it is completed. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient();
  const user = db.actor;
  if (!user || user.status !== "active") return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "معرّف المحاولة غير صالح" }, { status: 400 });
  const attempt = await getPracticeAttempt(id.data, user.user_id);
  if (!attempt) return NextResponse.json({ error: "المحاولة غير موجودة" }, { status: 404 });
  return NextResponse.json(attempt, { headers: { "Cache-Control": "no-store" } });
}
