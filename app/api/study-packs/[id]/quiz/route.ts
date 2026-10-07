import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { checkRateLimit } from "@/lib/usage";
import { accessErrorMessage, canUseFeature, consumeUsage, refundUsage } from "@/lib/subscriptions/service";
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
  let reservation;
  try {
    const access=await canUseFeature(user.id,"quiz_enabled");
    if(!access.allowed) return NextResponse.json(accessErrorMessage(new Error(access.reason==="subscription_expired"?"انتهى اشتراكك":"هذه الميزة غير متاحة ضمن باقتك"),"الاختبارات"),{status:403});
    if(typeof access.access.entitlements.quiz_limit==="number") reservation=await consumeUsage(user.id,"quiz_limit");
    const result = await getOrGenerateQuiz({
      studyPackId,
      userId: user.id,
      config: parsed.data,
      regenerate,
    });
    if(result.fromCache&&reservation) await refundUsage(reservation);
    return NextResponse.json(result);
  } catch (err) {
    if(reservation) await refundUsage(reservation).catch(()=>undefined);
    if(err instanceof Error&&(err.message.includes("الحد")||err.message.includes("اشتراك")||err.message.includes("الميزة"))) return NextResponse.json(accessErrorMessage(err,"الاختبارات"),{status:403});
    const message = err instanceof Error ? err.message : "تعذر إنشاء الاختبار";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
