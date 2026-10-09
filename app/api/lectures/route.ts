import { NextResponse } from "next/server";
import { limitedFormData } from "@/lib/request-body";
import { createClient } from "@/lib/db/server";
import { identityDb } from "@/lib/tutor/db";
import { getSettings } from "@/lib/usage";
import { canStudentAccessSubject } from "@/lib/subjects";
import { lectureUploadMetaSchema } from "@/lib/validations/lectures";
import { logEvent } from "@/lib/log";
import { readIdempotencyKey, usageErrorResponse } from "@/lib/subscriptions/service";
import {
  lectureRetention,
  storeStudentLecture,
  UploadRejectedError,
  verifiedLectureFile,
} from "@/lib/lectures/student-upload";

export async function POST(request: Request) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });

  const settings = await getSettings(db);
  const maxBytes = settings.lectureMaxFileMb * 1024 * 1024;

  let formData: FormData;
  try {
    formData = await limitedFormData(request, maxBytes + 64 * 1024);
  } catch {
    return NextResponse.json(
      { error: "حجم الملف كبير جدًا أو الطلب غير صالح" },
      { status: 413 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "لم يتم إرفاق ملف" }, { status: 400 });
  }

  const parsed = lectureUploadMetaSchema.safeParse({
    title: formData.get("title"),
    subjectId: formData.get("subjectId"),
    largeFileAcknowledged: formData.get("largeFileAcknowledged"),
    contributionConsent: formData.get("contributionConsent"),
    contributionOwnershipConfirmed: formData.get(
      "contributionOwnershipConfirmed",
    ),
    forceDuplicate: formData.get("forceDuplicate"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" },
      { status: 400 },
    );
  }
  const {
    title,
    subjectId,
    largeFileAcknowledged,
    contributionConsent,
    contributionOwnershipConfirmed,
    forceDuplicate,
  } = parsed.data;

  if (!(await canStudentAccessSubject(user.id, subjectId))) {
    return NextResponse.json(
      { error: "هذه المادة غير متاحة لسنتك الدراسية." },
      { status: 403 },
    );
  }

  if (file.size > maxBytes) {
    return NextResponse.json(
      {
        error: `حجم الملف أكبر من الحد المسموح. الحد الأقصى ${settings.lectureMaxFileMb}MB.`,
      },
      { status: 400 },
    );
  }

  let verified: Awaited<ReturnType<typeof verifiedLectureFile>>;
  try {
    verified = await verifiedLectureFile(file);
  } catch (err) {
    if (err instanceof UploadRejectedError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { isLarge } = lectureRetention(settings, file.size);
  if (isLarge && !largeFileAcknowledged) {
    return NextResponse.json(
      {
        error: "يرجى تأكيد الاطلاع على تنبيه حذف الملفات الكبيرة قبل المتابعة",
      },
      { status: 400 },
    );
  }

  const fileHash = verified.hash;

  if (!forceDuplicate) {
    const { rows: duplicates } = await identityDb(user.id).query<{
      id: string;
      title: string;
    }>(
      "SELECT id,title FROM lectures WHERE user_id=$1 AND file_hash=$2 AND deleted_at IS NULL LIMIT 1",
      [user.id, fileHash],
    );
    if (duplicates.length) {
      return NextResponse.json(
        {
          duplicate: true,
          existingLectureId: duplicates[0].id,
          existingTitle: duplicates[0].title,
          error: "يبدو أنك رفعت هذه المحاضرة مسبقًا",
        },
        { status: 409 },
      );
    }
  }

  logEvent("FILE_UPLOAD_STARTED", {
    userId: user.id,
    fileSize: file.size,
    mimeType: verified.file.type,
  });

  const now = new Date().toISOString();
  const bothConsentsGiven =
    contributionConsent && contributionOwnershipConfirmed;

  let stored: Awaited<ReturnType<typeof storeStudentLecture>>;
  try {
    stored = await storeStudentLecture({
      db,
      userId: user.id,
      file: verified.file,
      hash: fileHash,
      subjectId,
      title,
      maxBytes,
      settings,
      idempotencyKey: readIdempotencyKey(request, "lecture"),
      extra: {
        contribution_consent_at: bothConsentsGiven ? now : null,
        contribution_ownership_confirmed_at: bothConsentsGiven ? now : null,
      },
    });
  } catch (err) {
    const usage = usageErrorResponse(err, "الملفات");
    if (usage) return usage;
    logEvent("FILE_UPLOAD_FAILED", {
      userId: user.id,
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json(
      { error: "تعذر رفع الملف. حاول مرة أخرى." },
      { status: 500 },
    );
  }
  if (!stored.lectureId) {
    return NextResponse.json(
      { error: "طلب الرفع السابق ما زال قيد التنفيذ" },
      { status: 409 },
    );
  }
  const lecture = { id: stored.lectureId, status: "uploaded", delete_after: stored.deleteAfter };

  logEvent("FILE_UPLOAD_COMPLETED", { userId: user.id, lectureId: lecture.id });

  return NextResponse.json({
    id: lecture.id,
    status: lecture.status,
    deleteAfter: lecture.delete_after,
  });
}
