"use server";

import { redirect } from "next/navigation";
import { AccountAlreadyExistsError, registerAccount, loginAccount, requestPasswordReset, resetAccountPassword } from "@/lib/auth/accounts";
import { endSession } from "@/lib/auth/session";
import { completeGoogleRegistration } from "@/lib/auth/google";
import { z } from "zod";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
} from "@/lib/validations/auth";

export interface AuthActionState {
  error?: string;
  success?: string;
}

export async function registerAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    university: formData.get("university"),
    nursingYear: formData.get("nursingYear"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }

  try {
    await registerAccount(parsed.data);
  } catch (error) {
    if (error instanceof AccountAlreadyExistsError) {
      return { error: "هذا البريد الإلكتروني مسجّل بالفعل؛ سجّل الدخول أو استخدم استعادة كلمة المرور" };
    }
    console.error("Registration failed", error);
    return { error: "تعذر إنشاء الحساب؛ تحقق من البيانات أو حاول لاحقًا" };
  }

  redirect("/dashboard");
}

export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }

  if (!await loginAccount(parsed.data.email, parsed.data.password)) {
    return { error: "تعذر تسجيل الدخول؛ تحقق من البيانات أو حاول لاحقًا" };
  }

  const redirectTo = formData.get("redirectTo");
  redirect(typeof redirectTo === "string" && /^\/(?![\/\\])/.test(redirectTo) && !/[\\\r\n]/.test(redirectTo) ? redirectTo : "/dashboard");
}

export async function forgotPasswordAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "بريد إلكتروني غير صالح" };
  }

  try {
    await requestPasswordReset(parsed.data.email);
  } catch {
    return { error: "تعذر إرسال رابط الاستعادة؛ تواصل مع الإدارة أو حاول لاحقًا" };
  }

  // Always return success — never reveal whether an email exists.
  return { success: "إذا كان البريد الإلكتروني مسجلاً لدينا، ستصلك رسالة لإعادة تعيين كلمة المرور." };
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}

export async function resetPasswordAction(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(8).max(128) }).safeParse({ token: formData.get("token"), password: formData.get("password") });
  if (!parsed.success) return { error: "الرابط غير صالح أو كلمة المرور قصيرة (8 أحرف على الأقل)" };
  if (!await resetAccountPassword(parsed.data.token, parsed.data.password)) return { error: "الرابط منتهي أو مستخدم؛ اطلب رابطًا جديدًا" };
  return { success: "تم تغيير كلمة المرور. يمكنك تسجيل الدخول الآن." };
}

export async function completeGoogleRegistrationAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = z.object({
    university: z.string().trim().min(1, "اسم الجامعة مطلوب"),
    nursingYear: z.enum(["year1", "year2", "year3", "year4", "other"]),
  }).safeParse({ university: formData.get("university"), nursingYear: formData.get("nursingYear") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  try {
    await completeGoogleRegistration(parsed.data);
  } catch (error) {
    console.error("Google registration completion failed", error);
    return { error: "انتهت جلسة Google أو تعذر إنشاء الحساب؛ ابدأ تسجيل الدخول مجددًا" };
  }
  redirect("/dashboard");
}
