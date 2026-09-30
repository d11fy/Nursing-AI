import { z } from "zod";

export const documentUploadSchema = z.object({
  title: z.string().trim().min(2, "عنوان الملف مطلوب"),
  subjectId: z.string().uuid("الرجاء اختيار مادة"),
  sourceType: z.enum([
    'university_lecture','doctor_slides','official_course_material','required_textbook','lab_manual','exam_questions','approved_notes',
    "BOOK",
    "UNIVERSITY_LECTURE",
    "DOCTOR_SLIDES",
    "SUMMARY",
    "PAST_EXAM",
    "QUESTION_BANK",
    "MODEL_ANSWERS",
    "LAB_MATERIAL",
    "REVIEW_NOTES",
    "book",
    "lecture",
    "notes",
    "questions",
    "reference",
  ]),
  academicYearId: z.string().uuid().optional().nullable(),
  priority:z.coerce.number().int().min(0).max(100).optional(),
  semester: z.coerce.number().int().min(1).max(2).optional().nullable(),
  examYear: z.coerce.number().int().min(1990).max(2100).optional().nullable(),
  doctorName: z.string().trim().optional().nullable(),
  examType: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});


export type DocumentUploadInput = z.infer<typeof documentUploadSchema>;

export const subjectSchema = z.object({
  nameAr: z.string().trim().min(1, "الاسم بالعربية مطلوب"),
  nameEn: z.string().trim().min(1, "الاسم بالإنجليزية مطلوب"),
  descriptionAr: z.string().trim().optional(),
  descriptionEn: z.string().trim().optional(),
  icon: z.string().trim().min(1).max(50).default("book-open"),
  iconTheme: z.string().trim().max(50).optional(),
  status: z.enum(["active", "inactive"]),
  sortOrder: z.coerce.number().int().min(0).max(10000),
  academicYearIds: z.array(z.string().uuid()).min(1, "اختر سنة دراسية واحدة على الأقل"),
});

export const academicYearSchema = z.object({
  id: z.string().uuid(), nameAr: z.string().trim().min(1), nameEn: z.string().trim().min(1),
  sortOrder: z.coerce.number().int().min(0).max(10000), isActive: z.enum(["true", "false"]),
});
export const newAcademicYearSchema = academicYearSchema.omit({ id: true }).extend({ code: z.string().trim().regex(/^[a-z0-9_]+$/).max(50) });

export type SubjectInput = z.infer<typeof subjectSchema>;

export const settingsSchema = z.object({
  freeDailyLimit: z.coerce.number().int().min(1).max(1000),
  rateLimitSeconds: z.coerce.number().int().min(0).max(60),
  maxImageSizeMb: z.coerce.number().int().min(1).max(8),
});

export type SettingsInput = z.infer<typeof settingsSchema>;
