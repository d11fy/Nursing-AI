import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { checkRateLimit } from "@/lib/usage";
import { canUseFeature, accessErrorMessage } from "@/lib/subscriptions/service";
import {
  getStudyPackFlashcards,
} from "@/features/study-pack/db/flashcards-db";
import {
  getOrGenerateFlashcards,
} from "@/features/study-pack/services/study-pack-service";

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
    const cards = await getStudyPackFlashcards(studyPackId, user.id);
    return NextResponse.json({ cards });
  } catch (err) {
    const message = err instanceof Error ? err.message : "تعذر جلب البطاقات";
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
  const regenerate = Boolean(body.regenerate);

  const rate = await checkRateLimit(user.id);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "الرجاء الانتظار قليلًا قبل إرسال طلب جديد" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }
  try {
    const access=await canUseFeature(user.id,"flashcards_enabled");
    if(!access.allowed) return NextResponse.json(accessErrorMessage(new Error(access.reason==="subscription_expired"?"انتهى اشتراكك":"هذه الميزة غير متاحة ضمن باقتك"),"البطاقات"),{status:403});
    const result = await getOrGenerateFlashcards({
      studyPackId,
      userId: user.id,
      regenerate,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "تعذر إنشاء البطاقات";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
