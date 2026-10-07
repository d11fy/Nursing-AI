import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { getMistakes } from "@/lib/learning-progress/service";
import type { MistakeStatus } from "@/lib/learning-progress/types";

export async function GET(request: Request) {
  try {
    const db = await createClient();
    const user = db.actor;
    if (!user || user.status !== "active") {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const subjectParam = searchParams.get("subject") || undefined;
    const topicParam = searchParams.get("topic") || undefined;
    const statusParam = searchParams.get("status");
    const validStatus = ["new", "reviewing", "mastered"].includes(statusParam ?? "")
      ? (statusParam as MistakeStatus)
      : undefined;

    const [all, mistakes] = await Promise.all([
      getMistakes(user.user_id),
      getMistakes(user.user_id, {
        subjectId: subjectParam,
        topicKey: topicParam,
        status: validStatus,
      }),
    ]);

    const subjects = [...new Map(all.map((item) => [item.subjectId, item.subjectName])).entries()].map(
      ([id, name]) => ({ id, name })
    );
    const topics = [...new Map(all.map((item) => [item.topicKey, item.topic])).entries()].map(
      ([key, name]) => ({ key, name })
    );
    const currentCount = all.filter((item) => item.status !== "mastered").length;

    return NextResponse.json({
      mistakes,
      totalCount: all.length,
      currentCount,
      subjects,
      topics,
    });
  } catch (error) {
    console.error("GET /api/learning-progress/mistakes error:", error);
    return NextResponse.json({ error: "تعذر تحميل قائمة الأخطاء" }, { status: 500 });
  }
}
