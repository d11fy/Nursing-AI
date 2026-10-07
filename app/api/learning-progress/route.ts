import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { getProgressDashboard } from "@/lib/learning-progress/service";

export async function GET() {
  try {
    const db = await createClient();
    const user = db.actor;
    if (!user || user.status !== "active") {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
    }

    const data = await getProgressDashboard(user.user_id);
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/learning-progress error:", error);
    return NextResponse.json({ error: "تعذر تحميل لوحة التقدم" }, { status: 500 });
  }
}
