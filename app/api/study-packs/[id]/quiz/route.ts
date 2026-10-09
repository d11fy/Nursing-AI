import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { checkRateLimit } from "@/lib/usage";
import { ReplayedUsage, readIdempotencyKey, requireFeature, usageErrorResponse, usageMeter } from "@/lib/subscriptions/service";
import { quizGenerateRequestSchema } from "@/features/study-pack/schemas";
import { getLatestQuiz } from "@/features/study-pack/db/quiz-db";
import { toStudentQuiz } from "@/features/study-pack/student-dto";
import { getOrGenerateQuiz } from "@/features/study-pack/services/study-pack-service";

export async function GET(
  _request: Request,
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

  try {
    const quiz = await getLatestQuiz(studyPackId, user.id);
    return NextResponse.json({ quiz: quiz ? toStudentQuiz(quiz) : null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "تعذر جلب الاختبار";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
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

  const body = await request.json().catch(() => ({}));
  const parsed = quizGenerateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "إعدادات غير صالحة للاختبار" }, { status: 400 });
  }

  const regenerate = Boolean(body.regenerate);

  const rate = await checkRateLimit(user.id);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "الرجاء الانتظار قليلًا قبل إرسال طلب جديد" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }
  const usage = usageMeter(user.id, "quiz_limit", readIdempotencyKey(request, `study-pack-quiz:${studyPackId}`));
  try {
    await requireFeature(user.id, "quiz_enabled");
    const result = await getOrGenerateQuiz({
      studyPackId,
      userId: user.id,
      config: parsed.data,
      regenerate,
      meter: usage.meter,
    });
    await usage.commit({ quizId: result.quiz.id });
    return NextResponse.json({ ...result, quiz: toStudentQuiz(result.quiz) });
  } catch (err) {
    if (err instanceof ReplayedUsage) {
      const quiz = err.reservation.resultRef?.quizId ? await getLatestQuiz(studyPackId, user.id) : null;
      if (!quiz) return NextResponse.json({ error: "طلبك السابق ما زال قيد التنفيذ؛ انتظر لحظات" }, { status: 409 });
      return NextResponse.json({ quiz: toStudentQuiz(quiz), fromCache: true });
    }
    await usage.release();
    const denied = usageErrorResponse(err, "الاختبارات");
    if (denied) return denied;
    const message = err instanceof Error ? err.message : "تعذر إنشاء الاختبار";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
