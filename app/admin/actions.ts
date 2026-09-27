"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/server";
import { requireAdminProfile } from "@/lib/auth";
import { subjectSchema, settingsSchema } from "@/lib/validations/admin";

export async function setStudentStatusAction(formData: FormData) {
  await requireAdminProfile();
  const userId = formData.get("userId");
  const status = formData.get("status");
  if (typeof userId !== "string" || (status !== "active" && status !== "suspended")) return;

  const db = await createClient();
  await db.from("profiles").update({ status }).eq("user_id", userId);
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
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }

  const db = await createClient();
  const { error } = await db.from("subjects").insert({
    name_ar: parsed.data.nameAr,
    name_en: parsed.data.nameEn,
    description: parsed.data.description ?? null,
  });
  if (error) return { error: "تعذر إضافة المادة" };

  revalidatePath("/admin/subjects");
  return { success: "تمت إضافة المادة" };
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
