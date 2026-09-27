import { z } from "zod";

export const documentUploadSchema = z.object({
  title: z.string().trim().min(2, "عنوان الملف مطلوب"),
  subjectId: z.string().uuid("الرجاء اختيار مادة"),
  sourceType: z.enum(["book", "lecture", "notes", "questions", "reference"]),
});

export type DocumentUploadInput = z.infer<typeof documentUploadSchema>;

export const subjectSchema = z.object({
  nameAr: z.string().trim().min(1, "الاسم بالعربية مطلوب"),
  nameEn: z.string().trim().min(1, "الاسم بالإنجليزية مطلوب"),
  description: z.string().trim().optional(),
});

export type SubjectInput = z.infer<typeof subjectSchema>;

export const settingsSchema = z.object({
  freeDailyLimit: z.coerce.number().int().min(1).max(1000),
  rateLimitSeconds: z.coerce.number().int().min(0).max(60),
  maxImageSizeMb: z.coerce.number().int().min(1).max(50),
});

export type SettingsInput = z.infer<typeof settingsSchema>;
