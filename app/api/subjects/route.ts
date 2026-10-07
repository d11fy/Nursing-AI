import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { getStudentSubjects } from "@/lib/subjects";

export async function GET() {
  try {
    const db = await createClient();
    const user = db.actor;
    if (!user || user.status !== "active") {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
    }

    const { subjects, academicYearName } = await getStudentSubjects(user.user_id);
    return NextResponse.json({ subjects, academicYearName });
  } catch (error) {
    console.error("GET /api/subjects error:", error);
    return NextResponse.json({ error: "تعذر تحميل المواد الدراسية" }, { status: 500 });
  }
}
