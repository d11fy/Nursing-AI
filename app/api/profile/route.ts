import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/db/server";

const profileSchema = z.object({
  fullName: z.string().trim().min(2, "الاسم الكامل مطلوب (حرفين على الأقل)"),
  university: z.string().trim().min(1, "اسم الجامعة مطلوب"),
});

export async function PATCH(request: Request) {
  try {
    const db = await createClient();
    const user = db.actor;
    if (!user || user.status !== "active") {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" },
        { status: 400 }
      );
    }

    const { data: updated, error } = await db
      .from("profiles")
      .update({
        full_name: parsed.data.fullName,
        university: parsed.data.university,
      })
      .eq("user_id", user.user_id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: "تعذر حفظ التعديلات" }, { status: 500 });
    }

    return NextResponse.json({ success: true, profile: updated });
  } catch (error) {
    console.error("PATCH /api/profile error:", error);
    return NextResponse.json({ error: "تعذر حفظ التعديلات" }, { status: 500 });
  }
}
