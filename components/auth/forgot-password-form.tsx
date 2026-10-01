"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction, type AuthActionState } from "@/app/(auth)/actions";

const initialState: AuthActionState = {};

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(forgotPasswordAction, initialState);

  return (
    <div>
      <p className="eyebrow mb-1">أمان الحساب</p>
      <h1 className="text-2xl font-extrabold tracking-tight text-foreground">استعادة كلمة المرور</h1>
      <p className="mt-1.5 text-sm leading-7 text-muted-foreground">
        أدخل بريدك الإلكتروني وسنرسل لك رابطًا لإعادة تعيين كلمة المرور
      </p>

      <form action={formAction} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">البريد الإلكتروني</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required dir="ltr" />
        </div>

        {state.error && (
          <p role="alert" className="rounded-xl border border-destructive/15 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
            {state.error}
          </p>
        )}

        {state.success && (
          <p role="status" className="rounded-xl border border-success/15 bg-success/10 px-3.5 py-3 text-sm text-success">
            {state.success}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "جارٍ الإرسال..." : "إرسال رابط إعادة التعيين"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        تذكرت كلمة المرور؟{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          تسجيل الدخول
        </Link>
      </p>
    </div>
  );
}
