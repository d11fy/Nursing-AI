import { limitedFormData } from "@/lib/request-body";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { uploadChatImage } from "@/lib/storage";
import { getSettings } from "@/lib/usage";
import { ACCEPTED_IMAGE_TYPES } from "@/lib/validations/chat";
import { accessErrorMessage, consumeUsage, refundUsage } from "@/lib/subscriptions/service";

export async function POST(request: Request) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await limitedFormData(request, 9 * 1024 * 1024);
  } catch {
    return NextResponse.json({ error: "حجم الملف كبير جدًا أو الطلب غير صالح" }, { status: 413 });
  }
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "لم يتم إرفاق صورة" }, { status: 400 });
  }

  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "نوع الملف غير مدعوم" }, { status: 400 });
  }

  const settings = await getSettings(db);
  const maxBytes = settings.maxImageSizeMb * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json({ error: "حجم الصورة كبير جدًا" }, { status: 400 });
  }

  let reservation;
  try {
    reservation = await consumeUsage(user.id, "images_limit");
    const { path, signedUrl } = await uploadChatImage(db, user.id, file);
    return NextResponse.json({ path, url: signedUrl });
  } catch (error) {
    if (reservation) await refundUsage(reservation).catch(() => undefined);
    if (error instanceof Error && (error.message.includes("الحد") || error.message.includes("اشتراك") || error.message.includes("الميزة"))) {
      return NextResponse.json(accessErrorMessage(error, "الصور"), { status: 403 });
    }
    return NextResponse.json(
      { error: "صار خطأ أثناء رفع الصورة، جرب مرة ثانية" },
      { status: 500 }
    );
  }
}
