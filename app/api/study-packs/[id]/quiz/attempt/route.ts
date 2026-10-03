import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import {
  quizAnswerSubmitRequestSchema,
  quizAttemptCompleteRequestSchema,
} from "@/features/study-pack/schemas";
import {
  startQuizAttempt,
  submitQuizAnswer,
  completeQuizAttempt,
} from "@/features/study-pack/db/quiz-db";

export async function POST(
  request: Request,
  { params: _params }: { params: Promise<{ id: string }> }
) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const body = await request.json().catch(() => ({}));

  try {
    if (action === "start") {
      const quizId = String(body.quizId ?? "");
      if (!quizId) return NextResponse.json({ error: "quizId مطلوب" }, { status: 400 });
      const attempt = await startQuizAttempt(user.id, quizId);
      return NextResponse.json(attempt);
    }

    if (action === "answer") {
      const parsed = quizAnswerSubmitRequestSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "بيانات الإجابة غير صالحة" }, { status: 400 });
      }
      const result = await submitQuizAnswer({
        userId: user.id,
        attemptId: parsed.data.attemptId,
        questionId: parsed.data.questionId,
        studentAnswer: parsed.data.studentAnswer,
      });
      return NextResponse.json(result);
    }

    if (action === "complete") {
      const parsed = quizAttemptCompleteRequestSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
      }
      const summary = await completeQuizAttempt(user.id, parsed.data.attemptId);
      return NextResponse.json(summary);
    }

    return NextResponse.json({ error: "إجراء غير صالح" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "تعذر تنفيذ العملية";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
