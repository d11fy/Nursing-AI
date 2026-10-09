import { NextResponse } from "next/server";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { canStudentAccessSubject } from "@/lib/subjects";
import { createPracticeExam, getPracticeAttempt } from "@/lib/exams/practice-service";
import { ReplayedUsage, readIdempotencyKey, requireFeature, usageErrorResponse, usageMeter } from "@/lib/subscriptions/service";

const requestSchema = z.object({
  subjectId: z.string().uuid(),
  topic: z.string().trim().max(200).optional().nullable(),
  questionCount: z.coerce.number().int().min(1).max(100).optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  practiceType: z.enum(["PAST_EXAM", "UNIVERSITY_STYLE", "MIXED"]).optional(),
  mode: z.enum(["STUDY", "EXAM"]).optional(),
});

export async function POST(request: Request) {
  let profile;
  try {
    profile = await requireProfile();
  } catch {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "المادة مطلوبة أو إعدادات الاختبار غير صالحة" }, { status: 400 });
  const { subjectId, topic, questionCount, difficulty, practiceType, mode } = parsed.data;
  const isAdmin = profile.role === "admin";

  if (!isAdmin && !(await canStudentAccessSubject(profile.user_id, subjectId))) {
    return NextResponse.json({ error: "غير مصرح لك بالوصول لهذه المادة" }, { status: 403 });
  }

  // Entitlement and quota are settled before any question is selected or generated.
  const usage = usageMeter(profile.user_id, "quiz_limit", readIdempotencyKey(request, "practice"));
  try {
    if (!isAdmin) {
      await requireFeature(profile.user_id, "quiz_enabled");
      await usage.meter();
    }
    const examSession = await createPracticeExam({
      userId: profile.user_id,
      subjectId,
      topic: topic || undefined,
      questionCount: questionCount ?? 10,
      difficulty: difficulty ?? "MEDIUM",
      practiceType: practiceType ?? "MIXED",
      mode: mode ?? "STUDY",
    });
    await usage.commit({ attemptId: examSession.attemptId });
    return NextResponse.json(examSession);
  } catch (err) {
    if (err instanceof ReplayedUsage) {
      const attemptId = err.reservation.resultRef?.attemptId;
      const attempt = typeof attemptId === "string" ? await getPracticeAttempt(attemptId, profile.user_id) : null;
      if (!attempt) return NextResponse.json({ error: "طلبك السابق ما زال قيد التنفيذ؛ انتظر لحظات" }, { status: 409 });
      return NextResponse.json(attempt);
    }
    await usage.release();
    const denied = usageErrorResponse(err, "الاختبارات");
    if (denied) return denied;
    console.error("[PracticeExamAPI] generate error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "تعذر تجهيز الامتحان التدريبي" },
      { status: 500 }
    );
  }
}
