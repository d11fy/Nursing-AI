import { NextResponse } from "next/server";
import { after } from "next/server";
import { createHash } from "node:crypto";
import { limitedFormData } from "@/lib/request-body";
import { createClient } from "@/lib/db/server";
import { getPool } from "@/lib/db/pool";
import { getSettings } from "@/lib/usage";
import { canStudentAccessSubject } from "@/lib/subjects";
import { uploadLectureFile } from "@/lib/storage";
import { lectureUploadMetaSchema, LECTURE_EXTENSION_MIME_MAP } from "@/lib/validations/lectures";
import { processLecture } from "@/lib/lectures/processing";
import { logEvent } from "@/lib/log";

function sanitizeFileName(name: string): string {
  return name.replace(/[/\\\x00-\x1f]/g, "_").slice(0, 200) || "lecture";
}

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });

  const settings = await getSettings(db);
  const maxBytes = settings.lectureMaxFileMb * 1024 * 1024;

  let formData: FormData;
  try {
    formData = await limitedFormData(request, maxBytes + 64 * 1024);
  } catch {
    return NextResponse.json({ error: "حجم الملف كبير جدًا أو الطلب غير صالح" }, { status: 413 });
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
    contributionOwnershipConfirmed: formData.get("contributionOwnershipConfirmed"),
    forceDuplicate: formData.get("forceDuplicate"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" }, { status: 400 });
  }
  const { title, subjectId, largeFileAcknowledged, contributionConsent, contributionOwnershipConfirmed, forceDuplicate } = parsed.data;

  if (!await canStudentAccessSubject(user.id, subjectId)) {
    return NextResponse.json({ error: "هذه المادة غير متاحة لسنتك الدراسية." }, { status: 403 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const expectedMime = LECTURE_EXTENSION_MIME_MAP[ext];
  if (!expectedMime || expectedMime !== file.type) {
    return NextResponse.json({ error: "نوع الملف غير مدعوم" }, { status: 400 });
  }
  if (file.size > maxBytes) {
    return NextResponse.json({ error: `حجم الملف أكبر من الحد المسموح. الحد الأقصى ${settings.lectureMaxFileMb}MB.` }, { status: 400 });
  }

  const isLarge = file.size > settings.lectureLargeFileMb * 1024 * 1024;
  if (isLarge && !largeFileAcknowledged) {
    return NextResponse.json({ error: "يرجى تأكيد الاطلاع على تنبيه حذف الملفات الكبيرة قبل المتابعة" }, { status: 400 });
  }

  const fileHash = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");

  if (!forceDuplicate) {
    const { rows: duplicates } = await getPool().query<{ id: string; title: string }>(
      "SELECT id,title FROM lectures WHERE user_id=$1 AND file_hash=$2 AND deleted_at IS NULL LIMIT 1",
      [user.id, fileHash]
    );
    if (duplicates.length) {
      return NextResponse.json(
        { duplicate: true, existingLectureId: duplicates[0].id, existingTitle: duplicates[0].title, error: "يبدو أنك رفعت هذه المحاضرة مسبقًا" },
        { status: 409 }
      );
    }
  }

  logEvent("FILE_UPLOAD_STARTED", { userId: user.id, fileSize: file.size, mimeType: file.type });

  let storagePath: string;
  try {
    const result = await uploadLectureFile(db, user.id, file, maxBytes);
    storagePath = result.path;
  } catch (err) {
    logEvent("FILE_UPLOAD_FAILED", { userId: user.id, error: err instanceof Error ? err.message : "unknown" });
    return NextResponse.json({ error: "تعذر رفع الملف. حاول مرة أخرى." }, { status: 500 });
  }

  const now = Date.now();
  const bothConsentsGiven = contributionConsent && contributionOwnershipConfirmed;

  const { data: lecture, error } = await db
    .from("lectures")
    .insert({
      user_id: user.id,
      subject_id: subjectId,
      title,
      file_name: sanitizeFileName(file.name),
      original_file_name: file.name,
      storage_path: storagePath,
      mime_type: file.type,
      file_size_bytes: file.size,
      file_hash: fileHash,
      status: "uploaded",
      delete_after: isLarge ? new Date(now + settings.lectureRetentionDays * 24 * 60 * 60 * 1000).toISOString() : null,
      contribution_consent_at: bothConsentsGiven ? new Date(now).toISOString() : null,
      contribution_ownership_confirmed_at: bothConsentsGiven ? new Date(now).toISOString() : null,
    })
    .select("id, status, delete_after")
    .single();

  if (error || !lecture) {
    return NextResponse.json({ error: "تعذر إنشاء سجل المحاضرة" }, { status: 500 });
  }

  logEvent("FILE_UPLOAD_COMPLETED", { userId: user.id, lectureId: lecture.id });

  after(() => processLecture(lecture.id).catch((err) => console.error("processLecture error", err)));

  return NextResponse.json({ id: lecture.id, status: lecture.status, deleteAfter: lecture.delete_after });
}
