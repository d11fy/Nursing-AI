import { limitedFormData } from "@/lib/request-body";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { getSignedChatImageUrl, uploadChatImage } from "@/lib/storage";
import { getSettings } from "@/lib/usage";
import { ACCEPTED_IMAGE_TYPES } from "@/lib/validations/chat";
import { commitUsage, readIdempotencyKey, releaseUsage, reserveUsage, usageErrorResponse } from "@/lib/subscriptions/service";
import { IMAGE_KINDS, UPLOAD_REJECTION_MESSAGE, verifyUploadContent } from "@/lib/validations/file-content";

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

  const bytes = Buffer.from(await file.arrayBuffer());
  const check = verifyUploadContent(bytes, file.type, IMAGE_KINDS);
  if (!check.ok) {
    return NextResponse.json({ error: UPLOAD_REJECTION_MESSAGE[check.reason] }, { status: 400 });
  }

  let reservation;
  try {
    reservation = await reserveUsage(user.id, "images_limit", { idempotencyKey: readIdempotencyKey(request, "chat-image") });
    if (reservation.replayed) {
      const path = typeof reservation.resultRef?.path === "string" ? reservation.resultRef.path : null;
      if (!path) return NextResponse.json({ error: "طلب الرفع السابق ما زال قيد التنفيذ" }, { status: 409 });
      return NextResponse.json({ path, url: await getSignedChatImageUrl(db, path) });
    }
    const { path, signedUrl } = await uploadChatImage(db, user.id, new File([bytes], file.name, { type: check.mime }));
    await commitUsage(reservation, { path });
    return NextResponse.json({ path, url: signedUrl });
  } catch (error) {
    if (reservation) await releaseUsage(reservation).catch(() => undefined);
    const usage = usageErrorResponse(error, "الصور");
    if (usage) return usage;
    return NextResponse.json(
      { error: "صار خطأ أثناء رفع الصورة، جرب مرة ثانية" },
      { status: 500 }
    );
  }
}
