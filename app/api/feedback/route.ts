import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { feedbackSchema } from "@/lib/validations/chat";
import { identityDb } from '@/lib/tutor/db';

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

  const source=(await identityDb(user.id).query<{answer_origin:string|null;source_ids:string[];subject_id:string|null}>(`select m.answer_origin,m.source_ids,c.subject_id from messages m join conversations c on c.id=m.conversation_id
    where m.id=$1 and c.user_id=$2 and m.role='assistant'`,[parsed.data.messageId,user.id])).rows[0];
  if(!source)return NextResponse.json({error:'الرسالة غير موجودة'},{status:404});
  const { error } = await db.from("message_feedback").insert({
    message_id: parsed.data.messageId,
    user_id: user.id,
    is_positive: parsed.data.isPositive,
    reason: parsed.data.reason ?? null,
    comment: parsed.data.comment ?? null,
    subject_id:source.subject_id,answer_origin:source.answer_origin,source_ids:source.source_ids,
  });

  if (error) {
    return NextResponse.json({ error: "تعذر إرسال التقييم" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
