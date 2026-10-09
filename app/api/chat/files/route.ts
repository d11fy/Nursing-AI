import { z } from "zod";
import { createClient } from "@/lib/db/server";
import { identityDb } from "@/lib/tutor/db";
import { registerDocument, enqueueDocument } from "@/lib/tutor/ingestion";
import { canStudentAccessSubject } from "@/lib/subjects";
import { limitedFormData } from "@/lib/request-body";
import { getSettings } from "@/lib/usage";
import { attachProcessedLecture } from "@/lib/tutor/file-attachment";
import { readIdempotencyKey, usageErrorResponse } from "@/lib/subscriptions/service";
import { storeStudentLecture, UploadRejectedError, verifiedLectureFile } from "@/lib/lectures/student-upload";
import { fileSnapshot } from "@/lib/chat/file-status";
import { logEvent } from "@/lib/log";
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
  const upload = form.get("file");
  const meta = schema.safeParse({
    conversationId: form.get("conversationId") || null,
    subjectId: form.get("subjectId") || null,
  });
  if (!(upload instanceof File) || !meta.success)
    return Response.json({ error: "بيانات الملف غير صالحة" }, { status: 400 });
  if (upload.size > CHAT_FILE_MAX_SIZE_BYTES)
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
  let verified: Awaited<ReturnType<typeof verifiedLectureFile>>;
  try {
    verified = await verifiedLectureFile(upload);
  } catch (error) {
    if (error instanceof UploadRejectedError)
      return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
  // Re-sending a file already in this subject reuses it: no new storage,
  // processing or quota. A failed earlier copy is re-queued like the retry route.
  const duplicate = (
    await identityDb(user.user_id).query<{ id: string; status: string }>(
      "select id,status from lectures where user_id=$1 and file_hash=$2 and subject_id=$3 and deleted_at is null order by created_at desc limit 1",
      [user.user_id, verified.hash, subject],
    )
  ).rows[0];
  const ensureConversation = async () => {
    if (cid) return cid;
    const created = await db
      .from("conversations")
      .insert({
        user_id: user.user_id,
        title: upload.name.slice(0, 60),
        subject_id: subject,
      })
      .select("id")
      .single();
    if (!created.data) throw new Error("تعذر إنشاء المحادثة");
    return (cid = created.data.id as string);
  };
  if (duplicate) {
    const conversationId = await ensureConversation();
    if (duplicate.status === "ready")
      return Response.json({
        conversationId,
        lectureId: duplicate.id,
        attachmentId: await attachProcessedLecture(user.user_id, conversationId, duplicate.id),
        status: "ready",
      });
    if (duplicate.status === "failed") {
      await identityDb(user.user_id).query("update lectures set status='uploaded',error_message=null where id=$1 and user_id=$2", [duplicate.id, user.user_id]);
      await enqueueDocument(await registerDocument(duplicate.id, true));
    }
    return Response.json(
      { conversationId, lectureId: duplicate.id, status: "processing", deleteAfter: null },
      { status: 202 },
    );
  }
  try {
    const stored = await storeStudentLecture({
      db,
      userId: user.user_id,
      file: verified.file,
      hash: verified.hash,
      subjectId: subject,
      title: upload.name.slice(0, 180),
      maxBytes: CHAT_FILE_MAX_SIZE_BYTES,
      settings: await getSettings(db),
      idempotencyKey: readIdempotencyKey(request, "chat-file"),
    });
    if (!stored.lectureId)
      return Response.json({ error: "طلب الرفع السابق ما زال قيد التنفيذ" }, { status: 409 });
    const conversationId = await ensureConversation();
    return Response.json(
      { conversationId, lectureId: stored.lectureId, status: "processing", deleteAfter: stored.deleteAfter },
      { status: 202 },
    );
  } catch (error) {
    const usage = usageErrorResponse(error, "الملفات");
    if (usage) return usage;
    console.error("[ChatFiles] upload failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "تعذر حفظ الملف" }, { status: 503 });
  }
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
    await identityDb(user.user_id).query<{ status: string; document_status: string | null; document_error: string | null; chapter_count: number | null; structure_confidence: string | null }>(
      `select l.status,d.status document_status,d.error_message document_error,d.chapter_count,d.structure_confidence
         from lectures l join conversations c on c.id=$2 and c.user_id=$1 left join knowledge_documents d on d.lecture_id=l.id
         where l.id=$3 and l.user_id=$1`,
      [user.user_id, cid, lecture],
    )
  ).rows[0];
  if (!owned)
    return Response.json({ error: "الملف غير موجود" }, { status: 404 });
  // uploading -> processing -> ready | failed. A file is usable only when its whole index is ready.
  const snapshot = fileSnapshot({ lectureStatus: owned.status, documentStatus: owned.document_status, errorMessage: owned.document_error });
  logEvent("FILE_STATUS_POLLED", { lectureId: lecture, phase: snapshot.phase });
  if (snapshot.phase === "ready")
    return Response.json({
      status: "ready",
      phase: "ready",
      attachmentId: await attachProcessedLecture(user.user_id, cid!, lecture!),
      chapterCount: owned.chapter_count ?? 0,
      structureConfidence: owned.structure_confidence ?? "none",
    });
  return Response.json(
    {
      status: owned.status,
      phase: snapshot.phase,
      code: snapshot.code,
      message: snapshot.message,
      retryable: snapshot.retryable,
      lectureId: lecture,
      error: snapshot.phase === "failed" ? snapshot.message : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
