import { NextResponse } from "next/server";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { submitQuestionAnswer, completePracticeExam } from "@/lib/exams/practice-service";

const requestSchema = z.object({
  action: z.literal("COMPLETE").optional(),
  attemptId: z.string().uuid(),
  questionId: z.string().uuid().optional(),
  selectedAnswer: z.unknown().optional(),
});

export async function POST(request: Request) {
  let profile;
  try {
    profile = await requireProfile();
  } catch {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "معرّف المحاولة مطلوب" }, { status: 400 });
  const { action, attemptId, questionId, selectedAnswer } = parsed.data;
  try {
    if (action === "COMPLETE") {
      const summary = await completePracticeExam(attemptId, profile.user_id);
      return NextResponse.json({ success: true, ...summary });
    }

    if (!questionId) {
      return NextResponse.json({ error: "معرّف السؤال مطلوب" }, { status: 400 });
    }

    // STUDY attempts receive this question's answer and rationale now; EXAM
    // attempts receive only an acknowledgement until COMPLETE.
    const result = await submitQuestionAnswer({
      attemptId,
      userId: profile.user_id,
      questionId,
      selectedAnswer,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[PracticeExamAPI] submit error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "تعذر حفظ الإجابة" },
      { status: 500 }
    );
  }
}
