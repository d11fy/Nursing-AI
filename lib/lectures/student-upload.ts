import "server-only";

import { createHash } from "node:crypto";
import type { DatabaseClient } from "@/lib/db/server";
import { uploadLectureFile } from "@/lib/storage";
import { registerDocument, enqueueDocument } from "@/lib/tutor/ingestion";
import { commitUsage, releaseUsage, reserveUsage } from "@/lib/subscriptions/service";
import type { AppSettings } from "@/lib/usage";
import { LECTURE_KINDS, UPLOAD_REJECTION_MESSAGE, verifyUploadContent } from "@/lib/validations/file-content";
import { LECTURE_EXTENSION_MIME_MAP } from "@/lib/validations/lectures";

export class UploadRejectedError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); this.name = "UploadRejectedError"; }
}

/**
 * One retention rule for every student upload path (subject page and chat):
 * originals larger than the "large file" threshold are deleted after the
 * retention window. Extracted text and generated study material are kept.
 */
export function lectureRetention(settings: Pick<AppSettings, "lectureLargeFileMb" | "lectureRetentionDays">, sizeBytes: number, now = Date.now()) {
  const isLarge = sizeBytes > settings.lectureLargeFileMb * 1024 * 1024;
  return { isLarge, deleteAfter: isLarge ? new Date(now + settings.lectureRetentionDays * 86_400_000).toISOString() : null };
}

/**
 * Validates the declared extension against the real bytes and returns a File
 * whose type is the verified MIME type. Runs before any quota or storage work.
 */
export async function verifiedLectureFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const expected = LECTURE_EXTENSION_MIME_MAP[extension];
  if (!expected) throw new UploadRejectedError("استخدم PDF أو DOCX أو PPTX أو TXT أو صورة");
  if (file.type && file.type !== "application/octet-stream" && file.type !== expected && !(expected === "image/jpeg" && file.type === "image/jpg"))
    throw new UploadRejectedError(UPLOAD_REJECTION_MESSAGE.mismatch);
  const buffer = Buffer.from(await file.arrayBuffer());
  const check = verifyUploadContent(buffer, expected, LECTURE_KINDS);
  if (!check.ok) throw new UploadRejectedError(UPLOAD_REJECTION_MESSAGE[check.reason]);
  return {
    file: new File([buffer], file.name, { type: check.mime }),
    buffer,
    hash: createHash("sha256").update(buffer).digest("hex"),
  };
}

/**
 * Charges files_limit, stores the original and queues processing. The unit is
 * released if anything fails before processing is queued; once queued, the
 * processing cost is incurred and the unit stays committed.
 */
export async function storeStudentLecture(params: {
  db: DatabaseClient;
  userId: string;
  file: File;
  hash: string;
  subjectId: string;
  title: string;
  maxBytes: number;
  settings: Pick<AppSettings, "lectureLargeFileMb" | "lectureRetentionDays">;
  idempotencyKey?: string | null;
  extra?: Record<string, unknown>;
}) {
  const reservation = await reserveUsage(params.userId, "files_limit", { idempotencyKey: params.idempotencyKey });
  if (reservation.replayed) {
    const lectureId = typeof reservation.resultRef?.lectureId === "string" ? reservation.resultRef.lectureId : null;
    return { lectureId, deleteAfter: null as string | null, replayed: true, inProgress: reservation.status === "reserved" };
  }
  try {
    const { path } = await uploadLectureFile(params.db, params.userId, params.file, params.maxBytes);
    const retention = lectureRetention(params.settings, params.file.size);
    const { data: lecture, error } = await params.db.from("lectures").insert({
      user_id: params.userId,
      subject_id: params.subjectId,
      title: params.title.slice(0, 200),
      file_name: params.file.name.replace(/[/\\\x00-\x1f]/g, "_").slice(0, 200) || "lecture",
      original_file_name: params.file.name,
      storage_path: path,
      mime_type: params.file.type,
      file_size_bytes: params.file.size,
      file_hash: params.hash,
      status: "uploaded",
      delete_after: retention.deleteAfter,
      ...params.extra,
    }).select("id, delete_after").single();
    if (error || !lecture) throw new Error("تعذر حفظ سجل الملف");
    await enqueueDocument(await registerDocument(lecture.id, true));
    await commitUsage(reservation, { lectureId: lecture.id });
    return { lectureId: lecture.id as string, deleteAfter: lecture.delete_after as string | null, replayed: false, inProgress: false };
  } catch (error) {
    await releaseUsage(reservation).catch(() => undefined);
    throw error;
  }
}
