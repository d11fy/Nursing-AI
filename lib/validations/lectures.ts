import { z } from "zod";

export const LECTURE_EXTENSION_MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export const lectureUploadMetaSchema = z.object({
  title: z.string().trim().min(1, "الرجاء إدخال اسم المحاضرة").max(200, "اسم المحاضرة طويل جدًا"),
  subjectId: z.string().uuid("مادة غير صالحة"),
  largeFileAcknowledged: z.coerce.boolean().optional().default(false),
  contributionConsent: z.coerce.boolean().optional().default(false),
  contributionOwnershipConfirmed: z.coerce.boolean().optional().default(false),
  forceDuplicate: z.coerce.boolean().optional().default(false),
});
