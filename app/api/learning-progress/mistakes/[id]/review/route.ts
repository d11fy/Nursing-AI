import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { reviewMistake } from "@/lib/learning-progress/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const profile = await requireProfile();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (typeof body.studentAnswer !== "string" || !body.studentAnswer.trim()) {
      return NextResponse.json({ error: "الإجابة مطلوبة" }, { status: 400 });
    }
    return NextResponse.json(await reviewMistake(profile.user_id, id, body.studentAnswer));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر حفظ المراجعة" }, { status: 500 });
  }
}

