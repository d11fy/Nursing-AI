import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { flashcardProgressRequestSchema } from "@/features/study-pack/schemas";
import { updateFlashcardProgress } from "@/features/study-pack/db/flashcards-db";

export async function POST(request: Request, context: {params: Promise<{id:string}>}) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = flashcardProgressRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  try {
    const updated = await updateFlashcardProgress(
      user.id,
      parsed.data.flashcardId,
      parsed.data.status, parsed.data.eventId, (await context.params).id
    );
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "تعذر حفظ التقدم";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
