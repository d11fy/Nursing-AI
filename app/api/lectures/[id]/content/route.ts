import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, type DatabaseClient } from "@/lib/db/server";
import { getStudyContent, generateStudyContent } from "@/lib/lectures/study-content";

const typeSchema = z.object({ type: z.enum(["summary", "key_points", "quiz", "flashcards"]) });

async function loadOwnedLecture(db: DatabaseClient, id: string) {
  const { data } = await db.from("lectures").select("id, title, status").eq("id", id).single();
  return data;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });

  const lecture = await loadOwnedLecture(db, id);
  if (!lecture) return NextResponse.json({ error: "المحاضرة غير موجودة" }, { status: 404 });

  return NextResponse.json(await getStudyContent(id));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });

  const json = await request.json().catch(() => null);
  const parsed = typeSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });

  const lecture = await loadOwnedLecture(db, id);
  if (!lecture) return NextResponse.json({ error: "المحاضرة غير موجودة" }, { status: 404 });
  if (lecture.status !== "ready") return NextResponse.json({ error: "المحاضرة لم تجهز بعد للدراسة" }, { status: 400 });

  try {
    const content = await generateStudyContent(id, user.id, parsed.data.type, lecture.title);
    return NextResponse.json({ type: parsed.data.type, content });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "تعذر إنشاء المحتوى" }, { status: 500 });
  }
}
