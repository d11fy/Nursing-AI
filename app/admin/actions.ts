"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/server";
import { requireAdminProfile } from "@/lib/auth";
import { subjectSchema, settingsSchema, academicYearSchema, newAcademicYearSchema } from "@/lib/validations/admin";
import { archiveSubject, createAcademicYear, createSubject, setStudentAcademicYear, updateAcademicYear, updateSubject } from "@/lib/subjects";
import { z } from "zod";
import { revokeAllUserSessions } from "@/lib/auth/session-store";

export async function setStudentStatusAction(formData: FormData) {
  await requireAdminProfile();
  const userId = formData.get("userId");
  const status = formData.get("status");
  if (typeof userId !== "string" || (status !== "active" && status !== "suspended")) return;

  const db = await createClient();
  await db.from("profiles").update({ status }).eq("user_id", userId);
  if (status === "suspended") await revokeAllUserSessions(userId);
  revalidatePath("/admin/students");
}

export async function resetStudentDeviceAction(formData: FormData) {
  await requireAdminProfile();
  const parsed = z.string().uuid().safeParse(formData.get("userId"));
  if (!parsed.success) return;
  // Device binding lives only on active server sessions. Revoking them releases
  // the account so the next successful login can securely bind a new device.
  await revokeAllUserSessions(parsed.data);
  revalidatePath("/admin/students");
}

export async function resetDailyLimitAction(formData: FormData) {
  await requireAdminProfile();
  const userId = formData.get("userId");
  if (typeof userId !== "string") return;

  const db = await createClient();
  await db
    .from("usage_logs")
    .delete()
    .eq("user_id", userId)
    .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString());

  revalidatePath("/admin/students");
}

export interface SubjectActionState {
  error?: string;
  success?: string;
}

export async function createSubjectAction(
  _prev: SubjectActionState,
  formData: FormData
): Promise<SubjectActionState> {
  await requireAdminProfile();
  const parsed = subjectSchema.safeParse({
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn"),
    descriptionAr: formData.get("descriptionAr") || undefined,
    descriptionEn: formData.get("descriptionEn") || undefined,
    icon: formData.get("icon") || "book-open",
    iconTheme: formData.get("iconTheme") || undefined,
    status: formData.get("status") || "active",
    sortOrder: formData.get("sortOrder") || 0,
    academicYearIds: formData.getAll("academicYearIds"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }

  try { await createSubject(parsed.data); }
  catch { return { error: "تعذر إضافة المادة؛ تأكد أن الاسم الإنجليزي غير مستخدم" }; }

  revalidatePath("/admin/subjects");
  return { success: "تمت إضافة المادة" };
}

export async function updateSubjectAction(_prev: SubjectActionState, formData: FormData): Promise<SubjectActionState> {
  await requireAdminProfile();
  const subjectId = formData.get("subjectId");
  const parsed = subjectSchema.safeParse({
    nameAr: formData.get("nameAr"), nameEn: formData.get("nameEn"),
    descriptionAr: formData.get("descriptionAr") || undefined,
    descriptionEn: formData.get("descriptionEn") || undefined,
    icon: formData.get("icon") || "book-open", iconTheme: formData.get("iconTheme") || undefined,
    status: formData.get("status"), sortOrder: formData.get("sortOrder"),
    academicYearIds: formData.getAll("academicYearIds"),
  });
  if (typeof subjectId !== "string" || !z.string().uuid().safeParse(subjectId).success || !parsed.success)
    return { error: parsed.success ? "معرّف المادة غير صالح" : parsed.error.issues[0]?.message };
  try { await updateSubject(subjectId, parsed.data); }
  catch { return { error: "تعذر تحديث المادة" }; }
  revalidatePath("/admin/subjects"); revalidatePath("/dashboard/subjects");
  return { success: "تم تحديث المادة" };
}

export async function archiveSubjectAction(formData: FormData) {
  await requireAdminProfile();
  const parsed = z.string().uuid().safeParse(formData.get("subjectId"));
  if (!parsed.success) return;
  await archiveSubject(parsed.data);
  revalidatePath("/admin/subjects"); revalidatePath("/dashboard/subjects");
}

export async function setStudentAcademicYearAction(formData: FormData) {
  await requireAdminProfile();
  const parsed = z.object({ userId: z.string().uuid(), academicYearId: z.string().uuid() }).safeParse({
    userId: formData.get("userId"), academicYearId: formData.get("academicYearId"),
  });
  if (!parsed.success) return;
  await setStudentAcademicYear(parsed.data.userId, parsed.data.academicYearId);
  revalidatePath("/admin/students");
}

export async function updateAcademicYearAction(formData: FormData) {
  await requireAdminProfile();
  const parsed = academicYearSchema.safeParse({ id: formData.get("id"), nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn"), sortOrder: formData.get("sortOrder"), isActive: formData.get("isActive") });
  if (!parsed.success) return;
  await updateAcademicYear(parsed.data.id, { name_ar: parsed.data.nameAr, name_en: parsed.data.nameEn,
    sort_order: parsed.data.sortOrder, is_active: parsed.data.isActive === "true" });
  revalidatePath("/admin/academic-years"); revalidatePath("/admin/subjects");
}

export async function createAcademicYearAction(formData: FormData) {
  await requireAdminProfile();
  const parsed = newAcademicYearSchema.safeParse({ code: formData.get("code"), nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn"), sortOrder: formData.get("sortOrder"), isActive: "true" });
  if (!parsed.success) return;
  try { await createAcademicYear({ code: parsed.data.code, name_ar: parsed.data.nameAr, name_en: parsed.data.nameEn,
    sort_order: parsed.data.sortOrder, is_active: true }); } catch { return; }
  revalidatePath("/admin/academic-years"); revalidatePath("/admin/subjects");
}

export async function toggleSubjectStatusAction(formData: FormData) {
  await requireAdminProfile();
  const subjectId = formData.get("subjectId");
  const status = formData.get("status");
  if (typeof subjectId !== "string" || (status !== "active" && status !== "inactive")) return;

  const db = await createClient();
  await db.from("subjects").update({ status }).eq("id", subjectId);
  revalidatePath("/admin/subjects");
}

export interface SettingsActionState {
  error?: string;
  success?: string;
}

export async function updateSettingsAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  await requireAdminProfile();
  const parsed = settingsSchema.safeParse({
    freeDailyLimit: formData.get("freeDailyLimit"),
    rateLimitSeconds: formData.get("rateLimitSeconds"),
    maxImageSizeMb: formData.get("maxImageSizeMb"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "قيم غير صالحة" };
  }

  const db = await createClient();
  const entries: [string, number][] = [
    ["free_daily_limit", parsed.data.freeDailyLimit],
    ["rate_limit_seconds", parsed.data.rateLimitSeconds],
    ["max_image_size_mb", parsed.data.maxImageSizeMb],
  ];

  for (const [key, value] of entries) {
    await db.from("settings").update({ value }).eq("key", key);
  }

  revalidatePath("/admin/settings");
  return { success: "تم حفظ الإعدادات" };
}
