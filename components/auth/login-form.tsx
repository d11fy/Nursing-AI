"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type AuthActionState } from "@/app/(auth)/actions";
import { AuthDivider, GoogleButton } from "@/components/auth/google-button";

const initialState: AuthActionState = {};

const googleErrors: Record<string, string> = {
  google_config: "تسجيل الدخول باستخدام Google غير مفعّل بعد.",
  google_cancelled: "تم إلغاء تسجيل الدخول باستخدام Google.",
  google_failed: "تعذر التحقق من حساب Google؛ حاول مرة أخرى.",
  google_expired: "انتهت جلسة Google؛ ابدأ تسجيل الدخول مجددًا.",
  device_in_use: "هذا الحساب مستخدم حاليًا على جهاز آخر.",
};

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "";
  const googleError = googleErrors[searchParams.get("error") ?? ""];

  return (
    <div>
      <p className="eyebrow mb-1">مرحبًا بعودتك</p>
      <h1 className="text-2xl font-extrabold tracking-tight text-foreground">تسجيل الدخول</h1>
      <p className="mt-1.5 text-sm leading-7 text-muted-foreground">
        أهلًا بعودتك، سجّل الدخول لمتابعة دراستك
      </p>

      {googleEnabled && <div className="mt-6"><GoogleButton redirectTo={redirectTo} /><AuthDivider /></div>}
      {googleError && <p role="alert" className="mt-4 rounded-xl border border-destructive/15 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">{googleError}</p>}

      <form action={formAction} className={googleEnabled ? "space-y-4" : "mt-6 space-y-4"}>
        <div className="space-y-1.5"><Label htmlFor="secondFactor">رمز المصادقة أو الاسترداد (للحسابات المفعّلة فقط)</Label><Input id="secondFactor" name="secondFactor" autoComplete="one-time-code" dir="ltr" maxLength={32} /></div>
        <input type="hidden" name="redirectTo" value={redirectTo} />

        <div className="space-y-1.5">
          <Label htmlFor="email">البريد الإلكتروني</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required dir="ltr" />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">كلمة المرور</Label>
            <Link href="/forgot-password" className="text-xs font-semibold text-primary hover:underline">
              نسيت كلمة المرور؟
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        {state.error && (
          <p role="alert" className="rounded-xl border border-destructive/15 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
            {state.error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "جارٍ الدخول..." : "تسجيل الدخول"}
        </Button>
      <a href="/transfer-device" className="block min-h-11 text-primary underline">الحساب مفتوح على جهاز آخر؟ انقل تسجيل الدخول</a><a href="/support" className="block min-h-11 text-primary underline">طلب مساعدة</a></form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        ليس لديك حساب؟{" "}
        <Link href="/register" className="font-semibold text-primary hover:underline">
          إنشاء حساب جديد
        </Link>
      </p>
    </div>
  );
}
