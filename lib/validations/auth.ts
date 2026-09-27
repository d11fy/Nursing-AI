import { z } from "zod";

export const nursingYearOptions = [
  { value: "year1", label: "سنة أولى" },
  { value: "year2", label: "سنة ثانية" },
  { value: "year3", label: "سنة ثالثة" },
  { value: "year4", label: "سنة رابعة" },
  { value: "other", label: "أخرى" },
] as const;

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, "الاسم الكامل مطلوب"),
  email: z.string().trim().email("بريد إلكتروني غير صالح"),
  password: z.string().max(128).min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل"),
  university: z.string().trim().min(1, "اسم الجامعة مطلوب"),
  nursingYear: z.enum(["year1", "year2", "year3", "year4", "other"]),
});

export const loginSchema = z.object({
  email: z.string().trim().email("بريد إلكتروني غير صالح"),
  password: z.string().max(128).min(1, "كلمة المرور مطلوبة"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("بريد إلكتروني غير صالح"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
