import { NextResponse } from "next/server";
import { currentProfile } from "@/lib/auth/session";
import { getRemainingUsage, getStudentEntitlements } from "@/lib/subscriptions/service";

export async function GET() {
  try {
    const profile = await currentProfile();
    if (!profile) {
      return NextResponse.json({ authenticated: false, error: "غير مسجل الدخول" }, { status: 401 });
    }

    const [access, aiUsage] = await Promise.all([
      getStudentEntitlements(profile.user_id),
      getRemainingUsage(profile.user_id, "ai_questions_daily"),
    ]);

    return NextResponse.json({
      authenticated: true,
      profile,
      access,
      aiUsage,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Auth me API error:", error);
    return NextResponse.json({ error: "تعذر تحميل بيانات الجلسة" }, { status: 500 });
  }
}
