import { z } from "zod";

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
export const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024; // default; overridden by admin settings

export const sendMessageSchema = z.object({
  conversationId: z.string().uuid().optional(),
  content: z.string().trim().min(1, "الرجاء كتابة سؤال").max(12000, "السؤال طويل جدًا؛ ارفع النص كملف أو اختصر السؤال"),
  subjectId: z.string().uuid().optional().nullable(),
  lectureId: z.string().uuid().optional().nullable(),
  imagePath: z.string().min(1).optional().nullable(),
  attachmentId: z.string().uuid().optional().nullable(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const feedbackSchema = z.object({
  messageId: z.string().uuid(),
  isPositive: z.boolean(),
  reason: z
    .enum(["unclear", "inaccurate", "too_long", "missed_question", "other"])
    .optional(),
  comment: z.string().trim().max(500).optional(),
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;
