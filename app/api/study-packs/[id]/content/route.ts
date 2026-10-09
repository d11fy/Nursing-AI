import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { checkRateLimit } from "@/lib/usage";
import { usageErrorResponse, usageMeter } from "@/lib/subscriptions/service";
import { contentRequestSchema } from "@/features/study-pack/schemas";
import { getOrGenerateContent } from "@/features/study-pack/services/study-pack-service";

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
  const parsed = contentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const { type, regenerate } = parsed.data;

  // Rate and daily limit checks apply when generating with AI
  const rate = await checkRateLimit(user.id);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "الرجاء الانتظار قليلًا قبل إرسال طلب جديد" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }
  // study_pack_limit counts study packs: the first AI generation for a pack
  // charges one unit and later sections of the same pack reuse it. An explicit
  // regenerate is new AI work and is charged again.
  const usage = usageMeter(user.id, "study_pack_limit", regenerate ? null : `study-pack:${studyPackId}`, "proceed");
  try {
    const result = await getOrGenerateContent({
      studyPackId,
      contentType: type,
      userId: user.id,
      regenerate,
      meter: usage.meter,
    });
    await usage.commit();
    return NextResponse.json(result);
  } catch (err) {
    await usage.release();
    const denied = usageErrorResponse(err, "إنشاء حزمة الدراسة");
    if (denied) return denied;
    const message = err instanceof Error ? err.message : "تعذر إنشاء المحتوى";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
