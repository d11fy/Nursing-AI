import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { submitQuestionAnswer, completePracticeExam } from "@/lib/exams/practice-service";

export async function POST(request: Request) {
  try {
    const profile = await requireProfile();
    const body = await request.json();
    const { action, attemptId, questionId, selectedAnswer } = body;

    if (!attemptId) {
      return NextResponse.json({ error: "معرّف المحاولة مطلوب" }, { status: 400 });
    }

    if (action === "COMPLETE") {
      const summary = await completePracticeExam(attemptId, profile.user_id);
      return NextResponse.json({ success: true, ...summary });
    }

    if (!questionId) {
      return NextResponse.json({ error: "معرّف السؤال مطلوب" }, { status: 400 });
    }

    await submitQuestionAnswer({
      attemptId,
      userId: profile.user_id,
      questionId,
      selectedAnswer,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[PracticeExamAPI] submit error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "تعذر حفظ الإجابة" },
      { status: 500 }
    );
  }
}
