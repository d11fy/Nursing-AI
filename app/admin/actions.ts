"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/server";
import { requireAdminProfile } from "@/lib/auth";
import { subjectSchema, settingsSchema, academicYearSchema, newAcademicYearSchema } from "@/lib/validations/admin";
import { archiveSubject, createAcademicYear, createSubject, setStudentAcademicYear, updateAcademicYear, updateSubject } from "@/lib/subjects";
import { z } from "zod";
import { revokeAllUserSessions } from "@/lib/auth/session-store";
import { identityDb } from "@/lib/tutor/db";
import { getPool } from "@/lib/db/pool";
import { setAppVersionInfo } from "@/lib/version/app-version";
import { enqueueTemplateEmail } from "@/lib/email-queue";
import { adjustStudentUsage, getUsageSummary, METERED_FEATURES } from "@/lib/subscriptions/service";

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
  const admin = await requireAdminProfile();
  const parsed = z.string().uuid().safeParse(formData.get("userId"));
  if (!parsed.success) return;
  // Device binding lives only on active server sessions. Revoking them releases
  // the account so the next successful login can securely bind a new device.
  await revokeAllUserSessions(parsed.data);
  await identityDb(admin.user_id).query("insert into admin_audit_logs(event_type,admin_id,target_user_id) values('DEVICE_RESET',$1,$2)", [admin.user_id, parsed.data]);
  // Tell the student they can sign in on their new device (template device_reset).
  const student = (await identityDb(admin.user_id).query<{ email: string; full_name: string }>(
    "select email,full_name from profiles where user_id=$1", [parsed.data])).rows[0];
  if (student) await enqueueTemplateEmail(student.email, "device_reset", { student_name: student.full_name }).catch(() => null);
  revalidatePath("/admin/students");
}

export interface UsageAdjustState { error?: string; success?: string }

/**
 * Resets the subscription counter the entitlement service enforces (not
 * usage_logs) for the chosen feature in the student's current period.
 */
export async function adjustStudentUsageAction(_prev: UsageAdjustState, formData: FormData): Promise<UsageAdjustState> {
  const admin = await requireAdminProfile();
  const parsed = z.object({
    userId: z.string().uuid(),
    feature: z.enum([...METERED_FEATURES, "all"]),
    reason: z.string().trim().min(3, "اكتب سبب التعديل").max(300),
  }).safeParse({ userId: formData.get("userId"), feature: formData.get("feature"), reason: formData.get("reason") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  try {
    const changes = await adjustStudentUsage({ adminId: admin.user_id, userId: parsed.data.userId, reason: parsed.data.reason,
      features: parsed.data.feature === "all" ? METERED_FEATURES : [parsed.data.feature] });
    revalidatePath("/admin/students");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/subscription");
    return { success: changes.map((change) => `${change.feature}: ${change.previousValue} ← ${change.newValue}`).join("، ") };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "تعذر تعديل الاستخدام" };
  }
}

/** Current enforced usage for the admin dialog. */
export async function getStudentUsageAction(userId: string) {
  await requireAdminProfile();
  const id = z.string().uuid().parse(userId);
  return getUsageSummary(id);
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

export async function updatePublicSiteAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  await requireAdminProfile();
  const parsed = z.object({
    contactEmail: z.union([z.literal(""), z.string().email()]),
    whatsapp: z.string().max(40),
    refundPolicy: z.string().max(4000),
  }).safeParse({
    contactEmail: String(formData.get("contactEmail") ?? "").trim(),
    whatsapp: String(formData.get("whatsapp") ?? "").trim(),
    refundPolicy: String(formData.get("refundPolicy") ?? "").trim(),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };

  await getPool().query(
    `insert into public.settings(key,value) values('public_site',$1::jsonb)
     on conflict(key) do update set value=excluded.value,updated_at=now()`,
    [JSON.stringify({
      contact_email: parsed.data.contactEmail,
      whatsapp: parsed.data.whatsapp,
      refund_policy: parsed.data.refundPolicy,
    })]
  );
  revalidatePath("/");
  revalidatePath("/privacy");
  revalidatePath("/subscription-policy");
  revalidatePath("/admin/settings");
  return { success: "تم حفظ معلومات الموقع" };
}

export async function updateMobileReleaseAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  await requireAdminProfile();
  const parsed = z.object({
    latestVersion: z.string().regex(/^\d+\.\d+\.\d+$/, "استخدم صيغة 1.0.0"),
    latestVersionCode: z.coerce.number().int().positive(),
    minimumSupportedVersionCode: z.coerce.number().int().positive(),
    apkUrl: z.string().min(1),
    releaseNotes: z.string().min(3).max(4000),
    forceUpdate: z.boolean(),
    sha256: z.union([z.literal(""), z.string().regex(/^[a-fA-F0-9]{64}$/, "بصمة SHA-256 يجب أن تكون 64 حرفًا")]),
    previewEnabled: z.boolean(),
    previewVersion: z.string().trim(),
    previewApkUrl: z.string().trim(),
    previewNotes: z.string().trim().max(2000),
  }).safeParse({
    latestVersion: formData.get("latestVersion"),
    latestVersionCode: formData.get("latestVersionCode"),
    minimumSupportedVersionCode: formData.get("minimumSupportedVersionCode"),
    apkUrl: formData.get("apkUrl"),
    releaseNotes: formData.get("releaseNotes"),
    forceUpdate: formData.get("forceUpdate") === "on",
    sha256: String(formData.get("sha256") ?? "").trim(),
    previewEnabled: formData.get("previewEnabled") === "on",
    previewVersion: String(formData.get("previewVersion") ?? ""),
    previewApkUrl: String(formData.get("previewApkUrl") ?? ""),
    previewNotes: String(formData.get("previewNotes") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات الإصدار غير صالحة" };
  if(parsed.data.minimumSupportedVersionCode>parsed.data.latestVersionCode)return {error:"الحد الأدنى لا يمكن أن يتجاوز الإصدار المنشور"};

  try {
    await setAppVersionInfo({
      latest_version: parsed.data.latestVersion,
      latest_version_code: parsed.data.latestVersionCode,
      minimum_supported_version_code: parsed.data.minimumSupportedVersionCode,
      apk_url: parsed.data.apkUrl,
      release_notes: parsed.data.releaseNotes,
      force_update: parsed.data.forceUpdate,
      sha256: parsed.data.sha256 ? parsed.data.sha256.toLowerCase() : null,
      preview: parsed.data.previewVersion && parsed.data.previewApkUrl ? {
        enabled: parsed.data.previewEnabled,
        version: parsed.data.previewVersion,
        apk_url: parsed.data.previewApkUrl,
        notes: parsed.data.previewNotes,
      } : null,
    });
  } catch {
    return { error: "تعذر حفظ الإصدار. تأكد من رقم الإصدار ورابط APK الرسمي." };
  }
  revalidatePath("/download");
  revalidatePath("/admin/settings");
  return { success: "تم نشر إعداد الإصدار" };
}
