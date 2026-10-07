import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";

export async function GET() {
  try {
    const db = await createClient();
    const user = db.actor;
    if (!user || user.status !== "active") {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
    }

    const { data: conversations, error } = await db
      .from("conversations")
      .select("id, title, updated_at, subject_id")
      .eq("user_id", user.user_id)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "تعذر جلب المحادثات" }, { status: 500 });
    }

    return NextResponse.json({ conversations: conversations || [] });
  } catch (error) {
    console.error("GET /api/conversations error:", error);
    return NextResponse.json({ error: "تعذر جلب المحادثات" }, { status: 500 });
  }
}
