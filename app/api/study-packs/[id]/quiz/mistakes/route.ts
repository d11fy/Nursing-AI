import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { getQuizMistakes } from "@/features/study-pack/db/quiz-db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: studyPackId } = await params;
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }

  const url = new URL(request.url);
  const attemptId = url.searchParams.get("attemptId");

  try {
    const mistakes = await getQuizMistakes(studyPackId, user.id, attemptId);
    return NextResponse.json({ mistakes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "تعذر جلب الأخطاء";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
