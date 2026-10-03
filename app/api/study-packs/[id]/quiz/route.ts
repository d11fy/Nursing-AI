import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { checkRateLimit, checkDailyLimit } from "@/lib/usage";
import { quizGenerateRequestSchema } from "@/features/study-pack/schemas";
import { getLatestQuiz } from "@/features/study-pack/db/quiz-db";
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
    return NextResponse.json({ quiz });
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
  const daily = await checkDailyLimit(db, user.id);
  if (!daily.allowed) {
    return NextResponse.json(
      { error: "وصلت للحد اليومي للاستخدام؛ يمكنك العودة غدًا" },
      { status: 403 }
    );
  }

  try {
    const result = await getOrGenerateQuiz({
      studyPackId,
      userId: user.id,
      config: parsed.data,
      regenerate,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "تعذر إنشاء الاختبار";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
