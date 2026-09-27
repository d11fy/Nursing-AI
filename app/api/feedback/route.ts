import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { feedbackSchema } from "@/lib/validations/chat";

export async function POST(request: Request) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = feedbackSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const { error } = await db.from("message_feedback").insert({
    message_id: parsed.data.messageId,
    user_id: user.id,
    is_positive: parsed.data.isPositive,
    reason: parsed.data.reason ?? null,
    comment: parsed.data.comment ?? null,
  });

  if (error) {
    return NextResponse.json({ error: "تعذر إرسال التقييم" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
