import { createHash } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/db/server";
import { identityDb } from "@/lib/tutor/db";
import { registerDocument, enqueueDocument } from "@/lib/tutor/ingestion";
import { canStudentAccessSubject } from "@/lib/subjects";
import { limitedFormData } from "@/lib/request-body";
import { uploadLectureFile } from "@/lib/storage";
import { LECTURE_EXTENSION_MIME_MAP } from "@/lib/validations/lectures";
import { attachProcessedLecture } from "@/lib/tutor/file-attachment";
const CHAT_FILE_MAX_SIZE_MB = 10;
const CHAT_FILE_MAX_SIZE_BYTES = CHAT_FILE_MAX_SIZE_MB * 1024 * 1024;
const schema = z.object({
  conversationId: z.string().uuid().nullable(),
  subjectId: z.string().uuid().nullable(),
});
export async function POST(request: Request) {
  const db = await createClient(),
    user = db.actor;
  if (!user || user.status !== "active")
    return Response.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  let form: FormData;
  try {
    form = await limitedFormData(request, CHAT_FILE_MAX_SIZE_BYTES + 65536);
  } catch {
    return Response.json(
      { error: `الحد الأقصى لملف المحادثة ${CHAT_FILE_MAX_SIZE_MB}MB` },
      { status: 413 },
    );
  }
  let file = form.get("file");
  const meta = schema.safeParse({
    conversationId: form.get("conversationId") || null,
    subjectId: form.get("subjectId") || null,
  });
  if (!(file instanceof File) || !meta.success)
    return Response.json({ error: "بيانات الملف غير صالحة" }, { status: 400 });
  if (file.size > CHAT_FILE_MAX_SIZE_BYTES)
    return Response.json(
      { error: `الحد الأقصى لملف المحادثة ${CHAT_FILE_MAX_SIZE_MB}MB` },
      { status: 413 },
    );
  let cid = meta.data.conversationId,
    subject = meta.data.subjectId;
  if (cid) {
    const owned = (
      await identityDb(user.user_id).query<{ subject_id: string | null }>(
        "select subject_id from conversations where id=$1 and user_id=$2",
        [cid, user.user_id],
      )
    ).rows[0];
    if (!owned)
      return Response.json({ error: "المحادثة غير موجودة" }, { status: 404 });
    subject = subject ?? owned.subject_id;
  }
  if (!subject)
    return Response.json(
      { error: "اختر المادة أو أخبر المدرس بما تريد دراسته قبل رفع الملف" },
      { status: 400 },
    );
  if (!(await canStudentAccessSubject(user.user_id, subject)))
    return Response.json({ error: "المادة غير متاحة لك" }, { status: 403 });
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const expectedType = LECTURE_EXTENSION_MIME_MAP[extension];
  if (expectedType && (!file.type || file.type === "application/octet-stream"))
    file = new File([file], file.name, { type: expectedType });
  if (!expectedType || expectedType !== file.type)
    return Response.json(
      { error: "استخدم PDF أو DOCX أو PPTX أو TXT" },
      { status: 400 },
    );
  const buffer = Buffer.from(await file.arrayBuffer()),
    hash = createHash("sha256").update(buffer).digest("hex");
  if (!cid) {
    const created = await db
      .from("conversations")
      .insert({
        user_id: user.user_id,
        title: file.name.slice(0, 60),
        subject_id: subject,
      })
      .select("id")
      .single();
    if (!created.data)
      return Response.json({ error: "تعذر إنشاء المحادثة" }, { status: 503 });
    cid = created.data.id;
  }
  const duplicate = (
    await identityDb(user.user_id).query<{ id: string; status: string }>(
      "select id,status from lectures where user_id=$1 and file_hash=$2 and subject_id=$3 and deleted_at is null limit 1",
      [user.user_id, hash, subject],
    )
  ).rows[0];
  if (duplicate?.status === "ready") {
    const attachmentId = await attachProcessedLecture(
      user.user_id,
      cid,
      duplicate.id,
    );
    return Response.json({
      conversationId: cid,
      lectureId: duplicate.id,
      attachmentId,
      status: "ready",
    });
  }
  const { path } = await uploadLectureFile(
    db,
    user.user_id,
    file,
    CHAT_FILE_MAX_SIZE_BYTES,
  );
  const lecture = await db
    .from("lectures")
    .insert({
      user_id: user.user_id,
      subject_id: subject,
      title: file.name.slice(0, 180),
      file_name: file.name.replace(/[/\\\x00-\x1f]/g, "_"),
      original_file_name: file.name,
      storage_path: path,
      mime_type: file.type,
      file_size_bytes: file.size,
      file_hash: hash,
      status: "uploaded",
      delete_after: null,
    })
    .select("id")
    .single();
  if (!lecture.data)
    return Response.json({ error: "تعذر حفظ الملف" }, { status: 503 });
  const lectureId = lecture.data.id,
    conversationId = cid;
  await enqueueDocument(await registerDocument(lectureId, true));
  return Response.json(
    { conversationId, lectureId, status: "processing", deleteAfter: null },
    { status: 202 },
  );
}
export async function GET(request: Request) {
  const db = await createClient(),
    user = db.actor;
  if (!user)
    return Response.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  const url = new URL(request.url),
    cid = url.searchParams.get("conversationId"),
    lecture = url.searchParams.get("lectureId");
  if (
    !z.string().uuid().safeParse(cid).success ||
    !z.string().uuid().safeParse(lecture).success
  )
    return Response.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const owned = (
    await identityDb(user.user_id).query(
      `select l.status,l.error_message from lectures l join conversations c on c.id=$2 and c.user_id=$1 where l.id=$3 and l.user_id=$1`,
      [user.user_id, cid, lecture],
    )
  ).rows[0];
  if (!owned)
    return Response.json({ error: "الملف غير موجود" }, { status: 404 });
  if (owned.status === "ready")
    return Response.json({
      status: "ready",
      attachmentId: await attachProcessedLecture(user.user_id, cid!, lecture!),
    });
  return Response.json(
    {
      status: owned.status,
      error:
        owned.status === "failed"
          ? "تعذر تجهيز الملف؛ أعد المحاولة من صفحة المادة"
          : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
