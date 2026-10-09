import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { checkRateLimit } from "@/lib/usage";
import { requireFeature, usageErrorResponse, usageMeter } from "@/lib/subscriptions/service";
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
  const usage = usageMeter(user.id, "study_pack_limit", regenerate ? null : `study-pack:${studyPackId}`, "proceed");
  try {
    await requireFeature(user.id, "flashcards_enabled");
    const result = await getOrGenerateFlashcards({
      studyPackId,
      userId: user.id,
      regenerate,
      meter: usage.meter,
    });
    await usage.commit();
    return NextResponse.json(result);
  } catch (err) {
    await usage.release();
    const denied = usageErrorResponse(err, "البطاقات");
    if (denied) return denied;
    const message = err instanceof Error ? err.message : "تعذر إنشاء البطاقات";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
